// JavCC - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_javcc.js
// WordPress retrotube 站 javcc.me。列表/分类/搜索走站方 HTML（article 卡片）；
// 播放走 videplay 嵌页：详情页 base64 播放脚本解出 defaultUrl
// （xx.videplay.us/v/<id>）→ 嵌页 Dean Edwards 打包解包 → 模板 A：
// api.videplay.us/o/v-master.m3u8/<token>；模板 B：解包文本只有无 token 的
// /x/v-master.m3u8 模板，真实地址须经嵌页的 let pox / let dp 做 CryptoJS 式
// AES-256 解密（纯 JS 实现，见下）→ /x/v-master.m3u8/<token>；再按
// RESOLUTION 分档出线（单档只出一线，多档各出一线，绝不编造清晰度；
// 解不出时回落嵌页，绝不输出无 token 的模板地址）。
// 2026-11-07 播放链实测坐实：站方现分两条后端——/ved/ 线（api.videplay.us/ved/）
// 分片是 tiktokcdn 的 .image 伪装地址，70 字节 PNG 头 + 真 TS，播放器按
// image/png 拒收、建不起时间轴；/o/ 线（dual.streamhx.win）部分视频 master
// 稳定 502（站方后端按视频死掉，换头/重试/换出口都 502，无他腿可换）。故出线
// 一律走自家 javcc-hls Worker（已部署，根回 "javcc hls proxy v2
// (png-strip-range)"，2026-11-18 实测活着；/v 现解、/p 改写清单、/s 剥 PNG
// 头并强制 video/MP2T）；master 拉不到时出 Worker /v 单线（服务端重解新
// token 再拉，仍 502 时 Worker 直回 502 文本快败，不再把 502 地址交给播放器
// 转圈）。字幕按 avdb 模式（番号只从片名取，不从播放地址取）。
const HOST = 'https://javcc.me';
// 自家 javcc-hls Worker（已部署，2026-11-18 实测根回 v2 png-strip-range）
const WORKER = 'https://javcc-hls.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function getText(url, referer, timeoutMs) {
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/' },
            timeout: timeoutMs || 15000,
        });
        if (r && r.status !== 200) return '';
        return r && typeof r.data === 'string' ? r.data : '';
    } catch (e) { return ''; }
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
        .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
        .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// ---------- base64 / UTF-8 / hex（纯 JS，无 Buffer） ----------
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64ToBytes(b64url) {
    let s = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
    while (s.length % 4) s += '=';
    const out = [];
    for (let i = 0; i + 3 < s.length + 1 && i < s.length; i += 4) {
        const c0 = B64_ALPHABET.indexOf(s.charAt(i));
        const c1 = B64_ALPHABET.indexOf(s.charAt(i + 1));
        const c2 = s.charAt(i + 2) === '=' ? 0 : B64_ALPHABET.indexOf(s.charAt(i + 2));
        const c3 = s.charAt(i + 3) === '=' ? 0 : B64_ALPHABET.indexOf(s.charAt(i + 3));
        if (c0 < 0 || c1 < 0) break;
        out.push((c0 << 2) | (c1 >> 4));
        if (s.charAt(i + 2) !== '=' && c2 >= 0) out.push(((c1 & 15) << 4) | (c2 >> 2));
        if (s.charAt(i + 3) !== '=' && c3 >= 0) out.push(((c2 & 3) << 6) | c3);
    }
    return out;
}

function utf8BytesToStr(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
        const c = bytes[i++];
        if (c < 0x80) { out += String.fromCharCode(c); continue; }
        if (c >= 0xC0 && c < 0xE0 && i < bytes.length) {
            out += String.fromCharCode(((c & 0x1F) << 6) | (bytes[i++] & 0x3F));
            continue;
        }
        if (c >= 0xE0 && c < 0xF0 && i + 1 < bytes.length) {
            out += String.fromCharCode(((c & 0x0F) << 12) | ((bytes[i] & 0x3F) << 6) | (bytes[i + 1] & 0x3F));
            i += 2;
            continue;
        }
        if (c >= 0xF0 && i + 2 < bytes.length) {
            const cp = ((c & 0x07) << 18) | ((bytes[i] & 0x3F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F);
            i += 3;
            if (cp > 0xFFFF) {
                const v = cp - 0x10000;
                out += String.fromCharCode(0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF));
            } else out += String.fromCharCode(cp);
            continue;
        }
        out += '\uFFFD';
    }
    return out;
}

