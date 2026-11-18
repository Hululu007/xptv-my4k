// ToJav - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_tojav.js
// ToJav - 由 https://tojav.net/ 移植（初稿，待用户定名）
// 站方结构：HTML 列表页（tray 卡片）+ JSON 接口（搜索 / 播放 / 分页）。
// 分页实测结论（2026-10-31 修正）：无码列表与 genre 页走 /page-N
// （如 /genre/big-tits/page-2，p1/p2/p3 实测均 30 条不同内容；
// 旧代码用的 ?page= 会被站方忽略，才导致翻页无内容）；
// 有码列表走 POST /api/v1/pageView {page}（实测 p1/p2/p3 均不同、
// 均为有码内容，可正常翻页）；关键词分类走搜索接口（见下）。
// 详情：/<slug>，取 og:title / og:image / filmId / epButton(data-id)。
// 播放链（点播时现取，不缓存）：首页 meta(_token/_socket) -> Basic 鉴权
// -> POST /api/v1/player {episode, filmId} -> iframe vid-snap-player.com/embed/<uuid>
// -> GET /api/playlist-token/<uuid> -> {t} -> HLS：https://vid-snap-player.com/v/<t>
// （302 跳到存储 playlist.sb；token 内含请求方 IP 与时间戳，须设备侧现取）。
// 清晰度：实测 3 部（有码/无码各一 + 1 部）主清单均只有 1920x1080 单档，
// 故只出一线 1080p，不编造 720p 等不存在的档位。
// 字幕：与猫源 27 源同款芯（迅雷/迅雷看看/SubtitleCat 三槽、严过滤、
// 全局上限 10、单槽软上限 8、详情串行预热、点播挂 subs、无命中不带键）。
// 番号只从片名取（FC2 另加 FPV/PPV 形），不从播放地址取。
const KEY = 'py_tojav';
const NAME = 'ToJav';
const HOST = 'https://tojav.net';
const EMBED = 'https://vid-snap-player.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PAGE_SIZE = 30;

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
  return t(s).replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
// 纯 JS base64（ASCII 输入；token/socket 本身就是 base64 文本）
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64encode(str) {
  let out = ''; let i;
  for (i = 0; i + 2 < str.length; i += 3) {
    const n = (str.charCodeAt(i) << 16) | (str.charCodeAt(i + 1) << 8) | str.charCodeAt(i + 2);
    out += B64C[(n >> 18) & 63] + B64C[(n >> 12) & 63] + B64C[(n >> 6) & 63] + B64C[n & 63];
  }
  const rem = str.length - i;
  if (rem === 1) { const n1 = str.charCodeAt(i) << 16; out += B64C[(n1 >> 18) & 63] + B64C[(n1 >> 12) & 63] + '=='; }
  else if (rem === 2) { const n2 = (str.charCodeAt(i) << 16) | (str.charCodeAt(i + 1) << 8); out += B64C[(n2 >> 18) & 63] + B64C[(n2 >> 12) & 63] + B64C[(n2 >> 6) & 63] + '='; }
  return out;
}

// ---------- HTTP（只走框架 req） ----------
// 单请求超时 (有 setTimeout 的运行时才生效; 无则原样等待, 不报错)。
// 站方 POST (/api/v1/player 等) 在 VM 侧会无限挂起, 超时即按失败处理。
const REQ_TIMEOUT_MS = 15000;
function withTimeout(promise, ms) {
  if (typeof setTimeout !== 'function') return promise;
  let timer = null;
  const timeoutP = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ __timeout: true }), ms);
    if (timer && typeof timer.unref === 'function') { try { timer.unref(); } catch (e) {} }
  });
  return Promise.race([promise, timeoutP]).then((r) => {
    if (timer) { try { clearTimeout(timer); } catch (e) {} }
    return r;
  });
}

