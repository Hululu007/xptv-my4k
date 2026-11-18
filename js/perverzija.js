// Perverzija - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_perverzija.js
// Perverzija Tube - 由 REX 模块 user.perverzija（作者 Tiamo）移植
// 站点 https://tube.perverzija.com；播放链：详情页 iframe -> xtremestream 播放器页取 vt
// -> proto_api castsign 取 ct -> castmaster 生成标准 HLS（变体按 q 分档）+ 自适应兜底
// 注意：VM 侧 castsign 一律返回 forbidden-vt（VM 出口被拦，详情/列表/播放器页均通）；
// 本链路为 REX 原作者实测链路，设备侧能否签发以用户真机为准。
const KEY = 'py_perverzija';
const NAME = 'Perverzija';
const SITE = 'https://tube.perverzija.com';
const XS = 'https://perv.xtremestream.xyz';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CATS = [
  { type_id: '/?orderby=date', type_name: '最新' },
  { type_id: '/?orderby=view', type_name: '最多播放' },
  { type_id: '/?orderby=like', type_name: '最多点赞' },
  { type_id: '/featured-scenes/', type_name: '精选场景' },
  { type_id: '/full-movie/', type_name: '完整影片' },
  { type_id: '/vr/', type_name: 'VR' },
  { type_id: '/studio/brazzers/', type_name: 'Brazzers' },
  { type_id: '/studio/realitykings/', type_name: 'RealityKings' },
  { type_id: '/studio/bangbros/', type_name: 'BangBros' },
  { type_id: '/studio/teamskeet/', type_name: 'TeamSkeet' },
  { type_id: '/studio/naughtyamerica/', type_name: 'NaughtyAmerica' },
  { type_id: '/tag/anal/', type_name: '标签热门' },
];

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
  return t(s).replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ');
}
function H(referer, extra) {
  const h = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (referer) h.Referer = referer;
  if (extra) Object.assign(h, extra);
  return h;
}
async function getText(url, referer, extra) {
  const { data } = await $fetch.get(url, { headers: H(referer, extra), timeout: 25000 });
  return typeof data === 'string' ? data : JSON.stringify(data || '');
}

function listingHtml(html) {
  const h = String(html || '');
  let start = h.search(/class="(?:video|search)-listing-content/);
  if (start < 0) start = 0;
  let end = h.length;
  for (const mark of ['wp-pagenavi', 'class="pagination', '<nav class="navigation', 'id="footer', 'class="tm_related', 'related-section']) {
    const j = h.indexOf(mark, start);
    if (j > 0 && j < end) end = j;
  }
  return h.slice(start, end);
}

function parseCards(html) {
  const h = listingHtml(html);
  const out = [];
  const seen = {};
  const starts = [];
  const re = /<div[^>]+class="[^"]*\bvideo-item\b[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(h))) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const seg = h.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : Math.min(starts[i] + 6000, h.length));
    const a = seg.match(/<a\s+href="(https:\/\/tube\.perverzija\.com\/[^"\/]+\/)"(?:\s+title="([^"]*)")?/);
    if (!a) continue;
    const url = a[1];
    if (seen[url]) continue;
    const img = seg.match(/<img[^>]+src="([^"]+)"/);
    const h3 = seg.match(/<h3[^>]*>[\s\S]{0,200}?<a[^>]*>([\s\S]{1,300}?)<\/a>/);
    const alt = seg.match(/<img[^>]+alt="([^"]*)"/);
    let title = clean(a[2] || (h3 && h3[1]) || (alt && alt[1]) || '');
    if (!title) title = url.replace(/\/$/, '').split('/').pop().replace(/-/g, ' ');
    const p = seg.match(/<p[^>]*>([\s\S]{20,600}?)<\/p>/);
    let desc = clean(p ? p[1] : '');
    if (!desc || desc.length < 20) desc = '';
    seen[url] = 1;
    out.push({ vod_id: 'perv:' + url, vod_name: title, vod_pic: img ? img[1] : '', vod_remarks: desc.slice(0, 60) });
  }
  return out;
}

function pageUrl(path, page) {
  let p = Math.max(1, parseInt(page, 10) || 1);
  let base = String(path || '/');
  let query = '';
  const qi = base.indexOf('?');
  if (qi >= 0) { query = base.slice(qi); base = base.slice(0, qi); }
  if (base.charAt(0) !== '/') base = '/' + base;
  if (!/\/$/.test(base)) base += '/';
  if (p <= 1) return SITE + base + query;
  return SITE + base + 'page/' + p + '/' + query;
}

