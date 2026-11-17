// IPornBase - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_ipornbase.js
// Drupal 站：主站 ipornbase.com + 2 站 ipornbase.xyz（同站双域名，顺序
// 回落）。列表 /<section>/<sort>（?page=N，0-based）、标签 /tags/<词>、
// 详情 /video/<slug>，播放 window.m3u8List 首条直链（单码率媒体播单，
// 无多档，不设假清晰度）。分类：站方菜单 8 区 + 排序筛选卡片（最近更新
// /最新发行/中文字幕/今日/本周/本月/年度热门/总观看数）；用户点名近义项
// 實測：無碼破解/巨乳/大屁股均为真实标签页，已加；减码/减少马赛克查无
// 标签页（404、0 条），未加、不硬凑。字幕按条目接：仅标题或地址含番号
// 的条目才调芯，无番号不搜。
const HOSTS = ['https://ipornbase.com', 'https://ipornbase.xyz'];
const PRIMARY = HOSTS[0];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
}

function cleanLabel(s) {
    return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
        .replace(/[\r\n\t]+/g, ' ').replace(/[$#]/g, '').trim();
}

function clean(s) {
    return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ').trim();
}

function absUrl(u, host) {
    u = String(u || '').trim();
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return host + u;
    return u;
}

function normUrl(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
    return s;
}

// 双域名顺序回落：主站（.com，实测更快）先行；空/非 200/异常才走 .xyz。
async function getPage(path) {
    let p = String(path || '');
    if (p.indexOf('//') === 0) p = 'https:' + p;
    for (let i = 0; i < HOSTS.length; i++) {
        const host = HOSTS[i];
        const url = p.charAt(0) === '/' ? host + p : p;
        try {
            const r = await $fetch.get(url, {
                headers: { 'User-Agent': UA, 'Referer': host + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
                timeout: 20000,
            });
            if (r && r.status && r.status !== 200) continue;
            const body = r && typeof r.data === 'string' ? r.data : '';
            if (!body) continue;
            return { html: body, host: host };
        } catch (e) { /* 换下一个域名 */ }
    }
    return { html: '', host: PRIMARY };
}

// 卡片：图链 <a href="/video/<slug>"><img src alt=标题></a>；按 URL 合并，
// 标题取 img alt（无 alt 时取锚内文本）
function parseCards(html, host) {
    const byUrl = {};
    const order = [];
    const re = /<a[^>]+href=["'](\/video\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) {
        const raw = m[1].trim();
        if (!raw || raw.indexOf('go.') >= 0 || raw.indexOf('http') === 0) continue;
        const inner = m[2] || '';
        let it = byUrl[raw];
        if (!it) { it = { vod_id: raw, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl[raw] = it; order.push(raw); }
        const imgM = inner.match(/<img[^>]+>/i);
        if (imgM) {
            const srcM = imgM[0].match(/(?:data-original|data-src|src)=["']([^"']+)["']/i);
            if (srcM && !it.vod_pic) {
                const cand = srcM[1].trim();
                if (cand && !/loading|placeholder|logo/i.test(cand)) it.vod_pic = normUrl(cand.indexOf('http') === 0 ? cand : absUrl(cand, host));
            }
            const altM = imgM[0].match(/alt=["']([^"']*)["']/i);
            if (altM && !it.vod_name) { const tt = cleanLabel(altM[1]); if (tt.length > 1) it.vod_name = tt; }
        }
        if (!it.vod_name) { const txt = cleanLabel(inner); if (txt && txt.length > 2) it.vod_name = txt; }
    }
    const out = [];
    order.forEach(function (k) {
        const it = byUrl[k];
        if (it.vod_pic || it.vod_name) {
            if (!it.vod_name) it.vod_name = '精彩视频';
            it.ext = { id: k };
            out.push(it);
        }
    });
    return out;
}

function sectionPath(sec, sort, page) {
    let base;
    if (sort === 'sub') base = '/' + sec.base + '/new?field_video_tags_target_id=1&sort_by=created';
    else base = '/' + sec.base + '/' + sort;
    if (page > 1) base += (base.indexOf('?') >= 0 ? '&page=' + (page - 1) : '?page=' + (page - 1));
    return base;
}

function tagPath(tag, page) {
    let base = '/tags/' + encodeURIComponent(tag.word);
    if (page > 1) base += '?page=' + (page - 1);
    return base;
}

async function getConfig() {
    const tabs = [{ name: '首頁推薦', ext: { id: 'home' } }];
    SECTIONS.forEach(function (s) { tabs.push({ name: s.name, ext: { id: s.id } }); });
    TAGS.forEach(function (tg) { tabs.push({ name: tg.name, ext: { id: tg.id } }); });
    const filters = {};
    SECTIONS.forEach(function (s) {
        filters[s.id] = [{ key: 'sort', name: '排序', value: SORTS }];
    });
    return jsonify({ ver: 1, title: 'IPornBase', site: PRIMARY, tabs: tabs, filters: filters });
}

async function getCards(ext) {
    ext = argsify(ext);
    const zoneId = String(ext.id || 'home');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const sort = String(ext.sub || (ext.extend && ext.extend.sub) || 'new').trim() || 'new';
    let list = [];
    try {
        if (zoneId === 'home' || !zoneId) {
            const r = await getPage('/');
            list = parseCards(r.html, r.host);
        } else {
            let tag = null;
            TAGS.forEach(function (tg) { if (tg.id === zoneId) tag = tg; });
            if (tag) {
                const r = await getPage(tagPath(tag, page));
                list = parseCards(r.html, r.host);
            } else {
                let sec = null;
                SECTIONS.forEach(function (s) { if (s.id === zoneId) sec = s; });
                if (sec) {
                    const r = await getPage(sectionPath(sec, sort, page));
                    list = parseCards(r.html, r.host);
                }
            }
        }
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = String(ext.text || '').trim();
    if (!kw) return jsonify({ list: [] });
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let path = '/search?fulltext=' + encodeURIComponent(kw);
    if (page > 1) path += '&page=' + (page - 1);
    let list = [];
    try {
        const r = await getPage(path);
        list = parseCards(r.html, r.host);
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const rawId = String(ext.id || '');
    if (!rawId) return jsonify({ list: [] });
    const durl = rawId.indexOf('http') === 0 ? rawId : PRIMARY + rawId;
    const r = await getPage(rawId);
    const html = r.html;
    if (!html) return jsonify({ list: [] });
    let mainTitle = '精彩视频';
    const h1M = html.match(/<h1[^>]*class=["'][^"']*vdtitle[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (h1M) mainTitle = cleanLabel(h1M[1]) || mainTitle;
    else {
        const tM = html.match(/<title>(.*?)<\/title>/i);
        if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*[|｜-]\s*AV空投軍團.*$/i, '').trim() || mainTitle;
    }
    let posterPic = '';
    const vM = html.match(/<video[^>]*poster=["']([^"']+)["']/i);
    if (vM) posterPic = normUrl(vM[1].trim().indexOf('http') === 0 ? vM[1].trim() : absUrl(vM[1].trim(), r.host));
    const m3u8M = html.match(/window\.m3u8List\s*=\s*\[([\s\S]*?)\]/);
    const urls = [];
    if (m3u8M) {
        const re1 = /["'](https?:\/\/[^"']+\.m3u8(?:\?[^"']*)?)["']/g;
        let q;
        while ((q = re1.exec(m3u8M[1])) !== null) {
            const u = q[1].trim();
            if (u && urls.indexOf(u) < 0) urls.push(u);
        }
        if (!urls.length) {
            const re2 = /["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/g;
            while ((q = re2.exec(m3u8M[1])) !== null) {
                const u = q[1].trim();
                if (u && urls.indexOf(u) < 0) urls.push(u);
            }
        }
    }
    if (!urls.length) return jsonify({ list: [] });
    // 字幕按条目接：仅标题或地址含番号的条目才把片名放进 ext.name，
    // 无番号的 ext.name 留空，getPlayinfo 便不搜字幕。
    const code = subExtractCode(mainTitle) || subExtractCode(durl);
    const subName = code ? mainTitle : '';
    const tracks = urls.length === 1
        ? [{ name: '正片', pan: '', ext: { url: urls[0], name: subName, durl: durl } }]
        : urls.map(function (u, i) {
            return { name: '線路' + (i + 1), pan: '', ext: { url: u, name: subName, durl: durl } };
        });
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const target = String(ext.url || '');
    if (!target) return jsonify({ urls: [], headers: [] });
    const result = { urls: [target], headers: [{ 'User-Agent': UA, 'Referer': PRIMARY + '/' }] };
    const name = String(ext.name || '');
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}
const SECTIONS = [
  { id: 'japanese', name: '日本AV', base: 'japanese' },
  { id: 'uncensored-leak', name: 'JAV無碼流出', base: 'uncensored-leak' },
  { id: 'fc2', name: 'FC2素人', base: 'fc2' },
  { id: 'hentai', name: '裏番', base: 'hentai' },
  { id: 'western', name: '歐美', base: 'western' },
  { id: 'asian', name: '亞洲國產AV', base: 'asian' },
  { id: 'korean', name: '韓國直播', base: 'korean' },
  { id: 'ai', name: '黃果短劇', base: 'ai' },
];
const SORTS = [
  { n: '最近更新', v: 'new' },
  { n: '最新發行', v: 'release' },
  { n: '中文字幕', v: 'sub' },
  { n: '今日熱門', v: 'today-hot' },
  { n: '本週熱門', v: 'weekly-hot' },
  { n: '本月熱門', v: 'monthly-hot' },
  { n: '年度熱門', v: 'yearly-hot' },
  { n: '總觀看數', v: 'hot' },
];
const TAGS = [
  { id: 'tag-wuma-pojie', name: '無碼破解', word: '無碼破解' },
  { id: 'tag-juru', name: '巨乳', word: '巨乳' },
  { id: 'tag-dapigu', name: '大屁股', word: '大屁股' },
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

