// 7mmtv - XPTV csp 格式（csp_7mmtv）
// 转换自 mira-cat nodejs/src/spider/video/7mmtv.js（py_7mmtv）。站点 https://7mmtv.sx
// 依赖 Worker：mmtv-vidhide（https://mmtv-vidhide.li768435813.workers.dev）—— vidhide 系（SW/VH）全链代理，
// getPlayinfo 返回 Worker /v 产出的 URL 原样直出。
// tabs 只留 7 个主分类（list:*）；maker/tag 全铺成 tab 会卡死 XPTV，已删。
// S 线（DO/SP）播放：嵌页（站方 play.php）内 videoSources 直给多清晰度 m3u8，按清晰度从高到低回；
// 嵌页里解不出流（DO 的 Turnstile 等）返回空，绝不回页面地址。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）：搜索兜底的站方表单 POST（searchform_search）逐字保持猫侧表单格式。
// 猫版纯 JS AES-128-CBC 解密原样内联（不依赖 Node crypto）；其 atob/TextEncoder/TextDecoder 改纯 JS 实现（XPTV 运行时无这些全局）。
// 猫版页缓存/tierCache/twinCache 等跨调用全局状态按规范去掉（每次入口调用内现取）；setTimeout 仅原猫版用于请求超时，
// XPTV 版改 $fetch 单通道串行、无 setTimeout 参与逻辑；Worker 探活改 $fetch.get 文本/状态判定。
const HOST = 'https://7mmtv.sx';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = HOST + '/zh/';
const MMTV_WORKER = 'https://mmtv-vidhide.li768435813.workers.dev';

const CATS = [
  { type_id: 'list:censored', type_name: '有碼AV' },
  { type_id: 'list:reducing-mosaic', type_name: '無碼破解' },
  { type_id: 'list:chinese', type_name: '中字AV' },
  { type_id: 'list:uncensored', type_name: '無碼AV' },
  { type_id: 'list:amateurjav', type_name: '素人AV' },
  { type_id: 'list:amateur', type_name: '國產影片' },
  { type_id: 'list:klive', type_name: '韓國直播' }
];

const CATMAP = {};
for (const c of CATS) CATMAP[c.type_id] = c;

const appConfig = {
    ver: 1,
    title: '7mmtv',
    site: HOST,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) { return v == null ? '' : String(v).trim(); }