function slugifyActor(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function home() {
  let list = [];
  try {
    list = parseCards(await getText(pageUrl('/?orderby=date', 1), SITE + '/'));
  } catch (e) { list = []; }
  return { class: CATS, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  let tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '/?orderby=date');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let list = [];
  try {
    list = parseCards(await getText(pageUrl(tid, page), SITE + '/'));
  } catch (e) { list = []; }
  return { page, pagecount: list.length ? page + 1 : page, list };
}

async function searchCat(reqIn) {
  const body = reqIn?.body || {};
  const kw = t(body.wd);
  if (!kw) return { list: [] };
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let url = SITE + '/?s=' + encodeURIComponent(kw) + (page > 1 ? '&paged=' + page : '');
  let cards = [];
  try { cards = parseCards(await getText(url, SITE + '/')); } catch (e) {}
  if (!cards.length && /\s/.test(kw) && !/\d/.test(kw)) {
    const slug = slugifyActor(kw);
    if (slug) {
      try { cards = parseCards(await getText(SITE + '/stars/' + slug + '/' + (page > 1 ? 'page/' + page + '/' : ''), SITE + '/')); } catch (e) {}
    }
  }
  return { list: cards };
}

function isoToSec(v) {
  const m = String(v || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
}

async function parseDetail(url) {
  const html = await getText(url, SITE + '/');
  const titleM = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]{1,400}?)<\/h1>/) || html.match(/<title>([\s\S]{1,300}?)<\/title>/);
  const title = clean(titleM ? titleM[1] : '').replace(/\s*\|\s*Perverzija\.com\s*$/i, '');
  const coverM = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/);
  const descM = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/) || html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/);
  const durM = html.match(/"duration"\s*:\s*"(PT[^"]+)"/);
  const iframeM = html.match(/<iframe[^>]+src="([^"]*xtremestream[^"]*)"/) || html.match(/<iframe[^>]+src="([^"]*\/player\/index\.php\?data=([0-9a-f]{32}))[^"]*"/);
  let videoId = '';
  let embed = '';
  if (iframeM) {
    const src = String(iframeM[1]);
    const idM = src.match(/[?&]data=([0-9a-fA-F]{32})/);
    if (idM) videoId = idM[1].toLowerCase();
    const hostM = src.match(/^(https?:\/\/[^\/]+)/);
    if (hostM) embed = hostM[1];
  }
  if (!videoId) {
    const anyId = html.match(/(?:embedUrl|iframe)[^\n]{0,200}?[?&]data=([0-9a-fA-F]{32})/);
    if (anyId) videoId = anyId[1].toLowerCase();
  }
  return { videoId, embed, title, cover: coverM ? coverM[1] : '', desc: clean(descM ? descM[1] : ''), seconds: durM ? isoToSec(durM[1]) : 0 };
}

// 线路缓存 10 分钟：详情与播放共用，避免重复签发
const STREAM_CACHE = new Map();
const STREAM_TTL = 10 * 60 * 1000;

async function playlistAlive(url, referer) {
  try {
    const raw = await getText(url, referer);
    return raw.indexOf('#EXTM3U') >= 0;
  } catch (e) { return false; }
}

