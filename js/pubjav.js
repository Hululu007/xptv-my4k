// PubJav - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/pubjav.js
// pubjav.com - MiraPlayer 蜘蛛
// 站点：https://pubjav.com（Watch JAV Streaming Online, Free Japanese Porn）
// 列表：/movies（最新）、/movies?genre=censored|uncensored|amateur、
//   /genre/<slug>、/actor/<slug>、/studio/<slug>、/label/<slug>；详情 /play/<slug>。
// 播放链（VM 全链实测通）：详情页 filmId/__pt/__pk + F4 data-id
//   → POST /ajax/player（pt 必填，缺/错均 403 E_TOK_LEN/E_TOK_MISS）
//   → player_enc 用 __pk 做 base64+XOR 解密 → iframe f4scdn.com/e/<code>
//   → data-api → GET /api/play/<vid>?ab=0&n=1 → src（签名 master m3u8，300 秒有效）。
//   master 与分片均强制 Origin: https://f4scdn.com 才能 200（无 Origin 403；
//   播放器不把 play header 转发给分片请求，直出 m3u8 在真机上必死，sextb v1-v3 已证实）。
//   故播放走已部署的 sextb-hls Worker /f4 全链代理（Worker 内取 src + 注入 Origin 改写），
//   蜘蛛只返回 Worker 地址，不直接碰视频流；复用已部署 Worker，无需新部署。
// 分辨率：F4 编码实测均为单档 720p（3 部片 master 均只含 1280x720 一个变体），
//   详情按 master 实测档位出线，有多档就多线、单档就一线，绝不硬编。
// 封面：列表 cdn001.imggle.net webp 直读 200；详情 pics.dmm.co.jp 直读；均无需代理。
// 其他服务器：SW 为 JS 混淆加载页、DD 为 Turnstile 真人验证墙、
//   ST get_video 在 VM 上 500（IP 绑定，VM 无法验证），三者均未纳入播放线；只出已验通的 F4 线。
// 字幕：接定版 subcore.js（2026-11-02），按片名登记番号，后台预热，play 有命中才带 subs。
//   注意：播放地址每次现取签名不同，故字幕统一以详情页地址为键登记与查询。
const KEY = 'py_pubjav';
const NAME = 'PubJav';
const HOST = 'https://pubjav.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// 已部署的 sextb-hls Worker（用户 Cloudflare 账号，v4），/f4 路由为通用 f4 embed 代理，
// 实测可用于 pubjav 的 f4 embed（返回改写后 master + /p 变体 + /s 分片，全链 200）。
const WORKER = 'https://sextb-hls.li768435813.workers.dev';

