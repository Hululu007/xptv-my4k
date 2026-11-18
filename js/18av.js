// 18AV - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_18av.js
// 站点 https://18av.mm-cg.com（主备 6 域同站镜像，failover）；18+ 门页靠静态 Cookie
// YES_Eighteen=IamOverEighteenYearsOld（每请求都带，门页重现时从 gate 页 JS 重解析）；
// 注意：VM 侧 6 域全部连接超时（curl 000，站方拦 VM 出口），VM 无法验证列表/解密/播放链，
// 设备侧用户说内容能出、只是播不了；本文件只修链路形态，不改解密逻辑。
// failover 必须是并行的：原串行 6 域 × 每域多次取页、无超时，域挂时一次 getCards 要等数分钟；
// 现 6 域并行竞速、每请求 12s 超时，首个成功即返，全部失败才回空。
// 分类：中文字幕/有碼AV/無碼AV/素人AV/無碼破解/H動畫/國產自拍 7 个顶级；384/605 题材与 12 片商筛选在 XPTV 里不展；
// 列表 /zh/{区}_list/all/{N}.html；搜索 /zh/fc_search/all/{词}/{N}.html；
// 播放链：详情页 mvarr['10_1']（1080p）/['11_1']（720p)，加密串经 decrypto（hcdeedg252 为底、hadeedg252 异或）
// 得 base64，再以页内 argdeqweqweqwe（key）、hdddedg252（iv）作 AES-128-CBC 解密得 64 位 id；
// play.php?numresolution={1080|720}&id={id} 回 Plyr+HLS 页，内含 videoSources {src, size}，按档位挑 m3u8；
// 分片须带 play.php 作 Referer（无 Referer 分片 404）；详情有时渲染 SERVER:zero（无 mvarr），此时无播放线，
// 跨 3 个域重试命中即停；带字幕（有番号）。
const DOMAINS = [
    'https://18av.mm-cg.com',
    'https://mjv015.com',
    'https://mjv011.com',
    'https://mjv008.com',
    'https://mjv006.com',
    'https://mjv005.com',
];
const SITE = DOMAINS[0];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const GATE_PATH = '/zh/chinese_IamOverEighteenYearsOld/19/index.html';

let ageCookie = 'YES_Eighteen=IamOverEighteenYearsOld';

const SECTIONS = [
    { type_id: 'chinese', type_name: '中文字幕', list: 'chinese' },
    { type_id: 'censored', type_name: '有碼AV', list: 'censored' },
    { type_id: 'uncensored', type_name: '無碼AV', list: 'uncensored' },
    { type_id: 'amateurjav', type_name: '素人AV', list: 'amateurjav' },
    { type_id: 'reducing-mosaic', type_name: '無碼破解', list: 'reducing-mosaic' },
    { type_id: 'animation', type_name: 'H動畫', list: 'animation' },
    { type_id: 'dt', type_name: '國產自拍', list: 'dt' },
];

function t(v) { return String(v == null ? '' : v).trim(); }

function clean(s) {
    return t(s)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ');
}

function originOf(url) {
    const m = t(url).match(/^https?:\/\/[^/]+/i);
    return m ? m[0] : '';
}

function pathOf(url) {
    const u = t(url);
    const m = u.match(/^https?:\/\/[^/]+(\/.*)$/i);
    if (m) return m[1];
    return u.charAt(0) === '/' ? u : '/' + u;
}

function pageHeaders(origin) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'Referer': origin + '/',
        'Cookie': ageCookie,
    };
}

async function rawGet(url, headers, timeoutMs) {
    try {
        const r = await $fetch.get(url, { headers, timeout: timeoutMs || 12000 });
        if (r && r.status >= 200 && r.status < 300) {
            const d = r.data;
            if (typeof d === 'string') return d;
            if (d) return JSON.stringify(d);
        }
        return '';
    } catch (e) { return ''; }
}

function isGatePage(html) {
    return !!html && html.indexOf('fwin_dialog_submit') !== -1;
}

async function getHtmlForOrigin(origin, path, timeoutMs) {
    const to = timeoutMs || 12000;
    const url = origin + path;
    let html = await rawGet(url, pageHeaders(origin), to);
    if (isGatePage(html)) {
        const g = await rawGet(origin + GATE_PATH, pageHeaders(origin), to);
        const cm = g && g.match(/([A-Za-z0-9_]+)=IamOverEighteenYearsOld/);
        if (cm) ageCookie = cm[1] + '=IamOverEighteenYearsOld';
        html = await rawGet(url, pageHeaders(origin), to);
    }
    return isGatePage(html) ? '' : html;
}

