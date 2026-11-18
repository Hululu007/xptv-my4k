// JavGG - XPTV csp 格式（csp_javgg）
// 转换自 mira-cat nodejs/src/spider/video/javgg.js（py_javgg）。站点 https://javgg.net（备用 https://javgg.co）。
// VidHide 链（2026-11-19 改设备侧直解）：hls2 token 绑取嵌页那次请求的 IP，
// javgg-vidhide Worker 中转结构上已死（CF 出口被 hls2 CDN 切断，/v 回 502）。
// getPlayinfo 直取嵌页 → 纯字符串解 Dean Edwards 包 → 取 hls2 master 直出
// （hls3 备选，hls4 绝不用——TikTok 广告图诱饵）。playmate/vidara 仍优先直解。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）：playmate/vidara 的 POST JSON 逐字保持猫侧线格式。
// 嗅探型播放降级：回源页 URL，待真机验 —— 猫版 parse:1 嗅探（vidhide 无 Worker 时 / f4 / other / 无线路时回详情页）
// 在 XPTV 无嗅探位，降级为 urls:[embed/详情页 URL]。
// 猫版竞速（bestWithin/settleWithin + setTimeout 宽限/预算）按规范改串行：playmate/vidara 按优先级顺序逐个试；
// 线路收集 3 个 dooplayer API 改 Promise.all 并行（无 setTimeout 参与逻辑）。
// 猫版 Buffer base64url 改 createCryptoJS() 的 enc.Base64/Utf8 对应件（等价）。

const SITE = 'https://javgg.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const CATS = [
  { type_id: 'latest', type_name: '最新', kind: 'path', url: '/new-post/' },
  { type_id: 'trending', type_name: '热门', kind: 'path', url: '/trending/' },
  { type_id: 'english-subtitle', type_name: '英字幕', kind: 'search', kw: 'english subtitle' },
  { type_id: 'chinese-subtitle', type_name: '中字幕', kind: 'search', kw: 'chinese subtitle' },
  { type_id: 'uncensored', type_name: '无码', kind: 'path', url: '/genre/uncensored/' },
  { type_id: 'hd-uncensored', type_name: '高清无码', kind: 'path', url: '/genre/hd-uncensored/' },
  { type_id: 'minimal-mosaic', type_name: '减码', kind: 'path', url: '/genre/minimal-mosaic/' },
  { type_id: 'digital-mosaic', type_name: '有码', kind: 'path', url: '/genre/digital-mosaic/' },
  { type_id: 'genre-4k', type_name: '4K', kind: 'path', url: '/genre/4k/' },
  { type_id: 'genre-3p', type_name: '3P', kind: 'path', url: '/genre/3p/' },
];

const appConfig = {
    ver: 1,
    title: 'JavGG',
    site: SITE,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) { return String(v == null ? '' : v).trim(); }

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

function b64urlEncode(s) {
    return _b64urlEncodeUtf8(s);
}
function b64urlDecode(s) {
    try {
        return _b64urlDecodeUtf8(s);
    } catch (e) { return ''; }
}

function clean(s) {
    return t(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&ndash;/g, '-').replace(/&mdash;/g, '-').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
}

// ---------- VidHide 设备侧直解（2026-11-19，替代已死的 javgg-vidhide Worker） ----------
// hls2 master 的 token 绑取嵌页那次请求的 IP：Worker/jina 中转从结构上就是死的
// （CF 出口被 hls2 CDN 在连接层切断，/v 回 502 "no playable play"）。
// 只有播放器本机能解出可用地址：本机直取嵌页（token 绑本机 IP）→ 解包 →
// 取 hls2 master 直出，播放器再以同一 IP 拉流，token 才有效。
// 绝不用 hls4（站方播放器优先级虽列 hls4 在前，但它是 TikTok 广告图诱饵）。
// 解包是 Worker v3 的纯字符串 Dean Edwards 解包（禁 eval/new Function，XPTV 可用）。
function jsUnescapeSingle(s) {
    return String(s || '').replace(/\\(.)/g, (m, c) => {
        if (c === 'n') return '\n';
        if (c === 'r') return '\r';
        if (c === 't') return '\t';
        return c;
    });
}
function unpackDeanEdwards(html) {
    const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/);
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
function extractVidhideLinks(text) {
    const links = {};
    const src = String(text || '');
    let m;
    const re = /"hls(\d+)"\s*:\s*"([^"]+)"/g;
    while ((m = re.exec(src)) !== null) links['hls' + m[1]] = m[2];
    if (!Object.keys(links).length) {
        const f = src.match(/"file"\s*:\s*"(https?:[^"]+\.m3u8[^"]*)"/) || src.match(/(https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*)/);
        if (f) links.hls2 = f[1];
    }
    return links;
}
function absFrom(u, base) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    const o = String(base || '').match(/^(https?:\/\/[^\/]+)/i);
    if (u.startsWith('/')) return (o ? o[1] : '') + u;
    return (o ? o[1] + '/' : '') + u;
}
async function resolveVidhide(embedUrl, referer) {
    // 必须直取嵌页（不能走 site-fetch/Worker 中转，否则 token 绑到中转 IP 上，
    // 播放器本机拿该 token 拉流必被 CDN 拒绝）
    let html = '';
    try {
        const { data, status } = await $fetch.get(embedUrl, { headers: { 'User-Agent': UA, 'Referer': referer || REFERER, 'Accept': '*/*' } });
        if (status === 200 && data) html = typeof data === 'string' ? data : '';
    } catch (e) { return ''; }
    if (!html) return '';
    const unpacked = unpackDeanEdwards(html);
    const links = extractVidhideLinks(unpacked || html);
    // hls2 优先，hls3 备选；hls4 绝不用
    for (const key of ['hls2', 'hls3']) {
        const raw = links[key];
        if (!raw) continue;
        const abs = absFrom(raw, embedUrl);
        if (/\.m3u8/i.test(abs)) return abs;
    }
    return '';
}
function fixUrl(u) {
    u = t(u);
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return SITE + u;
    return u;
}

