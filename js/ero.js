// Ero - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_ero.js（2026-10-31 调研初稿，未推送）
// WordPress + manyse CDN。详情页脚本给出 videoLink/pndvd/versionSuffix，
// 播放地址 = https://test.manyse.com/<videoLink>/<CODE>/play.m3u8（FHD 线）
// 及 <CODE>-M/play.m3u8（去码线，仅去码片有，须验活才出线）。
// 注意：猫源的本地 /proxy/m3u8 代理（把 .jpeg 分片行改写成 ?x=.ts）是服务端
// 路由，XPTV 客户端脚本无法承载，故这里直接返回原始清单地址（与 XPTV 版
// MissAV 直出 surrit 播单同一做法）；分片为 TS 内容配 .jpeg 后缀，播放器
// 能否建时间轴以真机为准。站方没有 1080p/720p 数字分档，只有 FHD 线与
// 去码线两档，绝不编造数字清晰度。片名带番号，接字幕芯。
const HOST = 'https://ero.to';
const PLAY = 'https://test.manyse.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;

function t(v) { return String(v == null ? '' : v).trim(); }

function clean(s) {
    return t(s).replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    return HOST + (u.charAt(0) === '/' ? u : '/' + u);
}

// 统一取数：状态码不抛错，body 仅 2xx 时给正文；网络错误/超时回 status 0。
async function getHtml(url, timeoutMs) {
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA },
            timeout: timeoutMs || 20000,
        });
        const text = r && typeof r.data === 'string' ? r.data : (r && r.data != null ? JSON.stringify(r.data) : '');
        const status = r && typeof r.status === 'number' ? r.status : (text ? 200 : 0);
        const ok = status >= 200 && status < 300;
        return { status: status, body: ok ? text : '' };
    } catch (e) {
        return { status: 0, body: '' };
    }
}

// ---------- 列表解析 ----------
// 卡片：<a href="/vod|fc2/<id>/"><img src="...jpg"></a> + badge + 标题 clamp div。
function parseCards(html) {
    const out = [];
    if (!html || html.indexOf('Just a moment...') >= 0) return out;
    const re = /<a href="https:\/\/ero\.to\/(vod|fc2)\/(\d+)\/"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*>[\s\S]{0,1200}?-webkit-line-clamp: 2;[^>]*>([^<]+)</g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const block = m[0];
        const badge = (block.match(/<span class="badge bg-danger">([^<]+)<\/span>/) || [])[1] || '';
        out.push({
            vod_id: m[1] + ':' + m[2],
            vod_name: clean(m[4]),
            vod_pic: m[3],
            vod_remarks: badge ? clean(badge) : '',
            ext: { id: m[1] + ':' + m[2] },
        });
        if (out.length >= 100) break;
    }
    return out;
}

