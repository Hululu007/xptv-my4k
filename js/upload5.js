// 蜜桃 - XPTV csp 格式（csp_upload5）
// 转换自 mira-cat nodejs/src/spider/video/upload5.js（py_upload5）。站点 https://honeypeach.cc（honeypeach API + PoW 握手 + HMAC 签名）。
// @@ 线路重解机制原样保留：vod_id / playId 均为 mod@@id@@src@@sub（playId 再带集号段）复合串，
// getTracks 原样透传、getPlayinfo 按段重解（照猫版 detail/play 的 split('@@') 逻辑搬运）。
// 会话状态：猫版用模块级 sess 缓存 sid/skey（握手成本高、带过期校验）；XPTV 规范禁跨调用全局状态，
// 本版改为每次入口调用内现握手（signedGet 内闭包缓存、401/限流换设备重握手逻辑照猫版），单次调用内多次请求共用一次握手。
// detail 的 15 秒超时竞速（猫版用 setTimeout+Promise.race）按规范禁忌去掉，改串行直取。
// 播放：非 missav 模块走 /api/play 直出（parse:0 等价）；missav 模块主链直解 missav.fans 页内 uuid 拼 720p m3u8 直出，
// 解析失败时猫版落 parse:1 嗅探 missav 页，XPTV 无嗅探位，降级为回 missav 页 URL ——
// 嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL。
// play 末尾的 HEAD 跟跳（猫版用原生 fetch HEAD）$fetch 无 HEAD 接口，跳过该步直返 API 地址，待真机验。
// 2026-11-19 根因修复: 设备侧全空。猫版同款全走 mitao-handshake Worker 时
// harness 22 分类全通、真机仍全空。两个运行时未证实件是唯二嫌疑, 现全部改纯 JS:
// ① new URLSearchParams —— uu_video/march 已证实运行时未证实、改手工拼 query,
//    本文件是全仓唯一还在调它的, signedGet 首行即抛错致 getCards 全空;
// ② createCryptoJS 的 HmacSHA256 —— 全仓唯一用 HMAC 的文件, 改纯 JS SHA-256/HMAC
//    (已对 Node crypto 验过向量), 空串 SHA256 直接用常量。改后本文件零未证实依赖。
const EMPTY_SHA256_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// ---------------- 纯 JS SHA-256 / HMAC-SHA-256 / hex 件 (无 CryptoJS/Buffer) ----------------
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA256_H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
function hpRotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }
function hpSha256Bytes(msgBytes) {
  const ml = msgBytes.length;
  const bitLenHi = Math.floor((ml / 0x20000000) | 0);
  const bitLenLo = (ml << 3) >>> 0;
  const paddedLen = (((ml + 9 + 63) >> 6) << 6);
  const m = new Uint8Array(paddedLen);
  m.set(msgBytes);
  m[ml] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(paddedLen - 8, bitLenHi);
  dv.setUint32(paddedLen - 4, bitLenLo);
  let h0 = SHA256_H0[0], h1 = SHA256_H0[1], h2 = SHA256_H0[2], h3 = SHA256_H0[3],
      h4 = SHA256_H0[4], h5 = SHA256_H0[5], h6 = SHA256_H0[6], h7 = SHA256_H0[7];
  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = (hpRotr(w[i - 15], 7) ^ hpRotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (hpRotr(w[i - 2], 17) ^ hpRotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (hpRotr(e, 6) ^ hpRotr(e, 11) ^ hpRotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (hpRotr(a, 2) ^ hpRotr(a, 13) ^ hpRotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const od = new DataView(out.buffer);
  od.setUint32(0, h0); od.setUint32(4, h1); od.setUint32(8, h2); od.setUint32(12, h3);
  od.setUint32(16, h4); od.setUint32(20, h5); od.setUint32(24, h6); od.setUint32(28, h7);
  return out;
}
function hpUtf8Bytes(s) {
  const str = String(s || '');
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.codePointAt(i);
    if (cp > 0xffff) i++;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}
function hpBytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += ('0' + bytes[i].toString(16)).slice(-2);
  return s;
}
function hpHexToBytes(hex) {
  const h = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(h.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function hpHmacSha256Hex(keyBytes, msgStr) {
  let k = keyBytes;
  if (k.length > 64) k = hpSha256Bytes(k);
  const kb = new Uint8Array(64);
  kb.set(k);
  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = kb[i] ^ 0x36; opad[i] = kb[i] ^ 0x5c; }
  const msg = hpUtf8Bytes(msgStr);
  const inner = new Uint8Array(64 + msg.length);
  inner.set(ipad); inner.set(msg, 64);
  const innerHash = hpSha256Bytes(inner);
  const outer = new Uint8Array(64 + 32);
  outer.set(opad); outer.set(innerHash, 64);
  return hpBytesToHex(hpSha256Bytes(outer));
}
// 手工拼 query (与 URLSearchParams 同语义: 键序保留、值 encodeURIComponent; 运行时未证实有 URLSearchParams, 不用它)
function hpBuildQuery(params) {
  const parts = [];
  const obj = params || {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  return parts.join('&');
}

const HOST = 'https://honeypeach.cc';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
// 2026-11-19：蜜桃握手与签名接口绑定客户端出口 IP。直连握手会被站方拒收
// （PoW 解对了也只换回新 challenge，永不下发 sid/skey），故走猫版同款
// mitao-handshake Worker 全接口代理（握手+签名同一固定出口）；Worker 失败回落直连。
const HS_WORKER = 'https://mitao-handshake.li768435813.workers.dev';

// ---------------- PoW: FNV-1a 32bit, 与服务端握手算法一致（同猫版） ----------------
function hpHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function hpPow(chal, nonce) {
    let h = hpHash(chal + ':' + nonce);
    for (let r = 0; r < 4; r++) {
        const hex = h.toString(16).padStart(8, '0').slice(-8);
        h = hpHash(hex + chal);
    }
    return h.toString(16).padStart(8, '0').slice(-8);
}

function hpSolve(chal, bits) {
    const want = '0'.repeat(bits >> 2);
    for (let n = 0; n < 20000000; n++) {
        const nx = n.toString(16);
        if (hpPow(chal, nx).startsWith(want)) return chal + '.' + nx;
    }
    return '';
}

function rnd(n) {
    n = n || 10;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += chars.charAt((Math.random() * chars.length) | 0);
    return s;
}

function newDev() {
    return rnd(12) + Date.now().toString(16);
}

// ---------------- 分类（同猫版 CLASSES；XPTV 无 filters 位，筛选器不进 tabs，分类用默认三元组取数） ----------------
const CLASSES = [
    { type_id: 'video_new', type_name: '最近更新' },
    { type_id: 'video_release', type_name: '新作上市' },
    { type_id: 'video_chinese', type_name: '中文字幕' },
    { type_id: 'video_madou', type_name: '麻豆传媒' },
    { type_id: 'video_uncensored', type_name: '无码流出' },
    { type_id: 'video_hot', type_name: '热门视频' },
    { type_id: 'video_fc2', type_name: 'FC2' },
    { type_id: 'video_heyzo', type_name: 'HEYZO' },
    { type_id: 'video_tokyohot', type_name: '东京热' },
    { type_id: 'video_1pondo', type_name: '一本道' },
    { type_id: 'video_caribbean', type_name: '加勒比' },
    { type_id: 'video_todayhot', type_name: '今日热门' },
    { type_id: 'video_weeklyhot', type_name: '本周热门' },
    { type_id: 'duanju', type_name: '蜜桃短剧' },
    { type_id: 'duanju_chiguo', type_name: '赤果短剧' },
    { type_id: 'duanju_zhenren', type_name: '真人短剧' },
    { type_id: 'duanju_ai', type_name: 'AI成人短剧' },
    { type_id: 'duanju_rank', type_name: '短剧排行' },
    { type_id: 'caibian', type_name: '擦边短剧' },
    { type_id: 'shortv', type_name: '蜜桃动漫' },
    { type_id: 'heiliao', type_name: '黑料吃瓜' },
    { type_id: 'guochan', type_name: '国产精品' },
];

// 各分类默认 cat 三元组 code|src|sub（同猫版 DEFAULT_CAT）
const DEFAULT_CAT = {
    video_new: 'new|missav|',
    video_release: 'release|missav|',
    video_chinese: 'chinese-subtitle|missav|',
    video_madou: 'madou|missav|',
    video_uncensored: 'uncensored-leak|missav|',
    video_hot: 'monthly-hot|missav|',
    video_fc2: 'fc2|missav|',
    video_heyzo: 'heyzo|missav|',
    video_tokyohot: 'tokyohot|missav|',
    video_1pondo: '1pondo|missav|',
    video_caribbean: 'caribbeancom|missav|',
    video_todayhot: 'today-hot|missav|',
    video_weeklyhot: 'weekly-hot|missav|',
    duanju: 'tuijian|huangguo|0',
    duanju_chiguo: 'chiguo|huangguo|0',
    duanju_zhenren: 'zhenren|huangguo|0',
    duanju_ai: 'duanju|huangguo|0',
    duanju_rank: 'rank|huangguo|0',
    caibian: '0|huangdou|0',
    shortv: 'all|dongman|0',
    heiliao: '0|huangdou|0',
    guochan: '||',
};

const SRC_MAP = {
    video: 'missav', shortv: 'dongman', chiguo: 'chiguo', pengran: 'pengran',
    tuijian: 'huangguo', duanju: 'huangguo', manju: 'huangguo', huanlian: 'huangguo',
    mogai: 'huangguo', rank: 'huangguo',
};

const appConfig = {
    ver: 1,
    title: '蜜桃',
    site: HOST,
    tabs: CLASSES.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

async function fetchJson(url, extraHeaders) {
    try {
        const { data } = await $fetch.get(url, {
            headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, extraHeaders || {}),
        });
        if (typeof data === 'string') {
            try { return JSON.parse(data); } catch (e) { return {}; }
        }
        return data || {};
    } catch (e) {
        return {};
    }
}

async function fetchText(url, headers) {
    try {
        const { data } = await $fetch.get(url, { headers });
        return typeof data === 'string' ? data : '';
    } catch (e) {
        return '';
    }
}

// 先走 mitao-handshake Worker（固定出口，签名头原样转发），Worker 无有效回包再直连。
// Worker 只放行 honeypeach.cc 的 /api/* 与 /cover/*，本站请求均合规。
async function hsFetchJson(url, extraHeaders) {
    if (HS_WORKER) {
        try {
            const w = await fetchJson(HS_WORKER + '/?u=' + encodeURIComponent(url), extraHeaders);
            if (w && typeof w === 'object' && Object.keys(w).length > 0) return w;
        } catch (e) {}
    }
    return fetchJson(url, extraHeaders);
}

// 会话工厂：每次入口调用新建（无跨调用全局状态），闭包内缓存 sid/skey 供本次调用内复用
function createSession() {
    const sess = { sid: '', skey: '', exp: 0 };

    async function ensureHandshake() {
        const now = Math.floor(Date.now() / 1000);
        if (sess.sid && sess.skey && now < sess.exp - 60) return true;
        for (let attempt = 0; attempt < 3; attempt++) {
            const dev = newDev();
            let d = await hsFetchJson(HOST + '/api/handshake?dev=' + encodeURIComponent(dev));
            if (d && d.need_chal) {
                const tok = hpSolve(String(d.need_chal), parseInt(d.bits || '16', 10));
                if (!tok) continue;
                d = await hsFetchJson(HOST + '/api/handshake?dev=' + encodeURIComponent(dev) + '&c=' + encodeURIComponent(tok));
            }
            if (d && d.sid && d.skey) {
                sess.sid = String(d.sid);
                sess.skey = String(d.skey);
                sess.exp = parseInt(d.exp || '0', 10);
                return true;
            }
        }
        return false;
    }

    async function signedGet(path, params) {
        if (!(await ensureHandshake())) return {};
        const qs = hpBuildQuery(params);
        const bodyHash = EMPTY_SHA256_HEX;
        const ts = String(Math.floor(Date.now() / 1000));
        const nonce = rnd(8) + Date.now().toString(16);
        const canon = ['GET', path, qs, bodyHash, ts, nonce, sess.sid].join('\n');
        const sig = hpHmacSha256Hex(hpHexToBytes(sess.skey), canon);
        const url = HOST + path + (qs ? '?' + qs : '');
        const res = await hsFetchJson(url, {
            'X-Hp-Sid': sess.sid,
            'X-Hp-Ts': ts,
            'X-Hp-Nonce': nonce,
            'X-Hp-Sign': sig,
            Referer: HOST + '/',
        });
        if (res && res.code === 401) {
            sess.sid = '';
            sess.skey = '';
            if (await ensureHandshake()) return signedGet(path, params);
        }
        const errMsg = String((res && (res.err || res.msg)) || '').toLowerCase();
        const limited = res && (res.code === 429 || errMsg.includes('rl_sid') || errMsg.includes('rl_dev') ||
            errMsg.includes('rl_ip') || errMsg.includes('rate') || errMsg.includes('limit') ||
            errMsg.includes('toomany') || errMsg.includes('busy'));
        if (limited) {
            sess.sid = '';
            sess.skey = '';
            if (await ensureHandshake()) return signedGet(path, params);
        }
        return res;
    }

    return { signedGet };
}

function formatCover(mod, url) {
    if (!url) return '';
    const u = String(url);
    let abs;
    if (mod === 'live' || u.startsWith('/') || u.indexOf('://') === -1) {
        if (u.startsWith('/')) abs = HOST + u;
        else abs = u;
    } else {
        abs = HOST + '/cover/' + mod + '?u=' + encodeURIComponent(u);
    }
    // 封面也走 mitao-handshake Worker（猫版同款）：直连 honeypeach.cc 封面在设备上加载不出
    if (HS_WORKER) return HS_WORKER + '/?u=' + encodeURIComponent(abs);
    return abs;
}

function parseCatTriple(raw, fallback) {
    const parts = String(raw || fallback || '').split('|');
    return { cat: parts[0] || '', src: parts[1] || '', sub: parts[2] || '' };
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const tid = String(ext.tid || 'video_new');
    const def = parseCatTriple(DEFAULT_CAT[tid]);
    const pc = def; // XPTV 无筛选器入参，恒用默认三元组（猫版未选筛选器时的口径）
    const src = pc.src || SRC_MAP[pc.cat] || def.src || '';
    const sub = pc.sub !== '' ? pc.sub : def.sub;
    let apiKey = tid;
    if (tid.startsWith('video_')) apiKey = 'video';
    else if (tid.startsWith('duanju')) apiKey = 'duanju';
    const params = { key: apiKey, cat: pc.cat, page: String(page) };
    if (src) params.src = src;
    if (sub !== '') params.sub = sub;

    const session = createSession();
    const data = await session.signedGet('/api/module', params);
    const rawList = (data && data.list) || [];
    const coverMod = tid === 'duanju' ? src : tid;
    const list = [];
    for (const item of rawList) {
        const itemId = String(item.id || item.code || '');
        if (!itemId) continue;
        const title = String(item.title || itemId).trim();
        const pic = formatCover(coverMod, item.cover_n || item.cover || '');
        const rawRemark = item.remark || item.desc || '';
        const vodId = (tid.startsWith('video_') ? src : tid.startsWith('duanju') ? 'duanju' : tid) + '@@' + itemId + '@@' + src + '@@' + (sub !== '' ? sub : '');
        list.push({
            vod_id: vodId,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: rawRemark ? '蝴蝶影视 | ' + String(rawRemark).trim() : '蝴蝶影视',
            ext: { id: vodId },
        });
    }
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const rawId = String(ext.id || '');
    if (!rawId) return jsonify({ list: [] });
    const parts = rawId.split('@@');
    const mod = parts[0];
    const realId = parts[1] || rawId;
    const src = parts[2] || '';
    const sub = parts[3] || '';
    const params = {};
    if (src) params.src = src;
    if (sub) params.sub = sub;
    const session = createSession();
    const data = await session.signedGet('/api/detail/' + mod + '/' + encodeURIComponent(realId), params);
    const tracks = [];
    const det = (data && data.detail) || {};
    if (det && (det.title || det.episodes)) {
        const episodes = det.episodes || [];
        if (episodes.length) {
            for (const epItem of episodes) {
                const epNo = String(epItem.ep || '1');
                let rawName = String(epItem.name || ('第' + epNo + '集'));
                if (/^\d+$/.test(rawName)) rawName = '第' + rawName + '集';
                const epDisplay = epItem.lock ? rawName + '[预告10s]' : rawName;
                tracks.push({ name: epDisplay, pan: '', ext: { id: mod + '@@' + realId + '@@' + epNo + '@@' + src + '@@' + sub, flag: '蜜桃专线' } });
            }
        } else {
            tracks.push({ name: '正片', pan: '', ext: { id: mod + '@@' + realId + '@@1@@' + src + '@@' + sub, flag: '蜜桃专线' } });
        }
    } else {
        tracks.push({ name: '正片', pan: '', ext: { id: mod + '@@' + realId + '@@1@@' + src + '@@' + sub, flag: '蜜桃专线' } });
    }
    return jsonify({ list: [{ title: '蜜桃专线', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '').trim();
    if (!id) return jsonify({ urls: [], headers: [] });
    const parts = id.split('@@');
    const mod = parts[0];
    const realId = parts[1] || id;
    const ep = parts[2] || '1';
    const src = parts[3] || '';
    const sub = parts[4] || '';
    // missav 源：honeypeach 的 play 接口已坏，直接从 missav.fans 解析 m3u8（猫版同逻辑）
    if (mod === 'missav') {
        const missavId = String(realId).toLowerCase();
        const missavUrl = 'https://missav.fans/cn/' + encodeURIComponent(missavId);
        const html = await fetchText(missavUrl, {
            'User-Agent': UA,
            Referer: 'https://missav.fans/',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        });
        const uuidMatch = html.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
        if (uuidMatch) {
            const hostMatch = html.match(/https?:\/\/(surrit\.[^\/\\"\']+)/);
            const host = hostMatch ? hostMatch[1].replace(/\\/g, '') : 'surrit.mrstcdn.store';
            const m3u8_720 = `https://${host}/${uuidMatch[0]}/720p/video.m3u8`;
            return jsonify({ urls: [m3u8_720], headers: [{ 'User-Agent': UA, Referer: 'https://missav.fans/' }] });
        }
        // 解析失败回退（猫版 parse:1 嗅探）: XPTV 无嗅探位，降级回 missav 页 URL
        return jsonify({ urls: [missavUrl], headers: [{ 'User-Agent': UA, Referer: 'https://missav.fans/' }] });
    }
    const params = {};
    if (src) params.src = src;
    if (sub) params.sub = sub;
    const session = createSession();
    const data = await session.signedGet('/api/play/' + mod + '/' + encodeURIComponent(realId) + '/' + ep, params);
    let finalUrl = '';
    try {
        const pl = (data && data.play) || {};
        const rawSrc = String(pl.src || '');
        const rawProxy = String(pl.src_proxy || '');
        const candidates = [];
        if (rawProxy) candidates.push(rawProxy);
        if (rawSrc) candidates.push(rawSrc);
        for (const c of candidates) {
            if (c && c.indexOf('preview-r10') === -1) {
                finalUrl = c.startsWith('/') ? HOST + c : c;
                break;
            }
        }
        if (!finalUrl && candidates.length) {
            const c = candidates[0];
            finalUrl = c.startsWith('/') ? HOST + c : c;
        }
    } catch (e) {}
    if (!finalUrl) return jsonify({ urls: [], headers: [] });
    const headers = { 'User-Agent': UA, Referer: HOST + '/' };
    if (finalUrl.indexOf('hembed.com') !== -1 || finalUrl.indexOf('hanime') !== -1) {
        headers.Referer = 'https://hanime1.me/';
    }
    return jsonify({ urls: [finalUrl], headers: [headers] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const searchMods = ['video', 'duanju', 'shortv', 'guochan', 'caibian'];
    const session = createSession();
    const list = [];
    for (const mod of searchMods) {
        const data = await session.signedGet('/api/search', { key: mod, kw: wd, page: String(page) });
        const rawList = (data && data.list) || [];
        for (const item of rawList) {
            const itemId = String(item.id || item.code || '');
            if (!itemId) continue;
            const itemSrc = String(item.src || mod);
            const title = String(item.title || itemId).trim();
            const pic = formatCover(mod === 'duanju' ? itemSrc : mod, item.cover_n || item.cover || '');
            const rawRemark = item.remark || item.desc || '';
            const vodId = mod + '@@' + itemId + '@@' + itemSrc;
            list.push({
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: rawRemark ? '蝴蝶影视 | ' + String(rawRemark).trim() : '蝴蝶影视',
                ext: { id: vodId },
            });
        }
    }
    return jsonify({ list });
}