async function getTextInner(url, headers, minLen) {
    const h = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': REFERER, ...(headers || {}) };
    const need = minLen || 500;
    try {
        const { data, status } = await $fetch.get(url, { headers: h });
        if ((status === undefined || status === 200) && data) {
            const txt = typeof data === 'string' ? data : JSON.stringify(data);
            if (txt && txt.length >= need) return txt;
        }
    } catch (e) {}
    return '';
}
async function getText(url, headers, minLen) {
    let txt = await getTextInner(url, headers, minLen);
    if (txt) return txt;
    if (url.includes('javgg.net')) {
        txt = await getTextInner(url.replace('javgg.net', 'javgg.co'), headers, minLen);
        if (txt) return txt;
    }
    return '';
}

async function postJson(url, body, headers) {
    const h = { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json', 'Referer': REFERER, ...(headers || {}) };
    try {
        const { data, status } = await $fetch.post(url, body, { headers: h });
        if ((status === undefined || status === 200) && data) {
            return typeof data === 'string' ? JSON.parse(data) : data;
        }
    } catch (e) {}
    return null;
}

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const push = (durl, pic, name) => {
        if (!durl || seen.has(durl)) return;
        seen.add(durl);
        out.push({ vod_id: durl, vod_name: name || durl, vod_pic: pic || '', vod_remarks: '', ext: { id: durl } });
    };
    let m;
    const re1 = /<article[^>]*class="[^"]*item movies[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    while ((m = re1.exec(html)) !== null) {
        const card = m[1];
        const linkM = card.match(/<a[^>]*href="(https?:\/\/javgg\.(net|co)\/jav\/[^"]+\/)"/);
        if (!linkM) continue;
        const imgM = card.match(/<img[^>]*data-src="([^"]+)"/) || card.match(/<img[^>]*src="([^"]+)"/);
        const titleM = card.match(/<div class="titlecontent">([\s\S]*?)<\/div>/);
        const codeM = card.match(/<h3><a[^>]*>([^<]+)<\/a><\/h3>/);
        push(linkM[1], imgM ? fixUrl(imgM[1]) : '', titleM ? clean(titleM[1]) : (codeM ? clean(codeM[1]) : ''));
    }
    const re2 = /<div class="result-item">([\s\S]*?)<\/article>/g;
    while ((m = re2.exec(html)) !== null) {
        const card = m[1];
        const linkM = card.match(/<a[^>]*href="(https?:\/\/javgg\.(net|co)\/jav\/[^"]+\/)"/);
        if (!linkM) continue;
        const imgM = card.match(/<img[^>]*src="([^"]+)"/);
        const titleM = card.match(/<div class="title">\s*<a[^>]*>([\s\S]*?)<\/a>/);
        push(linkM[1], imgM ? fixUrl(imgM[1]) : '', titleM ? clean(titleM[1]) : '');
    }
    return out;
}

function catUrl(tid, page) {
    const cat = CATS.find(c => c.type_id === tid) || CATS[0];
    if (cat.kind === 'search') {
        let base = SITE + '/?s=' + encodeURIComponent(cat.kw);
        if (page > 1) base += '&paged=' + page;
        return base;
    }
    let base = SITE + cat.url;
    if (page > 1) base += 'page/' + page + '/';
    return base;
}

function classifyEmbed(embedUrl) {
    let host = '';
    try { host = new URL(embedUrl).hostname; } catch (e) { return null; }
    if (host.includes('playmate')) return { embedUrl, prio: 1, kind: 'playmate' };
    if (host.includes('shadowbyte') || host.includes('dstyladsg') || host.includes('vidara')) return { embedUrl, prio: 2, kind: 'vidara' };
    if (host.includes('earnvidjavgg') || host.includes('vidhide') || host.includes('streamhg')) return { embedUrl, prio: 3, kind: 'vidhide' };
    if (host.includes('f4jav') || host.includes('f4scdn') || /\/e\/[A-Za-z0-9]+/.test(embedUrl)) return { embedUrl, prio: 4, kind: 'f4' };
    return { embedUrl, prio: 99, kind: 'other' };
}