function listUrlFor(tid, page) {
    const p = page > 1 ? 'page/' + page + '/' : '';
    if (tid === 'newest') return HOST + '/vod/' + p;
    if (tid === 'fc2') return HOST + '/fc2/' + p;
    if (tid.indexOf('g:') === 0) return HOST + '/vod_genre/' + tid.slice(2) + '/' + p;
    return HOST + '/vod/' + p;
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'Ero',
        site: HOST,
        tabs: CATS.map(function (c) { return { name: c.type_name, ext: { id: c.type_id } }; }),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.id || 'newest');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let list = [];
    try {
        const r = await getHtml(listUrlFor(tid, page));
        list = parseCards(r.body);
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = t(ext.text);
    if (!kw) return jsonify({ list: [] });
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let list = [];
    try {
        const url = HOST + '/?s=' + encodeURIComponent(kw) + '&post_type%5B%5D=vod&post_type%5B%5D=fc2' + (page > 1 ? '&paged=' + page : '');
        const r = await getHtml(url);
        list = parseCards(r.body);
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

// ---------- 详情 / 播放 ----------
// 去码线（-M）只在去码片上活着，须验活才出线：
// FHD 除明确 404 外一律出线（网络错误时 fail-open）；-M 须 GET 200 才出线，
// 网络错误时仅当页标签含モザイク除去才出线（fail-open + 标签佐证）。
async function checkM3u8(url) {
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA },
            timeout: 15000,
        });
        const text = r && typeof r.data === 'string' ? r.data : '';
        const status = r && typeof r.status === 'number' ? r.status : (text ? 200 : 0);
        return { status: status, isM3u8: text.indexOf('#EXTM3U') >= 0 };
    } catch (e) {
        return { status: 0, isM3u8: false };
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '');
    id = id.replace(/^ero:/, '');
    const mm = id.match(/^(vod|fc2):(\d+)$/);
    if (!mm) return jsonify({ list: [] });
    const type = mm[1];
    const pageUrl = HOST + '/' + type + '/' + mm[2] + '/';
    let html = '';
    try {
        const r = await getHtml(pageUrl);
        html = r.body;
    } catch (e) { return jsonify({ list: [] }); }
    if (!html || html.indexOf('Just a moment...') >= 0) return jsonify({ list: [] });
    const ogTitle = (html.match(/<meta property="og:title" content="([^"]+)"[^>]*>/) || [])[1] || '';
    const titleTag = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
    let title = clean(ogTitle || titleTag.split(' – ')[0] || '');
    if (!title) title = 'Ero #' + mm[2];
    const poster = (html.match(/poster="([^"]+)"/) || [])[1] || '';
    const tags = [];
    const tagRe = /rel="tag">([^<]+)</g;
    let tm;
    while ((tm = tagRe.exec(html)) !== null && tags.length < 8) {
        const tg = clean(tm[1]);
        if (tg && tags.indexOf(tg) < 0) tags.push(tg);
    }
    const hasMosaicTag = tags.indexOf('モザイク除去') >= 0;
    // 播放候选
    const cands = []; // {name, url, kind}
    if (type === 'fc2') {
        const urlRe = /"label":"([^"]+)","url":"([^"]+)"/g;
        let um;
        while ((um = urlRe.exec(html)) !== null) {
            const u = um[2].replace(/\\\//g, '/');
            if (/^https?:\/\//.test(u)) cands.push({ name: clean(um[1]) || 'FHD', url: u, kind: 'fhd' });
        }
    } else {
        const videoLink = (html.match(/videoLink = "([^"]+)"/) || [])[1] || '2610';
        let code = (html.match(/pndvd = "([^"]+)"/) || [])[1] || '';
        if (!code) code = subExtractCode(title);
        const suffix = (html.match(/versionSuffix = "([^"]*)"/) || [])[1] || '';
        if (code) {
            cands.push({ name: 'FHD', url: PLAY + videoLink + '/' + code + '/play.m3u8' + suffix, kind: 'fhd' });
            cands.push({ name: '去码版', url: PLAY + videoLink + '/' + code + '-M/play.m3u8' + suffix, kind: 'm' });
        }
    }
    if (!cands.length) return jsonify({ list: [] });
    // 并行验活（仅 1 轮往返）
    const checks = await Promise.all(cands.map(function (c) { return checkM3u8(c.url); }));
    const tracks = [];
    for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        const ck = checks[i];
        let live = false;
        if (c.kind === 'fhd') live = ck.status !== 404;
        else live = ck.status === 200 || (ck.status === 0 && hasMosaicTag);
        if (!live) continue;
        tracks.push({ name: c.name, pan: '', ext: { url: c.url, name: title } });
    }
    if (!tracks.length) return jsonify({ list: [] });
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let url = String(ext.url || '');
    if (url.indexOf('$') >= 0) url = url.slice(url.indexOf('$') + 1);
    url = t(url);
    if (!url) return jsonify({ urls: [], headers: [] });
    const result = { urls: [url], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] };
    const name = String(ext.name || '');
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}
const CATS = [
  { type_id: 'newest', type_name: '最新' },
  { type_id: 'g:%e3%83%a2%e3%82%b6%e3%82%a4%e3%82%af%e9%99%a4%e5%8e%bb', type_name: '无码流出' },
  { type_id: 'g:%e5%b7%a8%e4%b9%b3', type_name: '巨乳' },
  { type_id: 'g:%e5%b7%a8%e5%b0%bb', type_name: '大屁股' },
  { type_id: 'g:%e4%ba%ba%e5%a6%bb%e3%83%bb%e4%b8%bb%e5%a9%a6', type_name: '人妻' },
  { type_id: 'g:%e5%88%b6%e6%9c%8d', type_name: '制服' },
  { type_id: 'fc2', type_name: 'FC2 PPV' },
  { type_id: 'g:4k', type_name: '4K' },
  { type_id: 'g:%e4%b8%ad%e5%87%ba%e3%81%97', type_name: '中出し' },
  { type_id: 'g:%e7%b4%a0%e4%ba%ba', type_name: '素人' },
  { type_id: 'g:%e5%8d%98%e4%bd%93%e4%bd%9c%e5%93%81', type_name: '单体作品' },
  { type_id: 'g:%e3%83%8f%e3%82%a4%e3%83%93%e3%82%b8%e3%83%a7%e3%83%b3', type_name: '高清' },
  { type_id: 'g:%e7%8b%ac%e5%8d%a0%e9%85%8d%e4%bf%a1', type_name: '独占配信' },
  { type_id: 'g:%e9%ab%98%e3%83%93%e3%83%83%e3%83%88%e3%83%ac%e3%83%bc%e3%83%88', type_name: '高码率' },
  { type_id: 'g:%e7%be%8e%e5%b0%91%e5%a5%b3', type_name: '美少女' },
  { type_id: 'g:%e3%83%95%e3%82%a7%e3%83%a9', type_name: '口交' },
  { type_id: 'g:%e3%82%b9%e3%83%ac%e3%83%b3%e3%83%80%e3%83%bc', type_name: '苗条' },
  { type_id: 'g:%e3%82%b5%e3%83%b3%e3%83%97%e3%83%ab%e5%8b%95%e7%94%bb', type_name: '样品视频' },
  { type_id: 'g:%e9%85%8d%e4%bf%a1%e5%b0%82%e7%94%a8', type_name: '配信专用' },
  { type_id: 'g:%e7%97%b4%e5%a5%b3', type_name: '痴女' },
  { type_id: 'g:%e7%86%9f%e5%a5%b3', type_name: '熟女' },
  { type_id: 'g:%e3%83%8f%e3%83%a1%e3%82%92%e3%82%8a', type_name: '自拍' },
  { type_id: 'g:3p%e3%83%bb4p', type_name: '3P・4P' },
  { type_id: 'g:%e3%83%95%e3%83%ab%e3%83%8f%e3%82%a4%e3%83%93%e3%82%b8%e3%83%a7%e3%83%b3fhd', type_name: '全高清' },
  { type_id: 'g:%e6%bd%ae%e5%90%b9%e3%81%8d', type_name: '潮吹' },
  { type_id: 'g:%e5%af%9d%e5%8f%96%e3%82%8a%e3%83%bb%e5%af%9d%e5%8f%96%e3%82%89%e3%82%8c%e3%83%bbntr', type_name: 'NTR' },
  { type_id: 'g:%e7%be%8e%e4%b9%b3', type_name: '美乳' },
  { type_id: 'g:%e6%b7%ab%e4%b9%b1%e3%83%bb%e3%83%8f%e3%83%bc%e3%83%89%e7%b3%bb', type_name: '淫乱重口' },
  { type_id: 'g:%e3%82%a2%e3%82%af%e3%83%a1%e3%83%bb%e3%82%aa%e3%83%bc%e3%82%ac%e3%82%ba%e3%83%a0', type_name: '高潮' },
  { type_id: 'g:%e9%a8%8e%e4%b9%97%e4%bd%8d', type_name: '骑乘位' },
];
const SUB_UA = UA;