// 分类：顶级 4 个（首页最新/有码/无码/素人）；子级平铺在后，名前缀标明从属
// （类型 16 个全站类型、女优前 20、厂商前 20、厂牌前 15，均按站内人气顺序取前 N；
// 站内女优/厂商/厂牌各 300+，全量既无法逐个 harness 验、App 里也没法翻，故只取前 N；
// 导演未入（浏览价值低）。每个分类均须 harness 实测有内容才保留，见 test_pubjav.cjs。
const CLASSES = [
  // —— 顶级 ——
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'censored', type_name: '有码' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'amateur', type_name: '素人' },
  // —— 子级：类型（/genres 全 16 个）——
  { type_id: '/genre/reducing-mosaic', type_name: '类型·Reducing Mosaic' },
  { type_id: '/genre/uncensored-leaked', type_name: '类型·Uncensored Leaked' },
  { type_id: '/genre/amateur', type_name: '类型·Amateur' },
  { type_id: '/genre/anal', type_name: '类型·Anal' },
  { type_id: '/genre/av-idol', type_name: '类型·AV Idol' },
  { type_id: '/genre/beautiful-girl', type_name: '类型·Beautiful Girl' },
  { type_id: '/genre/beautiful-pussy', type_name: '类型·Beautiful Pussy' },
  { type_id: '/genre/big-asses', type_name: '类型·Big Asses' },
  { type_id: '/genre/big-tits', type_name: '类型·Big Tits' },
  { type_id: '/genre/blowjob', type_name: '类型·Blowjob' },
  { type_id: '/genre/bondage', type_name: '类型·Bondage' },
  { type_id: '/genre/bukkake', type_name: '类型·Bukkake' },
  { type_id: '/genre/cheating-wife', type_name: '类型·Cheating Wife' },
  { type_id: '/genre/cosplay', type_name: '类型·Cosplay' },
  { type_id: '/genre/creampie', type_name: '类型·Creampie' },
  { type_id: '/genre/cumshot', type_name: '类型·Cumshot' },
  // —— 子级：女优（/actors 人气前 20）——
  { type_id: '/actor/yui-hatano', type_name: '女优·Yui Hatano' },
  { type_id: '/actor/yu-shinoda', type_name: '女优·Yu Shinoda' },
  { type_id: '/actor/hibiki-otsuki', type_name: '女优·Hibiki Otsuki' },
  { type_id: '/actor/mao-hamasaki', type_name: '女优·Mao Hamasaki' },
  { type_id: '/actor/kanako-iioka', type_name: '女优·Kanako Iioka' },
  { type_id: '/actor/ichika-matsumoto', type_name: '女优·Ichika Matsumoto' },
  { type_id: '/actor/julia', type_name: '女优·Julia' },
  { type_id: '/actor/asahi-mizuno', type_name: '女优·Asahi Mizuno' },
  { type_id: '/actor/akari-niimura', type_name: '女优·Akari Niimura' },
  { type_id: '/actor/mizuki-yayoi', type_name: '女优·Mizuki Yayoi' },
  { type_id: '/actor/aika', type_name: '女优·Aika' },
  { type_id: '/actor/kanako-ioka', type_name: '女优·Kanako Ioka' },
  { type_id: '/actor/waka-misono', type_name: '女优·Waka Misono' },
  { type_id: '/actor/reiko-kobayakawa', type_name: '女优·Reiko Kobayakawa' },
  { type_id: '/actor/kurea-hasumi', type_name: '女优·Kurea Hasumi' },
  { type_id: '/actor/himari-hanazawa', type_name: '女优·Himari Hanazawa' },
  { type_id: '/actor/yui-tenma', type_name: '女优·Yui Tenma' },
  { type_id: '/actor/mitsuki-nagisa', type_name: '女优·Mitsuki Nagisa' },
  { type_id: '/actor/yumi-kazama', type_name: '女优·Yumi Kazama' },
  { type_id: '/actor/rena-aoi', type_name: '女优·Rena Aoi' },
  // —— 子级：厂商（/studios 人气前 20）——
  { type_id: '/studio/fc2ppv', type_name: '厂商·FC2PPV' },
  { type_id: '/studio/madonna', type_name: '厂商·MADONNA' },
  { type_id: '/studio/moodyz', type_name: '厂商·MOODYZ' },
  { type_id: '/studio/s1-no-1-style', type_name: '厂商·S1 NO.1 STYLE' },
  { type_id: '/studio/sod-create', type_name: '厂商·SOD Create' },
  { type_id: '/studio/attackers', type_name: '厂商·Attackers' },
  { type_id: '/studio/prestige', type_name: '厂商·Prestige' },
  { type_id: '/studio/idea-pocket', type_name: '厂商·Idea Pocket' },
  { type_id: '/studio/k-m-produce', type_name: '厂商·K M Produce' },
  { type_id: '/studio/venus', type_name: '厂商·Venus' },
  { type_id: '/studio/fitch', type_name: '厂商·Fitch' },
  { type_id: '/studio/das-', type_name: '厂商·Das!!' },
  { type_id: '/studio/glory-quest', type_name: '厂商·Glory Quest' },
  { type_id: '/studio/hunter', type_name: '厂商·Hunter' },
  { type_id: '/studio/tameike-goro', type_name: '厂商·Tameike Goro' },
  { type_id: '/studio/center-village', type_name: '厂商·Center Village' },
  { type_id: '/studio/honnaka', type_name: '厂商·Honnaka' },
  { type_id: '/studio/premium', type_name: '厂商·Premium' },
  { type_id: '/studio/wanz-factory', type_name: '厂商·Wanz Factory' },
  { type_id: '/studio/doc', type_name: '厂商·Doc' },
  // —— 子级：厂牌（/labels 人气前 15）——
  { type_id: '/label/madonna', type_name: '厂牌·Madonna' },
  { type_id: '/label/s1-no-1-style', type_name: '厂牌·S1 NO.1 STYLE' },
  { type_id: '/label/moodyz-diva', type_name: '厂牌·MOODYZ DIVA' },
  { type_id: '/label/hhh-group', type_name: '厂牌·HHH Group' },
  { type_id: '/label/tissue', type_name: '厂牌·Tissue' },
  { type_id: '/label/glory-quest', type_name: '厂牌·GLORY QUEST' },
  { type_id: '/label/das', type_name: '厂牌·Das' },
  { type_id: '/label/sod-star', type_name: '厂牌·SOD star' },
  { type_id: '/label/honnaka', type_name: '厂牌·Honnaka' },
  { type_id: '/label/aleddin', type_name: '厂牌·ALEDDIN' },
  { type_id: '/label/oppai', type_name: '厂牌·OPPAI' },
  { type_id: '/label/tameike-goro-', type_name: '厂牌·Tameike Goro' },
  { type_id: '/label/fitch', type_name: '厂牌·Fitch' },
  { type_id: '/label/kawaii', type_name: '厂牌·Kawaii' },
  { type_id: '/label/wanz-factory', type_name: '厂牌·Wanz Factory' },
];