async function collectEmbeds(postId) {
    const fetchEmbed = async (srv) => {
        try {
            const apiText = await getText(`${SITE}/wp-json/dooplayer/v2/${postId}/movie/${srv}`, { 'Accept': 'application/json' }, 10);
            if (!apiText) return null;
            const embedUrl = t(JSON.parse(apiText).embed_url);
            if (!embedUrl || !/^https?:\/\//.test(embedUrl)) return null;
            return classifyEmbed(embedUrl);
        } catch (e) { return null; }
    };
    const embeds = (await Promise.all([1, 2, 3].map(fetchEmbed))).filter(Boolean);
    embeds.sort((a, b) => a.prio - b.prio);
    return embeds;
}

async function tryVidara(embedUrl) {
    try {
        const u = new URL(embedUrl);
        const code = u.pathname.split('/').filter(Boolean).pop() || '';
        if (!code) return null;
        const resp = await postJson(u.origin + '/api/stream', { filecode: code, device: 'ios', codecs: ['h265'] }, { 'Referer': embedUrl, 'Origin': u.origin });
        const src = resp && t(resp.streaming_url || resp.src || resp.url);
        if (!src || !/^https?:\/\//.test(src)) return null;
        return src;
    } catch (e) { return null; }
}
async function tryPlaymate(embedUrl) {
    try {
        const u = new URL(embedUrl);
        const code = u.pathname.split('/').filter(Boolean).pop() || '';
        if (!code) return null;
        const resp = await postJson(u.origin + '/api/s', { c: code, d: 'web' }, { 'Referer': embedUrl });
        const src = resp && t(resp.sx || resp.src || resp.url);
        if (!src || !/^https?:\/\//.test(src)) return null;
        return src;
    } catch (e) { return null; }
}

async function getConfig() { return jsonify(appConfig); }

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid) || 'latest';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const html = await getText(catUrl(tid, page));
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = /^https?:\/\//.test(id) ? id : (SITE + '/jav/' + id.replace(/^\//, '') + '/');
    const html = await getText(durl);
    if (!html) return jsonify({ list: [] });
    const postM = html.match(/data-post=['"](\d+)['"]/);
    const postId = postM ? postM[1] : '';
    let playId = postId ? postId + '$' + durl : durl;
    if (postId) {
        try {
            const embeds = await collectEmbeds(postId);
            if (embeds && embeds.length) {
                const payload = b64urlEncode(JSON.stringify({ e: embeds.map(e => e.embedUrl) }));
                if (payload) playId += '$@' + payload;
            }
        } catch (e) {}
    }
    return jsonify({ list: [{ title: 'JavGG', tracks: [{ name: '正片', pan: '', ext: { id: playId, flag: 'JavGG' } }] }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    const hdrFor = (ref) => [{ 'User-Agent': UA, 'Referer': ref || REFERER }];
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.startsWith('正片$')) id = id.slice(3);
    if (/\.m3u8(\?|$)/i.test(id)) return jsonify({ urls: [id], headers: hdrFor(REFERER) });
    let fastEmbeds = null;
    const fm = id.match(/\$@([A-Za-z0-9_-]+)$/);
    if (fm) {
        try {
            const payload = JSON.parse(b64urlDecode(fm[1]) || '{}');
            const urls = Array.isArray(payload.e) ? payload.e : [];
            const list = urls.map(u => classifyEmbed(t(u))).filter(Boolean);
            if (list.length && list.some(e => e.kind !== 'other')) fastEmbeds = list;
        } catch (e) {}
        id = id.slice(0, fm.index);
    }
    let postId = '';
    let durl = '';
    const pm = id.match(/^(\d+)\$(https?:\/\/.+)$/);
    if (pm) { postId = pm[1]; durl = pm[2]; }
    else if (/^https?:\/\//.test(id)) {
        durl = id;
        const html0 = await getText(durl);
        const m0 = html0 ? html0.match(/data-post=['"](\d+)['"]/) : null;
        postId = m0 ? m0[1] : '';
    } else { postId = id.replace(/\D/g, ''); }
    if (!postId) return jsonify({ urls: [], headers: [] });
    if (!durl) durl = REFERER;
    const embeds = fastEmbeds || await collectEmbeds(postId);
    // 串行按优先级试 playmate > vidara（猫版竞速改串行）
    const cands = embeds.filter(e => e.kind === 'playmate' || e.kind === 'vidara');
    for (const e of cands) {
        const src = e.kind === 'playmate' ? await tryPlaymate(e.embedUrl) : await tryVidara(e.embedUrl);
        if (src) return jsonify({ urls: [src], headers: hdrFor(durl) });
    }
    // VidHide：设备侧直解 hls2 master（token 绑本机 IP；Worker 中转已死，不再用）
    const vh = embeds.find(e => e.kind === 'vidhide');
    if (vh) {
        const src = await resolveVidhide(vh.embedUrl, durl);
        if (src) return jsonify({ urls: [src], headers: hdrFor(vh.embedUrl) });
    }
    // 解析失败返回空：嵌页/详情页地址不是可播流，交给播放器只会转圈
    return jsonify({ urls: [], headers: [] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/?s=' + encodeURIComponent(wd);
    if (page > 1) url += '&paged=' + page;
    const html = await getText(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