function utf8Encode(s) {
    const out = [];
    s = String(s || '');
    for (let i = 0; i < s.length; i++) {
        const cp = s.charCodeAt(i);
        if (cp < 0x80) out.push(cp);
        else if (cp < 0x800) { out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F)); }
        else if (cp >= 0xD800 && cp < 0xDC00 && i + 1 < s.length) {
            const lo = s.charCodeAt(i + 1);
            if (lo >= 0xDC00 && lo < 0xE000) {
                const v = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                out.push(0xF0 | (v >> 18), 0x80 | ((v >> 12) & 0x3F), 0x80 | ((v >> 6) & 0x3F), 0x80 | (v & 0x3F));
                i++;
            } else out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
        } else out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
    }
    return out;
}

function hexToBytes(hex) {
    const out = [];
    const s = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
    for (let i = 0; i + 1 < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
    return out;
}

function jsUnescapeSingle(s) {
    return s.replace(/\\(.)/g, function (m, c) {
        if (c === 'n') return '\n';
        if (c === 'r') return '\r';
        if (c === 't') return '\t';
        return c;
    });
}

// Dean Edwards 打包解包（与 hornyjav/videplay 同款纯字符串算法）
function unpackDeanEdwards(html) {
    const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/);
    if (!m) return '';
    let p = jsUnescapeSingle(m[1]);
    const a = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    const k = jsUnescapeSingle(m[4]).split('|');
    const enc = function (n) { return (n < a ? '' : enc(Math.floor(n / a))) + ((n % a) > 35 ? String.fromCharCode((n % a) + 29) : (n % a).toString(36)); };
    let i = c;
    while (i--) {
        if (k[i]) {
            const word = k[i];
            p = p.replace(new RegExp('\\b' + enc(i) + '\\b', 'g'), function () { return word; });
        }
    }
    return p;
}

