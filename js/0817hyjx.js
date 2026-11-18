// AV影社 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_0817hyjx.js
// 日本 AV 聚合站（MissAV 系镜像站）。列表 <article class="ms2-card">；
// 详情 iframe /api/public/missav-player/<id>，内 <script id="missav-config">
// JSON 含 poster 与 source（playorigincdn.com master.m3u8，单码率，不编假清晰度）。
// 站方有 xsg-base64-v2 混淆壳（document.write 输出 base64 真实页面），纯 JS 解 base64+UTF-8。
// 字幕按条目接：仅标题或地址含番号才搜（getPlayinfo 内 subSearch）。
const HOST = 'https://www.0817hyjx.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// 2026-11-19 三腿取数：用户手机直连 www.0817hyjx.com 失败（VM 全通）；site-fetch Worker 腿 → jina 腿 → 直连，首个真 HTML 胜出。
const SITE_FETCH = 'https://site-fetch.li768435813.workers.dev';
function looksRealHtml(t) {
    return !!t && t.length > 2000 && !/Just a moment|Checking your browser|cf-challenge|__cf_chl|Attention Required|cf-wrapper|cf\.errors|Enable JavaScript and cookies/i.test(t);
}

// 三腿取原文（不解混淆壳，解壳由 getHtml 做）。
async function fetchRaw(url) {
    const h = { 'User-Agent': UA, 'Referer': HOST + '/cn', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' };
    try {
        const r = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), { headers: h, timeout: 12000 });
        if (r && r.status === 200 && looksRealHtml(String(r.data || ''))) return String(r.data);
    } catch (e) {}
    try {
        const h2 = Object.assign({}, h, { 'x-respond-with': 'html' });
        const r = await $fetch.get('https://r.jina.ai/' + url, { headers: h2, timeout: 20000 });
        if (r && r.status === 200 && looksRealHtml(String(r.data || ''))) return String(r.data);
    } catch (e) {}
    try {
        const r = await $fetch.get(url, { headers: h, timeout: 15000 });
        if (r && r.status && r.status !== 200) return '';
        return r && typeof r.data === 'string' ? r.data : '';
    } catch (e) { return ''; }
}

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
}

function clean(s) {
    return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ').trim();
}

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return HOST + u;
    return u;
}

// 纯 JS base64 解码（XPTV 无 Buffer/atob），返回字节串（latin1）。
function b64decode(b64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const s = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    let out = '';
    for (let i = 0; i < s.length; i += 4) {
        const c1 = chars.indexOf(s.charAt(i));
        const c2 = chars.indexOf(s.charAt(i + 1));
        const c3 = chars.indexOf(s.charAt(i + 2));
        const c4 = chars.indexOf(s.charAt(i + 3));
        const n = (c1 << 18) | (c2 << 12) | ((c3 >= 0 ? c3 : 0) << 6) | (c4 >= 0 ? c4 : 0);
        out += String.fromCharCode((n >> 16) & 255);
        if (c3 >= 0) out += String.fromCharCode((n >> 8) & 255);
        if (c4 >= 0) out += String.fromCharCode(n & 255);
    }
    return out;
}

// UTF-8 字节串 -> JS 字符串（纯 JS，无 TextDecoder）。
function utf8decode(bin) {
    let out = '';
    let i = 0;
    while (i < bin.length) {
        const c = bin.charCodeAt(i);
        if (c < 128) { out += bin.charAt(i); i += 1; }
        else if (c >= 192 && c < 224) {
            const c2 = bin.charCodeAt(i + 1);
            out += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
            i += 2;
        } else if (c >= 224 && c < 240) {
            const c2 = bin.charCodeAt(i + 1);
            const c3 = bin.charCodeAt(i + 2);
            out += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
            i += 3;
        } else {
            const c2 = bin.charCodeAt(i + 1);
            const c3 = bin.charCodeAt(i + 2);
            const c4 = bin.charCodeAt(i + 3);
            let cp = ((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
            cp -= 0x10000;
            out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 1023));
            i += 4;
        }
    }
    return out;
}

