// JavLust - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_javlust.js
// 站点 https://javlust.net（JavTiful 播放后端；详情嵌 javtiful.com/embed/{tid}）；
// 分类：最新/破解减码/有码/无码/素人/最多观看；285 个类型筛选与排序在 XPTV 里不展；
// 播放（票据约 30 分钟，play 时现取现投）：详情页 iframe embed 页内联 JSON "playback"
// {endpoint:"/video/{tid}/playback", ticket:"p1.{tid}.0.{ts}.{hash}"}，POST 该 endpoint
// （ticket 表单体，头 X-Requested-With + Referer embed 页）返回 sources 单档 720p，
// src 为相对地址须补 javtiful.com 绝对地址，302 跳 R2 直链 MP4；站内无多档，不编造档位；
// 带字幕（有番号）。
const HOST = 'https://javlust.net';
const TIFUL = 'https://javtiful.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function H(referer) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer || (HOST + '/'),
    };
}

function t(v) { return String(v == null ? '' : v).trim(); }

function clean(s) {
    return t(s).replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (a, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (a, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (a, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (a, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

async function getText(url, referer) {
    try {
        const r = await $fetch.get(url, { headers: H(referer) });
        if (r && r.data) return String(r.data);
    } catch (e) {}
    return '';
}

function absUrl(href) {
    href = String(href || '').trim();
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith('/')) return HOST + href;
    return HOST + '/' + href;
}

const CATS = [
    { type_id: 'latest', type_name: '最新', path: '/' },
    { type_id: 'reducing-mosaic', type_name: '破解减码', path: '/reducing-mosaic' },
    { type_id: 'censored', type_name: '有码', path: '/censored' },
    { type_id: 'uncensored', type_name: '无码', path: '/uncensored' },
    { type_id: 'amateur', type_name: '素人', path: '/amateur' },
    { type_id: 'most-viewed', type_name: '最多观看', path: '/most-viewed' },
];
const PATH_BY_ID = {};
for (const c of CATS) PATH_BY_ID[c.type_id] = c.path;

function parseCards(html) {
    const items = [];
    const seen = new Set();
    const re = /<a[^>]*href="(\/video\/\d+\/[^"]+)"[^>]*>([\s\S]{0,1200}?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const href = m[1];
        if (seen.has(href)) continue;
        seen.add(href);
        const inner = m[2];
        let pic = '';
        const dm = inner.match(/data-src\s*=\s*"([^"]+)"/i);
        if (dm && dm[1] && !/placeholder/i.test(dm[1])) pic = dm[1];
        if (!pic) {
            const sm = inner.match(/<img[^>]*src\s*=\s*"([^"]+)"/i);
            if (sm && sm[1] && !/placeholder/i.test(sm[1]) && sm[1].indexOf('data:image') !== 0) pic = sm[1];
        }
        const bm = inner.match(/badge[^>]*>([^<]+)</i);
        const code = bm ? stripTags(bm[1]) : '';
        const tail = html.slice(m.index + m[0].length, m.index + m[0].length + 1200);
        let title = '';
        const tm = tail.match(/<h6[^>]*>\s*<a[^>]*title="([^"]+)"/i);
        if (tm) title = clean(tm[1]);
        if (!title) title = code || href.split('/').pop().replace(/-/g, ' ');
        const du = tail.match(/🕓\s*([\d:]+)/);
        const remarks = du ? du[1] : (code || '');
        items.push({ vod_id: absUrl(href), vod_name: title, vod_pic: pic, vod_remarks: remarks });
        if (items.length >= 60) break;
    }
    return items;
}

function listUrl(id, page) {
    const path = PATH_BY_ID[id] || '/';
    return HOST + path + '?sort=latest' + (page > 1 ? '&page=' + page : '');
}

async function fetchPlayback(durl, html) {
    const em = html.match(/javtiful\.com\/embed\/(\d+)/i);
    if (!em) return null;
    const embedUrl = TIFUL + '/embed/' + em[1];
    const ehtml = await getText(embedUrl, durl);
    if (!ehtml) return null;
    const pm = ehtml.match(/"playback"\s*:\s*\{\s*"endpoint"\s*:\s*"([^"]+)"\s*,\s*"ticket"\s*:\s*"([^"]+)"/i);
    if (!pm) return null;
    const endpoint = pm[1].indexOf('http') === 0 ? pm[1] : TIFUL + pm[1];
    try {
        const r = await $fetch.post(endpoint, 'ticket=' + encodeURIComponent(pm[2]), {
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': embedUrl,
            },
        });
        const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        if (j && j.success && Array.isArray(j.sources) && j.sources.length) {
            return { sources: j.sources, embedUrl };
        }
    } catch (e) {}
    return { sources: null, embedUrl };
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
        title: 'JavLust',
        site: HOST,
        tabs: CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'latest');
    const page = parseInt(ext.page || 1, 10) || 1;
    const html = await getText(listUrl(id, page), HOST + '/');
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id || '');
    const tracks = [];
    if (id) {
        const durl = id.indexOf('http') === 0 ? id : HOST + '/' + id.replace(/^\//, '');
        const html = await getText(durl, HOST + '/');
        const tm = html.match(/<title>([^<]*)<\/title>/i);
        const title = tm ? clean(tm[1]) : 'JavLust';
        tracks.push({ name: '720p', pan: '', ext: { url: durl, name: title } });
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.url || '').trim();
    const name = t(ext.name || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    const durl = id.indexOf('http') === 0 ? id : HOST + '/' + id.replace(/^\//, '');
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
        const html = await getText(durl, HOST + '/');
        const pb = html ? await fetchPlayback(durl, html) : null;
        if (pb && pb.sources && pb.sources.length) {
            const s0 = pb.sources[0];
            const abs = String(s0.src || '').indexOf('http') === 0 ? s0.src : TIFUL + s0.src;
            return withSubs(abs, TIFUL + '/');
        }
        return jsonify({ urls: [(pb && pb.embedUrl) || durl], headers: [{ 'User-Agent': UA, 'Referer': durl }] });
    } catch (e) {
        return jsonify({ urls: [durl], headers: [{ 'User-Agent': UA, 'Referer': durl }] });
    }
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text || '');
    const page = parseInt(ext.page || 1, 10) || 1;
    if (!wd) return jsonify({ list: [] });
    const html = await getText(HOST + '/search/?q=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : ''), HOST + '/');
    return jsonify({ list: parseCards(html) });
}
