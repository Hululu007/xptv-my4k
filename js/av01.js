// AV01 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/av01.js
// 站点 https://www.av01.media/cn（React SPA + JSON API）；
// 分类：最新/热门/LTX超清解码（tag:3585301）+ 流出/LADA破解无码/無修正/巨尻 + 15 个热门标签；
// 列表 /api/v1/videos/types/latest|hottest，标签 /api/v1/videos/tag/{id}，搜索 POST /api/v1/videos/search?lang=cn；
// 封面须带 geo token（https://files.iw01.xyz/edge/geo.js?json，30 分钟有效、绑 IP，缓存 9 分钟）；
// 播放关键：分片在 customers.iw01.xyz，裸 URL 直接 403，必须先调 GET /api/v1/videos/{id}/cdn-access
// ?token_v2&expires&ip（不要加 comp=true，加了会 403）换 CDN access_token（JWT，1 小时有效、绑 IP、
// is_hot 决定 1080p 上限），再把每个变体 URL 改写成 /api/v1/videos/{id}/manifest/{变体}?access_token=<token>；
// token 绑 IP——XPTV 在设备上取 token、设备上播放，同机同 IP 能过（Worker 中转才是死路，勿试）；
// 1080p 只在 is_hot=true 时给，否则上限 720p，全被滤掉时补回最低档；master 取不到时给一条“自动”线；
// 带字幕（仅片名含可抽番号时搜，播放地址域名会被误抽成 "AV01" 假番号，故只按片名查）。
const HOST = 'https://www.av01.media';
const API = 'https://www.av01.media/api/v1';
const GEO_URL = 'https://files.iw01.xyz/edge/geo.js?json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const NEW_TAGS = [
    { type_id: 'tag:1453929', type_name: '流出' },
    { type_id: 'tag:3583787', type_name: 'LADA破解无码' },
    { type_id: 'tag:3583805', type_name: '無修正' },
    { type_id: 'tag:107', type_name: '巨尻' },
];

const HOT_TAGS = [
    { type_id: 'tag:314590', type_name: 'HD高画质' },
    { type_id: 'tag:1', type_name: '中出内射' },
    { type_id: 'tag:314849', type_name: '独占配信' },
    { type_id: 'tag:5', type_name: '专属女优作品' },
    { type_id: 'tag:2', type_name: '巨乳' },
    { type_id: 'tag:424', type_name: '素人' },
    { type_id: 'tag:3', type_name: '人妻主妇' },
    { type_id: 'tag:527309', type_name: '4K' },
    { type_id: 'tag:314685', type_name: '情色自拍' },
    { type_id: 'tag:166', type_name: '口交吹萧' },
    { type_id: 'tag:94', type_name: '美少女' },
    { type_id: 'tag:599', type_name: '熟女' },
    { type_id: 'tag:59', type_name: '苗条' },
    { type_id: 'tag:60', type_name: '美乳' },
    { type_id: 'tag:26', type_name: '痴女' },
];

const LTX = { type_id: 'tag:3585301', type_name: 'LTX超清解码' };

function t(v) { return String(v == null ? '' : v).trim(); }

function headers() {
    return {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': HOST + '/cn',
    };
}

function pad2(n) {
    n = parseInt(n, 10) || 0;
    return n < 10 ? '0' + n : '' + n;
}

function fmtDur(sec) {
    sec = parseInt(sec, 10) || 0;
    if (!sec) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h) return h + ':' + pad2(m) + ':' + pad2(s);
    return m + ':' + pad2(s);
}

function parseJson(data) {
    if (!data) return null;
    if (typeof data === 'object') return data;
    try { return JSON.parse(String(data)); } catch (e) { return null; }
}

async function getJson(url) {
    try {
        const r = await $fetch.get(url, { headers: headers() });
        const d = parseJson(r && r.data);
        if (d) return d;
    } catch (e) {}
    return null;
}

async function postJson(url, body) {
    try {
        const r = await $fetch.post(url, JSON.stringify(body), {
            headers: Object.assign(headers(), { 'Content-Type': 'application/json' }),
        });
        const d = parseJson(r && r.data);
        if (d) return d;
    } catch (e) {}
    return null;
}

async function getText(url) {
    try {
        const r = await $fetch.get(url, { headers: headers() });
        return String((r && r.data) || '');
    } catch (e) { return ''; }
}

let _geo = null;
let _geoAt = 0;

async function getGeo(force) {
    const now = Date.now();
    if (!force && _geo && now - _geoAt < 9 * 60 * 1000) return _geo;
    const d = await getJson(GEO_URL);
    if (d && d.token_v2 && d.expires && d.ip) {
        _geo = d;
        _geoAt = now;
        return _geo;
    }
    return _geo;
}