// 6 域并行竞速：首个成功即返；全部失败才回空。不用 setTimeout（沙箱未必有），
// 用“首个成功 race”+“全部 settled 兜底 race”实现。
async function getHtml(url) {
    const path = pathOf(url);
    const first = originOf(url) || SITE;
    const order = [first];
    for (const d of DOMAINS) if (d !== first) order.push(d);
    const attempts = order.map((origin) => getHtmlForOrigin(origin, path, 12000));
    const never = new Promise(() => {});
    const firstOk = Promise.race(attempts.map((p) => p.then((h) => (h ? h : never))));
    const allDone = Promise.all(attempts).then((arr) => { for (const h of arr) if (h) return h; return ''; });
    return Promise.race([firstOk, allDone]);
}

function parsePosts(html) {
    const out = [];
    if (!html) return out;
    const seen = new Set();
    const chunks = String(html).split(/<div class=['"]post[\s'"]/);
    for (let i = 1; i < chunks.length; i++) {
        const c = chunks[i];
        const lm = c.match(/href=['"](https?:\/\/[^'"]*?_content\/[^'"]+?\.html)['"]/i);
        if (!lm) continue;
        const href = lm[1];
        if (seen.has(href)) continue;
        seen.add(href);
        const tm = c.match(/<h3[^>]*>\s*<a[^>]*>([^<]{2,400})<\/a>/i);
        const title = tm ? clean(tm[1]) : href;
        const pm = c.match(/<img[^>]+src=['"](https?:\/\/[^'"]+)['"]/i);
        const pic = pm ? pm[1] : '';
        const dm = c.match(/<div class=['"]meta['"]>([^<]*)<\/div>/i);
        out.push({ vod_id: href, vod_name: title, vod_pic: pic, vod_remarks: dm ? t(dm[1]) : '' });
    }
    return out;
}

function sectionListUrl(sec, page) {
    return '/zh/' + sec + '_list/all/' + page + '.html';
}

function searchUrl(wd, page) {
    return '/zh/fc_search/all/' + encodeURIComponent(wd) + '/' + page + '.html';
}

// ---------------- 播放器解密（纯 JS，无 node:crypto；S-box 运行时由 AES 仿射变换生成） ----------------
function xtime(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; }
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}
function gpow(a, e) {
  let r = 1;
  while (e > 0) {
    if (e & 1) r = gmul(r, a);
    a = gmul(a, a);
    e >>= 1;
  }
  return r;
}
function rotl8(x, n) { return ((x << n) | (x >> (8 - n))) & 0xff; }
const AES_SBOX = new Array(256);
const AES_ISBOX = new Array(256);
for (let i = 0; i < 256; i++) {
  const inv = i === 0 ? 0 : gpow(i, 254);
  const s = (inv ^ rotl8(inv, 1) ^ rotl8(inv, 2) ^ rotl8(inv, 3) ^ rotl8(inv, 4) ^ 0x63) & 0xff;
  AES_SBOX[i] = s;
  AES_ISBOX[s] = i;
}
const AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
function aesKeyExpand(key) {
  const w = new Array(44);
  for (let i = 0; i < 4; i++) w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
  for (let i = 4; i < 44; i++) {
    let tt = w[i - 1];
    if (i % 4 === 0) {
      tt = (AES_SBOX[(tt >> 16) & 0xff] << 24) | (AES_SBOX[(tt >> 8) & 0xff] << 16) | (AES_SBOX[tt & 0xff] << 8) | AES_SBOX[(tt >> 24) & 0xff];
      tt ^= AES_RCON[i / 4 - 1] << 24;
    }
    w[i] = (w[i - 4] ^ tt) >>> 0;
  }
  return w;
}
function aesAddRoundKey(s, w, round) {
  for (let c = 0; c < 4; c++) {
    const word = w[round * 4 + c];
    s[4 * c] ^= (word >>> 24) & 0xff;
    s[4 * c + 1] ^= (word >>> 16) & 0xff;
    s[4 * c + 2] ^= (word >>> 8) & 0xff;
    s[4 * c + 3] ^= word & 0xff;
  }
}
function aesInvShiftRows(s) {
  const tmp = s.slice();
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) s[4 * c + r] = tmp[4 * ((c - r + 4) % 4) + r];
  }
}
function aesInvSubBytes(s) { for (let i = 0; i < 16; i++) s[i] = AES_ISBOX[s[i]]; }
function aesInvMixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = 4 * c;
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    s[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    s[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    s[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    s[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}
function aesDecryptBlock(block, w) {
  const s = block.slice();
  aesAddRoundKey(s, w, 10);
  for (let round = 9; round >= 1; round--) {
    aesInvShiftRows(s);
    aesInvSubBytes(s);
    aesAddRoundKey(s, w, round);
    aesInvMixColumns(s);
  }
  aesInvShiftRows(s);
  aesInvSubBytes(s);
  aesAddRoundKey(s, w, 0);
  return s;
}
function b64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return Array.from(Buffer.from(String(b64), 'base64'));
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cl = String(b64).replace(/[^A-Za-z0-9+/=]/g, '');
  const out = [];
  for (let i = 0; i < cl.length; i += 4) {
    const n = (chars.indexOf(cl[i]) << 18) | (chars.indexOf(cl[i + 1]) << 12)
      | ((chars.indexOf(cl[i + 2]) & 63) << 6) | (chars.indexOf(cl[i + 3]) & 63);
    out.push((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
  }
  const pad = (cl.match(/=+$/) || [''])[0].length;
  return out.slice(0, out.length - pad);
}
function strToBytes(s) {
  if (typeof Buffer !== 'undefined') return Array.from(Buffer.from(String(s), 'utf8'));
  const out = [];
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) out.push(code);
    else if (code < 0x800) { out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f)); }
    else { out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)); }
  }
  return out;
}
// AES-128-CBC 解密（PKCS7 去填充），key/iv 为页内 16 字符 UTF-8 串
function aesDecryptCbcB64(b64, keyStr, ivStr) {
  const data = b64ToBytes(b64);
  const key = strToBytes(keyStr);
  const iv = strToBytes(ivStr);
  if (data.length < 16 || data.length % 16 !== 0 || key.length !== 16 || iv.length !== 16) return '';
  const w = aesKeyExpand(key);
  let prev = iv.slice();
  const out = [];
  for (let off = 0; off < data.length; off += 16) {
    const dec = aesDecryptBlock(data.slice(off, off + 16), w);
    for (let i = 0; i < 16; i++) out.push(dec[i] ^ prev[i]);
    prev = data.slice(off, off + 16);
  }
  const pad = out.length ? out[out.length - 1] : 0;
  if (pad < 1 || pad > 16) return '';
  for (let i = 0; i < pad; i++) if (out[out.length - 1 - i] !== pad) return '';
  const body = out.slice(0, out.length - pad);
  let s = '';
  for (let i = 0; i < body.length; i++) s += String.fromCharCode(body[i]);
  return s;
}

