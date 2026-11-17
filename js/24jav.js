// 24JAV - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_24jav.js
// 站点 https://www4.24-jav.com（WordPress 站，泰语界面，日语 AV）；帖子 = /<番号小写>/；
// 分类：最新/泰语字幕/无码/有码 + 70 个 /genre/<slug>/ 真实类型；搜索 /?s=<关键词>；翻页 /page/<N>/；
// 播放两路：① mee 播放器 iframe → 确定性 master https://<mee18player.com|meeplayer.com>/hlsr2/<40位hex>/master
// （1080p 单档，音视频分离，须给 master 本身）；② 无码路 upload18 播放器 → 播放时现取
// window.PLAYER_CONFIG.m3u8（helvid.com 直链，手机 UA，token 约 30 分钟）；
// 注意：mee 分片是 545 字节 PNG 头包裹的真 TS，猫源靠本地代理剥头才能从头播/快进；XPTV 没有服务端，
// 本文件只能给 master 直链——此前在 Mira 上能播，但严格内核可能不从头播、无法快进，属已知限制；
// 带字幕（仅番号条目）。
const HOST = 'https://www4.24-jav.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const UA_MOB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const U18_REFERER = 'https://upload18.com/';

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (a, n) => String.fromCharCode(parseInt(n, 10)));
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

function normUrl(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
    return s;
}

function t(v) { return String(v == null ? '' : v).trim(); }

async function getHtml(path) {
    let url = String(path || '');
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('/')) url = HOST + url;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await $fetch.get(url, {
                headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
            });
            if (r && r.status && r.status !== 200) continue;
            const body = typeof r.data === 'string' ? r.data : '';
            if (body) return body;
        } catch (e) {}
    }
    return '';
}

async function getText(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const r = await $fetch.get(url, { headers: { 'User-Agent': UA, 'Referer': HOST + '/' } });
            if (r && r.status === 200 && typeof r.data === 'string' && r.data) return r.data;
        } catch (e) {}
    }
    return '';
}

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<article class="box"[\s\S]*?<\/article>/g;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) {
        const block = m[0];
        const aM = block.match(/<a[^>]+class="tip"[^>]+href="([^"]+)"[^>]*title="([^"]*)"/i)
            || block.match(/<a[^>]+href="([^"]+)"[^>]*title="([^"]*)"/i);
        if (!aM) continue;
        const href = aM[1].trim();
        if (!href.startsWith('/') && !href.startsWith(HOST)) continue;
        const path = href.startsWith(HOST) ? href.slice(HOST.length) : href;
        if (seen.has(path)) continue;
        seen.add(path);
        const imgM = block.match(/<img[^>]+src="([^"]+)"/i);
        const qM = block.match(/<span class="quality[^"]*">([^<]+)<\/span>/i);
        out.push({
            vod_id: path,
            vod_name: cleanLabel(aM[2]) || path.replace(/\//g, ''),
            vod_pic: imgM ? normUrl(imgM[1].trim()) : '',
            vod_remarks: qM ? cleanLabel(qM[1]) : '',
        });
    }
    return out;
}

function extractMeeMd5(html) {
    const m = String(html || '').match(/https?:\/\/(mee18player\.com|meeplayer\.com)\/play\/([a-f0-9]{32,64})/i);
    if (!m) return null;
    return { host: m[1].toLowerCase(), token: m[2].toLowerCase() };
}

function masterUrl(mee) {
    return 'https://' + (mee && mee.host ? mee.host : 'mee18player.com') + '/hlsr2/' + mee.token + '/master';
}

function extractUpload18(html) {
    const m = String(html || '').match(/https?:\/\/(?:www\.)?upload18\.com\/play\/index\/([^"'\s<>]+)/i);
    if (!m) return '';
    return 'https://upload18.com/play/index/' + m[1].replace(/\/$/, '');
}

async function getTextWithUa(url, ua, referer) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const r = await $fetch.get(url, { headers: { 'User-Agent': ua, 'Referer': referer } });
            if (r && r.status === 200 && typeof r.data === 'string' && r.data) return r.data;
        } catch (e) {}
    }
    return '';
}