function coverUrl(id) {
    const base = 'https://static.av01.tv/media/videos/tmb/' + id + '/1.jpg/format=webp/wlv=800';
    const tk = _geo && _geo.access_token ? String(_geo.access_token) : '';
    return tk ? base + '?access_token=' + encodeURIComponent(tk) : base;
}

let _cdnCache = {};

function b64urlDecode(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    if (typeof Buffer !== 'undefined') {
        try { return Buffer.from(s, 'base64').toString('utf8'); } catch (e) {}
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    let i = 0;
    s = s.replace(/=+$/, '');
    while (i < s.length) {
        const a = chars.indexOf(s.charAt(i++));
        const b = chars.indexOf(s.charAt(i++));
        const c = chars.indexOf(s.charAt(i++));
        const d = chars.indexOf(s.charAt(i++));
        if (a < 0 || b < 0) break;
        out += String.fromCharCode((a << 2) | (b >> 4));
        if (c >= 0) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
        if (d >= 0) out += String.fromCharCode(((c & 3) << 6) | d);
    }
    return out;
}

function jwtIsHot(token) {
    try {
        const parts = String(token || '').split('.');
        if (parts.length !== 3) return false;
        const obj = JSON.parse(b64urlDecode(parts[1]));
        return !!(obj && obj.is_hot);
    } catch (e) { return false; }
}

function jwtExp(token) {
    try {
        const parts = String(token || '').split('.');
        if (parts.length !== 3) return 0;
        const obj = JSON.parse(b64urlDecode(parts[1]));
        return (obj && parseInt(obj.exp, 10)) || 0;
    } catch (e) { return 0; }
}

async function getCdnToken(vid) {
    const nowSec = Math.floor(Date.now() / 1000);
    const cached = _cdnCache[vid];
    if (cached && cached.expiresAt && nowSec < cached.expiresAt - 60) return cached;
    for (let attempt = 0; attempt < 2; attempt++) {
        const geo = await getGeo(attempt > 0);
        if (!geo) break;
        const q = 'token_v2=' + encodeURIComponent(String(geo.token_v2))
            + '&expires=' + encodeURIComponent(String(geo.expires))
            + '&ip=' + encodeURIComponent(String(geo.ip));
        const d = await getJson(API + '/videos/' + vid + '/cdn-access?' + q);
        const tk = d && d.access_token ? String(d.access_token) : '';
        if (tk) {
            const ent = {
                token: tk,
                isHot: jwtIsHot(tk),
                expiresAt: (d.expires_at ? parseInt(d.expires_at, 10) : 0) || jwtExp(tk) || (nowSec + 3600),
            };
            _cdnCache[vid] = ent;
            return ent;
        }
    }
    return null;
}

let _tagsCache = null;

async function fetchTagClasses() {
    if (_tagsCache) return _tagsCache;
    try {
        const d = await getJson(API + '/tags/by-video-count?page=1&limit=30');
        const tags = (d && d.tags) || [];
        if (tags.length > HOT_TAGS.length) {
            const seen = new Set();
            const dyn = [];
            for (const tg of tags) {
                const id = String(tg.id || '');
                if (!id || seen.has(id)) continue;
                seen.add(id);
                const nm = t((tg.name_translations && tg.name_translations.cn) || tg.name || '');
                if (!nm) continue;
                dyn.push({ type_id: 'tag:' + id, type_name: nm });
                if (dyn.length >= 28) break;
            }
            if (dyn.length > HOT_TAGS.length) _tagsCache = dyn;
        }
    } catch (e) {}
    return _tagsCache;
}

function toCard(v) {
    const id = String(v && v.id != null ? v.id : '');
    if (!id) return null;
    const title = t((v.title_translations && v.title_translations.cn) || v.title || v.dvd_id || id);
    const dur = fmtDur(v.duration);
    return {
        vod_id: id,
        vod_name: title,
        vod_pic: coverUrl(id),
        vod_remarks: dur || (v.dvd_id ? String(v.dvd_id) : ''),
    };
}

function resolveUrl(u, base) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    const b = String(base || '');
    if (u.charAt(0) === '/') {
        const m = b.match(/^(https?:\/\/[^\/]+)/i);
        return (m ? m[1] : '') + u;
    }
    const idx = b.lastIndexOf('/');
    const dir = idx >= 0 ? b.slice(0, idx + 1) : b + '/';
    return dir + u;
}

