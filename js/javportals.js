
// JavPortals https://javportals.com/zh/ —— 日本AV聚合站（/zh/view/<slug> 详情 + #player data-src 直出 m3u8 + data-poster 封面）
// 分类：站内 /zh/genres/<slug>（20 个导航类 + 素人）+ /zh/tags/<slug>（巨乳/大屁股近义类，标题实测）
// 列表翻页：首页 /zh/?p=N；分类 /zh/genres/<slug>?p=N、/zh/tags/<slug>?p=N；搜索 /zh/search?keyword=<kw>
// 播放：详情页唯一 data-src m3u8，单码率、不编假多档；注意播单分片为 PNG 头 + TS 体伪装（首 502 字节为 PNG、其后为 0x47 同步 TS 流，
//   站方自带 JWPlayer 直接播该播单；MiraPlayer 设备侧能否跳过 PNG 头播 TS 尚未经真机证实，见 NOTES.md）
// 字幕：与模板同一套 Layer A 芯（迅雷 > 迅雷看看 > SubtitleCat，见下），仅标题/地址含番号的条目才接 subs 键。
const HOST = 'https://javportals.com';
const BASE = 'https://javportals.com/zh';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const CDN = 'https://cdn.javportals.com';

// 分类全部取自站内实测：genres 名取自首页导航/分类页 <title>，tags 名取自标签页 <title>。
// 用户点名近义项落点：无码破解 = genres/reducing-mosaic（站方原名）；减码/减少马赛克 = 同一类（站内标题即 Reducing Mosaic）；
// 无码流出无字面同名类，不硬造，改用站内无码池 genres/uncensored（站方名“无码”）作最接近项；巨乳 = tags/big-tits；大屁股 = tags/big-butt。
const CATS = [
  { v: 'genres/reducing-mosaic', n: '无码破解' },
  { v: 'genres/chinese-subtitle', n: '中文字幕' },
  { v: 'genres/jav', n: '日本AV' },
  { v: 'genres/uncensored', n: '无码' },
  { v: 'genres/censored', n: '有码' },
  { v: 'genres/vietnamese-subtitles', n: '越南语字幕' },
  { v: 'genres/english-subtitle', n: '英文字幕' },
  { v: 'genres/thai-subtitle', n: '泰文字幕' },
  { v: 'genres/beauty', n: '美女' },
  { v: 'genres/uniform', n: '制服' },
  { v: 'genres/affair', n: '偷情出轨' },
  { v: 'genres/category-iii', n: '三级片' },
  { v: 'genres/roleplay', n: '角色扮演' },
  { v: 'genres/group-sex', n: '多P群交' },
  { v: 'genres/pantyhose', n: '丝袜美腿' },
  { v: 'genres/bdsm', n: '主奴调教' },
  { v: 'genres/pov', n: '男友视角' },
  { v: 'genres/lesbian', n: '女同' },
  { v: 'genres/sex-only', n: '直接开啪' },
  { v: 'genres/western', n: '欧美' },
  { v: 'genres/amateur', n: '素人' },
  { v: 'tags/big-tits', n: '巨乳' },
  { v: 'tags/big-butt', n: '大屁股' },
  { v: 'tags/huge-butt', n: '巨大屁股' },
];

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
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
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}

function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
  return s;
}

