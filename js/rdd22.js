// 肉多多 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/rdd22.js
// 肉多多视频 91rdd (https://www.rdd22.top) -> CatPawOpen spider
// 站点结构: 列表走 JSON API, 详情页直给 m3u8, 无墙无门 (直连 200)。
// 列表 API: /factory/api/category.php?id=<分类id>&field=category_id|parent_category_id&sort=latest&page=<N>
//   返回 {status, data:[{id,title,tags,cover_image_url,url,category,parent_category_id,content_id,created_at_timestamp}], pagination:{totalHits,page,limit:12}}
// 搜索 API: /factory/api/search.php?q=<词>&type=video&sort=latest&page=<N> (同格式, 另有 counts)
// 详情页: /videos/<前3位>/<id>.html, 播放器 <div class="video-player-container" data-m3u8="..."> 直给 m3u8, <video poster> 为封面, <h1> 为标题。
// 单档实话: 每片只有一条 m3u8 (master 恰好 1 个变体, 多为 1280x720/2000k, 个别 720x406/1500k; fqm3u8 的则是直出 media 清单),
// 站方只给一条流, 无分辨率可选, 不编档位; 详情直接回 master 地址, 播放器自行跟变体。
// 分片是 .jpg 后缀伪装的 TS (个别 AES-128), iOS 原生 HLS 可播; 封面直链无防盗链 (.jpg 与 .avif 均 200)。
// 分类: 首页最新 (国产452+番号453 两父级最新合并按时间排) + 热门排行 (首页国产排行 10 条, 单页) + 国产全部 + 番号全部
//   + 25 个视频分类 + 刷视频 (竖屏 feed, 单页 12 条) + 153 个标签 (标签云原序, 走搜索 API)。
// 不进分类: 成人小说/动图专区/美图写真/成人漫画 (图文无视频)、番号磁力/国产磁力 (磁力无流)。
// 注意: 域名来自用户给的 https://www.rdd22.top/home; HOST 是文件顶部单一常量, 改一处即可; 未发现备用域, 未猜。
// 2026-11-11 修: 全部 API 分类空、仅热门排行有内容, 根因是 API 回 application/json 导致 App 内 axios 把 data
//   自动解析成对象, String(data) 得 "[object Object]", JSON.parse 失败回空; 修法见 rawGet (强制原始文本 + 对象兜底)。
// 门: 本站当前无门; getHtml 内留了与悟空同款的 xk_gate 过门兜底 (若日后站方加门, 自动取 token 设 Cookie 再取), 未碰任何统计像素。
const KEY = 'py_rdd22';
const NAME = '肉多多';
const HOST = 'https://www.rdd22.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// gate cookie 缓存 (本站当前无门; 若日后加门, 复用悟空同款逻辑)
let gateCookie = '';

const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'hot', type_name: '热门排行' },
  { type_id: 'p452', type_name: '国产全部' },
  { type_id: 'p453', type_name: '番号全部' },
  { type_id: 'c454', type_name: '国产传媒' },
  { type_id: 'c455', type_name: '探花交友' },
  { type_id: 'c456', type_name: '网曝黑料' },
  { type_id: 'c457', type_name: '绿帽出轨' },
  { type_id: 'c458', type_name: '国产乱伦' },
  { type_id: 'c460', type_name: '主播自拍' },
  { type_id: 'c461', type_name: '户外露出' },
  { type_id: 'c490', type_name: '福利姬' },
  { type_id: 'c462', type_name: '中文字幕' },
  { type_id: 'c463', type_name: '无码破解' },
  { type_id: 'c464', type_name: '熟女人妻' },
  { type_id: 'c465', type_name: '巨乳美乳' },
  { type_id: 'c466', type_name: '少女萝莉' },
  { type_id: 'c468', type_name: '强奸乱伦' },
  { type_id: 'c469', type_name: 'SM调教' },
  { type_id: 'c489', type_name: 'VR视角' },
  { type_id: 'c459', type_name: '剧情演绎' },
  { type_id: 'c467', type_name: '制服诱惑' },
  { type_id: 'c483', type_name: '欧美视频' },
  { type_id: 'c484', type_name: '成人动漫' },
  { type_id: 'c485', type_name: '三级伦理' },
  { type_id: 'c486', type_name: 'AI换脸' },
  { type_id: 'c487', type_name: 'AV解说' },
  { type_id: 'c488', type_name: '女同性恋' },
  { type_id: 'c1160', type_name: 'AI短剧' },
];