// 首页/分类/标签/搜索卡片：<article> 块（标题在 a 的 title 属性，封面在 img data-src）
function parseCards(html) {
    const items = [];
    const seen = {};
    const re = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const blk = m[1];
        const lm = blk.match(/<a[^>]+href="https:\/\/javcc\.me\/([^"\/\?#]+)\/?"[^>]*title="([^"]*)"/i)
            || blk.match(/<a[^>]+href="https:\/\/javcc\.me\/([^"\/\?#]+)\/?"[^>]*>/i);
        if (!lm) continue;
        const slug = lm[1];
        if (seen[slug]) continue;
        seen[slug] = 1;
        let title = lm[2] ? stripTags(lm[2]) : '';
        if (!title) {
            const hm = blk.match(/<header[^>]*>([\s\S]{0,400}?)<\/header>/i);
            if (hm) title = stripTags(hm[1]);
        }
        if (!title || title.length < 2) continue;
        let pic = '';
        const im = blk.match(/<img[^>]+>/i);
        if (im) {
            const sm = im[0].match(/(?:data-src|data-original|src)\s*=\s*"([^"]+)"/i);
            if (sm && /^https?:\/\//i.test(sm[1]) && !/data:image/i.test(sm[1])) pic = sm[1];
        }
        let remarks = '';
        const dm = blk.match(/duration">[\s\S]{0,120}?(\d+:\d+(?::\d+)?)/i);
        if (dm) remarks = dm[1];
        items.push({ vod_id: slug, vod_name: title, vod_pic: pic, vod_remarks: remarks, ext: { id: slug } });
        if (items.length >= 60) break;
    }
    return items;
}

// ---------- 详情 / 播放 ----------
// 详情页播放脚本：Rocket Lazy Load 包的 base64 内联脚本，解出 defaultUrl
function extractEmbedUrl(html) {
    const bm = String(html || '').match(/data-rocketlazyloadscript='data:text\/javascript;base64,([^']+)'/);
    if (bm) {
        const js = utf8BytesToStr(b64ToBytes(bm[1]));
        const um = js.match(/defaultUrl\s*=\s*"([^"]+)"/);
        if (um && /^https?:\/\//i.test(um[1])) return um[1];
    }
    const vm = String(html || '').match(/https:\/\/[a-z0-9.\-]*videplay\.us\/v\/[A-Za-z0-9]+/i);
    if (vm) return vm[0];
    const fm = String(html || '').match(/<iframe[^>]+src="([^"]+)"/i);
    if (fm && /^https?:\/\//i.test(fm[1])) return fm[1];
    return '';
}

// master 清单按 RESOLUTION 分档；单档只出一线，多档各出一线（绝不编造）
function parseMasterVariants(text) {
    const out = [];
    const seen = {};
    const re = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)[^\n]*\n([^\n#][^\n]*)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const h = parseInt(m[2], 10);
        const url = m[3].trim();
        if (!url || seen[url]) continue;
        seen[url] = 1;
        const q = h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : h >= 360 ? '360p' : (h + 'p');
        out.push({ name: q, url: url });
    }
    out.sort(function (a, b) { return parseInt(b.name, 10) - parseInt(a.name, 10); });
    return out;
}

// ---------- videplay 模板 B：pox/dp AES 解密（纯 JS，无 CryptoJS/node:crypto） ----------
// 嵌页 setup 用 file:ply(pox,dp) 运行时组装地址；ply 等价逻辑（2026-10-31
// 对 jur-887 嵌页实测坐实）：
//   pass = pox.split('+')[1].slice(1)（取中间 '+' 段并去掉首字符）
//   dp 经 base64 解码得 JSON {ct(base64), iv(hex), s(hex 盐)}
//   EVP_BytesToKey(MD5, pass, salt, 48 字节) -> key=前 32(AES-256) + iv=后 16
//   AES-256-CBC 解密 ct、去 PKCS7 填充 -> 真实 master 清单地址（如 /x/v-master.m3u8/<token>）
// 注意：JSON 里的 iv 与 EVP 派生 iv 一致，解密时以 EVP 为准；md5Bytes 与
// AES-256 均由 py_one.js 的 MD5/AES-128 改编（MD5 改走字节数组输入，
// AES 扩展 Nk=8/Nr=14，轮函数与 S 盒算法不变）。
function md5Bytes(input) {
    const msg = Array.from(input || []);
    const len = msg.length;
    const bitLen = len * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    const lo = bitLen >>> 0; const hi = Math.floor(bitLen / 4294967296) >>> 0;
    msg.push(lo & 255, (lo >>> 8) & 255, (lo >>> 16) & 255, (lo >>> 24) & 255);
    msg.push(hi & 255, (hi >>> 8) & 255, (hi >>> 16) & 255, (hi >>> 24) & 255);
    let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const K = [];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    for (let off = 0; off < msg.length; off += 64) {
        const M = [];
        for (let j = 0; j < 16; j++) M[j] = msg[off + j * 4] | (msg[off + j * 4 + 1] << 8) | (msg[off + j * 4 + 2] << 16) | (msg[off + j * 4 + 3] << 24);
        let A = a0; let B = b0; let C = c0; let D = d0;
        for (let r = 0; r < 64; r++) {
            let F; let g;
            if (r < 16) { F = (B & C) | (~B & D); g = r; }
            else if (r < 32) { F = (D & B) | (~D & C); g = (5 * r + 1) % 16; }
            else if (r < 48) { F = B ^ C ^ D; g = (3 * r + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * r) % 16; }
            const tmp = D; D = C; C = B;
            const sum = (A + F + K[r] + M[g]) | 0;
            B = (B + ((sum << S[r]) | (sum >>> (32 - S[r])))) | 0;
            A = tmp;
        }
        a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = [];
    const words = [a0, b0, c0, d0];
    for (let wi = 0; wi < 4; wi++) { const x = words[wi]; for (let i = 0; i < 4; i++) out.push((x >>> (i * 8)) & 255); }
    return out;
}

const AES256 = (function () {
    function xt(a) { return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff; }
    function mul(a, b) { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r & 0xff; }
    const SBOX = []; const INV = [];
    for (let a = 0; a < 256; a++) {
        let inv = 0;
        if (a) { for (let b = 1; b < 256; b++) { if (mul(a, b) === 1) { inv = b; break; } } }
        const x = inv;
        const s = x ^ ((x << 1 | x >> 7) & 255) ^ ((x << 2 | x >> 6) & 255) ^ ((x << 3 | x >> 5) & 255) ^ ((x << 4 | x >> 4) & 255) ^ 0x63;
        SBOX[a] = s & 0xff;
    }
    for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
    function expandKey256(key) {
        const Nk = 8; const Nr = 14;
        const w = [];
        for (let i = 0; i < Nk; i++) w[i] = (key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3];
        let rcon = 1;
        for (let i = Nk; i < 4 * (Nr + 1); i++) {
            let tt = w[i - 1];
            if (i % Nk === 0) {
                tt = ((tt << 8) | (tt >>> 24)) >>> 0;
                tt = ((SBOX[(tt >>> 24) & 255] << 24) | (SBOX[(tt >>> 16) & 255] << 16) | (SBOX[(tt >>> 8) & 255] << 8) | SBOX[tt & 255]) >>> 0;
                tt = (tt ^ (rcon << 24)) >>> 0;
                rcon = xt(rcon);
            } else if (i % Nk === 4) {
                tt = ((SBOX[(tt >>> 24) & 255] << 24) | (SBOX[(tt >>> 16) & 255] << 16) | (SBOX[(tt >>> 8) & 255] << 8) | SBOX[tt & 255]) >>> 0;
            }
            w[i] = (w[i - Nk] ^ tt) >>> 0;
        }
        return w;
    }
    function invShift(st) {
        const cols = [];
        for (let c = 0; c < 4; c++) cols[c] = [(st[c] >>> 24) & 255, (st[c] >>> 16) & 255, (st[c] >>> 8) & 255, st[c] & 255];
        const rows = [[], [], [], []];
        for (let cc = 0; cc < 4; cc++) for (let rr = 0; rr < 4; rr++) rows[rr][cc] = cols[cc][rr];
        for (let r2 = 0; r2 < 4; r2++) { const t2 = rows[r2].slice(); for (let c2 = 0; c2 < 4; c2++) rows[r2][(c2 + r2) % 4] = t2[c2]; }
        for (let c3 = 0; c3 < 4; c3++) for (let r3 = 0; r3 < 4; r3++) cols[c3][r3] = rows[r3][c3];
        const out = [];
        for (let c4 = 0; c4 < 4; c4++) out[c4] = ((cols[c4][0] << 24) | (cols[c4][1] << 16) | (cols[c4][2] << 8) | cols[c4][3]) >>> 0;
        return out;
    }
    function invSub(st) {
        const out = [];
        for (let c = 0; c < 4; c++) out[c] = ((INV[(st[c] >>> 24) & 255] << 24) | (INV[(st[c] >>> 16) & 255] << 16) | (INV[(st[c] >>> 8) & 255] << 8) | INV[st[c] & 255]) >>> 0;
        return out;
    }
    function invMix(st) {
        const out = [];
        for (let c = 0; c < 4; c++) {
            const b0 = (st[c] >>> 24) & 255; const b1 = (st[c] >>> 16) & 255; const b2 = (st[c] >>> 8) & 255; const b3 = st[c] & 255;
            out[c] = ((mul(b0, 14) ^ mul(b1, 11) ^ mul(b2, 13) ^ mul(b3, 9)) << 24 |
                (mul(b0, 9) ^ mul(b1, 14) ^ mul(b2, 11) ^ mul(b3, 13)) << 16 |
                (mul(b0, 13) ^ mul(b1, 9) ^ mul(b2, 14) ^ mul(b3, 11)) << 8 |
                (mul(b0, 11) ^ mul(b1, 13) ^ mul(b2, 9) ^ mul(b3, 14))) >>> 0;
        }
        return out;
    }
    function decBlock(w, s, Nr) {
        let st = [];
        for (let i = 0; i < 4; i++) st[i] = s[i] >>> 0;
        for (let round = Nr; round >= 1; round--) {
            for (let k = 0; k < 4; k++) st[k] = (st[k] ^ w[round * 4 + k]) >>> 0;
            if (round !== Nr) st = invMix(st);
            st = invShift(st);
            st = invSub(st);
        }
        for (let k2 = 0; k2 < 4; k2++) st[k2] = (st[k2] ^ w[k2]) >>> 0;
        return st;
    }
    function cbcDecrypt(keyBytes, ivBytes, dataBytes) {
        const w = expandKey256(keyBytes);
        const iv = [];
        for (let i = 0; i < 4; i++) iv[i] = ((ivBytes[i * 4] << 24) | (ivBytes[i * 4 + 1] << 16) | (ivBytes[i * 4 + 2] << 8) | ivBytes[i * 4 + 3]) >>> 0;
        const out = []; let prev = iv;
        for (let off = 0; off < dataBytes.length; off += 16) {
            const blk = [];
            for (let j = 0; j < 4; j++) blk[j] = ((dataBytes[off + j * 4] << 24) | (dataBytes[off + j * 4 + 1] << 16) | (dataBytes[off + j * 4 + 2] << 8) | dataBytes[off + j * 4 + 3]) >>> 0;
            let res = decBlock(w, blk, 14);
            res = [(res[0] ^ prev[0]) >>> 0, (res[1] ^ prev[1]) >>> 0, (res[2] ^ prev[2]) >>> 0, (res[3] ^ prev[3]) >>> 0];
            for (let j2 = 0; j2 < 4; j2++) out.push((res[j2] >>> 24) & 255, (res[j2] >>> 16) & 255, (res[j2] >>> 8) & 255, res[j2] & 255);
            prev = blk;
        }
        return out;
    }
    return { cbcDecrypt: cbcDecrypt };
})();

function evpBytesToKey(password, salt, total) {
    const pw = utf8Encode(String(password || ''));
    const sl = Array.from(salt || []);
    let out = []; let prev = [];
    while (out.length < total) {
        prev = md5Bytes(prev.concat(pw, sl));
        out = out.concat(prev);
    }
    return out.slice(0, total);
}

// ply 等价：pox/dp -> 真实 master 清单地址；失败返回 ''（绝不输出半截地址）
function decryptVideplayDp(pox, dp) {
    try {
        const parts = String(pox || '').split('+');
        if (parts.length < 3) return '';
        const pass = parts[1].slice(1);
        if (!pass) return '';
        const json = JSON.parse(utf8BytesToStr(b64ToBytes(String(dp || ''))));
        if (!json || !json.ct || !json.s) return '';
        const ct = b64ToBytes(json.ct);
        const salt = hexToBytes(json.s);
        if (!ct.length || ct.length % 16 !== 0 || salt.length !== 8) return '';
        const dk = evpBytesToKey(pass, salt, 48);
        const plain = AES256.cbcDecrypt(dk.slice(0, 32), dk.slice(32, 48), ct);
        const pad = plain[plain.length - 1];
        const cut = (pad >= 1 && pad <= 16) ? plain.slice(0, plain.length - pad) : plain;
        const text = utf8BytesToStr(cut);
        let url = text;
        if (text.charAt(0) === '"') {
            try { url = JSON.parse(text); } catch (e) { url = text.replace(/^"|"$/g, '').replace(/\\\//g, '/'); }
        } else url = text.replace(/\\\//g, '/');
        if (!/^https?:\/\/[^"'\\\s<>]+\/v-master\.m3u8\/[A-Za-z0-9_\-\.%=]+/i.test(url)) return '';
        return url;
    } catch (e) { return ''; }
}
// ---------- /videplay 模板 B ----------

async function resolveLines(embedUrl, durl) {
    const embedHtml = await getText(embedUrl, durl);
    if (!embedHtml) return [{ name: '正片', url: embedUrl }];
    const unpacked = unpackDeanEdwards(embedHtml);
    const hay = unpacked || embedHtml;
    let master = '';
    const mm = hay.match(/https:\/\/api\.videplay\.us\/o\/v-master\.m3u8\/[A-Za-z0-9_\-\.%]+/i);
    if (mm) master = mm[0];
    if (!master) {
        // 模板 B：解包文本只有无 token 的 /x/v-master.m3u8 模板地址，真实地址
        // 须经 pox/dp 解密；解不出则回落嵌页，绝不输出无 token 的模板地址。
        const px = embedHtml.match(/let\s+pox\s*=\s*'([^']+)'/);
        const dp = embedHtml.match(/let\s+dp\s*=\s*'([^']+)'/);
        if (px && dp) master = decryptVideplayDp(px[1], dp[1]);
    }
    if (!master) return [{ name: '正片', url: embedUrl }];
    const masterText = await getText(master, embedUrl);
    const variants = masterText ? parseMasterVariants(masterText) : [];
    if (variants.length) {
        // 每档出一线，地址走 Worker /p（Worker 改写分片为 /s/<名>.ts、剥 PNG 头；
        // 直连原变体清单会拿到 .image 伪装分片、播不了）。
        return variants.map(function (v) {
            return { name: v.name, url: workerPUrl(v.url, embedUrl) };
        });
    }
    // master 拉不到（dual 502 类）：交 Worker /v，服务端重抓 embed、现解
    // 新 token、再拉 master（服务端重试一次）；仍 502 时 Worker 直回 502
    // 文本快败，不再把 502 的 master 地址交给播放器转圈。
    return [{ name: '正片', url: workerVUrl(embedUrl, durl) }];
}

// 自家 javcc-hls Worker：/p 改写变体清单、/v 全链现解。
function workerPUrl(variantUrl, embedUrl) {
    return WORKER + '/p?u=' + encodeURIComponent(variantUrl) + '&e=' + encodeURIComponent(embedUrl);
}
function workerVUrl(embedUrl, durl) {
    return WORKER + '/v?u=' + encodeURIComponent(embedUrl) + '&r=' + encodeURIComponent(durl);
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'JavCC',
        site: HOST,
        tabs: CATS.map(function (c) { return { name: c.type_name, ext: { id: c.type_id } }; }),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.id || 'latest');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const base = tid === 'latest' ? HOST : HOST + '/' + tid.replace(/^\/+/, '').replace(/\/+$/, '');
    const url = page === 1 ? (base + '/') : (base + '/page/' + page + '/');
    let list = [];
    try {
        const html = await getText(url, HOST + '/');
        list = parseCards(html);
        // 翻页兜底：主地址空回时换 ?paged=N 再取一次
        if (page > 1 && !list.length) {
            const alt = tid === 'latest' ? HOST + '/?paged=' + page : base + '/?paged=' + page;
            const html2 = await getText(alt, HOST + '/', 20000);
            list = parseCards(html2);
        }
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = String(ext.text || '').trim();
    if (!kw) return jsonify({ list: [] });
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = page === 1
        ? HOST + '/?s=' + encodeURIComponent(kw)
        : HOST + '/page/' + page + '/?s=' + encodeURIComponent(kw);
    let list = [];
    try {
        const html = await getText(url, HOST + '/');
        list = parseCards(html);
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '');
    if (!id) return jsonify({ list: [] });
    const durl = /^https?:\/\//i.test(id) ? id : HOST + '/' + id.replace(/^\/+/, '');
    const html = await getText(durl, HOST + '/');
    if (!html) return jsonify({ list: [] });
    let title = '';
    const ogt = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogt) title = stripTags(ogt[1]);
    if (!title) {
        const tm = html.match(/<title>([\s\S]{0,400}?)<\/title>/i);
        if (tm) title = stripTags(tm[1]).replace(/\s*-\s*JAVCC\.ME\s*$/i, '');
    }
    if (!title) title = id;
    const embedUrl = extractEmbedUrl(html);
    let lines = [];
    if (embedUrl) {
        try { lines = await resolveLines(embedUrl, durl); } catch (e) { lines = []; }
        if (!lines.length) lines = [{ name: '正片', url: embedUrl }];
    }
    if (!lines.length) return jsonify({ list: [] });
    const tracks = lines.map(function (l) {
        return { name: l.name, pan: '', ext: { url: l.url, name: title, embed: embedUrl } };
    });
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    // 嵌页地址本身无法直播，交给播放器自行解析（猫源 play 的 parse:1 同款）
    const result = {
        urls: [url],
        headers: [{ 'User-Agent': UA, 'Referer': String(ext.embed || HOST + '/') }],
    };
    const name = String(ext.name || '');
    if (name && !/videplay\.us\/v\//i.test(url)) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}
const CATS = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'tag/uncensored-leaked', type_name: '无码流出' },
  { type_id: 'category/reducing-mosaic', type_name: '减码' },
  { type_id: 'tag/big-tits', type_name: '巨乳' },
  { type_id: 'tag/huge-butt', type_name: '大屁股' },
  { type_id: 'tag/married-woman', type_name: '人妻' },
  { type_id: 'tag/school-uniform', type_name: '制服' },
  { type_id: 'tag/uncensored', type_name: '无码' },
  { type_id: 'tag/creampie', type_name: '中出' },
  { type_id: 'tag/amateur', type_name: '素人' },
  { type_id: 'tag/beautiful-girl', type_name: '美少女' },
  { type_id: 'category/censored', type_name: '有码' },
  { type_id: 'category/english-subtitle', type_name: '英字' },
];
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