async function reqGet(url, headers, timeoutMs) {
  try {
    const r = await withTimeout($fetch.get(url, { headers: headers || {}, timeout: timeoutMs || 15000, responseType: 'text', transformResponse: [(d) => d] }), REQ_TIMEOUT_MS);
    if (!r || r.__timeout) return { status: 0, body: '', headers: {} };
    const text = typeof r.data === 'string' ? r.data : (r.data === null || r.data === undefined ? '' : JSON.stringify(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '', headers: r.headers || {} };
  } catch (e) {
    return { status: 0, body: '', headers: {} };
  }
}
async function reqPostForm(url, data, headers) {
  const body = Object.keys(data).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('&');
  // 站方 API 校验 PHP 会话：调用方已 getAuth() 时把 PHPSESSID 一并带上；
  // 未鉴权时不带（避免空 Cookie 头干扰）。
  const hdrs = Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, headers || {});
  try {
    const ck = (typeof authCookie === 'function') ? authCookie() : '';
    if (ck && !hdrs.Cookie && !hdrs.cookie) hdrs.Cookie = ck;
  } catch (e) { /* 忽略 */ }
  try {
    const r = await withTimeout($fetch.post(url, body, { headers: hdrs, timeout: 15000 }), REQ_TIMEOUT_MS);
    if (!r || r.__timeout) return { status: 0, json: null, text: '' };
    if (typeof r.data === 'string') {
      try { return { status: r.status || 0, json: JSON.parse(r.data), text: r.data }; }
      catch (e) { return { status: r.status || 0, json: null, text: r.data }; }
    }
    return { status: r.status || 0, json: r.data, text: '' };
  } catch (e) {
    return { status: 0, json: null, text: '' };
  }
}

// ---------- 鉴权（首页 meta，30 分钟缓存） ----------
// 站方 API 必须带 PHP 会话：首页下发 PHPSESSID，/api/v1/player 校验它与
// _token/_socket 的绑定关系；只发 Authorization 不发 Cookie 时服务端直接
// 断开连接（VM 侧表现为 POST 无响应挂起）。故 getAuth 同时带回 session cookie。
function pickCookie(headers, name) {
  const h = headers || {};
  const raw = h['set-cookie'] || h['Set-Cookie'] || h['x-set-cookie'] || '';
  const list = Array.isArray(raw) ? raw : [String(raw)];
  for (const item of list) {
    const m = String(item).match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    if (m) return name + '=' + m[1];
  }
  return '';
}
let AUTH_CACHE = null;
async function getAuth() {
  if (AUTH_CACHE && Date.now() - AUTH_CACHE.ts < 30 * 60 * 1000) return AUTH_CACHE.auth;
  const r = await reqGet(HOST + '/', { 'User-Agent': UA });
  if (r.status !== 200) throw new Error('auth page fail');
  const token = (r.body.match(/meta name="_token"[^>]*value="([^"]+)"/) || [])[1] || '';
  const socket = (r.body.match(/meta name="_socket"[^>]*value="([^"]+)"/) || [])[1] || '';
  if (!token || !socket) throw new Error('auth meta missing');
  const auth = 'Basic ' + b64encode(token + ':' + socket);
  const cookie = pickCookie(r.headers, 'PHPSESSID');
  AUTH_CACHE = { ts: Date.now(), auth, cookie };
  return AUTH_CACHE.auth;
}
function authCookie() {
  return (AUTH_CACHE && AUTH_CACHE.cookie) || '';
}

// ---------- 列表解析 ----------
function absPoster(p) {
  if (!p) return '';
  if (/^https?:\/\//.test(p)) return p;
  return HOST + (p.charAt(0) === '/' ? '' : '/') + p;
}
function parseItems(html) {
  const out = [];
  const re = /<a href="\/([^"]+)">\s*<img class="tray-item-thumbnail" src="([^"]+)" alt="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) && out.length < 60) {
    out.push({ vod_id: m[1], vod_name: clean(m[3]), vod_pic: absPoster(m[2]), vod_remarks: '' });
  }
  return out;
}
async function listPage(path, page) {
  const url = HOST + path + (page > 1 ? '/page-' + page : '');
  const r = await reqGet(url, { 'User-Agent': UA });
  if (r.status !== 200) return { list: [], more: false };
  const list = parseItems(r.body);
  return { list, more: list.length >= PAGE_SIZE };
}