async function getHtml(url) {
    let full = String(url || '');
    if (full.indexOf('//') === 0) full = 'https:' + full;
    else if (full.charAt(0) === '/') full = HOST + full;
    const raw = await fetchRaw(full);
    if (!raw) return '';
    // 站方 xsg-base64-v2 混淆壳：壳里只有一段长 base64，解开即真实页面；
    // 解不开或解开后无卡片时回落原文。
    if (raw.indexOf('data-xsg-obfuscation') >= 0) {
        try {
            const cands = raw.match(/"([A-Za-z0-9+/=]{1000,})"/g) || [];
            let best = '';
            for (let i = 0; i < cands.length; i++) {
                const inner = cands[i].slice(1, -1);
                if (inner.length > best.length) best = inner;
            }
            if (best) {
                const decoded = utf8decode(b64decode(best));
                if (decoded.indexOf('<article') >= 0) return decoded;
            }
        } catch (e) { /* fall through */ }
    }
    return raw;
}

function parseCards(html) {
    const out = [];
    const seen = {};
    const re = /<article[^>]*class="[^"]*ms2-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) {
        const inner = m[1];
        const hrefM = inner.match(/href=["']([^"']+)["']/);
        if (!hrefM) continue;
        const slugM = hrefM[1].match(/\/cn\/([A-Za-z0-9][^"'?#]*)/);
        if (!slugM) continue;
        const href = '/cn/' + slugM[1];
        if (seen[href]) continue;
        seen[href] = true;
        const imgM = inner.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
        const altM = inner.match(/<img[^>]+alt=["']([^"']*)["']/i);
        const durM = inner.match(/ms2-duration[^>]*>([^<]+)</);
        const title = clean(altM ? altM[1] : '');
        const h3M = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
        const name = title || (h3M ? clean(h3M[1]) : '') || '精彩视频';
        out.push({ vod_id: href, vod_name: name, vod_pic: imgM ? imgM[1].trim() : '', vod_remarks: durM ? durM[1].trim() : '', ext: { id: href } });
    }
    return out;
}

function catPath(v) {
    return '/cn/' + String(v || '').replace(/^\/+/, '');
}
const CLASSES = [
  { v: 'new', n: '最近更新' },
  { v: 'release', n: '新作上市' },
  { v: 'chinese-subtitle', n: '中文字幕' },
  { v: 'uncensored-leak', n: '无码流出' },
  { v: 'today-hot', n: '今日热门' },
  { v: 'weekly-hot', n: '本週热门' },
  { v: 'monthly-hot', n: '本月热门' },
  { v: 'genres/VR', n: 'VR' },
  { v: 'genres/%E5%B7%A8%E4%B9%B3', n: '巨乳' },
  { v: 'genres/%E5%A4%A7%E5%B1%81%E8%82%A1', n: '大屁股' },
  { v: 'genres/%E5%B7%A8%E4%B9%B3%E5%81%8F%E5%A5%BD', n: '巨乳偏好' },
  { v: 'genres/%E5%B1%81%E8%82%A1%E5%81%8F%E5%A5%BD', n: '屁股偏好' },
  { v: 'genres/%E5%A4%96%E5%9B%BD%E5%A5%B3%E4%BC%98', n: '欧美大片' },
  { v: 'fc2', n: 'FC2' },
  { v: 'heyzo', n: 'HEYZO' },
  { v: 'tokyohot', n: '东京热' },
  { v: '1pondo', n: '一本道' },
  { v: 'caribbeancom', n: 'Caribbeancom' },
  { v: 'caribbeancompr', n: 'Caribbeancompr' },
  { v: '10musume', n: '10musume' },
  { v: 'pacopacomama', n: 'pacopacomama' },
  { v: 'gachinco', n: 'Gachinco' },
  { v: 'xxxav', n: 'XXX-AV' },
  { v: 'marriedslash', n: '人妻斩' },
  { v: 'naughty4610', n: '顽皮 4610' },
  { v: 'naughty0930', n: '顽皮 0930' },
  { v: 'siro', n: 'SIRO' },
  { v: 'luxu', n: 'LUXU' },
  { v: 'gana', n: 'GANA' },
  { v: 'maan', n: 'PRESTIGE PREMIUM' },
  { v: 'scute', n: 'S-CUTE' },
  { v: 'ara', n: 'ARA' },
  { v: 'madou', n: '麻豆传媒' },
  { v: 'twav', n: 'TWAV' },
  { v: 'furuke', n: 'Furuke' },
  { v: 'klive', n: '韩国直播' },
  { v: 'clive', n: '中国直播' },
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


async function getConfig() {
    const tabs = [{ name: '首页推荐', ext: { id: 'home' } }];
    for (let i = 0; i < CLASSES.length; i++) {
        tabs.push({ name: CLASSES[i].n, ext: { id: CLASSES[i].v } });
    }
    return jsonify({ ver: 1, title: 'AV影社', site: HOST, tabs: tabs });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.id || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (tid === 'home' || !tid) {
        const list = parseCards(await getHtml('/cn'));
        return jsonify({ list: list });
    }
    const path = catPath(tid);
    const url = page === 1 ? path : (path + '?page=' + page);
    const html = await getHtml(url);
    const list = parseCards(html);
    return jsonify({ list: list });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = String(ext.text || '').trim();
    if (!kw) return jsonify({ list: [] });
    const html = await getHtml('/cn/search?keyword=' + encodeURIComponent(kw));
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const rawId = String(ext.id || '');
    if (!rawId) return jsonify({ list: [] });
    const durl = rawId.indexOf('http') === 0 ? rawId : HOST + rawId;
    const html = await getHtml(rawId);
    const h1M = html.match(/<h1>([\s\S]*?)<\/h1>/i);
    const mainTitle = h1M ? clean(h1M[1]) : '';
    const tM = html.match(/<title>(.*?)<\/title>/i);
    const title = mainTitle || (tM ? clean(tM[1]).replace(/\s*-\s*日本AV高清在线播放\s*-\s*AV影社\s*$/i, '').trim() : '') || '精彩视频';
    let playUrl = '';
    let posterPic = '';
    const iframeM = html.match(/<iframe[^>]+src=["']((?:https:\/\/playdaili\.com)?\/api\/public\/missav-player\/\d+)["']/i);
    if (iframeM) {
        const playerUrl = iframeM[1].indexOf('http') === 0 ? iframeM[1] : HOST + iframeM[1];
        const playerHtml = await getHtml(playerUrl);
        const cfgM = playerHtml.match(/id="missav-config">(\{[\s\S]*?\})<\/script>/);
        if (cfgM) {
            try {
                const cfg = JSON.parse(cfgM[1]);
                if (cfg.source && String(cfg.source).indexOf('https://') === 0) playUrl = String(cfg.source);
                if (cfg.poster) posterPic = String(cfg.poster);
            } catch (e) { /* ignore */ }
        }
        if (!playUrl) {
            const srcM = playerHtml.match(/"source"\s*:\s*"([^"]+)"/);
            if (srcM) playUrl = srcM[1];
        }
    }
    if (!posterPic) {
        const parts = rawId.split('/').filter(function (x) { return x; });
        const slug = parts.length ? parts[parts.length - 1] : '';
        if (slug) posterPic = 'https://webp.cdnimg261015.com/video-covers/missav/' + slug + '.jpg';
    }
    if (!playUrl) return jsonify({ list: [] });
    return jsonify({ list: [{ title: '在线播放', tracks: [{ name: '正片', pan: '', ext: { url: playUrl, name: title } }] }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '').trim();
    if (!url) return jsonify({ urls: [], headers: [] });
    const result = { urls: [url], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/cn' }] };
    const name = String(ext.name || '');
    // 字幕按条目接：仅当标题含番号才搜，否则不带 subs 键。
    if (name && subExtractCode(name)) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}