function parseMaster(text, baseUrl) {
    const out = [];
    if (!text) return out;
    const lines = String(text).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const rm = lines[i].match(/RESOLUTION=(\d+)x(\d+)/i);
        if (!rm) continue;
        const h = parseInt(rm[2], 10) || 0;
        let u = '';
        for (let j = i + 1; j < lines.length; j++) {
            const s = t(lines[j]);
            if (!s) continue;
            if (s.charAt(0) === '#') continue;
            u = s;
            break;
        }
        if (!u) continue;
        out.push({
            h: h,
            label: h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : h + 'p',
            raw: u,
            url: resolveUrl(u, baseUrl),
        });
    }
    const seen = new Set();
    return out.filter(function (x) {
        if (seen.has(x.label)) return false;
        seen.add(x.label);
        return true;
    });
}

function signVariantUrl(vid, rawUri, cdnToken) {
    const file = String(rawUri || '').split('/').pop();
    const sep = file.indexOf('?') >= 0 ? '&' : '?';
    return API + '/videos/' + vid + '/manifest/' + file + sep + 'access_token=' + encodeURIComponent(cdnToken);
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

async function getConfig() {
    const dyn = await fetchTagClasses();
    const tags = dyn || HOT_TAGS;
    const fixedIds = {};
    for (const x of NEW_TAGS) fixedIds[x.type_id] = 1;
    fixedIds[LTX.type_id] = 1;
    const rest = [];
    for (const x of tags) {
        if (!fixedIds[x.type_id]) rest.push(x);
    }
    const cls = [{ type_id: 'latest', type_name: '最新' }, { type_id: 'hottest', type_name: '热门' }, LTX]
        .concat(NEW_TAGS).concat(rest);
    return jsonify({
        ver: 1,
        title: 'AV01',
        site: HOST,
        tabs: cls.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = parseInt(ext.page || 1, 10) || 1;
    const id = String(ext.tid || 'latest');
    const limit = 20;
    let url = '';
    if (id === 'latest') url = API + '/videos/types/latest?page=' + page + '&limit=' + limit;
    else if (id === 'hottest') url = API + '/videos/types/hottest?page=' + page + '&limit=' + limit;
    else if (id.indexOf('tag:') === 0) url = API + '/videos/tag/' + encodeURIComponent(id.slice(4)) + '?page=' + page + '&limit=' + limit;
    else url = API + '/videos/types/latest?page=' + page + '&limit=' + limit;
    await getGeo(false);
    const d = await getJson(url);
    const videos = (d && d.videos) || [];
    const list = [];
    for (const v of videos) {
        const c = toCard(v);
        if (c) list.push(c);
    }
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let vid = String(ext.id || '');
    const m = vid.match(/(\d{4,})/);
    if (m) vid = m[1];
    vid = vid.replace(/[^0-9]/g, '');
    const tracks = [];
    if (vid) {
        await getGeo(false);
        const v = await getJson(API + '/videos/' + vid);
        const name = v ? t((v.title_translations && v.title_translations.cn) || v.title || v.dvd_id || vid) : vid;
        const subTitle = (name + ' ' + (v && v.dvd_id ? String(v.dvd_id) : '')).trim();
        const masterUrl = API + '/videos/' + vid + '/manifest/master.m3u8';
        const masterText = await getText(masterUrl);
        const vars = parseMaster(masterText, masterUrl);
        if (vars.length) {
            const cdn = await getCdnToken(vid);
            const maxH = (cdn && cdn.isHot) ? 1080 : 720;
            let kept = [];
            for (const x of vars) {
                if (x.h <= maxH) kept.push(x);
            }
            if (!kept.length) {
                const sorted = vars.slice().sort(function (a, b) { return a.h - b.h; });
                kept = [sorted[0]];
            }
            kept.sort(function (a, b) { return b.h - a.h; });
            for (const x of kept) {
                const u = (cdn && cdn.token) ? signVariantUrl(vid, x.raw, cdn.token) : x.url;
                tracks.push({ name: x.label, pan: '', ext: { url: u, name: subTitle } });
            }
        } else {
            tracks.push({ name: '自动', pan: '', ext: { url: masterUrl, name: subTitle } });
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '').trim();
    const name = t(ext.name || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    const result = {
        urls: [url],
        headers: [{ 'User-Agent': UA, 'Referer': HOST + '/cn' }],
    };
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = parseInt(ext.page || 1, 10) || 1;
    if (!wd) return jsonify({ list: [] });
    await getGeo(false);
    const d = await postJson(API + '/videos/search?lang=cn', { query: wd, page: page, limit: 20 });
    const videos = (d && d.videos) || [];
    const list = [];
    for (const v of videos) {
        const c = toCard(v);
        if (c) list.push(c);
    }
    return jsonify({ list });
}