// ---------- 分类 ----------
const KW_CATS = [
  // 大屁股已改走原生 genre:big-asses（见 CATS；搜索接口只回 30 条且不支持翻页，2026-10-31 实测）
];
const CATS = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'genre:uncensored-leaked', type_name: '无码流出' },
  { type_id: 'genre:4k', type_name: '4K' },
  { type_id: 'genre:reducing-mosaic', type_name: '减码' },
  { type_id: 'censored', type_name: '有码' },
];
// 2026-11-02 用户令删：其余 genre 分类站方只有索引、无在线片源
// （详情页 episode-list 为空、默认集接口回空 player，实测护士/女仆/巨乳等
// 30 条全无片源），留着只会点进详情报“视频信息获取失败”，故只留 5 类。
// 关键词分类：走站方搜索接口（POST /api/v1/search {term}，
// 站方返回 30 条；标题盲扫 240 条曾 0 命中，搜索接口是唯一可靠途径）。
// 搜索接口不支持翻页（page/offset 参数实测均被忽略、回同样 30 条），
// 故关键词分类只有 1 页、属接口上限，非程序 bug。
// 短剧：用户 2026-10-31 令四家统一去掉，本站不设（站内搜“短編”得 0 条）。
const KWCACHE = {};
async function kwSearch(cat, page) {
  if (page > 1) return { list: [], more: false };
  if (KWCACHE[cat.id]) return { list: KWCACHE[cat.id], more: false };
  const auth = await getAuth();
  const r = await reqPostForm(HOST + '/api/v1/search', { term: cat.term },
    { Authorization: auth, 'User-Agent': UA, Referer: HOST + '/', 'X-Requested-With': 'XMLHttpRequest' });
  if (r.status !== 200 || !Array.isArray(r.json)) return { list: [], more: false };
  const list = r.json.slice(0, PAGE_SIZE).map((it) => ({
    vod_id: it.slug, vod_name: clean(it.name), vod_pic: absPoster(it.poster), vod_remarks: '',
  }));
  KWCACHE[cat.id] = list;
  return { list, more: false };
}
// 有码分页：POST /api/v1/pageView {page}（type 参数站方忽略，实测恒回有码流）
async function censoredPage(page) {
  const auth = await getAuth();
  const r = await reqPostForm(HOST + '/api/v1/pageView', { page, type: 'censored' },
    { Authorization: auth, 'User-Agent': UA, Referer: HOST + '/jav/censored', 'X-Requested-With': 'XMLHttpRequest' });
  if (r.status !== 200 || !Array.isArray(r.json)) return { list: [], more: false };
  const list = r.json.slice(0, PAGE_SIZE).map((it) => ({
    vod_id: it.slug, vod_name: clean(it.name), vod_pic: absPoster(it.poster), vod_remarks: '',
  }));
  return { list, more: list.length >= PAGE_SIZE };
}

























