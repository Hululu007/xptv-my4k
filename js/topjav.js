// TopJAV - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_topjav.js
// TopJAV - CatPawOpen JS Spider（2026-10-30 新源）
// 站点：https://topjav.tv/cn（另有 /en /kr /tw；详情规范 /video/{id}）
// 结构（2026-10-30 VM 实测）：
//  - 列表：<article class="movie-item">，链接 /cn/video/{id}，
//    封面 https://topjav.tv/storage/images/{id}/thumbnail.jpg，
//    标题 <h3 class="movie-link">；分页 ?page=N（popular 页实测到 4621 页）。
//  - 分类（/cn 导航实测）：最新 /cn，热门 /cn/popular，
//    有码 /cn/categories/censored，无码 /cn/categories/uncensored，
//    减码 /cn/categories/reducing_mosaic。
//  - 播放（2026-10-30 破解，字节级验过）：详情页内联混淆脚本 5 的
//    jwplayer 配置 file: f("<约 220 字符>")；f 的真身是
//    atob(reverse(encoded.slice(16, -16))) →
//    https://topjav.tv/m3u8/{id}.m3u8?time={epoch}&sig={sha256hex}&sig2={短串}。
//    sig 有时效，detail 只给“播放$详情页”线，play() 现取现解现播，
//    绝不把解出的签名 URL 存成静态线。本站未见分辨率档，单线（master）。
//  - 搜索：站内表单 action=/cn/search，字段名 s → /cn/search?s={wd}。
const KEY = 'py_topjav';
const NAME = 'TopJAV';
const HOST = 'https://topjav.tv';
const LANG = '/cn';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function H(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': referer || HOST + LANG,
  };
}

async function getText(url, referer) {
  try {
    const { data } = await $fetch.get(url, { headers: H(referer), timeout: 15000 });
    return String(data || '');
  } catch { return ''; }
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// 顶层 clean（字幕芯 subSlugTitle 用；与 py_ero.js 同款）
function clean(s) {
  return String(s == null ? '' : s).trim().replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<article[^>]*class="[^"]*movie-item[^"]*"[^>]*>([\s\S]{0,6000}?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const blk = m[1];
    const lm = blk.match(/<a[^>]*href="([^"]*\/video\/\d+[^"]*)"[^>]*>/i);
    if (!lm) continue;
    let href = lm[1];
    if (!/^https?:\/\//i.test(href)) href = HOST + (href.startsWith('/') ? href : '/' + href);
    if (seen.has(href)) continue;
    seen.add(href);
    const clean = blk.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let pic = '';
    const ims = clean.match(/<img[^>]*>/gi) || [];
    for (const tag of ims) {
      const sm = tag.match(/(?:data-src|data-original|src)\s*=\s*"([^"]+)"/i);
      if (sm && sm[1] && !/data:image/i.test(sm[1])) {
        pic = /^https?:\/\//i.test(sm[1]) ? sm[1] : HOST + (sm[1].startsWith('/') ? sm[1] : '/' + sm[1]);
        break;
      }
    }
    let title = '';
    const tm = clean.match(/<h3[^>]*>([\s\S]{0,400}?)<\/h3>/i);
    if (tm) title = stripTags(tm[1]);
    if (!title) {
      const am = clean.match(/title="([^"]+)"/i);
      if (am) title = stripTags(am[1]);
    }
    if (!title || title.length < 2) continue;
    let remarks = '';
    const vm = clean.match(/([\d,]+)\s*(?:views|次|观看)/i);
    if (vm) remarks = vm[1];
    items.push({ vod_id: href, vod_name: title, vod_pic: pic, vod_remarks: remarks });
    if (items.length >= 60) break;
  }
  return items;
}