function headers(isJson) {
  const h = {
    'User-Agent': UA,
    'Accept': isJson ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/home',
  };
  if (gateCookie) h['Cookie'] = gateCookie;
  return h;
}

function isGatePage(html) {
  return !!html && html.indexOf('xkEnter') !== -1 && /var token='[^']+'/.test(html);
}

function extractGateToken(html) {
  const m = html.match(/var token='([^']+)'/);
  return m ? m[1] : '';
}

async function rawGet(url, isJson) {
  try {
    // 2026-11-11 修: 根因是 API 回 application/json, App 内 req (axios) 会把 data 自动解析成对象,
    // 旧版 String(data) 得到 "[object Object]", 后续 JSON.parse 失败, 全部 API 分类回空
    // (只有走 HTML 的热门排行能出内容)。修法: responseType:'text' + transformResponse 强制拿原始文本,
    // 再兜底: 若 data 已是对象则 JSON.stringify 回 JSON 文本, 两种返回形态都走得通。
    const r = await $fetch.get(url, { headers: headers(isJson), timeout: 20000, responseType: 'text', transformResponse: [(d) => d] });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) { /* fall through to fetch */ }
  try {
    if (typeof fetch === 'function') {
      const r = await fetch(url, { headers: headers(isJson), signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.text();
    }
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * 取页: 先 GET; 若回 gate 页 (含 xkEnter + var token), 取 token 设 Cookie 再 GET 一次,
 * cookie 缓存到 gateCookie 供后续调用复用; 若某次调用又命中 gate 页 (cookie 过期), 重新取 token。
 * 本站当前无门, 该分支平时不触发, 只作兜底。
 */
async function getHtml(url, isJson) {
  let html = await rawGet(url, isJson);
  if (isGatePage(html)) {
    const tok = extractGateToken(html);
    if (tok) {
      gateCookie = 'xk_gate=' + tok;
      html = await rawGet(url, isJson);
    }
  }
  if (isGatePage(html)) {
    const tok = extractGateToken(html);
    if (tok) {
      gateCookie = 'xk_gate=' + tok;
      html = await rawGet(url, isJson);
    }
  }
  return isGatePage(html) ? '' : html;
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

/** API 条目 -> 卡片 (vod_id 用详情相对地址, detail 直接 GET 它) */
function apiToCard(it) {
  if (!it || !it.url) return null;
  const tags = Array.isArray(it.tags) ? it.tags.filter(Boolean) : [];
  return {
    vod_id: String(it.url),
    vod_name: decodeHtml(it.title) || ('视频 ' + (it.content_id || '')),
    vod_pic: absUrl(it.cover_image_url),
    vod_remarks: (it.category ? String(it.category) : '') + (tags.length ? ' ' + tags.slice(0, 3).join(' ') : ''),
  };
}

function parseApiList(text) {
  const out = [];
  if (!text) return out;
  let j = null;
  try { j = JSON.parse(text); } catch (e) { return out; }
  const arr = Array.isArray(j.data) ? j.data : [];
  const seen = new Set();
  for (const it of arr) {
    const card = apiToCard(it);
    if (!card || seen.has(card.vod_id)) continue;
    seen.add(card.vod_id);
    out.push(card);
  }
  return out;
}

function apiPageInfo(text) {
  try {
    const j = JSON.parse(text || '{}');
    const p = j.pagination || {};
    const total = parseInt(p.totalHits, 10) || 0;
    const limit = parseInt(p.limit, 10) || 12;
    return { total, pagecount: total > 0 ? Math.ceil(total / limit) : 999, limit };
  } catch (e) {
    return { total: 999 * 12, pagecount: 999, limit: 12 };
  }
}

async function catApi(id, field, page) {
  const url = HOST + '/factory/api/category.php?id=' + encodeURIComponent(id)
    + '&field=' + encodeURIComponent(field) + '&sort=latest&page=' + page;
  const text = await getHtml(url, true);
  return { list: parseApiList(text), info: apiPageInfo(text) };
}

async function searchApi(q, page) {
  const url = HOST + '/factory/api/search.php?q=' + encodeURIComponent(q)
    + '&type=video&sort=latest&page=' + page;
  const text = await getHtml(url, true);
  return { list: parseApiList(text), info: apiPageInfo(text) };
}

/** 首页最新: 国产父级 452 与番号父级 453 的最新各取一页, 合并按 created_at_timestamp 倒序 */
async function homeLatest(page) {
  const [a, b] = await Promise.all([
    (async () => {
      const text = await getHtml(HOST + '/factory/api/category.php?id=452&field=parent_category_id&sort=latest&page=' + page, true);
      let raw = [];
      try { raw = (JSON.parse(text).data || []); } catch (e) { raw = []; }
      return raw;
    })(),
    (async () => {
      const text = await getHtml(HOST + '/factory/api/category.php?id=453&field=parent_category_id&sort=latest&page=' + page, true);
      let raw = [];
      try { raw = (JSON.parse(text).data || []); } catch (e) { raw = []; }
      return raw;
    })(),
  ]);
  const merged = a.concat(b);
  merged.sort((x, y) => (Number(y.created_at_timestamp) || 0) - (Number(x.created_at_timestamp) || 0));
  const seen = new Set();
  const list = [];
  for (const it of merged) {
    const card = apiToCard(it);
    if (!card || seen.has(card.vod_id)) continue;
    seen.add(card.vod_id);
    list.push(card);
  }
  return { list, pagecount: 423 };
}

/** 热门排行: 首页国产排行 10 条 (单页; 只取 active 的第一个 ranking-content 块) */
function parseHot(html) {
  const out = [];
  if (!html) return out;
  let block = html;
  const start = html.indexOf('ranking-content active');
  if (start !== -1) {
    const next = html.indexOf('ranking-content', start + 10);
    block = next !== -1 ? html.slice(start, next) : html.slice(start);
  }
  const re = /<a href="(\/videos\/\d+\/\d+\.html)"[^>]*>[\s\S]*?data-smart-src="([^"]+)"[^>]*?alt="([^"]*)"/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(block)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({
      vod_id: m[1],
      vod_name: decodeHtml(m[3]) || m[1],
      vod_pic: absUrl(m[2]),
      vod_remarks: '热门排行',
    });
  }
  return out;
}

/** 刷视频: /shuashipin/ 竖屏 feed, 每 slide 一条 (单页) */
function parseBrush(html) {
  const out = [];
  if (!html) return out;
  const re = /<section class="brush-slide"[^>]*>[\s\S]*?<a href="(\/videos\/\d+\/\d+\.html)">[\s\S]*?<div class="brush-title">([^<]+)<\/div>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const chunk = html.slice(Math.max(0, m.index - 200), m.index + 400);
    const pic = (chunk.match(/poster="([^"]+)"/) || [])[1] || '';
    out.push({
      vod_id: m[1],
      vod_name: decodeHtml(m[2]) || m[1],
      vod_pic: absUrl(pic),
      vod_remarks: '刷视频',
    });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/<h1[^>]*>([^<]{2,300})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1].split(/[-|_｜]/)[0]);
  return fallback || '';
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'home');

  if (id === 'home' || id === '') {
    const r = await homeLatest(page);
    return { page, pagecount: r.pagecount, limit: r.list.length || 24, total: r.pagecount * 24, list: r.list };
  }
  if (id === 'hot') {
    if (page > 1) return { page, pagecount: 1, limit: 0, total: 0, list: [] };
    const html = await getHtml(HOST + '/home');
    const list = parseHot(html);
    return { page, pagecount: 1, limit: list.length || 10, total: list.length, list };
  }
  if (id === 'brush') {
    if (page > 1) return { page, pagecount: 1, limit: 0, total: 0, list: [] };
    const html = await getHtml(HOST + '/shuashipin/');
    const list = parseBrush(html);
    return { page, pagecount: 1, limit: list.length || 12, total: list.length, list };
  }
  if (id === 'p452' || id === 'p453') {
    const r = await catApi(id.slice(1), 'parent_category_id', page);
    return { page, pagecount: r.info.pagecount, limit: r.list.length || 12, total: r.info.total, list: r.list };
  }
  if (id.indexOf('c') === 0) {
    const r = await catApi(id.slice(1), 'category_id', page);
    return { page, pagecount: r.info.pagecount, limit: r.list.length || 12, total: r.info.total, list: r.list };
  }
  if (id.indexOf('tag:') === 0) {
    const r = await searchApi(id.slice(4), page);
    return { page, pagecount: r.info.pagecount, limit: r.list.length || 12, total: r.info.total, list: r.list };
  }
  return { page, pagecount: page, limit: 0, total: 0, list: [] };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let path = String(raw || '');
  if (!path) return { list: [] };
  if (!path.startsWith('/')) {
    // 数字 id 兜底: /videos/<前3位>/<id>.html
    const num = path.replace(/[^0-9]/g, '');
    if (!num) return { list: [] };
    path = '/videos/' + num.slice(0, 3) + '/' + num + '.html';
  }
  const html = await getHtml(HOST + path);
  if (!html) return { list: [] };

  const m3u8 = (html.match(/data-m3u8="([^"]+)"/) || [])[1] || '';
  if (!m3u8 || !/^https?:\/\//i.test(m3u8)) return { list: [] };

  const name = extractTitle(html, path);
  const pic = absUrl((html.match(/<video[^>]+poster="([^"]+)"/) || [])[1] || '');
  const desc = decodeHtml((html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '');
  const tagList = [];
  const tre = /href="\/search\.php\?q=[^"]+"[^>]*>([^<]{1,20})<\/a>/g;
  let tx;
  while ((tx = tre.exec(html)) !== null) {
    const tag = decodeHtml(tx[1]);
    if (tag && tagList.indexOf(tag) === -1) tagList.push(tag);
  }
  const content = (tagList.length ? '标签：' + tagList.join(' / ') + '\n' : '') + desc;

  // 字幕：按 m3u8 地址 + 详情 path 登记片名，后台预热（不 await）
  subCacheName(m3u8, name);
  subCacheName(path, name);
  subWarm(m3u8);

  return {
    list: [{
      vod_id: path,
      vod_name: name || path,
      vod_pic: pic,
      vod_type: '',
      vod_remarks: tagList.slice(0, 5).join(' '),
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: '正片$' + m3u8,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let url = String(body.id || '');
  if (url.includes('$')) url = url.split('$').pop().trim();
  // 字幕：detail 预热过则命中缓存/在途，一般不增加点播延迟；无命中不带 subs 键
  const subs = await subSearchAll(url).catch(() => []);
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function searchCat(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const r = await searchApi(wd, page);
  return {
    page,
    pagecount: r.info.pagecount,
    limit: r.list.length || 12,
    total: r.info.total,
    list: r.list,
  };
}

function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

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
    return jsonify({ ver: 1, title: '肉多多', site: 'https://www.rdd22.top', tabs: tabs.length ? tabs : [{ name: '全部', ext: { id: '' } }] });
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