function t(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return HOST + u;
  return HOST + '/' + u;
}

// 取页：强制原始文本（站方回 HTML；rdd22 教训：axios 自动解析 JSON 会坏 String(data)）。
async function getHtml(url, headers, timeoutMs) {
  try {
    const r = await $fetch.get(url, {
      headers: Object.assign({ 'User-Agent': UA, 'Referer': HOST + '/' }, headers || {}),
      timeout: timeoutMs || 15000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

async function postForm(url, fields, headers, timeoutMs) {
  const body = Object.keys(fields || {}).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(fields[k])).join('&');
  try {
    const r = await $fetch.post(url, body, {
      headers: Object.assign({
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      }, headers || {}),
      timeout: timeoutMs || 10000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

// theme.script.min.js 的 xorDecrypt 原样移植（Buffer 版；App 内无 atob/TextDecoder）：
 // player_enc 是 base64，解出字节后逐字节 XOR key（__pk，循环），再按 UTF-8 还原。
// ---------- 纯 JS base64 / UTF-8（不依赖 Buffer / atob / CryptoJS；XPTV 内可用） ----------
const _B64T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function _b64ToBytes(b64) {
  const s = String(b64 == null ? '' : b64).replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const c0 = _B64T.indexOf(s[i]);
    const c1 = _B64T.indexOf(s[i + 1] || 'A');
    const c2 = _B64T.indexOf(s[i + 2] || 'A');
    const c3 = _B64T.indexOf(s[i + 3] || 'A');
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out.push((n >> 16) & 0xff);
    if (s[i + 2] !== undefined) out.push((n >> 8) & 0xff);
    if (s[i + 3] !== undefined) out.push(n & 0xff);
  }
  return out;
}
function _bytesToB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += _B64T[b0 >> 2] + _B64T[((b0 & 3) << 4) | (b1 >> 4)] + (i + 1 < bytes.length ? _B64T[((b1 & 15) << 2) | (b2 >> 6)] : '=') + (i + 2 < bytes.length ? _B64T[b2 & 63] : '=');
  }
  return out;
}
function _utf8Bytes(s) {
  const str = String(s == null ? '' : s);
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.codePointAt(i);
    if (cp > 0xffff) i++;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}
function _utf8Decode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if ((b & 0xe0) === 0xc0) { const b2 = bytes[i++] || 0; s += String.fromCharCode(((b & 0x1f) << 6) | (b2 & 0x3f)); }
    else if ((b & 0xf0) === 0xe0) { const b2 = bytes[i++] || 0, b3 = bytes[i++] || 0; s += String.fromCharCode(((b & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)); }
    else if ((b & 0xf8) === 0xf0) { const b2 = bytes[i++] || 0, b3 = bytes[i++] || 0, b4 = bytes[i++] || 0; s += String.fromCodePoint((((b & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f))); }
    else s += '\ufffd';
  }
  return s;
}
function _b64EncodeUtf8(s) { return _bytesToB64(_utf8Bytes(s)); }
function _b64DecodeUtf8(b64) { try { return _utf8Decode(_b64ToBytes(b64)); } catch (e) { return ''; } }
function _b64urlEncodeUtf8(s) { return _b64EncodeUtf8(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function _b64urlDecodeUtf8(s) { let b = String(s == null ? '' : s).replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; return _b64DecodeUtf8(b); }

function xorDecrypt(enc, key) {
  if (!enc || !key) return '';
  try {
    const buf = _b64ToBytes(String(enc));
    const out = [];
    for (let i = 0; i < buf.length; i++) out.push(buf[i] ^ key.charCodeAt(i % key.length));
    return _utf8Decode(out);
  } catch (e) {
    return '';
  }
}

// 列表页：/movies、/movies?genre=X、/genre/X、/actor/X、/studio/X、/label/X、/search/X
// 翻页：/movies/pg-N、/movies?genre=X&pg=N、其余 /pg-N 后缀（搜索页 302 跟随）。
function listUrl(id, page) {
  const p = Math.max(1, page || 1);
  let base;
  if (id === 'home' || id === '' || id == null) base = '/movies';
  else if (id === 'censored') base = '/movies?genre=censored';
  else if (id === 'uncensored') base = '/movies?genre=uncensored';
  else if (id === 'amateur') base = '/movies?genre=amateur';
  else base = String(id);
  if (p <= 1) return HOST + base;
  if (base.indexOf('?') >= 0) return HOST + base + '&pg=' + p;
  return HOST + base + '/pg-' + p;
}

// 列表解析：每条一个 <a href="/play/<slug>" title="<标题>"> 卡片，内含
//   <span class="mli-code">CODE</span>、<span class="mli-runtimes">分钟</span>、
//   <img data-original="封面 webp">（懒加载，src 是占位图，必须取 data-original）。
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a[^>]*href="\/play\/([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (!slug || seen.has(slug)) continue;
    const body = m[3] || '';
    const cm = body.match(/<span class="mli-code">([^<]*)<\/span>/i);
    const rm = body.match(/<span class="mli-runtimes">([^<]*)<\/span>/i);
    const im = body.match(/data-original="([^"]+)"/i) || body.match(/<img[^>]*src="(https?:\/\/[^"]+)"/i);
    const title = decodeHtml(t(m[2]));
    if (!title) continue;
    seen.add(slug);
    const code = cm ? t(cm[1]) : '';
    const mins = rm ? t(rm[1]) : '';
    out.push({
      vod_id: HOST + '/play/' + slug,
      vod_name: title,
      vod_pic: im ? absUrl(im[1]) : '',
      vod_remarks: (code ? code : '') + (mins ? (code ? ' · ' : '') + mins + '分钟' : ''),
    });
  }
  return out;
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'home');
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 24,
    total: 999 * 24,
    list,
  };
}

async function searchCat(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const base = '/search/' + encodeURIComponent(wd);
  const url = page <= 1 ? HOST + base : HOST + base + '/pg-' + page;
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 24,
    total: 999 * 24,
    list,
  };
}

// 从详情页提取：filmId、__pt、__pk、F4 服务器的 data-id。
function extractPlayerInfo(html) {
  const out = { filmId: '', pt: '', pk: '', f4ep: '' };
  if (!html) return out;
  let m = html.match(/filmId\s*=\s*(\d+)/);
  if (m) out.filmId = m[1];
  m = html.match(/window\.__pt\s*=\s*"([^"]+)"/);
  if (m) out.pt = m[1];
  m = html.match(/window\.__pk\s*=\s*"([^"]+)"/);
  if (m) out.pk = m[1];
  // 服务器按钮：<button class="switch-source" data-source=".." data-id="..">F4</button>
  // （VIP 按钮 data-id 为负数，跳过；clickfakeplayer 无 data-id，不会命中。）
  const re = /data-source="(\d+)"\s+data-id="(-?\d+)"[^>]*>([\s\S]{0,120}?)<\/button>/g;
  let bm;
  while ((bm = re.exec(html)) !== null) {
    const name = t(decodeHtml(bm[3]).replace(/<[^>]*>/g, ' '));
    if (name === 'F4' && bm[2] && bm[2][0] !== '-') {
      out.f4ep = bm[2];
      if (!out.filmId) out.filmId = bm[1];
      break;
    }
  }
  return out;
}