// 2026-10-30 晚：站内题材页为 /cn/genre/{slug}（/cn/genres 索引页实测数百个，
// 含大量拼写重复项，只取干净常用的；抽查 10 个均 200 且有内容）。
const CATS = [
  { type_id: '/cn', type_name: '最新' },
  { type_id: '/cn/popular', type_name: '热门' },
  { type_id: '/cn/categories/censored', type_name: '有码' },
  { type_id: '/cn/categories/uncensored', type_name: '无码' },
  { type_id: '/cn/categories/reducing_mosaic', type_name: '减码' },
  { type_id: '/cn/genre/busty', type_name: '巨乳' },
  { type_id: '/cn/genre/butt', type_name: '屁股' },
  { type_id: '/cn/genre/huge-butt', type_name: '巨臀' },
  { type_id: '/cn/genre/creampie', type_name: '中出' },
  { type_id: '/cn/genre/blowjob', type_name: '口交' },
  { type_id: '/cn/genre/cosplay', type_name: '角色扮演' },
  { type_id: '/cn/genre/school-girls', type_name: '校园' },
  { type_id: '/cn/genre/housewife', type_name: '人妻' },
  { type_id: '/cn/genre/young-wife', type_name: '年轻妻' },
  { type_id: '/cn/genre/lesbian', type_name: '女同' },
  { type_id: '/cn/genre/anal', type_name: '肛交' },
  { type_id: '/cn/genre/bondage', type_name: '捆绑' },
  { type_id: '/cn/genre/massage', type_name: '按摩' },
  { type_id: '/cn/genre/uniform', type_name: '制服' },
  { type_id: '/cn/genre/squirting', type_name: '潮吹' },
  { type_id: '/cn/genre/pov', type_name: '第一视角' },
  { type_id: '/cn/genre/hardcore', type_name: '硬核' },
  { type_id: '/cn/genre/gangbang', type_name: '轮奸' },
  { type_id: '/cn/genre/slender', type_name: '苗条' },
  { type_id: '/cn/genre/cowgirl', type_name: '骑乘' },
  { type_id: '/cn/genre/bukkake', type_name: '颜射' },
];

// 签名 URL 现解：slice(16, -16) → 反转 → base64 解码
function decodeSigned(html) {
  const fm = String(html || '').match(/file\s*:\s*f\("([^"]{100,})"\)/i)
    || String(html || '').match(/f\("([^"]{150,})"\)/);
  if (!fm) return '';
  const enc = fm[1];
  try {
    const sliced = enc.slice(16, -16);
    const rev = sliced.split('').reverse().join('');
    const out = Buffer.from(rev, 'base64').toString('utf8');
    if (/^https:\/\/topjav\.tv\/(cn\/)?m3u8\//i.test(out)) return out;
  } catch {}
  return '';
}

async function init() { return {}; }

async function home() {
  const html = await getText(HOST + LANG, HOST + LANG);
  return { class: CATS, filters: {}, list: parseCards(html) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  let tid = String(body.id || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!tid) tid = LANG;
  const base = (/^https?:\/\//i.test(tid) ? tid : HOST + '/' + tid.replace(/^\/+/, '')).replace(/\/+$/, '');
  const url = page === 1 ? base : base + '?page=' + page;
  const html = await getText(url, HOST + LANG);
  const list = parseCards(html);
  return { page, pagecount: 9999, limit: 90, total: list.length ? 999999 : 0, list };
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
  const list = [];
  for (const raw of ids.filter(Boolean)) {
    let durl = String(raw).trim();
    if (!/^https?:\/\//i.test(durl)) {
      durl = HOST + (durl.startsWith('/') ? durl : '/' + durl);
    }
    const html = await getText(durl, HOST + LANG);
    const hm = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<h1[^>]*>([\s\S]{0,400}?)<\/h1>/i);
    const title = hm ? stripTags(hm[1]) : 'TopJAV';
    const ogm = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    let pic = ogm ? ogm[1] : '';
    if (!pic) {
      const idm = durl.match(/\/video\/(\d+)/);
      if (idm) pic = HOST + '/storage/images/' + idm[1] + '/thumbnail.jpg';
    }
    list.push({ vod_id: raw, vod_name: title, vod_pic: pic, vod_play_from: NAME, vod_play_url: '播放$' + durl });
    // 字幕预热：播放线即详情页地址（play 取 id 的 $ 后部分亦为该地址），
    // 按详情 URL 登记片名并后台串行找字幕（不 await）
    subCacheName(durl, title);
    subWarm(durl);
  }
  return { list };
}

async function play(reqIn) {
  let id = String(reqIn?.body?.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop().trim();
  if (/\.m3u8(\?|$)/i.test(id)) {
    return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + LANG } };
  }
  // 详情页：现取现解（签名有时效）
  const durl = /^https?:\/\//i.test(id) ? id : HOST + (id.startsWith('/') ? id : '/' + id);
  // 字幕：key 与 detail 登记的详情 URL 一致；detail 预热过则命中缓存/在途，
  // 与详情页请求并行跑，不增加点播延迟；无命中不带 subs 键
  const subsP = subSearchAll(durl).catch(() => []);
  const html = await getText(durl, HOST + LANG);
  const signed = decodeSigned(html);
  const subs = await subsP;
  if (signed) {
    const result = { parse: 0, url: signed, header: { 'User-Agent': UA, 'Referer': durl } };
    if (subs && subs.length) result.subs = subs;
    return result;
  }
  const fallback = { parse: 1, url: durl, header: { 'User-Agent': UA, 'Referer': HOST + LANG } };
  if (subs && subs.length) fallback.subs = subs;
  return fallback;
}

async function searchCat(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 90, total: 0, list: [] };
  const url = HOST + LANG + '/search?s=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : '');
  const html = await getText(url, HOST + LANG);
  const list = parseCards(html);
  return { page, pagecount: 9999, limit: 90, total: list.length, list };
}


   // durl -> 片名 (detail 时 best-effort 写入)
 // durl -> {ts, subs}




















 // durl -> Promise<subs> (detail 预热与 play 共用同一趟)