// 站方 decrypto：按分隔符切块、base 进制解析、异或还原字符（见 content_mv_protect.js）
function decrypto(g, base, xor) {
  const sep = String.fromCharCode(base + 97);
  const parts = String(g || '').split(sep);
  let out = '';
  for (const p of parts) {
    const n = parseInt(p, base);
    if (isNaN(n)) continue;
    out += String.fromCharCode(n ^ xor);
  }
  return out;
}

function extractPlay(html) {
    const out = [];
    if (!html) return out;
    const km = html.match(/var argdeqweqweqwe\s*=\s*'([^']+)'/) || html.match(/var hdddedd252\s*=\s*'([^']+)'/);
    const ivm = html.match(/var hdddedg252\s*=\s*'([^']+)'/) || html.match(/var argdeqweqweqww\s*=\s*'([^']+)'/);
    if (!km || !ivm) return out;
    const key = km[1];
    const iv = ivm[1];
    const bm = html.match(/hcdeedg252\s*=\s*(\d+)/);
    const xm = html.match(/hadeedg252\s*=\s*(\d+)/);
    const base = bm ? parseInt(bm[1], 10) : 3;
    const xor = xm ? parseInt(xm[1], 10) : 13;
    const re = /mvarr\['(10_1|11_1)'\]=\[\['[^']*','([^']+)','[^']*','([^']*)','([^']*)'/g;
    let m;
    while ((m = re.exec(html))) {
        const res = m[1] === '10_1' ? 1080 : 720;
        const b64 = decrypto(m[2], base, xor);
        const id = aesDecryptCbcB64(b64, key, iv);
        if (!id || /[^A-Za-z0-9_-]/.test(id)) continue;
        let prefix = m[3];
        if (prefix.indexOf('//') === 0) prefix = 'https:' + prefix;
        if (!/^https?:\/\//.test(prefix)) continue;
        out.push({ res, playUrl: prefix + id + (m[4] || '') });
    }
    out.sort((a, b) => b.res - a.res);
    return out;
}

async function detailHtmlRetry(durl) {
    const path = pathOf(durl);
    const first = originOf(durl) || SITE;
    const order = [first];
    for (const d of DOMAINS) if (d !== first) order.push(d);
    const tries = order.slice(0, 3);
    const attempts = tries.map((origin) => getHtmlForOrigin(origin, path, 12000));
    const never = new Promise(() => {});
    const firstOk = Promise.race(attempts.map((p) => p.then((h) => {
        if (h && extractPlay(h).length) return { html: h, plays: extractPlay(h) };
        return never;
    })));
    const allDone = Promise.all(attempts).then((arr) => {
        let firstHtml = '';
        for (const h of arr) {
            if (!firstHtml) firstHtml = h;
            if (h && extractPlay(h).length) return { html: h, plays: extractPlay(h) };
        }
        return { html: firstHtml, plays: [] };
    });
    return Promise.race([firstOk, allDone]);
}

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

async function getConfig() {
    return jsonify({
        ver: 1,
        title: '18AV',
        site: SITE,
        tabs: SECTIONS.map((s) => ({ name: s.type_name, ext: { tid: s.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'chinese');
    const page = parseInt(ext.page || 1, 10) || 1;
    const sec = SECTIONS.find((s) => s.type_id === tid) || SECTIONS[0];
    const html = await getHtml(SITE + sectionListUrl(sec.list, page));
    return jsonify({ list: parsePosts(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id || '');
    const tracks = [];
    if (id) {
        const durl = /^https?:\/\//.test(id) ? id : SITE + (id.charAt(0) === '/' ? id : '/' + id);
        const { html, plays } = await detailHtmlRetry(durl);
        let name = '';
        const hm = html.match(/<h1[^>]*>\s*<b>([^<]{2,500})<\/b>/i);
        if (hm) name = clean(hm[1]);
        if (!name) {
            const tm = html.match(/<title>([^<]*)<\/title>/i);
            if (tm) name = clean(tm[1]).replace(/\s*18AV在線H成人影片.*$/i, '').trim();
        }
        if (!name) name = durl;
        if (plays.length) {
            for (const p of plays) tracks.push({ name: p.res + 'p', pan: '', ext: { url: durl + '|' + p.playUrl, name } });
        } else {
            tracks.push({ name: '网页播放', pan: '', ext: { url: durl, name } });
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.url || '').trim();
    const name = t(ext.name || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    let durl = id;
    let playUrl0 = '';
    const bar = id.indexOf('|');
    if (bar >= 0) { durl = id.slice(0, bar); playUrl0 = id.slice(bar + 1); }
    const resM = playUrl0.match(/numresolution=(\d+)/);
    const wantRes = resM ? parseInt(resM[1], 10) : 0;
    const withSubs = async (url, referer) => {
        const result = { urls: [url], headers: [{ 'User-Agent': UA, 'Referer': referer }] };
        if (name) {
            try {
                const subs = await subSearch(name);
                if (subs && subs.length) result.subs = subs;
            } catch (e) {}
        }
        return jsonify(result);
    };
    const playHeaders = (ref) => ({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': ref || durl,
        'Cookie': ageCookie,
    });
    async function resolveFromPlayUrl(playUrl) {
        if (!playUrl) return { media: '', used: '' };
        const html = await rawGet(playUrl, playHeaders(durl), 15000);
        if (!html) return { media: '', used: '' };
        const srcs = [];
        const re = /\{src: '([^']+)',type: 'application\/x-mpegURL', size: (\d+)\}/g;
        let m;
        while ((m = re.exec(html))) srcs.push({ url: m[1], size: parseInt(m[2], 10) });
        if (!srcs.length) return { media: '', used: '' };
        const hit = (wantRes && srcs.find((s) => s.size === wantRes)) || srcs[0];
        return { media: hit.url, used: playUrl };
    }
    try {
        let r = await resolveFromPlayUrl(playUrl0);
        if (!r.media) {
            const { plays } = await detailHtmlRetry(durl);
            const p = plays.find((x) => x.res === wantRes) || plays[0];
            if (p) r = await resolveFromPlayUrl(p.playUrl);
        }
        if (!r.media) return jsonify({ urls: [], headers: [] });
        return withSubs(r.media, r.used);
    } catch (e) {
        return jsonify({ urls: [], headers: [] });
    }
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text || '');
    const page = parseInt(ext.page || 1, 10) || 1;
    if (!wd) return jsonify({ list: [] });
    const html = await getHtml(SITE + searchUrl(wd, page));
    return jsonify({ list: parsePosts(html) });
}