// subHttp: 与猫版同语义 (状态码不抛错、仅 2xx 给正文), 底层
// $fetch.get; data 已被运行时解析成对象时回序列化成文本。
async function subHttp(url, headers, timeoutMs) {
    try {
        const r = await $fetch.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
        const data = r ? r.data : null;
        const body = typeof data === 'string' ? data : (data == null ? '' : JSON.stringify(data));
        const status = r && typeof r.status === 'number' ? r.status : (body ? 200 : 0);
        return { status, body: status >= 200 && status < 300 ? body : '' };
    } catch (e) {
        return { status: 0, body: '' };
    }
}

// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)
function subExtractCode(text) {
    const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
    const pats = [
        /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
        /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
        /\b1PONDO[- ]?\d{6,8}\b/,
        /\bHEYZO[- ]?\d{3,6}\b/,
        /\b[A-Z]{2,10}[- ]\d{2,8}[A-Z]?\b/,
        /\b[A-Z]{2,10}\d{2,8}[A-Z]?\b/,
    ];
    for (const re of pats) {
        const m = s.match(re);
        if (m) return m[0].replace(/\s+/g, '-').replace(/-+/g, '-');
    }
    return '';
}

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 日文 > 其他)
function subLangOf(name, langs) {
    const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
    if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
    if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
    if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
    if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
    if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
    return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;
const SUB_NOISE_RE = /\b(UNCENSORED|LEAKED|LEAK|OTHER|COMPLETE|FULL|HDR|WEB|BLURAY|BDRIP|WEBDL|REMUX|X264|X265|10BIT|8BIT|HEVC|AVC)\b/gi;

function subStripEp(text) {
    return String(text || '').trim()
        .replace(/\b(?:第\s*\d+\s*集|第\s*\d+\s*話|EP\s*\d+|E\s*\d+|S\d{1,2}E\d{1,2}|\d{1,2}x\d{1,2}|Season\s*\d+\s*Episode\s*\d+)\b/gi, ' ')
        .replace(/\b(?:第\s*\d+\s*季|Season\s*\d+)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function subLoose(s) {
    return String(s || '').replace(/[-_\s.]/g, '');
}

function subFirstNumber() {
    for (let i = 0; i < arguments.length; i++) {
        const n = Number(arguments[i]);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
}

function subParseDuration(value) {
    if (value == null) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value || '').trim();
    if (!text) return 0;
    if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
    const hms = text.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
    if (hms) return Number(hms[1] || 0) * 3600 + Number(hms[2] || 0) * 60 + Number(hms[3] || 0);
    const zh = text.match(/(\d+)\s*小时(?:\s*(\d+)\s*分(?:钟)?)?(?:\s*(\d+)\s*秒)?/);
    if (zh) return Number(zh[1] || 0) * 3600 + Number(zh[2] || 0) * 60 + Number(zh[3] || 0);
    return 0;
}

function subExtOf(name) {
    if (!name) return '';
    const s = String(name).toLowerCase();
    if (s.endsWith('.srt')) return '.srt';
    if (s.endsWith('.ass')) return '.ass';
    if (s.endsWith('.ssa')) return '.ssa';
    if (s.endsWith('.vtt')) return '.vtt';
    return '';
}

// 搜索上下文 + 组件法键序 (照 xunlei.subtitle buildSearchKeys,
// 片名直接取自 track.ext): 有番号时 [番号, 紧凑番号, 番号+标题
// 余部, 紧凑番号+标题余部, 全标题]; 迅雷槽只取 [番号, 紧凑番号]。
function subBuildCtx(title) {
    const rawText = String(title || '').trim();
    const displayText = subStripEp(rawText);
    const code = subExtractCode(rawText) || subExtractCode(displayText);
    const keysAll = [];
    if (code) {
        const titlePart = displayText
            .replace(new RegExp(code.replace(/[-_]/g, '[-_ ]?'), 'i'), '')
            .replace(SUB_NOISE_RE, '')
            .replace(/\b(?:EP|E|S|SEASON)\s*\d{1,3}\b/gi, '')
            .replace(/^[\s\-_:]+|[\s\-_:]+$/g, '')
            .trim();
        const compact = code.replace(/[-_ ]/g, '');
        keysAll.push(code, compact);
        if (titlePart && titlePart !== code) keysAll.push(code + ' ' + titlePart);
        if (titlePart && titlePart !== compact) keysAll.push(compact + ' ' + titlePart);
    }
    if (displayText) keysAll.push(displayText);
    return {
        code,
        compact: code ? code.replace(/[-_ ]/g, '') : '',
        displayText,
        rawText,
        keysAll: [...new Set(keysAll)].filter((k) => k.length >= 2),
        xunleiKeys: code ? [code, code.replace(/[-_ ]/g, '')] : (displayText ? [displayText] : []),
        catKey: code || displayText,
        matchText: subStripEp(rawText).toLowerCase(),
        titleLower: rawText.toLowerCase(),
    };
}

// 条目文本 (name + langs + ext) 是否与番号/片名相关 (组件严过滤)
function subRelevant(it, ctx) {
    const text = (String(it.name || '') + ' ' + String(it.langs || '') + ' ' + String(it.ext || '')).toLowerCase();
    const textLoose = subLoose(text);
    if (ctx.code) {
        const cl = ctx.code.toLowerCase();
        if (text.indexOf(cl) >= 0 || textLoose.indexOf(subLoose(cl)) >= 0) return true;
    }
    const mt = ctx.matchText;
    const tl = ctx.titleLower;
    if (mt && text.indexOf(mt) >= 0) return true;
    if (mt && textLoose.indexOf(subLoose(mt)) >= 0) return true;
    if (tl && text.indexOf(tl) >= 0) return true;
    if (tl && textLoose.indexOf(subLoose(tl)) >= 0) return true;
    if (text && mt && mt.indexOf(text) >= 0) return true;
    return false;
}

// 片名有效词元 (相关性闸门用): 拉丁/数字词 >=3 字符、汉字串
// >=2 字。单字召回 (如生僻字「龘」) 过不了这一关。
function subTitleTokens(title) {
    const t = String(title || '').toLowerCase();
    const toks = [];
    let m;
    const re = /[a-z0-9]+/g;
    while ((m = re.exec(t)) !== null) if (m[0].length >= 3) toks.push(m[0]);
    const re2 = /[一-鿿]+/g;
    while ((m = re2.exec(t)) !== null) if (m[0].length >= 2) toks.push(m[0]);
    return toks;
}

function subTokenHit(name, tokens) {
    const n = String(name || '').toLowerCase();
    for (let i = 0; i < tokens.length; i++) if (n.indexOf(tokens[i]) >= 0) return 1;
    return 0;
}

// 严过滤: 有番号时过滤到空即空 (不回退); 无番号时回退名单也
// 要过词元闸门。
function subStrictFilter(items, ctx) {
    const kept = items.filter((it) => subRelevant(it, ctx));
    if (kept.length) return kept;
    if (ctx.code) return [];
    const toks = subTitleTokens(ctx.displayText);
    return items.filter((it) => subTokenHit(it.name, toks));
}

// 组件打分 (scoreItem 的电影路径)
function subScoreOracle(it, ctx) {
    const text = (String(it.name || '') + ' ' + String(it.langs || '') + ' ' + String(it.ext || '')).toLowerCase();
    const textLoose = subLoose(text);
    let score = (it.cid_match ? 100000 : 0) + (Number(it.down_count) || 0) / 10000;
    if (ctx.code) {
        const cl = ctx.code.toLowerCase();
        if (text.indexOf(cl) >= 0 || textLoose.indexOf(subLoose(cl)) >= 0) score += 25000;
        score += 500;
    }
    score += Math.max(0, Number(it.score) || 0);
    score += Math.max(0, Number(it.fingerprintScore) || 0);
    if (Number(it.duration) > 0) score += 50;
    if (Number(it.file_size) > 0) score += Math.min(Number(it.file_size) / 1024 / 1024, 20);
    if (ctx.titleLower && (text.indexOf(ctx.titleLower) >= 0 || textLoose.indexOf(subLoose(ctx.titleLower)) >= 0)) score += 1000;
    if (text.indexOf('sub') >= 0 || text.indexOf('subtitle') >= 0 || text.indexOf('字幕') >= 0) score += 300;
    return score;
}

// oracle 条目归一 (照组件 normalizeResult 的字段别名口径)
function subNormOracle(item) {
    const duration = subFirstNumber(
        subParseDuration(item && item.Duration), subParseDuration(item && item.duration),
        subParseDuration(item && item.TimeLength), subParseDuration(item && item.time_length),
        subParseDuration(item && item.Length), subParseDuration(item && item.length),
        subParseDuration(item && item.VideoDuration), subParseDuration(item && item.video_duration),
        subParseDuration(item && item.Dur), subParseDuration(item && item.dur),
        subParseDuration(item && item.Runtime), subParseDuration(item && item.runtime),
        subParseDuration(item && item.PlayTime), subParseDuration(item && item.play_time));
    const fileSize = subFirstNumber(
        item && item.FileSize, item && item.file_size, item && item.Size, item && item.size,
        item && item.FileSizeBytes, item && item.fileSize, item && item.filesize,
        item && item.SubSize, item && item.sub_size, item && item.Subsize, item && item.subsize,
        item && item.LengthBytes, item && item.length_bytes, item && item.Bytes, item && item.bytes);
    const name = String((item && (item.Name || item.name || item.Title || item.title || item.FileName || item.filename)) || '迅雷字幕').trim();
    return {
        name,
        langs: String((item && (item.Langs || item.langs || (Array.isArray(item.Languages) ? item.Languages.join(',') : item.Languages) || item.lang || item.language)) || '').trim(),
        ext: String((item && (item.Ext || item.ext || item.Format || item.format)) || '').trim() || subExtOf(name) || '.srt',
        url: String((item && (item.Url || item.url)) || '').trim(),
        down_count: Number((item && (item.DownCount || item.down_count || item.Download || item.download || item.Downloads || item.downloads)) || 0),
        cid_match: Boolean(item && (item.CidMatch != null ? item.CidMatch : item.cid_match)),
        duration,
        file_size: fileSize,
        score: Number((item && (item.Score || item.score)) || 0),
        fingerprintScore: Number((item && (item.FingerprintfScore || item.fingerprintfScore || item.FingerprintScore || item.fingerprintScore)) || 0),
    };
}

// oracle 单键查询: 归一后的条目数组 (仅文本字幕直链); 失败 []
async function subOracleQuery(key) {
    const r = await subHttp('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
        { 'User-Agent': 'ForwardWidgets/1.0.2', Accept: '*/*' }, 5000);
    if (r.status !== 200 || !r.body) return [];
    let j;
    try { j = JSON.parse(r.body); } catch (e) { return []; }
    if (!j || Number(j.code) !== 0 || !Array.isArray(j.data)) return [];
    const out = [];
    for (const raw of j.data) {
        const it = subNormOracle(raw);
        if (!it.url || !SUB_TEXT_RE.test(it.url)) continue;
        out.push(it);
    }
    return out;
}

// oracle 槽: 键序逐个查、首个有结果的键即停 (组件原法); 命中
// 名单过严过滤 + 打分后入 bag。
async function subOracleSlot(src, tier, keys, ctx, bag) {
    for (const key of keys) {
        const items = await subOracleQuery(key);
        if (!items.length) continue;
        const kept = subStrictFilter(items, ctx);
        for (const it of kept) {
            const lang = subLangOf(it.name, it.langs);
            const dispName = /^[0-9a-f]{24,}$/i.test(it.name.trim()) ? (ctx.code ? ctx.code + ' 迅雷字幕' : '迅雷字幕') : it.name;
            bag.push({
                src, tier, name: dispName, url: it.url, lang: lang.tag, langRank: lang.rank,
                score: subScoreOracle(it, ctx), dl: it.down_count,
            });
        }
        break;
    }
}

// SubtitleCat 槽: 搜索页 -> 字幕页 (前 3) -> 按语言分的直链;
// 文件名同样过严过滤 (有番号时不回退)。
async function subFromSubtitleCat(ctx, bag) {
    const key = ctx.catKey;
    if (!key) return;
    const r = await subHttp('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
        { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 5000);
    if (r.status !== 200 || !r.body) return;
    const pages = [];
    const seen = new Set();
    for (const m of r.body.matchAll(/href="(subs\/\d+\/[^"]+\.html)"/g)) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        pages.push(m[1]);
        if (pages.length >= 3) break;
    }
    await Promise.all(pages.map(async (p) => {
        const pr = await subHttp('https://subtitlecat.com/' + p, { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 4000);
        if (pr.status !== 200 || !pr.body) return;
        const rawItems = [];
        for (const m of pr.body.matchAll(/href="(\/subs\/\d+\/[^"]+\.(?:srt|vtt|ass))"/gi)) {
            let nm = m[1].split('/').pop() || '字幕';
            try { nm = decodeURIComponent(nm); } catch (e) { /* 保持原样 */ }
            rawItems.push({ name: nm, langs: '', ext: subExtOf(nm), url: 'https://subtitlecat.com' + m[1] });
        }
        const kept = rawItems.filter((it) => subRelevant(it, ctx));
        for (const it of kept) {
            const lang = subLangOf(it.name, '');
            let sc = 0;
            if (ctx.code) {
                const nl = it.name.toLowerCase();
                if (nl.indexOf(ctx.code.toLowerCase()) >= 0 || subLoose(nl).indexOf(subLoose(ctx.code.toLowerCase())) >= 0) sc += 25000;
            }
            if (it.name.toLowerCase().indexOf('sub') >= 0) sc += 300;
            bag.push({
                src: 'SubtitleCat', tier: 2, name: it.name, url: it.url,
                lang: lang.tag, langRank: lang.rank, score: sc, dl: 0,
            });
        }
    }));
}

// 合并: URL 去重 (同 URL 保留高档位来源) + (语言|去扩展名文件
// 名) 去重; 排序 档位 -> 语言 -> 分数; 单槽软上限 8、全局上
// 限 10。
function subMerge(items) {
    const sorted = items.slice().sort((a, b) =>
        (a.tier - b.tier) || (a.langRank - b.langRank) || (b.score - a.score) || String(a.name).localeCompare(String(b.name)));
    const seenUrl = new Set();
    const seenName = new Set();
    const tierCount = {};
    const out = [];
    for (const it of sorted) {
        if (seenUrl.has(it.url)) continue;
        const nameKey = it.lang + '|' + it.name.toLowerCase().replace(/\.(srt|vtt|ass|ssa)$/i, '');
        if (seenName.has(nameKey)) continue;
        if ((tierCount[it.tier] || 0) >= 8) continue;
        seenUrl.add(it.url);
        seenName.add(nameKey);
        tierCount[it.tier] = (tierCount[it.tier] || 0) + 1;
        const ext = (it.url.match(SUB_TEXT_RE) || [])[1].toLowerCase();
        const cleanName = it.name.replace(/\.(srt|vtt|ass|ssa)$/i, '').slice(0, 60);
        out.push({ name: it.src + '·' + (it.lang ? it.lang + '·' : '') + cleanName, url: it.url, format: ext });
        if (out.length >= 10) break;
    }
    return out;
}

// 一次搜索: 三槽并行, 各自失败静默; 无键/无命中返回 []。
async function subSearch(title) {
    const ctx = subBuildCtx(title);
    if (!ctx.keysAll.length && !ctx.catKey) return [];
    const bag = [];
    await Promise.all([
        Promise.resolve(subOracleSlot('迅雷', 0, ctx.xunleiKeys, ctx, bag)).catch(() => {}),
        Promise.resolve(subOracleSlot('迅雷看看', 1, ctx.keysAll, ctx, bag)).catch(() => {}),
        Promise.resolve(subFromSubtitleCat(ctx, bag)).catch(() => {}),
    ]);
    return subMerge(bag);
}