// POST /ajax/player 拿 F4 embed 地址（player_enc XOR 解密）。
async function resolveF4Embed(durl, info) {
  if (!info || !info.filmId || !info.f4ep || !info.pt || !info.pk) return '';
  const resp = await postForm(HOST + '/ajax/player',
    { episode: info.f4ep, filmId: info.filmId, pt: info.pt },
    { 'Referer': durl }, 10000);
  if (!resp) return '';
  let playerEnc = '';
  try {
    const j = JSON.parse(resp);
    playerEnc = j && j.player_enc ? String(j.player_enc) : '';
  } catch (e) { return ''; }
  if (!playerEnc) return '';
  const playerHtml = xorDecrypt(playerEnc, info.pk);
  const m = playerHtml.match(/<iframe[^>]+src="(https?:\/\/[^"]+)"/i);
  if (!m) return '';
  return m[1];
}

// Worker /f4 取 master 播单（Worker 内现取签名 src 并注入 Origin 改写）。
async function workerF4Master(embedUrl, durl) {
  const u = WORKER + '/f4?u=' + encodeURIComponent(embedUrl) + '&r=' + encodeURIComponent(durl);
  const txt = await getHtml(u, { 'Accept': 'application/vnd.apple.mpegurl,*/*' }, 20000);
  if (!txt || txt.indexOf('#EXTM3U') < 0) return '';
  return txt;
}

