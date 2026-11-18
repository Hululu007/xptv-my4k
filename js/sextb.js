// SexTB - XPTV csp 格式（csp_sextb）
// 转换自 mira-cat nodejs/src/spider/video/sextb.js（py_sextb）。站点 https://sextb.cc（备用 https://sextb.net）。
// 依赖 Worker：sextb-hls v4（https://sextb-hls.li768435813.workers.dev）——
// 播放主链：Worker /resolve?u=<详情页>&ep=<线路>（默认 F4，可换 SW），Worker 在服务端取详情页 + 调 /ajax/player，
// 回 {"ok":true,"url":"<Worker /f4 或 /v 代理地址>","line":"F4"/"SW"}；蜘蛛侧探活（确是 #EXTM3U 才收），F4 不通换 SW。
// DD/FL/ST 等线 /resolve 只回嵌页地址（sniff:true），XPTV 无嗅探位，不收。
// 蜘蛛侧旧解析（ajax/player 借线 + 各宿主直解）保留作兜底：VM 侧 sextb 直连被 CF 拦、走不通，设备侧可能通。
// 拿不到可播流返回空，绝不回页面/嵌页地址。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）：/ajax/player 为表单 POST、playmate/vidara 为 JSON POST，逐字保持猫侧线格式。
// 猫版 setTimeout/AbortController 探活与 fetch 双通道改 $fetch 单通道串行（探活以 $fetch.get 状态+文本判定，替代二进制字节探活）；
// 跨调用状态无（猫版原本即无全局缓存）。
const HOSTS = ['https://sextb.cc', 'https://sextb.net'];
const SITE = HOSTS[0];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';
const SEXTB_WORKER = 'https://sextb-hls.li768435813.workers.dev';
// 2026-11-19 取数腿：站方 CF 拦程序化直连（VM 与设备均拿不到正文）、jina 匿名
// 配额已耗尽（401 bad IP reputation），改走自家 site-fetch Worker 优先
// （2026-11-19 实测：SF 取首页 200/244KB，parseCards 得 75 卡 75 封面）。
// 三腿：site-fetch → 直连 → jina，首个真 HTML 胜出。
const SITE_FETCH = 'https://site-fetch.li768435813.workers.dev';

const CATS = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'censored', type_name: '有码', slug: 'censored' },
  { type_id: 'uncensored', type_name: '无码', slug: 'uncensored-dc02d84q' },
  { type_id: 'amateur', type_name: '素人', slug: 'amateur-9yvovjqr' },
  { type_id: 'subtitle', type_name: '中文字幕', slug: 'subtitle' },
  { type_id: 'uncensored-leaked', type_name: '无码流出', slug: 'uncensored-leaked-8iodxgmu' },
  { type_id: 'reducing-mosaic', type_name: '减码', slug: 'reducing-mosaic-o16ol1qy' },
  { type_id: 'english-subtitle', type_name: '英字幕', slug: 'english-subtitle-8rpwhwew' },
  { type_id: 'digital-mosaic', type_name: '数码有码', slug: 'digital-mosaic-merf7vyh' },
  { type_id: 'minimal-mosaic', type_name: '低马赛克', slug: 'minimal-mosaic-csskw5dg' },
  { type_id: 'big-tits', type_name: '巨乳', slug: 'big-tits-hipx7w77' },
  { type_id: 'creampie', type_name: '中出', slug: 'creampie-dkel1ugw' },
  { type_id: 'blowjob', type_name: '口交', slug: 'blowjob-6w43evzo' },
  { type_id: 'school-girl', type_name: '学生', slug: 'school-girl-aze0q30d' },
  { type_id: 'milf', type_name: '熟女', slug: 'milf-k01m582n' },
  { type_id: 'mature-woman', type_name: '成熟女性', slug: 'mature-woman-pj7rh291' },
  { type_id: 'lesbian', type_name: '蕾丝', slug: 'lesbian-9akyznh5' },
  { type_id: 'nurse', type_name: '护士', slug: 'nurse-kor7sr6n' },
  { type_id: 'office-lady', type_name: 'OL', slug: 'office-lady-pjv31x9c' },
  { type_id: 'threesome', type_name: '3P4P', slug: 'threesome--foursome-3r7836if' },
  { type_id: 'cosplay', type_name: 'Cosplay', slug: 'cosplay-d5rzeneh' },
  { type_id: 'voyeur', type_name: '偷拍', slug: 'voyeur-9thq5fr5' },
  { type_id: 'massage', type_name: '按摩', slug: 'massage-0ypm730h' },
  { type_id: 'bondage', type_name: '捆绑', slug: 'bondage-wywuaggb' },
  { type_id: 'squirting', type_name: '潮吹', slug: 'squirting-1t5r5wb9' },
  { type_id: 'maid', type_name: '女仆', slug: 'maid-vkrzm0oo' },
  { type_id: 'teen', type_name: '少女', slug: 'teen-gk3kz0pk' },
  { type_id: 'fc2', type_name: 'FC2', slug: 'fc2' },
];

