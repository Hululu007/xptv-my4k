// JavTubs - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_javtubs.js
// 站点 https://javtubs.com（JAV tube 站，SSR HTML，无 CF 墙，iPhone UA）；
// 分类：最新/精选/Reducing Mosaic（搜索背书）+ 7 个站内 category；genre 筛选 43 项在 XPTV 里不展；
// 播放链：详情页 hidden #links = base64(embed URL)，POST /get_link.php 取 embed；
// 主腿 earnvidjavgg.xyz（VidHide）：embed 页内 packed JS 解包出 hls2 master（480p/720p/1080p 多档），
// 分片明文 TS，签名 36h；VidHide 播单 token 绑 IP——master 必须与取 embed 页同一次调用连续取；
// play() 点播时现解现取，绝不用详情时缓存的地址；
// dramiyos-cdn 的线：优先取 acek-cdn，3 次都只有 dramiyos 时也直出 master
// （2026-11-19 改：dramiyos hls2 token 绑取嵌页那次请求的 IP，设备侧直取
// 嵌页、播放器以同一 IP 拉流才能过；VM/CF 出口 403 是机房 IP 被拦，不是
// 地址本身坏；同 javgg 设备侧直解。绝不用 hls4——TikTok 广告图诱饵）。
// VM 侧注意：VidHide token 绑取嵌页那次请求的出口 IP，VM 出口 IP 每次连接都可能变，
// 故 VM 侧 master 一律 403（acek/dramiyos、换 Referer/UA/Cookie 均 403），VM 验不出流，
// 须以用户设备真机为准；不要拿 VM 403 当设备失败，也不要为此建 Worker 中转
// （VidHide 中转从结构上就是死的，javtubs-hls v1 腿已死，不要复活）。
// 带字幕（有番号）。
const HOST = 'https://javtubs.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function headers(referer) {
    return {
        'User-Agent': UA,
        'Referer': referer || (HOST + '/'),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

function t(v) {
    return String(v == null ? '' : v).trim();
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#x([0-9a-fA-F]+);/g, (a, h) => { try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return a; } })
        .replace(/&#(\d+);/g, (a, d) => { try { return String.fromCharCode(parseInt(d, 10)); } catch (e) { return a; } });
}

const CLASSES = [
    { type_id: 'latest', type_name: '最新', path: '/new-post' },
    { type_id: 'featured', type_name: '精选', path: '/featured' },
    { type_id: 'rm', type_name: 'Reducing Mosaic', path: '' },
    { type_id: 'censored', type_name: '有码', path: '/category/censored' },
    { type_id: 'uncensored', type_name: '无码', path: '/category/uncensored' },
    { type_id: 'chinese-subtitle', type_name: '中文字幕', path: '/category/chinese-subtitle' },
    { type_id: 'chinese-uncensored', type_name: '无码中文', path: '/category/chinese-uncensored' },
    { type_id: 'amateur-censored', type_name: '素人有码', path: '/category/amateur-censored' },
    { type_id: 'hd1080', type_name: '1080p', path: '/category/1080p' },
    { type_id: '4k', type_name: '4K', path: '/category/4k' },
];
const PATH_BY_ID = {};
for (const c of CLASSES) PATH_BY_ID[c.type_id] = c.path;

async function getHtml(url, referer) {
    for (let i = 0; i < 3; i++) {
        try {
            const r = await $fetch.get(url, { headers: headers(referer) });
            if (r && (r.status === 200 || r.status == null) && r.data) return String(r.data);
            if (r && r.status && r.status !== 200) return '';
        } catch (e) {}
    }
    return '';
}

async function getText200(url, referer) {
    for (let i = 0; i < 2; i++) {
        try {
            const r = await $fetch.get(url, { headers: headers(referer) });
            if (r && r.status === 200 && r.data) return String(r.data);
            if (r && r.status) return '';
        } catch (e) {}
    }
    return '';
}

async function postForm(url, body, referer) {
    for (let i = 0; i < 2; i++) {
        try {
            const r = await $fetch.post(url, body, {
                headers: {
                    'User-Agent': UA,
                    'Referer': referer || (HOST + '/'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': '*/*',
                },
            });
            if (r && (r.status === 200 || r.status == null) && r.data) return String(r.data);
        } catch (e) {}
    }
    return '';
}

function parseList(html) {
    const list = [];
    if (!html) return list;
    const re = /<div class="post-entry-1">[\s\S]*?<a href="(\/[^"]+)" title="([^"]*)">[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(html)) !== null) {
        const href = m[1];
        if (seen.has(href)) continue;
        seen.add(href);
        let name = decodeEntities(m[2] || '').trim();
        const pic = m[3] || '';
        const slug = href.replace(/^\//, '').replace(/\/$/, '');
        if (!name) {
            const cm = slug.match(/^([a-z]+-\d+)/i);
            name = cm ? cm[1].toUpperCase() : slug.toUpperCase();
        }
        if (!pic) continue;
        list.push({
            vod_id: HOST + href,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: '',
            ext: { id: HOST + href, name },
        });
    }
    return list;
}

function parsePagecount(html) {
    if (!html) return 1;
    const pages = [];
    const re = /(?:\/page\/|[?&]page=)(\d+)/g;
    let m;
    while ((m = re.exec(html)) !== null) pages.push(parseInt(m[1], 10) || 1);
    if (!pages.length) return 1;
    return Math.max.apply(null, pages);
}

function listUrl(id, page) {
    if (id === 'rm') {
        return HOST + '/search?s=' + encodeURIComponent('reducing mosaic') + (page > 1 ? '&page=' + page : '');
    }
    const path = PATH_BY_ID[id] || '/new-post';
    return HOST + path + (page > 1 ? '/page/' + page : '');
}

function unpackPacked(html) {
    const s = String(html || '');
    const i = s.indexOf('eval(function(p,a,c,k,e,d){');
    if (i < 0) return '';
    const j = s.indexOf("}('", i);
    if (j < 0) return '';
    const pStart = j + 3;
    let k1 = -1;
    let a = 0;
    let c0 = 0;
    let kStr = '';
    let pos = pStart;
    while (true) {
        const q = s.indexOf("',", pos);
        if (q < 0) return '';
        const rest = s.slice(q + 2);
        const m = rest.match(/^(\d+),(\d+),'/);
        if (m) {
            k1 = q;
            a = parseInt(m[1], 10);
            c0 = parseInt(m[2], 10);
            kStr = rest.slice(m[0].length);
            break;
        }
        pos = q + 2;
    }
    const p = s.slice(pStart, k1);
    const kEnd = kStr.indexOf("'.split('|')");
    if (kEnd < 0) return '';
    const k = kStr.slice(0, kEnd).split('|');
    let out = p;
    let c = c0;
    while (c--) {
        if (k[c]) out = out.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    }
    if (out.indexOf('hls2') < 0 && out.indexOf('jwplayer') < 0) return '';
    return out;
}

function labelOf(h) {
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    if (h > 0) return h + 'p';
    return '自适应';
}

function masterFromEmbedHtml(html, embed) {
    const up = unpackPacked(html || '');
    if (!up) return '';
    let m = up.match(/"hls2"\s*:\s*"([^"]+)"/);
    let u = m ? m[1] : '';
    if (!u) {
        m = up.match(/"file"\s*:\s*"([^"]*master\.m3u8[^"]*)"/);
        u = m ? m[1] : '';
    }
    if (!u) return '';
    u = u.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/') {
        const om = String(embed || '').match(/^(https?:\/\/[^\/]+)/);
        return om ? om[1] + u : '';
    }
    return '';
}

function absUrl(base, rel) {
    if (/^https?:\/\//i.test(rel)) return rel;
    const m = String(base || '').match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
    if (!m) return rel;
    if (rel.charAt(0) === '/') return m[1] + rel;
    const dir = (m[2] || '/').replace(/[^\/]*$/, '');
    return m[1] + dir + rel;
}

async function labelsFromVidHide(embed, referer) {
    try {
        const html = await getHtml(embed, referer);
        if (!html) return { labels: [], master: '' };
        return { labels: labelsFromEmbedHtml(html), master: masterFromEmbedHtml(html, embed) };
    } catch (e) {
        return { labels: [], master: '' };
    }
}

function labelsFromEmbedHtml(html) {
    const up = unpackPacked(html || '');
    if (!up) return [];
    const m = up.match(/qualityLabels[^}]*\}/);
    if (!m) return [];
    const clean = m[0].replace(/\\"/g, '"').replace(/\\'/g, "'");
    const out = [];
    const seen = {};
    for (const mm of clean.matchAll(/"(\d+)"\s*:\s*"([^"]+)"/g)) {
        const label = labelOf(parseInt(mm[2].replace(/[^0-9]/g, ''), 10) || 0);
        if (!label || label === '自适应') continue;
        if (seen[label]) continue;
        seen[label] = true;
        out.push({ label, h: parseInt(mm[2].replace(/[^0-9]/g, ''), 10) || 0 });
    }
    out.sort((a, b) => b.h - a.h);
    return out;
}

const tierCache = new Map();

async function resolveTiers(durl) {
    const hit = tierCache.get(durl);
    if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.v;
    const res = { tiers: [], embed: '', master: '' };
    try {
        const html = await getHtml(durl);
        if (html) {
            const lm = html.match(/id="links" value="([^"]+)"/);
            if (lm) {
                const linksVal = lm[1];
                const nBtn = (html.match(/class="btn btn-server[^"]*"/g) || []).length;
                const nParts = linksVal.split(',,').length;
                const n = Math.max(nBtn, nParts, 1);
                for (let opt = 1; opt <= n; opt++) {
                    let embed = '';
                    try {
                        const body = 'links=' + encodeURIComponent(linksVal) + '&option=' + opt;
                        const r = (await postForm(HOST + '/get_link.php', body, durl)).trim();
                        if (/^https?:\/\//i.test(r)) embed = r;
                    } catch (e) {}
                    if (!embed) continue;
                    if (!res.embed) res.embed = embed;
                    if (/earnvidjavgg\.xyz/i.test(embed)) {
                        const r2 = await labelsFromVidHide(embed, durl);
                        if (r2.labels.length) { res.tiers = r2.labels; if (r2.master) res.master = r2.master; break; }
                    }
                }
            }
        }
    } catch (e) {}
    tierCache.set(durl, { ts: Date.now(), v: res });
    if (tierCache.size > 100) tierCache.delete(tierCache.keys().next().value);
    return res;
}

function slugCode(durl) {
    const slug = String(durl || '').replace(/\/$/, '').split('/').pop() || '';
    const cm = slug.match(/^([a-z]+-\d+)/i);
    return cm ? cm[1].toUpperCase() : slug.toUpperCase();
}

async function resolveFresh(durl) {
    const out = { tiers: [], embed: '', master: '' };
    try {
        const html = await getHtml(durl);
        if (!html) return out;
        const lm = html.match(/id="links" value="([^"]+)"/);
        if (!lm) return out;
        const linksVal = lm[1];
        const nBtn = (html.match(/class="btn btn-server[^"]*"/g) || []).length;
        const nParts = linksVal.split(',,').length;
        const n = Math.max(nBtn, nParts, 1);
        for (let opt = 1; opt <= n; opt++) {
            let embed = '';
            try {
                const body = 'links=' + encodeURIComponent(linksVal) + '&option=' + opt;
                const r = (await postForm(HOST + '/get_link.php', body, durl)).trim();
                if (/^https?:\/\//i.test(r)) embed = r;
            } catch (e) {}
            if (!embed) continue;
            if (!out.embed) out.embed = embed;
            if (!/earnvidjavgg\.xyz/i.test(embed)) continue;
            let ehtml = '';
            try { ehtml = await getHtml(embed, durl); } catch (e) {}
            if (!ehtml) continue;
            const labels = labelsFromEmbedHtml(ehtml);
            const master = masterFromEmbedHtml(ehtml, embed);
            if (!master) continue;
            out.master = master;
            if (labels.length) out.tiers = labels;
            break;
        }
    } catch (e) {}
    return out;
}

function variantForTier(masterText, masterUrl, want) {
    const lines = String(masterText || '').split('\n');
    const vars = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        const rm = line.match(/RESOLUTION=(\d+)x(\d+)/);
        const h = rm ? parseInt(rm[2], 10) || 0 : 0;
        let uri = '';
        for (let j = i + 1; j < lines.length; j++) {
            const u = lines[j].trim();
            if (!u) continue;
            if (u.charAt(0) === '#') continue;
            uri = u;
            break;
        }
        if (!uri) continue;
        vars.push({ label: labelOf(h), h, url: absUrl(masterUrl, uri) });
    }
    vars.sort((a, b) => b.h - a.h);
    if (!vars.length) return '';
    if (want) {
        for (const v of vars) { if (v.label === want) return v.url; }
        return '';
    }
    return vars[0].url;
}

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

function isAcekMaster(u) { return /acek-cdn\.com/i.test(String(u || '')); }
function isDramiyosMaster(u) { return /dramiyos-cdn\.com/i.test(String(u || '')); }

// 点播时现铸 master：最多重铸 3 次，优先取 acek-cdn 的线；
// 3 次都只有 dramiyos-cdn 时也返回它（不再置空）：dramiyos 的 hls2 token
// 绑取嵌页那次请求的 IP，设备侧直取嵌页、播放器以同一 IP 拉流才能过
// （同 javgg 设备侧直解；VM/CF 出口一律 403 是机房 IP 被拦，不是地址本身坏）。
async function resolveFreshPreferAcek(durl) {
    let dramiyos = null;
    for (let i = 0; i < 3; i++) {
        const fr = await resolveFresh(durl);
        if (!fr.master) continue;
        if (isAcekMaster(fr.master)) return fr;
        if (isDramiyosMaster(fr.master) && !dramiyos) dramiyos = fr;
        if (!isDramiyosMaster(fr.master) && !isAcekMaster(fr.master)) return fr;
    }
    return dramiyos || { tiers: [], embed: '', master: '' };
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'JavTubs',
        site: HOST,
        tabs: CLASSES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'latest');
    const page = parseInt(ext.page || 1, 10) || 1;
    const html = await getHtml(listUrl(id, page));
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id || '');
    const tracks = [];
    if (id) {
        const durl = id.indexOf('http') === 0 ? id : HOST + '/' + id.replace(/^\//, '');
        const html = await getHtml(durl);
        const title = decodeEntities((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').trim() || slugCode(durl);
        const r = await resolveTiers(durl);
        if (r.tiers.length) {
            for (const x of r.tiers) tracks.push({ name: x.label, pan: '', ext: { url: durl + '@' + x.label, name: title } });
        } else {
            tracks.push({ name: '站内播放', pan: '', ext: { url: durl + '@app', name: title } });
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.url || '').trim();
    const name = t(ext.name || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    const at = id.lastIndexOf('@');
    let durl = id;
    let want = '';
    if (at > 0) {
        durl = id.slice(0, at);
        want = id.slice(at + 1);
    }
    if (durl.indexOf('http') !== 0) durl = HOST + '/' + durl.replace(/^\//, '');
    const withSubs = async (url, referer) => {
        const result = { urls: [url], headers: [{ 'User-Agent': UA, 'Referer': referer }] };
        if (name) {
            try {
                const subs = await subSearch(name);
                if (subs && subs.length) result.subs = subs;
            } catch (e) {}
        }
        return jsonify(result);
    };
    try {
        const fr = await resolveFreshPreferAcek(durl);
        if (want === 'app' || !fr.master) {
            // 无可用 master（dramiyos-only 或取数失败）：不回页面地址、不回 embed 页，直接空。
            return jsonify({ urls: [], headers: [] });
        }
        let url = '';
        try {
            const mt = await getText200(fr.master, fr.embed);
            if (mt && mt.indexOf('#EXTM3U') >= 0) url = variantForTier(mt, fr.master, want);
        } catch (e) {}
        if (!url) url = fr.master;
        return withSubs(url, fr.embed);
    } catch (e) {
        return jsonify({ urls: [], headers: [] });
    }
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text || '');
    const page = parseInt(ext.page || 1, 10) || 1;
    if (!wd) return jsonify({ list: [] });
    const html = await getHtml(HOST + '/search?s=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : ''));
    return jsonify({ list: parseList(html) });
}