async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  try {
    const r = await $fetch.get(url, {
      headers: { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 字幕芯取数原语（与模板一致）：统一回 {status, body}

// 卡片结构：<article class="movie-card"> 内 thumb <a href="/zh/view/..."> + <img src="cdn...webp" alt="标题">
// + badge--code（番号）+ badge--duration（时长）；标题另在 h3 <a title="...">。按文章块解析，避免相关推荐串位。
function parseCards(html) {
  const out = [];
  const seen = new Set();
  const blocks = String(html || '').match(/<article class="movie-card">[\s\S]*?<\/article>/g) || [];
  for (const b of blocks) {
    const hrefM = b.match(/href="(\/zh\/view\/[^"#]+)"/);
    if (!hrefM) continue;
    const vUrl = hrefM[1].trim();
    if (seen.has(vUrl)) continue;
    seen.add(vUrl);
    const imgM = b.match(/<img[^>]+src="([^"]+)"/i);
    const pic = imgM ? normUrl(imgM[1].trim()) : '';
    const titleM = b.match(/movie-card__title"><a[^>]+title="([^"]+)"/) || b.match(/<img[^>]+alt="([^"]*)"/i);
    const name = titleM ? cleanLabel(titleM[1]) : '';
    const codeM = b.match(/badge--code">([^<]+)</);
    const durM = b.match(/badge--duration">([^<]+)</);
    if (!name && !pic) continue;
    out.push({ vod_id: vUrl, vod_name: name || 'JavPortals 视频', vod_pic: pic, vod_remarks: durM ? durM[1].trim() : (codeM ? codeM[1].trim() : '') });
  }
  return out;
}

function hasNextPage(html, page) {
  return String(html || '').includes('?p=' + (page + 1));
}

// ---------------- 字幕聚合 (与 32 个带芯猫源同一套 Layer A，2026-11-02 定版) ----------------
// 槽位：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 键序逐个查、首中即停；命中后严过滤（须含番号或片名全文，无回退）；
// 合并序 = 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；
// 全局上限 10、单槽软上限 8；总预算 6s、失败全静默；无结果时 play 不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 除 1000），无时长不显示、不编造；
// 去重键 = 语言 + 小写名（去扩展名）+ 秒（无时长记 nodur），同名同时长才算重复。
























async function home() {
  const classes = [{ type_id: 'home', type_name: '首页推荐' }];
  for (const c of CATS) classes.push({ type_id: c.v, type_name: c.n });
  let list = [];
  try { list = parseCards(await getHtml('/zh/')); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  // 中文字幕：站方 genres/chinese-subtitle 页本身是空的（站方显示“暂无影片”，
  // /zh/ 与 /en/、p=1/p=2 均 0 卡），但中字片实际被错归到 english-subtitle
  // 类下（2026-11-19 实测：该类 21 卡里 18 卡标题含【中文字幕】，如 DLDSS-163）。
  // 本 tab 改取 english-subtitle 页、按标题含“中文字幕”过滤；同时并取
  // chinese-subtitle 页（站方日后补归类即自动并入），按 vod_id 去重。
  if (zoneId === 'genres/chinese-subtitle') {
    const cnPath = page === 1 ? '/zh/genres/chinese-subtitle/' : ('/zh/genres/chinese-subtitle/?p=' + page);
    const enPath = page === 1 ? '/zh/genres/english-subtitle/' : ('/zh/genres/english-subtitle/?p=' + page);
    const cnHtml = await getHtml(cnPath);
    const enHtml = await getHtml(enPath);
    const seen = new Set();
    const list = [];
    for (const v of parseCards(cnHtml)) {
      if (!seen.has(v.vod_id)) { seen.add(v.vod_id); list.push(v); }
    }
    for (const v of parseCards(enHtml)) {
      if (seen.has(v.vod_id)) continue;
      if (String(v.vod_name || '').indexOf('中文字幕') < 0) continue;
      seen.add(v.vod_id);
      list.push(v);
    }
    const next = hasNextPage(cnHtml, page) || hasNextPage(enHtml, page);
    return { page, pagecount: next ? page + 1 : page, list };
  }
  let path;
  if (zoneId === 'home' || !zoneId) {
    path = page === 1 ? '/zh/' : ('/zh/?p=' + page);
  } else if (CATS.some((c) => c.v === zoneId)) {
    path = page === 1 ? ('/zh/' + zoneId + '/') : ('/zh/' + zoneId + '/?p=' + page);
  } else {
    return { page, pagecount: page, list: [] };
  }
  const html = await getHtml(path);
  const list = parseCards(html);
  const next = hasNextPage(html, page);
  return { page, pagecount: next ? page + 1 : page, list };
}

async function catSearch(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const html = await getHtml('/zh/search?keyword=' + encodeURIComponent(kw));
  return { page: 1, pagecount: 1, list: parseCards(html) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  if (!html) return { list: [] };
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let mainTitle = h1M ? cleanLabel(h1M[1]) : '';
  if (!mainTitle) {
    const tM = html.match(/<title>(.*?)<\/title>/i);
    mainTitle = tM ? cleanLabel(tM[1]).replace(/\s*-\s*javportals\.com\s*$/i, '').trim() : 'JavPortals 视频';
  }
    let posterPic = '';
  const srcM = html.match(/id="player"[^>]+data-poster="([^"]+)"/i) || html.match(/data-poster="([^"]+)"/i);
  if (srcM) posterPic = normUrl(srcM[1].trim());
  if (!posterPic) {
    const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogM) posterPic = normUrl(ogM[1].trim());
  }
  let playUrl = '';
  const dataM = html.match(/id="player"[^>]+data-src="([^"]+)"/i) || html.match(/data-src="([^"]+)"/i);
  if (dataM) playUrl = normUrl(dataM[1].trim());
  const code = subExtractCode(mainTitle) || subExtractCode(durl);
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: code || 'HD',
      vod_content: mainTitle,
      vod_play_from: 'JavPortals',
      vod_play_url: playUrl ? ('正片$' + durl + '@@' + playUrl) : '',
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let target = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
  // 兜底：播单缺失时现取一次详情页 data-src；仍无则不编假地址（框架以空 url 表示无可播流）
  if (!target && durl) {
    const path = durl.replace(HOST, '');
    const html = await getHtml(path);
    const dataM = html.match(/data-src="([^"]+)"/i);
    if (dataM) target = normUrl(dataM[1].trim());
  }
  if (!target) return { parse: 0, url: '' };
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
        const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': BASE + '/' } };
      return result;
}

// ---------------- 字幕聚合试点 (XPTV 版, 2026-10-23 新芯) ----------------
// 本试点只加在 avdb: 验证 XPTV 播放器是否渲染 getPlayinfo 返回的
// subs 字幕位。2026-10-23 按用户反馈换芯 (旧芯多键合并+只排序不
// 过滤, 片名键召回别片字幕灌满前 10、SubtitleCat 被挤出): 改照
// 用户自有迅雷看看组件 (xunlei.subtitle) 原法 ——
//   (a) 搜索键按序逐个查、首个有结果的键即停;
//   (b) 严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可) 或片
//       名全文, 不含全扔; 有番号时过滤到空即空 (不回退), 无番
//       号时回退名单也要过片名词元闸门 (单字模糊召回过不了);
//   (c) 打分照组件: cid_match 100000、含番号 +25000、oracle 自
//       带 Score/FingerprintScore、下载量、时长/大小。
// 槽位 (用户钦定优先级, 同走 oracle 接口):
//   迅雷 (档位 0): 键序 [番号, 紧凑番号]
//   迅雷看看 (档位 1): 组件完整键序 [番号, 紧凑番号, 番号+标题,
//     紧凑番号+标题, 全标题]
//   SubtitleCat (档位 2): 搜索页 -> 字幕页 -> 按语言直链, 同样
//     过严过滤。
// 合并: URL 去重 (重复条目标高档位来源) -> 档位 -> 语言 (简中>
// 繁中>双语>英文>日文>其他) -> 分数; 全局上限 10、单槽软上限 8
// (保 SubtitleCat 有位置); 只收 .srt/.vtt/.ass/.ssa 直链, 命中
// 以 [{name,url,format}] 挂到 getPlayinfo 返回对象。
// XPTV 适配: HTTP 全走 $fetch.get (两源皆 GET, 不依赖未证实的
// $fetch.post); 不用 setTimeout, 时长由单请求超时兜底 (oracle
// 5s / SubtitleCat 搜索 5s + 字幕页 4s, 三槽并行); 不依赖跨调
// 用全局状态 — 片名由 track.ext 从 getTracks 带入, 搜索在
// getPlayinfo 内一次完成, 失败全静默; 无命中时返回不带 subs
// 键, 与未接入前逐字一致。SubHD (下载被站方门控 403) 与射手
// assrt (源站 522 不可达) 不接入, 与猫版口径一致。
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


// ---------------- XPTV 适配层（薄适配：复用上方猫源 home/category/detail/play/search） ----------------
function __s(v) { return String(v == null ? '' : v).trim(); }

async function getConfig() {
    const tabs = (CATS.map(c => ({ id: c.v, name: c.n }))).map((c) => ({ name: c.name, ext: { id: c.id } }));
    return jsonify({ ver: 1, title: 'JavPortals', site: HOST, tabs });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = __s(ext.id || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let res;
    try { res = await category({ body: { id, page } }); } catch (e) { res = null; }
    const list = (res && Array.isArray(res.list) ? res.list : []).map((v) => ({
        vod_id: v.vod_id, vod_name: v.vod_name, vod_pic: v.vod_pic, vod_remarks: v.vod_remarks,
        ext: { id: v.vod_id, name: v.vod_name },
    }));
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = __s(ext.id || '');
    const tracks = [];
    let d = null;
    try { d = await detail({ body: { id } }); } catch (e) { d = null; }
    const vod0 = (d && Array.isArray(d.list) && d.list[0]) || null;
    const playUrl = __s(vod0 && vod0.vod_play_url);
    if (playUrl) {
    const segs = playUrl.split('$$$');
    for (const seg of segs) {
        const eps = String(seg || '').split('#').filter(Boolean);
        for (const ep of eps) {
            const di = ep.indexOf('$');
            const nm = di > 0 ? ep.slice(0, di) : '正片';
            tracks.push({ name: nm, pan: '', ext: { url: ep, id: ep, name: nm } });
        }
    }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = __s(ext.url || ext.id || '');
    const name = __s(ext.name || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    let r = null;
    try { r = await play({ body: { id } }); } catch (e) { r = null; }
    const url = __s(r && r.url);
    if (!url) return jsonify({ urls: [], headers: [] });
    const result = { urls: [url], headers: [r.header || {}] };
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) { /* 无字幕不影响播放 */ }
    }
    return jsonify(result);
}

async function search(ext) {
    ext = argsify(ext);
    const wd = __s(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let res = null;
    try { res = await catSearch({ body: { wd, page } }); } catch (e) { res = null; }
    const list = (res && Array.isArray(res.list) ? res.list : []).map((v) => ({
        vod_id: v.vod_id, vod_name: v.vod_name, vod_pic: v.vod_pic, vod_remarks: v.vod_remarks,
        ext: { id: v.vod_id, name: v.vod_name },
    }));
    return jsonify({ list });
}