// 猫版字幕芯已移除（字幕改由 XPTV 版 subSearch 在 getPlayinfo 内按片名查）；旧调用留空壳，避免残留调用报错。
async function subSearchAll() { return []; }
function subWarm() {}
function subRegister() {}
function subAttach(r) { return r; }
function subCacheName() {}
function subSlugTitle() { return ''; }
const subNameCache = new Map();
const subResultCache = new Map();

// ---------------- 字幕聚合 (XPTV 版，照 avdb 新芯) ----------------
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

// ---------------- XPTV 适配层 ----------------
// 猫源 home/category/detail/play/search 原样保留；以下 5 个 XPTV 入口做薄适配。
async function getConfig() {
    const h = await home();
    const tabs = (h && Array.isArray(h.class) ? h.class : []).map((c) => ({ name: String(c.type_name || ''), ext: { id: String(c.type_id || '') } }));
    return jsonify({ ver: 1, title: 'TopJAV', site: 'https://topjav.tv', tabs: tabs.length ? tabs : [{ name: '全部', ext: { id: '' } }] });
}

async function getCards(ext) {
    ext = argsify(ext);
    const r = await category({ body: { id: ext.id || '', page: ext.page || 1 } });
    const list = (r && Array.isArray(r.list) ? r.list : []).map((c) => ({
        vod_id: String(c.vod_id || ''),
        vod_name: c.vod_name || '',
        vod_pic: c.vod_pic || '',
        vod_remarks: c.vod_remarks || '',
        ext: { id: String(c.vod_id || ''), name: c.vod_name || '' },
    }));
    return jsonify({ list });
}

function parseTracks(playUrl, vodName) {
    const tracks = [];
    if (!playUrl) return tracks;
    const groups = String(playUrl).split('$$$');
    for (const g of groups) {
        for (const ep of g.split('#')) {
            if (!ep) continue;
            const idx = ep.indexOf('$');
            const nm = idx >= 0 ? ep.slice(0, idx) : '播放';
            const u = idx >= 0 ? ep.slice(idx + 1) : ep;
            if (u) tracks.push({ name: nm || '播放', pan: '', ext: { url: u, name: vodName || '' } });
        }
    }
    return tracks;
}

async function getTracks(ext) {
    ext = argsify(ext);
    const r = await detail({ body: { id: ext.id } });
    const item = (r && Array.isArray(r.list) && r.list[0]) || null;
    const tracks = item ? parseTracks(item.vod_play_url, item.vod_name) : [];
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    const r = await play({ body: { id: url } });
    const result = { urls: [r.url || url], headers: [r.header || {}] };
    const name = String(ext.name || '');
    if (name) {
        try { const subs = await subSearch(name); if (subs && subs.length) result.subs = subs; } catch (e) {}
    }

    return jsonify(result);
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    if (!wd) return jsonify({ list: [] });
    const r = await searchCat({ body: { wd, page: ext.page || 1 } });
    const list = (r && Array.isArray(r.list) ? r.list : []).map((c) => ({
        vod_id: String(c.vod_id || ''),
        vod_name: c.vod_name || '',
        vod_pic: c.vod_pic || '',
        vod_remarks: c.vod_remarks || '',
        ext: { id: String(c.vod_id || ''), name: c.vod_name || '' },
    }));
    return jsonify({ list });
}