const appConfig = {
    ver: 1,
    title: 'SexTB',
    site: SITE,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
    return t(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
}
function fixUrl(u) {
    u = t(u);
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return SITE + u;
    if (/^https?:\/\//.test(u)) return u;
    return SITE + '/' + u;
}
function isBlockedPage(html) {
    if (!html || typeof html !== 'string') return true;
    if (html.length < 500) return true;
    const head = html.slice(0, 3000);
    if (/Your request was blocked/i.test(head)) return true;
    if (/<title>[^<]*(Just a moment|Attention Required)/i.test(head)) return true;
    if (/Performing security verification/i.test(head)) return true;
    if (/Sorry, you have been blocked/i.test(head)) return true;
    return false;
}
function hostOrder(url) {
    const order = [];
    const m = t(url).match(/^https?:\/\/([^/]+)/i);
    if (m) {
        const h = 'https://' + m[1].toLowerCase();
        if (HOSTS.includes(h)) order.push(h);
    }
    for (const h of HOSTS) if (!order.includes(h)) order.push(h);
    return order;
}
function pathOf(url) {
    const u = t(url);
    const m = u.match(/^https?:\/\/[^/]+(\/.*)$/i);
    if (m) return m[1];
    return u.startsWith('/') ? u : '/' + u;
}
function pageHeaders(referer, extraHeaders) {
    return { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Referer': referer || REFERER, ...(extraHeaders || {}) };
}
async function rawGet(url, headers) {
    try {
        const { data, status } = await $fetch.get(url, { headers });
        if ((status === undefined || status === 200) && typeof data === 'string' && !isBlockedPage(data)) return data;
        if (typeof data === 'string' && data && !isBlockedPage(data)) return data;
    } catch (e) {}
    return '';
}
// /ajax/player 会话：__pt 绑 PHP 会话（缺 Cookie 回 E_SID，缺 pt 回 E_TOK_LEN）。
// 详情页经 site-fetch 取回时 Worker 以 x-set-cookie 带回 PHPSESSID，存下来，
// POST 时一并带上（经 site-fetch 转发，Worker 代传给站方，同一会话）。
let SEXTB_SESSION = '';
function storeSessionCookie(headers) {
    try {
        const h = headers || {};
        const raw = h['x-set-cookie'] || h['X-Set-Cookie'] || h['set-cookie'] || h['Set-Cookie'] || '';
        const list = Array.isArray(raw) ? raw : [String(raw)];
        for (const item of list) {
            const m = String(item).match(/(?:^|;\s*)(PHPSESSID=[^;]+)/);
            if (m) { SEXTB_SESSION = m[1]; return; }
        }
    } catch (e) {}
}
async function fetchViaSiteFetch(url) {
    try {
        const { data, status, headers } = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), { headers: pageHeaders(REFERER), timeout: 15000 });
        if ((status === undefined || status === 200) && typeof data === 'string' && !isBlockedPage(data)) {
            if (data.includes('tray-item') || data.length > 5000) {
                storeSessionCookie(headers);
                return data;
            }
        }
    } catch (e) {}
    return '';
}
async function fetchViaJina(host, path) {
    const jinaUrl = 'https://r.jina.ai/' + host + path;
    const headers = { 'User-Agent': UA, 'x-respond-with': 'html' };
    try {
        const { data, status } = await $fetch.get(jinaUrl, { headers });
        if ((status === undefined || status === 200) && typeof data === 'string' && !isBlockedPage(data)) {
            if (data.includes('tray-item') || data.length > 5000) return data;
        }
    } catch (e) {}
    return '';
}
async function getHtml(url, extraHeaders) {
    const m = t(url).match(/^https?:\/\/([^/]+)/i);
    const host = m ? m[1].toLowerCase() : '';
    if (!/sextb\.(net|cc)$/.test(host)) {
        return rawGet(url, pageHeaders(m ? 'https://' + host + '/' : REFERER, extraHeaders));
    }
    const path = pathOf(url);
    // ① 自家 site-fetch 中转（首选，实测通）
    const sf = await fetchViaSiteFetch(url);
    if (sf) return sf;
    const hosts = hostOrder(url);
    for (const h of hosts) {
        const html = await rawGet(h + path, pageHeaders(h + '/', extraHeaders));
        if (html) return html;
    }
    for (const h of hosts) {
        const html = await fetchViaJina(h, path);
        if (html) return html;
    }
    return '';
}
function formEncode(obj) {
    return Object.keys(obj).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k])).join('&');
}
// ---- /ajax/player：站方现行协议（2026-11-19 对照站方 /js/sextb.js 查实） ----
//   详情页内联：window.__pt / window.__pk（每页现值）；
//   POST /ajax/player {episode, filmId, pt: __pt}；
//   回 {player_enc: base64(XOR(playerHtml, __pk)), next_pt, next_pk}，
//   下一次调用须用 next_pt/next_pk（每调轮换）；缺 pt 回 E_TOK_LEN。
//   旧代码只发 {episode, filmId}、只认明文 json.player，故一直拿不到嵌页。
//   纯 JS base64 解码 + XOR，不依赖 atob/Buffer（XPTV 运行时无 Buffer）。
const B64CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64ToBytes(s) {
    const clean = String(s || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const out = [];
    let i = 0;
    while (i < clean.length) {
        const c0 = B64CHARS.indexOf(clean.charAt(i++));
        const c1 = B64CHARS.indexOf(clean.charAt(i++));
        const c2 = B64CHARS.indexOf(clean.charAt(i++));
        const c3 = B64CHARS.indexOf(clean.charAt(i++));
        if (c0 < 0 || c1 < 0) break;
        out.push((c0 << 2) | (c1 >> 4));
        if (c2 >= 0) out.push(((c1 & 15) << 4) | (c2 >> 2));
        if (c3 >= 0) out.push(((c2 & 3) << 6) | c3);
    }
    return out;
}
function xorDecrypt(encoded, key) {
    if (!encoded || !key) return '';
    const bytes = b64ToBytes(encoded);
    if (!bytes.length) return '';
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i] ^ key.charCodeAt(i % key.length));
    }
    return result;
}
function extractPtPk(html) {
    const pt = (String(html || '').match(/window\.__pt\s*=\s*"([^"]+)"/) || [])[1] || '';
    const pk = (String(html || '').match(/window\.__pk\s*=\s*"([^"]+)"/) || [])[1] || '';
    return { pt, pk };
}
async function postJsonFast(durl, body) {
    let ajaxUrl = '';
    try { ajaxUrl = new URL(durl).origin + '/ajax/player'; } catch (e) { return ''; }
    const data = formEncode(body);
    const headers = { 'User-Agent': UA, 'Referer': durl, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' };
    if (SEXTB_SESSION) headers['Cookie'] = SEXTB_SESSION;
    // ① 经 site-fetch 转发（Worker 代传 Cookie 给站方，同一会话；VM 直连被 CF 拦、设备侧也未必通）
    try {
        const { data: res, status, headers: rh } = await $fetch.post(SITE_FETCH + '/?u=' + encodeURIComponent(ajaxUrl), data, { headers });
        if (rh) storeSessionCookie(rh);
        if ((status === undefined || status === 200) && res != null) {
            const s = typeof res === 'string' ? res : JSON.stringify(res);
            // 成功回包带 player_enc；Forbidden（E_TOK_LEN/E_SID 等）不回，落到直连再试
            if (s && /player_enc/.test(s)) return s;
            if (s && !/Your request was blocked/i.test(s) && !/"error"/.test(s)) return s;
        }
    } catch (e) {}
    // ② 直连（设备侧可能通；VM 侧被 CF 拦）
    try {
        const { data: res, status } = await $fetch.post(ajaxUrl, data, { headers });
        if ((status === undefined || status === 200) && res != null) {
            const s = typeof res === 'string' ? res : JSON.stringify(res);
            if (s && !/Your request was blocked/i.test(s)) return s;
        }
    } catch (e) {}
    return '';
}
// ---- packer / probe / resolvers ----
function jsUnescapeSingle(s) {
    return s.replace(/\\(.)/g, (m, c) => {
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
function extractHgLinks(text) {
    const links = {};
    for (const m of String(text || '').matchAll(/"hls(\d+)"\s*:\s*"([^"]+)"/g)) links['hls' + m[1]] = m[2];
    return links;
}
function extractGenericFile(text) {
    const s = String(text || '');
    let m = s.match(/"file"\s*:\s*"(https?:[^"]+?\.m3u8[^"]*)"/) || s.match(/file\s*:\s*"(https?:[^"]+?\.m3u8[^"]*)"/);
    if (m) return m[1];
    m = s.match(/(https?:\/\/[^\s"'\\]+\.m3u8(?:\?[^\s"'\\]*)?)/);
    if (m) return m[1];
    m = s.match(/"file"\s*:\s*"(https?:[^"]+?\.mp4[^"]*)"/);
    if (m) return m[1];
    return '';
}
async function probePlaylist(url, headers) {
    try {
        const { data, status } = await $fetch.get(url, { headers: headers || { 'User-Agent': UA } });
        return (status === undefined || status === 200) && typeof data === 'string' && data.includes('#EXTM3U');
    } catch (e) { return false; }
}
async function probeBytesOk(url, headers) {
    try {
        const h = { ...(headers || {}), 'Range': 'bytes=0-0' };
        const { data, status } = await $fetch.get(url, { headers: h });
        return status === 200 || status === 206 || (status === undefined && !!data);
    } catch (e) { return false; }
}
async function fetchEmbedText(url, referer) {
    const headers = pageHeaders(referer || REFERER);
    try {
        const { data, status } = await $fetch.get(url, { headers });
        if ((status === undefined || status === 200) && typeof data === 'string' && data.length > 200) return data;
    } catch (e) {}
    return '';
}
async function postJsonBody(url, obj, headers) {
    const h = { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json', ...(headers || {}) };
    try {
        const { data, status } = await $fetch.post(url, obj, { headers: h });
        if ((status === undefined || status === 200) && data) return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {}
    return null;
}
function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }
function codeOf(u) {
    try { const parts = new URL(u).pathname.split('/').filter(Boolean); return parts[parts.length - 1] || ''; } catch (e) { return ''; }
}
function workerVUrl(embedUrl, durl) { return SEXTB_WORKER ? SEXTB_WORKER + '/v?u=' + encodeURIComponent(embedUrl) + '&r=' + encodeURIComponent(durl) : ''; }
function workerF4Url(embedUrl, durl) { return SEXTB_WORKER ? SEXTB_WORKER + '/f4?u=' + encodeURIComponent(embedUrl) + '&r=' + encodeURIComponent(durl) : ''; }
function isF4HostName(host) { return /f4scdn\.com|f4jav\.xyz/.test(host || ''); }
function isSwHostName(host) { return /hglink\.to|streamhg|trailerhg|earnvid|vidhide|ryderjet/.test(host || ''); }

async function decodeStreamHgLinks(embedUrl, durl) {
    const host = hostOf(embedUrl);
    const code = codeOf(embedUrl);
    if (!code) return {};
    let pageUrl = embedUrl;
    if (/(^|\.)hglink\.to$/.test(host)) pageUrl = 'https://trailerhg.xyz/e/' + code;
    const html = await fetchEmbedText(pageUrl, durl);
    if (!html) return {};
    const unpacked = unpackDeanEdwards(html) || html;
    const links = extractHgLinks(unpacked);
    for (const k of Object.keys(links)) {
        if (links[k].startsWith('/')) { try { links[k] = new URL(links[k], pageUrl).href; } catch (e) {} }
    }
    return links;
}
async function resolveStreamHgInSpider(embedUrl, durl, withProbe) {
    const links = await decodeStreamHgLinks(embedUrl, durl);
    const heads = { 'User-Agent': UA };
    // 2026-11-19：hls2 为真流（签名 master，token 绑取嵌页 IP，设备侧直解直取才通），
    // hls3 现回 404（已死，仅作备选）；hls4 是 TikTok 广告图诱饵，绝不取。
    for (const key of ['hls2', 'hls3']) {
        const u = links[key];
        if (!u || !/^https?:\/\//.test(u)) continue;
        if (withProbe && !(await probePlaylist(u, heads))) continue;
        return { urls: [u], headers: [heads] };
    }
    return null;
}
async function resolvePlaymate(embedUrl) {
    try {
        const u = new URL(embedUrl);
        const code = codeOf(embedUrl);
        if (!code) return null;
        const resp = await postJsonBody(u.origin + '/api/s', { c: code, d: 'web' }, { 'Referer': embedUrl });
        const src = resp && t(resp.sx || resp.src || resp.url);
        if (!src || !/^https?:\/\//.test(src)) return null;
        return { urls: [src], headers: [{ 'User-Agent': UA, 'Referer': embedUrl }] };
    } catch (e) { return null; }
}
async function resolveVidara(embedUrl) {
    try {
        const u = new URL(embedUrl);
        const code = codeOf(embedUrl);
        if (!code) return null;
        const resp = await postJsonBody(u.origin + '/api/stream', { filecode: code, device: 'ios', codecs: ['h265'] }, { 'Referer': embedUrl, 'Origin': u.origin });
        const src = resp && t(resp.streaming_url || resp.src || resp.url);
        if (!src || !/^https?:\/\//.test(src)) return null;
        return { urls: [src], headers: [{ 'User-Agent': UA, 'Referer': embedUrl }] };
    } catch (e) { return null; }
}
async function resolveDood(embedUrl) {
    try {
        const u = new URL(embedUrl);
        const html = await fetchEmbedText(embedUrl, embedUrl);
        if (!html) return null;
        const pm = html.match(/(\/pass_md5\/[A-Za-z0-9_\-\/]+)/);
        if (!pm) return null;
        const passUrl = u.origin + pm[1];
        let prefix = '';
        try {
            const { data } = await $fetch.get(passUrl, { headers: { 'User-Agent': UA, 'Referer': embedUrl } });
            if (typeof data === 'string') prefix = t(data);
        } catch (e) {}
        if (!/^https?:\/\//.test(prefix)) return null;
        const tokM = html.match(/[?&]token=([A-Za-z0-9_\-]+)/) || html.match(/token\s*[:=]\s*["']([A-Za-z0-9_\-]+)["']/);
        const expM = html.match(/expiry\s*[:=]\s*["']?(\d{9,})/);
        let finalUrl = prefix;
        if (tokM) finalUrl += '?token=' + tokM[1] + (expM ? '&expiry=' + expM[1] : '');
        if (await probeBytesOk(finalUrl, { 'User-Agent': UA, 'Referer': embedUrl })) {
            return { urls: [finalUrl], headers: [{ 'User-Agent': UA, 'Referer': embedUrl }] };
        }
        return null;
    } catch (e) { return null; }
}
async function resolveGeneric(embedUrl, durl) {
    const html = await fetchEmbedText(embedUrl, durl);
    if (!html) return null;
    const unpacked = unpackDeanEdwards(html);
    const file = extractGenericFile(unpacked) || extractGenericFile(html);
    if (!file || !/^https?:\/\//.test(file)) return null;
    const heads = { 'User-Agent': UA, 'Referer': embedUrl };
    if (/\.m3u8(\?|$)/i.test(file)) {
        if (await probePlaylist(file, heads)) return { urls: [file], headers: [heads] };
        return null;
    }
    if (await probeBytesOk(file, heads)) return { urls: [file], headers: [heads] };
    return null;
}
async function resolveEmbed(embedUrl, durl) {
    const host = hostOf(embedUrl);
    if (!host) return null;
    if (isF4HostName(host)) return null;
    if (isSwHostName(host)) return resolveStreamHgInSpider(embedUrl, durl, true);
    if (/playmate/.test(host)) return resolvePlaymate(embedUrl);
    if (/shadowbyte|dstyladsg|vidara/.test(host)) return resolveVidara(embedUrl);
    if (/dood|d000d|do7go|playmogo/.test(host)) return resolveDood(embedUrl);
    return resolveGeneric(embedUrl, durl);
}
async function ajaxEmbed(durl, ep, filmId, ptPk) {
    const body = { episode: ep.episode, filmId };
    if (ptPk && ptPk.pt) body.pt = ptPk.pt;
    const resp = await postJsonFast(durl, body);
    if (!resp) return '';
    try {
        const json = JSON.parse(resp);
        if (json.error) return '';
        // 先用本次的 pk 解 player_enc（它是用本次 pk 加密的），再轮换
        // 成 next_pt/next_pk 供下一次调用；顺序反了会解出乱码、拿不到嵌页。
        let playerHtml = '';
        if (json.player_enc && ptPk && ptPk.pk) playerHtml = xorDecrypt(json.player_enc, ptPk.pk);
        if (!playerHtml) playerHtml = t(json.player);
        if (ptPk) {
            if (json.next_pt) ptPk.pt = json.next_pt;
            if (json.next_pk) ptPk.pk = json.next_pk;
        }
        const em = playerHtml.match(/<iframe[^>]+src="(https?:\/\/[^"]+)"/) || playerHtml.match(/<iframe[^>]+src="(\/\/[^"]+)"/);
        if (em) return fixUrl(em[1]);
    } catch (e) {}
    return '';
}
// ---- list/detail ----
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<div class="tray-item(?:\s[^"]*)?">\s*<a\s[^>]*href="(?:https?:\/\/sextb\.(?:net|cc))?(\/[a-z0-9][a-z0-9\-]{3,40})"[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const path = m[1];
        if (seen.has(path)) continue;
        seen.add(path);
        const win = html.slice(m.index, m.index + 2500);
        let title = '';
        const altM = win.match(/<img[^>]+alt="([^"]+)"/);
        if (altM) title = clean(altM[1]);
        let pic = '';
        const dsM = win.match(/data-src="(https?:\/\/[^"]+)"/) || win.match(/data-src="(\/\/[^"]+)"/);
        if (dsM && !dsM[1].includes('default-cover')) pic = fixUrl(dsM[1]);
        if (!pic) {
            const srcM = win.match(/<img[^>]+src="(https?:\/\/[^"]+)"/) || win.match(/<img[^>]+src="(\/\/[^"]+)"/);
            if (srcM && !srcM[1].includes('default-cover')) pic = fixUrl(srcM[1]);
        }
        let code = '';
        const cdM = win.match(/tray-item-code">([^<]+)</);
        if (cdM) code = clean(cdM[1]);
        const durl = fixUrl(path);
        out.push({ vod_id: durl, vod_name: title || code || path.replace(/^\//, ''), vod_pic: pic, vod_remarks: code, ext: { id: durl } });
    }
    return out;
}
function catOf(tid) { return CATS.find(c => c.type_id === tid) || CATS[0]; }
function catUrl(cat, page) {
    if (cat.type_id === 'latest') return page > 1 ? `${SITE}/pg-${page}` : SITE + '/';
    const slug = cat.slug || cat.type_id;
    if (/^https?:\/\//.test(slug)) return slug;
    const base = slug.includes('/') ? `${SITE}/${slug}` : `${SITE}/genre/${slug}`;
    return page > 1 ? `${base}/pg-${page}` : base;
}
function extractPlayerInfo(html) {
    let filmId = '';
    const fm = html.match(/filmId\s*=\s*["']?(\d+)/);
    if (fm) filmId = fm[1];
    const episodes = [];
    const re = /<button[^>]*class="[^"]*btn-player episode[^"]*"[^>]*data-source="(\d+)"[^>]*data-id="(\d+)"[^>]*>(?:<i[^>]*><\/i>)?\s*([A-Z0-9]+)</g;
    let m;
    while ((m = re.exec(html)) !== null) episodes.push({ filmId: m[1], episode: m[2], name: m[3] });
    return { filmId, episodes };
}
function extractDefaultEmbed(html) {
    const m = html.match(/id="sextb-player"[\s\S]{0,500}?<iframe[^>]+src="(https?:\/\/[^"]+)"/) || html.match(/id="sextb-player"[\s\S]{0,500}?<iframe[^>]+src="(\/\/[^"]+)"/);
    return m ? fixUrl(m[1]) : '';
}

async function getConfig() { return jsonify(appConfig); }

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid) || 'latest';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const html = await getHtml(catUrl(catOf(tid), page));
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = /^https?:\/\//.test(id) ? id : fixUrl(id);
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    return jsonify({ list: [{ title: 'SexTB', tracks: [{ name: '正片', pan: '', ext: { id: durl, flag: 'SexTB' } }] }] });
}

// Worker /resolve：在服务端取详情页 + 调 /ajax/player，返回可播地址。
// line 为空 = 默认线（F4）；返回 {ok, url, host, line, sniff?}，sniff 型为嵌页地址、不可直接播。
async function resolveViaWorker(durl, line) {
    try {
        const u = SEXTB_WORKER + '/resolve?u=' + encodeURIComponent(durl) + (line ? '&ep=' + encodeURIComponent(line) : '');
        const { data, status } = await $fetch.get(u, { headers: { 'User-Agent': UA } });
        if (status !== undefined && status !== 200) return null;
        const j = typeof data === 'string' ? JSON.parse(data) : data;
        if (!j || !j.ok || !j.url || !/^https?:\/\//.test(j.url)) return null;
        return j;
    } catch (e) { return null; }
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    const uaHead = [{ 'User-Agent': UA }];
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (/\.m3u8(\?|$)/i.test(id)) return jsonify({ urls: [id], headers: uaHead });
    const durl = /^https?:\/\//.test(id) ? id : fixUrl(id);
    // 1) Worker /resolve：默认线 → SW，探活确是 #EXTM3U 才收；sniff 型嵌页地址不收
    for (const line of ['', 'SW']) {
        const r = await resolveViaWorker(durl, line);
        if (!r || r.sniff) continue;
        if (await probePlaylist(r.url, { 'User-Agent': UA })) {
            return jsonify({ urls: [r.url], headers: uaHead });
        }
    }
    // 2) 蜘蛛侧旧解析兜底（设备侧可能通；VM 侧 sextb 直连被 CF 拦、走不通）
    let html = await getHtml(durl);
    const hasPlayer = (h) => !!h && (h.includes('sextb-player') || h.includes('btn-player'));
    if (html && !hasPlayer(html)) {
        const alt = durl.replace(/sextb\.(cc|net)/i, (m, g) => 'sextb.' + (g.toLowerCase() === 'cc' ? 'net' : 'cc'));
        if (alt !== durl) {
            const h2 = await getHtml(alt);
            if (hasPlayer(h2)) html = h2;
        }
    }
    if (!html) return jsonify({ urls: [], headers: [] });
    const defEmbed = extractDefaultEmbed(html);
    const { filmId, episodes } = extractPlayerInfo(html);
    // /ajax/player 须带本页 __pt（缺了回 E_TOK_LEN），回包是 XOR 加密的 player_enc
    const ptPk = extractPtPk(html);
    const deadline = Date.now() + 30000;
    let firstEmbed = defEmbed || '';
    let swLastResort = '';
    if (defEmbed) {
        const dhost = hostOf(defEmbed);
        if (isF4HostName(dhost)) {
            // Worker /f4 已死（上游 403，/f4 回 502）：先探活，死的不回
            // （回死地址播放器只会转圈），落到后面的线路循环找 SW 等线。
            const w = workerF4Url(defEmbed, durl);
            if (w && await probePlaylist(w, { 'User-Agent': UA })) return jsonify({ urls: [w], headers: uaHead });
        } else if (isSwHostName(dhost)) {
            // Worker /v 已死（上游 403 拦 CF 出口，/v 回 502）：探活失败时
            // 不再直接放弃，改走设备侧直解（嵌页直取 + 解包取 hls2，token 绑
            // 设备本机 IP，设备侧直取才通；VM 侧探活必 403，只看结构）。
            const w = workerVUrl(defEmbed, durl);
            if (w && await probePlaylist(w, { 'User-Agent': UA })) return jsonify({ urls: [w], headers: uaHead });
            const r = await resolveStreamHgInSpider(defEmbed, durl, true);
            if (r) return jsonify(r);
        } else {
            try { const r = await resolveEmbed(defEmbed, durl); if (r && r.urls && r.urls.length) return jsonify(r); } catch (e) {}
        }
    }
    const PREF = { F4: 0, SW: 1, PM: 2, FL: 3, DD: 4, US: 5, ST: 6, PP: 7 };
    const sorted = [...episodes].sort((a, b) => {
        const pa = PREF[t(a.name).toUpperCase()] ?? 90;
        const pb = PREF[t(b.name).toUpperCase()] ?? 90;
        return pa - pb;
    });
    const seenName = new Set();
    let borrowed = 0;
    for (const ep of sorted) {
        if (borrowed >= 2 || Date.now() > deadline) break;
        const nm = t(ep.name).toUpperCase();
        if (seenName.has(nm)) continue;
        seenName.add(nm);
        if (defEmbed && episodes.length && ep.episode === episodes[0].episode) continue;
        if (!filmId) break;
        borrowed++;
        const embed = await ajaxEmbed(durl, ep, filmId, ptPk);
        if (!embed) continue;
        if (!firstEmbed) firstEmbed = embed;
        const host = hostOf(embed);
        try {
            if (isF4HostName(host)) {
                const w = workerF4Url(embed, durl);
                if (w && await probePlaylist(w, { 'User-Agent': UA })) return jsonify({ urls: [w], headers: uaHead });
                continue;
            }
            if (isSwHostName(host)) {
                const w = workerVUrl(embed, durl);
                if (w && await probePlaylist(w, { 'User-Agent': UA })) return jsonify({ urls: [w], headers: uaHead });
                // Worker /v 死时走设备侧直解（探活过的 hls2 才收）；只在直解
                // 也失败时才把 hls2 当最后兜底（不探活，VM 侧探活必 403）。
                if (!swLastResort) {
                    const r = await resolveStreamHgInSpider(embed, durl, true);
                    if (r && r.urls && r.urls.length) return jsonify(r);
                    const links = await decodeStreamHgLinks(embed, durl);
                    if (links.hls2) swLastResort = links.hls2;
                }
                continue;
            }
            const r = await resolveEmbed(embed, durl);
            if (r && r.urls && r.urls.length) return jsonify(r);
        } catch (e) {}
    }
    if (!swLastResort && defEmbed && isSwHostName(hostOf(defEmbed))) {
        const links = await decodeStreamHgLinks(defEmbed, durl);
        if (links.hls2) swLastResort = links.hls2;
    }
    if (swLastResort) return jsonify({ urls: [swLastResort], headers: uaHead });
    return jsonify({ urls: [], headers: [] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/search/' + encodeURIComponent(wd);
    if (page > 1) url += '/pg-' + page;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