function clean(s) { return t(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' '); }
function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return HOST + u;
    return u;
}
async function fetchText(url, referer) {
    const headers = { 'User-Agent': UA, 'Referer': referer || REFERER, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9' };
    try {
        const { data, status } = await $fetch.get(url, { headers });
        if ((status === undefined || status === 200) && data != null && data !== '') {
            return typeof data === 'string' ? data : JSON.stringify(data);
        }
        if (typeof data === 'string' && data) return data;
    } catch (e) {}
    return '';
}
async function getPage(url, referer) { return fetchText(url, referer); }
async function postForm(url, params, referer) {
    const body = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    const headers = { 'User-Agent': UA, 'Referer': referer || REFERER, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' };
    try {
        const { data, status } = await $fetch.post(url, body, { headers });
        if ((status === undefined || status === 200) && typeof data === 'string' && data) return data;
    } catch (e) {}
    return '';
}
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<div class='video'>[\s\S]*?<a[^>]+href="([^"]+_content\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<h3 class='video-title'>\s*<a[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const url = absUrl(m[1]);
        if (seen.has(url)) continue;
        seen.add(url);
        const imgM = m[2].match(/data-src='([^']+)'/) || m[2].match(/src='([^']+)'/) || m[2].match(/data-src="([^"]+)"/);
        const name = clean(m[3].replace(/<[^>]+>/g, ''));
        const tail = url.match(/\/([^/]+)\.html(?:[?#]|$)/);
        out.push({ vod_id: url, vod_name: name, vod_pic: imgM ? absUrl(imgM[1]) : '', vod_remarks: tail ? tail[1] : '', ext: { id: url } });
    }
    return out;
}
function pagecountOf(html) {
    const i = html.indexOf('pagination-row');
    if (i < 0) return 1;
    const seg = html.slice(i, i + 6000);
    let max = 1;
    for (const m of seg.matchAll(/\/(\d+)\.html/g)) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    return max;
}
// ---------- 纯 JS AES-128-CBC 解密 (仅解密方向，与猫版逐字一致) ----------
const AES_SBOX = [], AES_INV = [], AES_LOG = new Uint8Array(256), AES_EXP = new Uint8Array(256);
(function aesInit() {
  let x = 1;
  for (let i = 0; i < 256; i++) {
    AES_EXP[i] = x; AES_LOG[x] = i;
    x ^= ((x << 1) & 0xff) ^ ((x & 0x80) ? 0x1b : 0);
  }
  for (let i = 0; i < 256; i++) {
    let s = i ? AES_EXP[(255 - AES_LOG[i]) % 255] : 0;
    let y = s;
    y = ((y << 1) | (y >> 7)) & 0xff; s ^= y;
    y = ((y << 1) | (y >> 7)) & 0xff; s ^= y;
    y = ((y << 1) | (y >> 7)) & 0xff; s ^= y;
    y = ((y << 1) | (y >> 7)) & 0xff; s ^= y;
    s ^= 0x63;
    AES_SBOX[i] = s & 0xff; AES_INV[s & 0xff] = i;
  }
})();
function aesMul(a, b) { return a && b ? AES_EXP[(AES_LOG[a] + AES_LOG[b]) % 255] : 0; }
const AES_RCON = [1, 2, 4, 8, 16, 32, 64, 128, 27, 54];
function aesExpandKey(key) {
  const w = new Uint8Array(176);
  w.set(key.subarray(0, 16));
  for (let i = 4; i < 44; i++) {
    let t0 = w[4 * i - 4], t1 = w[4 * i - 3], t2 = w[4 * i - 2], t3 = w[4 * i - 1];
    if (i % 4 === 0) {
      const n0 = AES_SBOX[t1] ^ AES_RCON[i / 4 - 1], n1 = AES_SBOX[t2], n2 = AES_SBOX[t3], n3 = AES_SBOX[t0];
      t0 = n0; t1 = n1; t2 = n2; t3 = n3;
    }
    w[4 * i] = w[4 * i - 16] ^ t0;
    w[4 * i + 1] = w[4 * i - 15] ^ t1;
    w[4 * i + 2] = w[4 * i - 14] ^ t2;
    w[4 * i + 3] = w[4 * i - 13] ^ t3;
  }
  return w;
}
function aesDecryptBlock(w, block, out, off) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = block[i] ^ w[160 + i];
  for (let round = 9; round >= 1; round--) {
    for (let i = 0; i < 16; i++) s[i] = AES_INV[s[i]];
    const u = new Uint8Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) u[4 * c + r] = s[4 * ((c - r + 4) % 4) + r];
    s.set(u);
    for (let i = 0; i < 16; i++) s[i] ^= w[16 * round + i];
    for (let c = 0; c < 4; c++) {
      const a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
      s[4 * c]     = aesMul(a0, 14) ^ aesMul(a1, 11) ^ aesMul(a2, 13) ^ aesMul(a3, 9);
      s[4 * c + 1] = aesMul(a0, 9) ^ aesMul(a1, 14) ^ aesMul(a2, 11) ^ aesMul(a3, 13);
      s[4 * c + 2] = aesMul(a0, 13) ^ aesMul(a1, 9) ^ aesMul(a2, 14) ^ aesMul(a3, 11);
      s[4 * c + 3] = aesMul(a0, 11) ^ aesMul(a1, 13) ^ aesMul(a2, 9) ^ aesMul(a3, 14);
    }
  }
  for (let i = 0; i < 16; i++) s[i] = AES_INV[s[i]];
  const u = new Uint8Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) u[4 * c + r] = s[4 * ((c - r + 4) % 4) + r];
  for (let i = 0; i < 16; i++) out[off + i] = u[i] ^ w[i];
}
function aes128CbcDecrypt(data, keyBytes, ivBytes) {
  if (!data.length || data.length % 16 !== 0) return new Uint8Array(0);
  const w = aesExpandKey(keyBytes);
  const out = new Uint8Array(data.length);
  let prev = ivBytes;
  for (let off = 0; off < data.length; off += 16) {
    const block = data.subarray(off, off + 16);
    aesDecryptBlock(w, block, out, off);
    for (let i = 0; i < 16; i++) out[off + i] ^= prev[i];
    prev = block;
  }
  const pad = out[out.length - 1];
  if (pad >= 1 && pad <= 16) return out.subarray(0, out.length - pad);
  return out;
}
// 纯 JS base64 解码（代 atob）
function b64ToBytes(b64) {
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const s = String(b64).replace(/[^A-Za-z0-9+/=]/g, '');
    const out = [];
    for (let i = 0; i < s.length; i += 4) {
        const a = alpha.indexOf(s[i]), b = alpha.indexOf(s[i + 1]);
        const c = s[i + 2] === '=' ? 0 : alpha.indexOf(s[i + 2]);
        const d = s[i + 3] === '=' ? 0 : alpha.indexOf(s[i + 3]);
        if (a < 0 || b < 0) break;
        out.push((a << 2) | (b >> 4));
        if (s[i + 2] !== '=') out.push(((b & 15) << 4) | (c >> 2));
        if (s[i + 3] !== '=') out.push(((c & 3) << 6) | d);
    }
    return new Uint8Array(out);
}
// 纯 JS UTF-8 编码（代 TextEncoder；key/iv 为 ASCII，此为通用实现）
function utf8Bytes(s) {
    const out = [];
    for (let i = 0; i < String(s).length; i++) {
        let cp = String(s).codePointAt(i);
        if (cp > 0xffff) i++;
        if (cp < 0x80) out.push(cp);
        else if (cp < 0x800) { out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)); }
        else if (cp < 0x10000) { out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
        else { out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
    }
    return new Uint8Array(out);
}
// 纯 JS UTF-8 解码（代 TextDecoder）
function utf8Text(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i];
        if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
        else if ((b & 0xe0) === 0xc0) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
        else if ((b & 0xf0) === 0xe0) { out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3; }
        else { const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f); out += String.fromCodePoint(cp); i += 4; }
    }
    return out;
}
function parseGlobals(html) {
  const grabS = (n) => { const m = html.match(new RegExp(n + "\\s*=\\s*'([^']+)'")); return m ? m[1] : ''; };
  const grabN = (n) => { const m = html.match(new RegExp(n + "\\s*=\\s*(\\d+)")); return m ? parseInt(m[1], 10) : NaN; };
  return { hc: grabN('hcdeedg252'), ha: grabN('hadeedg252'), key: grabS('argdeqweqweqwz'), iv: grabS('hdddedf252') };
}
function hsdf(s, hc, ha) {
  const sep = String.fromCharCode(hc + 97);
  return s.split(sep).filter(x => x.length).map(tok => String.fromCharCode((parseInt(tok, hc) * 1) ^ ha)).join('');
}
function extractEmbeds(html) {
  const g = parseGlobals(html);
  if (!g.key || !g.iv || !(g.hc >= 2) || isNaN(g.ha)) return [];
  const out = [];
  const re = /mvarr\['(\d+)_(\d+)'\]\s*=\s*\[(.*?)\];/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    const srv = m[1], part = parseInt(m[2], 10);
    const strs = [];
    const sre = /'((?:[^'\\]|\\.)*)'/g;
    let sm;
    while ((sm = sre.exec(m[3])) !== null) strs.push(sm[1]);
    const sep = String.fromCharCode(g.hc + 97);
    const blobIdx = strs.findIndex(s => s.length > 50 && s.includes(sep) && /^[0-9a-z]+$/i.test(s));
    if (blobIdx < 0) continue;
    let base = '';
    for (let i = blobIdx + 1; i < strs.length; i++) {
      if (/^(https?:)?\/\//.test(strs[i])) { base = strs[i]; break; }
    }
    if (!base) continue;
    let suffix = '';
    if (strs[blobIdx + 2] === base && typeof strs[blobIdx + 3] === 'string' && !strs[blobIdx + 3].startsWith('<')) suffix = strs[blobIdx + 3];
    try {
      const plain = utf8Text(aes128CbcDecrypt(b64ToBytes(hsdf(strs[blobIdx], g.hc, g.ha)), utf8Bytes(g.key), utf8Bytes(g.iv)));
      if (!plain || /[\u0000-\u001f]/.test(plain)) continue;
      const embed = base.includes('emturbovid') ? plain : absUrl(base) + plain + suffix;
      out.push({ srv, part, base: absUrl(base), embed });
    } catch (e) {}
  }
  return out;
}
const SRV_INFO = {
  '37': { name: 'SW', kind: 'W' },
  '38': { name: 'VH', kind: 'W' },
  '28': { name: 'DO', kind: 'S' },
  '42': { name: 'SP', kind: 'S' },
};
function srvInfo(e) {
  if (SRV_INFO[e.srv]) return SRV_INFO[e.srv];
  if (/mmsi02|mmvh02/.test(e.base)) return { name: 'VH', kind: 'W' };
  return { name: 'SP', kind: 'S' };
}
function jsUnescapeSingle(s) {
  return s.replace(/\\(.)/g, (m, c) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    return c;
  });
}
function unpackPacker(html) {
  const m = String(html).match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/);
  if (!m) return '';
  let p = jsUnescapeSingle(m[1]);
  const a = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const k = jsUnescapeSingle(m[4]).split('|');
  const enc = (n) => (n < a ? '' : enc(Math.floor(n / a))) + ((n % a) > 35 ? String.fromCharCode((n % a) + 29) : (n % a).toString(36));
  let i = c;
  while (i--) {
    if (k[i]) {
      const word = k[i];
      p = p.replace(new RegExp('\\b' + enc(i) + '\\b', 'g'), () => word);
    }
  }
  return p;
}
function extractEmbedLinks(text) {
  const links = {};
  for (const m of String(text).matchAll(/"hls(\d+)"\s*:\s*"([^"]+)"/g)) links['hls' + m[1]] = m[2];
  if (!Object.keys(links).length) {
    const f = String(text).match(/"file"\s*:\s*"(https?:[^"]+\.m3u8[^"]*)"/) || String(text).match(/(https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*)/);
    if (f) links.hls2 = f[1];
  }
  return links;
}
async function probeEmbedViable(embed, referer) {
  try {
    const html = await fetchText(embed, referer);
    if (html) {
      const links = extractEmbedLinks(unpackPacker(html) || html);
      return !!links.hls4;
    }
  } catch (e) {}
  return true;
}
async function filterViableW(wEmbeds, referer) {
  if (!wEmbeds.length) return [];
  const flags = await Promise.all(wEmbeds.map(e => probeEmbedViable(e.embed, referer)));
  return wEmbeds.filter((e, i) => flags[i]);
}
async function probeLineAlive(embed, referer) {
  try {
    const wurl = `${MMTV_WORKER}/v?u=${encodeURIComponent(embed)}&r=${encodeURIComponent(referer)}`;
    let txt = await fetchText(wurl, referer);
    if (!txt || !txt.includes('#EXTM3U')) return 'unknown';
    let seg = '';
    for (let hop = 0; hop < 2 && !seg; hop++) {
      const line = txt.split('\n').map(s => s.trim()).find(s => s && !s.startsWith('#'));
      if (!line) return 'unknown';
      if (/\.m3u8($|\?)|\/p\?/.test(line)) {
        txt = await fetchText(line, referer);
        if (!txt || !txt.includes('#EXTM3U')) return 'unknown';
      } else seg = line;
    }
    if (!seg) return 'unknown';
    try {
        const { data, status } = await $fetch.get(seg, { headers: { 'Range': 'bytes=0-0', 'User-Agent': UA } });
        if (status !== 200 && status !== 206 && status !== undefined) return 'dead';
        if (status === undefined) return 'unknown';
        const s = typeof data === 'string' ? data : '';
        if (!s) return 'unknown';
        return s.charCodeAt(0) === 0x47 ? 'alive' : 'dead';
    } catch (e) { return 'unknown'; }
  } catch (e) { return 'unknown'; }
}
function sectionOf(url) {
  const m = String(url).match(/\/zh\/([a-z-]+)_content\//);
  return m ? m[1] : '';
}
function codeOf(url) {
  const m = String(url).match(/\/([^/]+)\.html(?:[?#]|$)/);
  return m ? m[1] : '';
}
async function findViableTwinEmbeds(code, selfUrl) {
  if (!code || code === 'content') return [];
  let viable = [];
  try {
    let cards = parseCards(await getPage(`${HOST}/zh/searchall_search/all/${encodeURIComponent(code)}/1.html`, selfUrl) || '');
    if (!cards.length) {
      const html = await postForm(HOST + '/zh/searchform_search/all/index.html', { search_keyword: code, search_type: 'searchall', op: 'search' }, selfUrl);
      cards = parseCards(html || '');
    }
    const pref = ['censored', 'chinese', 'uncensored', 'amateurjav', 'amateur', 'klive'];
    const twins = cards.map(c => c.vod_id).filter(u => u !== selfUrl && sectionOf(u) && sectionOf(u) !== sectionOf(selfUrl)).sort((x, y) => pref.indexOf(sectionOf(x)) - pref.indexOf(sectionOf(y)));
    for (const tu of twins.slice(0, 2)) {
      const thtml = await fetchText(tu, selfUrl);
      if (!thtml) continue;
      const te = extractEmbeds(thtml).filter(e => srvInfo(e).kind === 'W');
      if (!te.length) continue;
      const tv = await filterViableW(te, selfUrl);
      if (tv.length) { viable = tv; break; }
    }
  } catch (e) {}
  return viable;
}
function buildGroups(wEmbeds, sEmbeds) {
  const groups = new Map();
  for (const e of wEmbeds.concat(sEmbeds)) {
    const info = srvInfo(e);
    if (!groups.has(info.name)) groups.set(info.name, { kind: info.kind, parts: [] });
    groups.get(info.name).parts.push(e);
  }
  for (const grp of groups.values()) grp.parts.sort((x, y) => x.part - y.part);
  return groups;
}
async function orderWithProbe(groups, referer) {
  const order = ['SW', 'VH', 'DO', 'SP'].filter(n => groups.has(n));
  const wLines = order.filter(n => groups.get(n).kind === 'W');
  if (!wLines.length) return { order, anyW: false, wAlive: false };
  const st1 = await probeLineAlive(groups.get(wLines[0]).parts[0].embed, referer);
  if (st1 === 'alive' || st1 === 'unknown') return { order, anyW: true, wAlive: true };
  if (wLines.length > 1) {
    const st2 = await probeLineAlive(groups.get(wLines[1]).parts[0].embed, referer);
    if (st2 === 'alive') {
      const rest = order.filter(n => n !== wLines[0] && n !== wLines[1]);
      return { order: [wLines[1], wLines[0]].concat(rest), anyW: true, wAlive: true };
    }
    if (st2 === 'unknown') return { order, anyW: true, wAlive: true };
  }
  return { order, anyW: true, wAlive: false };
}
function catUrl(cat, page) {
  const parts = cat.type_id.split(':');
  const kind = parts[0], a = parts[1], b = parts[2];
  if (kind === 'list') return `${HOST}/zh/${a}_list/all/${page}.html`;
  if (kind === 'maker') return `${HOST}/zh/${a}_makersr/${b}/${encodeURIComponent(cat.arg || '')}/${page}.html`;
  if (kind === 'tag') return `${HOST}/zh/${a}_category/${b}/${encodeURIComponent(cat.arg || '')}/${page}.html`;
  return HOST + '/zh/';
}
async function getConfig() { return jsonify(appConfig); }
async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid) || 'list:censored';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cat = CATMAP[tid] || CATS[0];
    const html = await getPage(catUrl(cat, page));
    return jsonify({ list: html ? parseCards(html) : [] });
}
async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = absUrl(id);
    const html = await getPage(durl);
    if (!html) return jsonify({ list: [] });
    const code = codeOf(durl);
    const allEmbeds = extractEmbeds(html);
    const ownS = allEmbeds.filter(e => srvInfo(e).kind !== 'W');
    let wEmbeds = await filterViableW(allEmbeds.filter(e => srvInfo(e).kind === 'W'), durl);
    let groups = buildGroups(wEmbeds, ownS);
    let ord = await orderWithProbe(groups, durl);
    if (!ord.wAlive) {
        const tv = await findViableTwinEmbeds(code, durl);
        if (tv.length) {
            wEmbeds = tv;
            groups = buildGroups(wEmbeds, ownS);
            ord = await orderWithProbe(groups, durl);
        }
    }
    const list = [];
    for (const lname of ord.order) {
        const grp = groups.get(lname);
        const tracks = grp.parts.map((e) => {
            const epName = grp.parts.length > 1 ? `CD${e.part}` : (code || '正片');
            const pid = `${grp.kind}|${encodeURIComponent(e.embed)}|${encodeURIComponent(durl)}`;
            return { name: epName, pan: '', ext: { id: pid, flag: lname } };
        });
        list.push({ title: lname, tracks });
    }
    if (!list.length) {
        list.push({ title: 'SP', tracks: [{ name: '正片', pan: '', ext: { id: `S|${encodeURIComponent(durl)}|${encodeURIComponent(durl)}`, flag: 'SP' } }] });
    }
    return jsonify({ list });
}
// 站方 play.php 嵌页内 videoSources 直给多清晰度 m3u8：
// videoSources = [{src:'.../24/1/....m3u8', type:'application/x-mpegURL', size:480}, {src:'...', size:720}, ...]
function extractVideoSources(html) {
    const out = [];
    const m = String(html || '').match(/videoSources\s*=\s*\[([\s\S]*?)\];/);
    if (!m) return out;
    const re = /\{\s*src:\s*'([^']+)'[^}]*?size:\s*(\d+)/g;
    let sm;
    while ((sm = re.exec(m[1])) !== null) out.push({ src: sm[1], size: parseInt(sm[2], 10) || 0 });
    if (!out.length) {
        const re2 = /src:\s*'([^']+\.m3u8[^']*)'/g;
        while ((sm = re2.exec(m[1])) !== null) out.push({ src: sm[1], size: 0 });
    }
    out.sort((a, b) => b.size - a.size);
    return out;
}
async function getPlayinfo(ext) {
    ext = argsify(ext);
    const raw = t(ext.id);
    const parts = raw.split('|');
    const kind = parts[0] || '';
    const embed = parts[1] ? decodeURIComponent(parts[1]) : '';
    const from = parts[2] ? decodeURIComponent(parts[2]) : REFERER;
    if (kind === 'W' && embed) {
        const wurl = `${MMTV_WORKER}/v?u=${encodeURIComponent(embed)}&r=${encodeURIComponent(from)}`;
        return jsonify({ urls: [wurl], headers: [{ 'User-Agent': UA, 'Referer': from }] });
    }
    if (embed) {
        // S 线：取嵌页，videoSources 里直接抽 m3u8（清晰度从高到低）
        const embHtml = await fetchText(embed, from);
        const srcs = extractVideoSources(embHtml);
        if (srcs.length) {
            return jsonify({ urls: srcs.map(s => s.src), headers: [{ 'User-Agent': UA, 'Referer': from }] });
        }
        // 通用兜底：嵌页解包后取 hls 链接
        const links = extractEmbedLinks(unpackPacker(embHtml) || embHtml);
        const ordered = ['hls4', 'hls3', 'hls2', 'hls1'].map(k => links[k]).filter(u => u && /^https?:\/\//.test(u));
        if (ordered.length) {
            return jsonify({ urls: ordered, headers: [{ 'User-Agent': UA, 'Referer': from }] });
        }
        return jsonify({ urls: [], headers: [] });
    }
    return jsonify({ urls: [], headers: [] });
}
async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let html = await getPage(`${HOST}/zh/searchall_search/all/${encodeURIComponent(wd)}/${page}.html`);
    let list = html ? parseCards(html) : [];
    if (page === 1 && !list.length) {
        html = await postForm(HOST + '/zh/searchform_search/all/index.html', { search_keyword: wd, search_type: 'searchall', op: 'search' });
        list = html ? parseCards(html) : [];
    }
    return jsonify({ list });
}