async function resolveUpload18(embedUrl) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const html = await getTextWithUa(embedUrl, UA_MOB, HOST + '/');
        if (!html || html.indexOf('window.PLAYER_CONFIG') < 0) continue;
        let url = '';
        const direct = html.match(/"m3u8"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (direct) url = direct[1].replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
        if (!url) {
            const cfgM = html.match(/window\.PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\});/);
            if (cfgM) { try { url = String(JSON.parse(cfgM[1]).m3u8 || '').replace(/\\\//g, '/'); } catch (e) {} }
        }
        if (/^https?:\/\/[^/]*helvid\.com\/m\//.test(url)) return url;
        if (/^https?:\/\//.test(url) && url.indexOf('.m3u8') >= 0) return url;
    }
    return '';
}

function parseMasterVariants(masterText) {
    const lines = String(masterText || '').split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const inf = lines[i].match(/#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)/);
        if (inf && lines[i + 1] && lines[i + 1].trim() && !lines[i + 1].startsWith('#')) {
            out.push({ label: inf[2] + 'p', url: lines[i + 1].trim() });
        }
    }
    return out;
}

const GENRES = [
    ['3p', '三人行'], ['abuse', '虐待'], ['affair', '出轨'], ['back', '背后位'],
    ['bath', '洗浴'], ['beautiful-girl', '美少女'], ['big-tits', '巨乳'], ['blowjob', '口交'],
    ['bukkake', '颜射'], ['busty-fetish', '巨乳癖'], ['cervix', '宫颈'], ['cowgirl', '女上位'],
    ['creampie', '中出'], ['cuckold', '绿帽'], ['cum', '射精'], ['cunnilingus', '舔阴'],
    ['debut-production', '出道作'], ['dirty-talk', '淫语'], ['drama', '剧情'], ['elder-male', '大叔'],
    ['facials', '面部射精'], ['female-teacher', '女教师'], ['footjob', '足交'], ['gal', '辣妹'],
    ['glasses', '眼镜'], ['hot-spring', '温泉'], ['how-to', '教学'], ['huge-cocks', '巨根'],
    ['humiliation', '羞辱'], ['incest', '乱伦'], ['instructor', '教官'], ['kiss', '接吻'],
    ['lesbian', '女同'], ['lesbian-kiss', '女同接吻'], ['lotion', '乳液'], ['lotion-oil', '精油'],
    ['m-girl', 'M女'], ['male-squirting', '男潮'], ['married', '已婚'], ['married-woman', '人妻'],
    ['mature', '熟女'], ['mini', '娇小'], ['mother', '母亲'], ['muscle', '肌肉'],
    ['nasty', '下流'], ['nurse', '护士'], ['ol', '白领'], ['older-sister', '姐姐'],
    ['orgasm', '高潮'], ['orgy', '群交'], ['original-collaboration', '原创合作'], ['other-asian', '其他亚洲'],
    ['outdoors', '户外'], ['pantyhose', '连裤袜'], ['pov', '第一视角'], ['restraint', '束缚'],
    ['school-swimsuit', '学校泳装'], ['schoolgirls', '女学生'], ['shaved', '白虎'], ['slender', '苗条'],
    ['slut', '淫娃'], ['solowork', '单体作品'], ['squirting', '潮吹'], ['sun-tan', '晒痕'],
    ['sweat', '汗水'], ['swimsuit', '泳装'], ['titty-fuck', '乳交'], ['toy', '玩具'],
    ['urination', '排尿'], ['vibe', '振动棒'],
];

const CLASSES = [
    { type_id: 'home', type_name: '最新' },
    { type_id: 'category/subthai', type_name: '泰语字幕' },
    { type_id: 'category/uncensored', type_name: '无码' },
    { type_id: 'category/censored', type_name: '有码' },
];
for (const [slug, name] of GENRES) CLASSES.push({ type_id: 'genre/' + slug, type_name: name });

function archivePath(id, page) {
    if (id === 'home' || !id) return page > 1 ? '/page/' + page + '/' : '/';
    return page > 1 ? '/' + id + '/page/' + page + '/' : '/' + id + '/';
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
    return jsonify({
        ver: 1,
        title: '24JAV',
        site: HOST,
        tabs: CLASSES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'home');
    const page = parseInt(ext.page || 1, 10) || 1;
    const html = await getHtml(archivePath(id, page));
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id || '');
    const tracks = [];
    if (id) {
        const durl = id.indexOf('http') === 0 ? id : HOST + id;
        const html = await getHtml(id);
        const h1M = html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i);
        const tM = html.match(/<title>(.*?)<\/title>/i);
        let title = '精彩视频';
        if (h1M) title = cleanLabel(h1M[1]) || title;
        else if (tM) title = cleanLabel(tM[1]).replace(/\s*-\s*24-Jav\.com.*$/i, '').trim() || title;
        const mee = extractMeeMd5(html);
        if (mee) {
            const master = masterUrl(mee);
            const variants = parseMasterVariants(await getText(master));
            const label = variants.length ? variants[0].label : '正片';
            tracks.push({ name: label, pan: '', ext: { url: durl + '@@' + master, name: title } });
        } else {
            const embed = extractUpload18(html);
            if (embed) tracks.push({ name: '正片', pan: '', ext: { url: durl + '@@u18:' + embed, name: title } });
            else tracks.push({ name: '网页播放', pan: '', ext: { url: durl, name: title } });
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.url || '').trim();
    const name = t(ext.name || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    let durl = '';
    let target = id;
    const at = id.indexOf('@@');
    if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
    const withSubs = async (url, ua, referer) => {
        const result = { urls: [url], headers: [{ 'User-Agent': ua, 'Referer': referer }] };
        if (name) {
            try {
                const subs = await subSearch(name);
                if (subs && subs.length) result.subs = subs;
            } catch (e) {}
        }
        return jsonify(result);
    };
    try {
        if (target.indexOf('u18:') === 0) {
            const m3u8 = await resolveUpload18(target.slice(4));
            if (m3u8) return withSubs(m3u8, UA_MOB, U18_REFERER);
            return jsonify({ urls: [durl || HOST + '/'], headers: [{ 'User-Agent': UA, 'Referer': durl || HOST + '/' }] });
        }
        if (!target || target === durl) {
            const html = await getHtml(durl || id);
            const mee = extractMeeMd5(html);
            if (mee) target = masterUrl(mee);
            else {
                const embed = extractUpload18(html);
                if (embed) {
                    const m3u8 = await resolveUpload18(embed);
                    if (m3u8) return withSubs(m3u8, UA_MOB, U18_REFERER);
                }
                return jsonify({ urls: [durl || HOST + '/'], headers: [{ 'User-Agent': UA, 'Referer': durl || HOST + '/' }] });
            }
        }
        return withSubs(target, UA, durl || HOST + '/');
    } catch (e) {
        return jsonify({ urls: [durl || id], headers: [{ 'User-Agent': UA, 'Referer': durl || HOST + '/' }] });
    }
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text || '');
    const page = parseInt(ext.page || 1, 10) || 1;
    if (!wd) return jsonify({ list: [] });
    const html = await getHtml('/?s=' + encodeURIComponent(wd));
    return jsonify({ list: parseCards(html) });
}