async function resolveStream(url, d) {
  if (!d.videoId) throw new Error('未找到播放器 id，可能影片无源');
  const cached = STREAM_CACHE.get(d.videoId);
  if (cached && Date.now() - cached.t < STREAM_TTL) return cached.lines;
  const bases = [];
  const pushBase = (b) => { if (b && bases.indexOf(b) < 0) bases.push(b); };
  pushBase(d.embed);
  pushBase(XS);
  pushBase('https://pervm1.xtremestream.xyz');
  pushBase('https://pervl5.xtremestream.xyz');
  pushBase('https://pervm2.xtremestream.xyz');
  const playerReferer = url;
  let base = '';
  let vt = '';
  let playerUrl = '';
  let lastErr = '';
  for (const b of bases) {
    const tryUrl = b + '/player/index.php?data=' + d.videoId;
    let page = '';
    try { page = await getText(tryUrl, playerReferer); } catch (e) { lastErr = String(e && e.message || e); continue; }
    const vtM = page.match(/boot\(\s*["']?[0-9a-fA-F]{32}["']?\s*,\s*["']([^"']+)["']/);
    if (vtM) { base = b; vt = String(vtM[1]).replace(/\s+/g, ''); playerUrl = tryUrl; break; }
    lastErr = '该子域无 ftk 令牌';
  }
  if (!vt) throw new Error('播放器页未返回 vt 令牌' + (lastErr ? '：' + lastErr : ''));
  const apiBase = base + '/player/proto_api.php?data=' + d.videoId;
  const vtParam = '&vt=' + encodeURIComponent(vt);
  const signResp = await getText(apiBase + '&op=castsign' + vtParam, playerUrl, { 'X-XS-P': '1', 'Accept': '*/*' });
  const ct = String(signResp || '').replace(/\s+/g, '');
  if (!ct || ct.indexOf('forbidden') === 0) throw new Error('castsign 签名失败');
  const cm = apiBase + vtParam + '&ct=' + encodeURIComponent(ct) + '&op=castmaster';
  const autoLine = { name: '自动', desc: '自适应', url: cm };
  let master = '';
  try { master = await getText(cm, playerUrl, { 'X-XS-P': '1', 'Accept': '*/*' }); } catch (e) {}
  let quals = [];
  const re = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)[^\n]*\n(\S+)/g;
  let mm;
  while ((mm = re.exec(master))) {
    const lineUrl = String(mm[3]).trim();
    const qm = lineUrl.match(/[?&]q=(\d+)/);
    if (!qm) continue;
    quals.push({ q: qm[1], label: qm[1] + 'p', url: lineUrl });
  }
  if (!quals.length) {
    for (const fl of ['1080', '720', '480']) {
      quals.push({ q: fl, label: fl + 'p', url: apiBase + vtParam + '&ct=' + encodeURIComponent(ct) + '&op=castmedia&q=' + fl });
    }
  }
  quals.sort((a, b) => parseInt(b.q, 10) - parseInt(a.q, 10));
  const lines = [];
  for (const q of quals) {
    if (!(await playlistAlive(q.url, playerUrl))) continue;
    lines.push({ name: q.label, desc: q.label, url: q.url });
  }
  lines.push(autoLine);
  if (STREAM_CACHE.size > 100) STREAM_CACHE.delete(STREAM_CACHE.keys().next().value);
  STREAM_CACHE.set(d.videoId, { t: Date.now(), lines });
  return lines;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const url = id.replace(/^perv:/, '');
  if (!url) return { list: [] };
  let d;
  try { d = await parseDetail(url); } catch (e) { return { list: [] }; }
  let playFrom = [];
  let playUrls = [];
  try {
    const lines = await resolveStream(url, d);
    if (lines.length) {
      playFrom.push('Perverzija');
      playUrls.push(lines.map(l => l.name + '$' + l.url).join('#'));
      // 字幕预热：按每条播放地址登记片名（key 须与 play() 传给 subSearchAll
      // 的字符串完全一致——本源 play 直接取 $ 后的播放地址）；后台逐条串行
      // 找字幕（不 await，不一拥而上）
      for (const l of lines) subCacheName(l.url, d.title);
      (async () => {
        for (const l of lines) {
          try { await subSearchAll(l.url); } catch (e) {}
        }
      })().catch(() => {});
    }
  } catch (e) { /* 无播放线时只出详情，播放失败原因不写进标题 */ }
  return {
    list: [{
      vod_id: 'perv:' + url,
      vod_name: d.title || url,
      vod_pic: d.cover,
      vod_remarks: d.desc.slice(0, 80),
      vod_play_from: playFrom.join('$$$'),
      vod_play_url: playUrls.join('$$$'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const idx = id.indexOf('$');
  let url = idx >= 0 ? id.slice(idx + 1) : id;
  url = t(url);
  if (!url) return { parse: 0, url: '' };
  // 字幕：detail 预热过则命中缓存/在途，一般不增加点播延迟；无命中不带 subs 键
  const subs = await subSearchAll(url).catch(() => []);
  const result = { parse: 0, url, header: { 'User-Agent': UA, 'Referer': SITE + '/' } };
  if (subs && subs.length) result.subs = subs;
  return result;
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
    // 静态 tabs：CATS 即全部分类（12 条，2026-11-18 实测与首页一致）；getConfig 不再拉 670KB 首页，
    // 真机入口不再等首页加载。列表/播放仍走原 home/category/detail 链路。
    const tabs = CATS.map((c) => ({ name: String(c.type_name || ''), ext: { id: String(c.type_id || '') } }));
    return jsonify({ ver: 1, title: 'Perverzija', site: 'https://tube.perverzija.com', tabs: tabs.length ? tabs : [{ name: '全部', ext: { id: '' } }] });
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