// 解析 master 里的变体：#EXT-X-STREAM-INF(RESOLUTION=WxH) 下一行是变体地址。
// 返回 [{ label: '720p', height: 720, url: '<绝对地址>' }]（label 按高取，如 720p/1080p）。
function parseVariants(master) {
  const out = [];
  if (!master) return out;
  const lines = String(master).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const s = t(lines[i]);
    if (s.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    const rm = s.match(/RESOLUTION=(\d+)x(\d+)/i);
    const height = rm ? parseInt(rm[2], 10) : 0;
    let url = '';
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      const u = t(lines[j]);
      if (u && u[0] !== '#') { url = u; break; }
    }
    if (!url) continue;
    let label = height ? (height + 'p') : '';
    if (!label) {
      const lm = url.match(/\/(\d{3,4})p\//);
      if (lm) label = lm[1] + 'p';
    }
    if (!label) label = '原画';
    out.push({ label, height, url });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/<title>([^<]*)<\/title>/i);
  if (m) return decodeHtml(t(m[1]));
  return fallback || '';
}

function extractCover(html) {
  // 详情页海报：img.cover（pics.dmm.co.jp），其次 og:image
  let m = html.match(/<img[^>]*class="cover"[^>]*src="([^"]+)"/i)
    || html.match(/<img[^>]*src="([^"]+)"[^>]*class="cover"/i);
  if (m) return absUrl(m[1]);
  m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (m) return absUrl(m[1]);
  return '';
}