// ---------- 接口 ----------
async function home() {
  try {
    const r = await listPage('/jav/uncensored', 1);
    return { class: CATS, list: r.list };
  } catch (e) {
    return { class: CATS, list: [] };
  }
}
async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || 'latest');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let r = { list: [], more: false };
  try {
    if (tid === 'latest') {
      r = await listPage('/jav/uncensored', page);
    }
    else if (tid === 'censored') r = await censoredPage(page);
    else if (tid.indexOf('kw_') === 0) {
      const cat = KW_CATS.find((c) => c.id === tid);
      if (cat) r = await kwSearch(cat, page);
    } else if (tid.indexOf('genre:') === 0) {
      // genre 深翻页走 /genre/<slug>/page-N（站方分页锚链实测；?page= 会被忽略）
      r = await listPage('/genre/' + tid.slice(6), page);
    }
  } catch (e) { r = { list: [], more: false }; }
  return { page, pagecount: r.more ? page + 1 : page, list: r.list };
}
async function searchCat(reqIn) {
  const body = reqIn?.body || {};
  const kw = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!kw || page > 1) return { list: [] };
  try {
    const auth = await getAuth();
    const r = await reqPostForm(HOST + '/api/v1/search', { term: kw },
      { Authorization: auth, 'User-Agent': UA, Referer: HOST + '/', 'X-Requested-With': 'XMLHttpRequest' });
    if (r.status !== 200 || !Array.isArray(r.json)) return { list: [] };
    return {
      list: r.json.slice(0, PAGE_SIZE).map((it) => ({
        vod_id: it.slug, vod_name: clean(it.name), vod_pic: absPoster(it.poster), vod_remarks: '',
      })),
    };
  } catch (e) {
    return { list: [] };
  }
}
async function detail(reqIn) {
  const body = reqIn?.body || {};
  const slug = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!slug || /^(https?|tojav:)/.test(slug)) return { list: [] };
  let html = '';
  try {
    const r = await reqGet(HOST + '/' + slug, { 'User-Agent': UA });
    if (r.status !== 200) return { list: [] };
    html = r.body;
  } catch (e) {
    return { list: [] };
  }
  const title = clean((html.match(/og:title" content="([^"]*)"/) || [])[1] || (html.match(/<title>([^<]*)<\/title>/) || [])[1] || slug);
  // FC2 等条目站方本身无封面（og:image 为空）：退回站方默认图，与列表一致
  const pic = absPoster((html.match(/og:image" content="([^"]*)"/) || [])[1] || '/default-cover.jpg');
  const filmId = (html.match(/filmId\s*=\s*'(\d+)'/) || [])[1] || '';
  const eps = [];
  const epRe = /epButton[^>]*data-id="(\d+)"/g;
  let em;
  while ((em = epRe.exec(html))) eps.push(em[1]);
  const lines = [];
  if (filmId && eps.length) {
    eps.forEach((ep, i) => {
      lines.push({ name: eps.length > 1 ? '线路' + (i + 1) : '正片', url: 'tojav:' + filmId + ':' + ep });
    });
  }
  // 字幕预热：后台逐条串行（不 await；并行预热曾挤挂 SubtitleCat，见 ONE 教训）
  if (lines.length) {
    for (const l of lines) subCacheName(l.url, title);
    (async () => {
      for (const l of lines) {
        try { await subSearchAll(l.url); } catch (e) {}
      }
    })().catch(() => {});
  }
  return {
    list: [{
      vod_id: slug,
      vod_name: title,
      vod_pic: pic,
      vod_remarks: '',
      vod_play_from: lines.length ? 'ToJav' : '',
      vod_play_url: lines.map((l) => l.name + '$' + l.url).join('#'),
    }],
  };
}
async function play(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const idx = id.indexOf('$');
  let url = idx >= 0 ? id.slice(idx + 1) : id;
  url = t(url);
  if (!url) return { parse: 0, url: '' };
  // 非 tojav: 编码直接放行（防御性，正常线均为 tojav:film:ep）
  if (!/^tojav:\d+:\d+$/.test(url)) return { parse: 0, url, header: { 'User-Agent': UA } };
  const subsP = subSearchAll(url).catch(() => []);
  const parts = url.split(':');
  const filmId = parts[1];
  const episode = parts[2];
  let embedUrl = '';
  try {
    const auth = await getAuth();
    const pr = await reqPostForm(HOST + '/api/v1/player', { episode, filmId },
      { Authorization: auth, 'User-Agent': UA, Referer: HOST + '/', 'X-Requested-With': 'XMLHttpRequest' });
    let playerHtml = '';
    if (pr.json && pr.json.player) playerHtml = pr.json.player;
    else if (pr.text) {
      try { playerHtml = JSON.parse(pr.text).player || ''; } catch (e) { /* 忽略 */ }
    }
    const m = playerHtml.match(/embed\/([0-9a-f-]{36})/);
    if (!m) {
      // javtiful 嵌套播放器（2026-10-31 查实：-mosaic 类条目走 javtiful.com/embed/<数字 id>，
      // 旧代码只认 36 位 UUID，匹配失败回空地址 → 播放器一直转圈；MNGS-079 即此类）
      const jm = playerHtml.match(/javtiful\.com\/embed\/(\d+)/);
      if (jm) {
        const jtEmbed = 'https://javtiful.com/embed/' + jm[1];
        try {
          const eh = await reqGet(jtEmbed, { 'User-Agent': UA, Referer: HOST + '/' });
          const pm = (eh.body || '').match(/"playback"\s*:\s*\{\s*"endpoint"\s*:\s*"([^"]+)"\s*,\s*"ticket"\s*:\s*"([^"]+)"/i);
          if (pm) {
            const endpoint = pm[1].startsWith('http') ? pm[1] : 'https://javtiful.com' + pm[1];
            const pb = await reqPostForm(endpoint, { ticket: pm[2] },
              { 'User-Agent': UA, Referer: jtEmbed, 'X-Requested-With': 'XMLHttpRequest' });
            let pj = pb.json;
            if (!pj && pb.text) { try { pj = JSON.parse(pb.text); } catch (e) {} }
            if (pj && pj.success && Array.isArray(pj.sources) && pj.sources.length) {
              let best = pj.sources[0];
              for (const s of pj.sources) { if ((s.size || 0) > (best.size || 0)) best = s; }
              let src = best.src || best.fallbackSrc || '';
              if (src && !/^https?:\/\//i.test(src)) src = 'https://javtiful.com' + (src.startsWith('/') ? '' : '/') + src;
              if (src) {
                const subs = await subsP;
                const res = { parse: 0, url: src, header: { Referer: jtEmbed, 'User-Agent': UA } };
                if (subs && subs.length) res.subs = subs;
                return res;
              }
            }
          }
        } catch (e) { /* 落到嗅探 */ }
        // javtiful 链路失败时退回嵌套页嗅探，绝不回空地址（空地址即转圈）
        const subs = await subsP;
        const res = { parse: 1, url: jtEmbed, header: { Referer: HOST + '/', 'User-Agent': UA } };
        if (subs && subs.length) res.subs = subs;
        return res;
      }
      // 未知嵌套：有 iframe 地址就嗅探，否则才回空
      const im = playerHtml.match(/<iframe[^>]+src="(https?:\/\/[^"]+)"/i);
      const subs = await subsP;
      if (im) {
        const res = { parse: 1, url: im[1], header: { Referer: HOST + '/', 'User-Agent': UA } };
        if (subs && subs.length) res.subs = subs;
        return res;
      }
      const res = { parse: 0, url: '' };
      if (subs && subs.length) res.subs = subs;
      return res;
    }
    embedUrl = EMBED + '/embed/' + m[1];
    const tr = await reqGet(EMBED + '/api/playlist-token/' + m[1],
      { Accept: 'application/json', 'User-Agent': UA, Referer: embedUrl });
    let token = '';
    if (tr.status === 200) {
      try { token = JSON.parse(tr.body).t || ''; } catch (e) { /* 忽略 */ }
    }
    const subs = await subsP;
    if (token) {
      const res = { parse: 0, url: EMBED + '/v/' + token, header: { Referer: embedUrl, 'User-Agent': UA } };
      if (subs && subs.length) res.subs = subs;
      return res;
    }
    // token 失败时退回 embed 页嗅探（parse:1）
    const res = { parse: 1, url: embedUrl, header: { Referer: HOST + '/', 'User-Agent': UA } };
    if (subs && subs.length) res.subs = subs;
    return res;
  } catch (e) {
    const subs = await subsP.catch(() => []);
    const res = { parse: embedUrl ? 1 : 0, url: embedUrl || '' };
    if (subs && subs.length) res.subs = subs;
    return res;
  }
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
    // 静态 tabs, 不联网 (CATS 即分类表; 旧版调 home() 先拉一页列表,
    // 站方慢 (单页可达 9s) 且一挂就拖死 getConfig)。
    const tabs = CATS.map((c) => ({ name: String(c.type_name || ''), ext: { id: String(c.type_id || '') } }));
    return jsonify({ ver: 1, title: 'ToJav', site: 'https://tojav.net', tabs });
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
    // 只接受真媒体地址; 令牌本身 (tojav:film:ep)、嵌套页 (parse:1 嗅探
    // 地址, 如 /embed/ 或 /e/ 形) 一律不回 (页面地址绝不当播放地址)。
    // 无真地址时直接回空, 不再跑字幕搜索。
    const media = String((r && r.url) || '');
    if (!media || !/^https?:\/\//.test(media) || /^tojav:/.test(media) ||
        /\/embed\//.test(media) || /\/e\/[A-Za-z0-9_-]+\/?$/.test(media)) {
        return jsonify({ urls: [], headers: [] });
    }
    const result = { urls: [media], headers: [r.header || {}] };
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