function slugOf(durl) {
  const m = String(durl || '').match(/\/play\/([^/?#]+)/i);
  return m ? m[1] : '';
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let durl = t(raw);
  if (!durl) return { list: [] };
  if (!/^https?:\/\//i.test(durl)) durl = absUrl(durl);
  const slug = slugOf(durl);
  const html = await getHtml(durl);
  if (!html) return { list: [] };

  const name = extractTitle(html, slug);
  const pic = extractCover(html);

  // F4 链：详情页 → ajax/player → embed → Worker /f4 取 master → 按实测档位出线。
  let lines = [];
  const info = extractPlayerInfo(html);
  const embed = await resolveF4Embed(durl, info);
  if (embed) {
    const master = await workerF4Master(embed, durl);
    const variants = parseVariants(master);
    if (variants.length) {
      lines = variants.map((v) => v.label + '$f4:' + slug + ':' + v.label);
    }
  }
  // 兜底：链路当时没跑通也留一条 F4 线，play() 里现解（签名现取，不依赖详情时效）。
  if (!lines.length) lines = ['F4$f4:' + slug + ':auto'];

  const playUrl = lines.join('#');
  // 字幕：以详情页地址为键登记片名（播放地址每次现取签名不同，不能作键），后台预热。
  if (name) {
    subCacheName(durl, name);
    subWarm(durl);
  }
  return {
    list: [{
      vod_id: durl,
      vod_name: name || slug,
      vod_pic: pic,
      vod_play_from: NAME,
      vod_play_url: playUrl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  // id 可能是 "720p$f4:<slug>:720p" 或 "F4$f4:<slug>:auto"，取 $ 后面的 token。
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const m = id.match(/^f4:([^:]+):(.+)$/);
  if (!m) return { parse: 0, url: '' };
  const slug = m[1];
  const want = m[2];
  const durl = HOST + '/play/' + slug;

  // 现取：详情页（新鲜 __pt/__pk）→ ajax/player → embed → Worker /f4 取 master。
  const html = await getHtml(durl);
  if (!html) return { parse: 0, url: '' };
  const info = extractPlayerInfo(html);
  const embed = await resolveF4Embed(durl, info);
  if (!embed) return { parse: 0, url: '' };
  const master = await workerF4Master(embed, durl);
  if (!master) return { parse: 0, url: '' };

  let url = WORKER + '/f4?u=' + encodeURIComponent(embed) + '&r=' + encodeURIComponent(durl);
  if (want && want !== 'auto') {
    const variants = parseVariants(master);
    const hit = variants.filter((v) => v.label === want)[0]
      || variants.filter((v) => String(v.height) === want.replace(/p$/i, ''))[0];
    if (hit && hit.url) url = hit.url;
  }
  // 字幕：与 detail 同键（详情页地址），detail 预热过则命中缓存/在途；无命中不带 subs 键。
  const subs = await subSearchAll(durl).catch(() => []);
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

// ---------- 字幕聚合 companion helpers（core 本身不含，抄自 chineseav.js） ----------
// reqRaw：框架 req，2xx 才回 body，永不抛错；clean：去标签/空白（core 的 subSlugTitle 用到）。
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
    return jsonify({ ver: 1, title: 'PubJav', site: 'https://pubjav.com', tabs: tabs.length ? tabs : [{ name: '全部', ext: { id: '' } }] });
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
    if (!r.url) return jsonify({ urls: [], headers: [] });
    const result = { urls: [r.url], headers: [r.header || {}] };
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
