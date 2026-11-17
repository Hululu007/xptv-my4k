// JavCT - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_javct.js
// 站点 javct.net（与 sextb 同模板 family）。列表卡片 <a href="/v/{slug}"
// class="card__play">，标题 card__title，封面懒加载 data-src
// （cdn001.imggle.net/webp/poster/…）；封面不在 card__play 锚点内，而在
// 同 card__cover 块里锚点前 900 字内最后一个 img。分类：素人/有码/无码/
// 字幕 + /categories 索引的真实题材分类。分页真相：站方忽略 ?page=N
// （恒回第 1 页），真实分页是分类 token 路径 + /pg-N（如
// /uncensored-c8lkazew/pg-2；token 各分类不同、跨请求稳定，须从第 1 页
// 分页链接现取；取不到则 page>1 如实返回空，绝不回第 1 页内容充数）。
// 详情 /v/{slug}；h1 = 番号 + 标题。播放：服务器按钮
// <button class="switch-source btn-player episode" data-source="{filmId}"
// data-id="{episode}">F4</button>（默认激活 F4；另有 FL、US；VIP 按钮
// class 含 btn-player-vip，绝不碰）；页内全局 window.__pt / window.__pk
// （每页现值，播时现取）；点击 → POST /ajax/player，body
// {episode, filmId, pt}，头 X-Requested-With: XMLHttpRequest；返回 JSON，
// item.error 则失败，嵌页 = item.player_enc ? xorDecrypt(item.player_enc,
// __pk) : item.player。嵌页按 host 分流：F4（f4scdn/f4jav）→ sextb-hls
// Worker /f4?u={embed}&r={detail}；其他 host → Worker /v?u={embed}&r={detail}。
// 本站给的是服务器选择（F4/FL/US），不是分辨率档，不编造清晰度。站方有
// WAF（VM 直连 403，2026-11-18 复核仍 403）：每次入口先 GET 首页暖会话；
// App 的 req 能否过墙、cookie 是否跨请求保持，待真机验。字幕按 avdb 模式
// （番号只从片名取）。
const HOST = 'https://javct.net';
const WORKER = 'https://sextb-hls.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function H(referer) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer || HOST + '/',
    };
}

async function getText(url, referer) {
    try {
        const r = await $fetch.get(url, { headers: H(referer), timeout: 15000 });
        return r && typeof r.data === 'string' ? r.data : '';
    } catch (e) { return ''; }
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
        .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
        .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function t(v) { return String(v == null ? '' : v).trim(); }

// ---------- base64 解码 + UTF-8（纯 JS，无 Buffer） ----------
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

// xorDecrypt：main.js 原文（2026-10-30 浏览器实测回传，逐字对应）：
// 先 base64 解码，密钥为空则直接返回解码串；否则逐字节与 key 循环异或，
// 再转 utf8 供后续正则取 iframe。
function xorDecrypt(enc, key) {
    if (!enc) return '';
    const bytes = b64ToBytes(enc);
    if (!key) return utf8BytesToStr(bytes);
    const out = [];
    for (let i = 0; i < bytes.length; i++) {
        out.push(bytes[i] ^ key.charCodeAt(i % key.length));
    }
    return utf8BytesToStr(out);
}

function isF4Host(host) { return /f4scdn\.com|f4jav\.xyz/i.test(host || ''); }
function hostOf(url) {
    const m = String(url || '').match(/^https?:\/\/([^\/]+)/i);
    return m ? m[1] : '';
}
function workerUrl(embed, durl) {
    const host = hostOf(embed);
    const path = isF4Host(host) ? '/f4' : '/v';
    return WORKER + path + '?u=' + encodeURIComponent(embed) + '&r=' + encodeURIComponent(durl);
}

function parseCards(html) {
    const items = [];
    const seen = {};
    const re = /<a[^>]*href="(https:\/\/javct\.net\/v\/[a-z0-9\-]+|\/v\/[a-z0-9\-]+)"[^>]*class="[^"]*card__play[^"]*"[^>]*>([\s\S]{0,1500}?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        let href = m[1];
        if (!/^https?:\/\//i.test(href)) href = HOST + href;
        if (seen[href]) continue;
        seen[href] = 1;
        // 封面不在 card__play 锚点内（锚点里只有一个播放图标），而是同
        // card__cover 块里锚点前面的 <img class="lazy" data-src="imggle webp">；
        // 取锚点前 900 字内最后一个 img。
        let pic = '';
        const before = html.slice(Math.max(0, m.index - 900), m.index);
        const imgs = before.match(/<img[^>]*>/gi) || [];
        const im = imgs.length ? imgs[imgs.length - 1] : null;
        if (im) {
            const dm = im.match(/data-src="([^"]+)"/i);
            const sm = im.match(/src="([^"]+)"/i);
            const cand = (dm && dm[1]) || (sm && sm[1]) || '';
            if (cand && !/default-cover/i.test(cand) && !/data:image/i.test(cand)) {
                pic = /^https?:\/\//i.test(cand) ? cand : HOST + (cand.charAt(0) === '/' ? cand : '/' + cand);
            }
        }
        items.push({ vod_id: href, vod_name: '', vod_pic: pic, vod_remarks: '', ext: { id: href } });
        if (items.length >= 60) break;
    }
    // 标题与番号：card__title 块与卡片一一对应，按顺序补
    const titles = [];
    const titleRe = /class="[^"]*card__title[^"]*"[^>]*>([\s\S]{0,500}?)<\/[^>]+>/gi;
    let tm;
    while ((tm = titleRe.exec(html)) !== null) titles.push(stripTags(tm[1]));
    const codes = [];
    const codeRe = /<a[^>]*href="https:\/\/javct\.net\/v\/[a-z0-9\-]+"[^>]*>([A-Z0-9\-]{4,})<\/a>/gi;
    let cm;
    while ((cm = codeRe.exec(html)) !== null) codes.push(cm[1]);
    items.forEach(function (it, i) {
        if (titles[i]) it.vod_name = titles[i];
        if (codes[i]) it.vod_remarks = codes[i];
        if (!it.vod_name) it.vod_name = it.vod_remarks || 'JavCT';
    });
    return items.filter(function (it) { return it.vod_name && it.vod_name.length >= 2; });
}

// 站方有 WAF（VM 直连 403）：先 GET 首页暖会话再抓详情/ajax。
async function warmSession() {
    await getText(HOST + '/', HOST + '/');
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'JavCT',
        site: HOST,
        tabs: CATS.map(function (c) { return { name: c.type_name, ext: { id: c.type_id } }; }),
    });
}

// 分页真相：站方忽略 ?page=N（恒回第 1 页）；真实分页是分类 token 路径 +
// /pg-N（token 各分类不同、跨请求稳定，须从第 1 页分页链接现取；取不到
// 则 page>1 如实返回空，绝不回第 1 页内容充数）。
function pagePrefix(html) {
    const m = String(html || '').match(/href=["']([^"']*?)\/pg-\d+["']/i);
    if (!m) return null;
    let p = m[1];
    if (!/^https?:\/\//i.test(p)) p = HOST + (p.charAt(0) === '/' ? p : '/' + p);
    return p.replace(/\/+$/, '');
}

async function getCards(ext) {
    ext = argsify(ext);
    let tid = String(ext.id || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!tid) tid = '/amateur';
    const base = (/^https?:\/\//i.test(tid) ? tid : HOST + '/' + tid.replace(/^\/+/, '')).replace(/\/+$/, '');
    await warmSession();
    if (page === 1) {
        const html = await getText(base, HOST + '/');
        return jsonify({ list: parseCards(html) });
    }
    const firstHtml = await getText(base, HOST + '/');
    const prefix = pagePrefix(firstHtml);
    if (!prefix) return jsonify({ list: [] });
    const html = await getText(prefix + '/pg-' + page, HOST + '/');
    return jsonify({ list: parseCards(html) });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = String(ext.text || '').trim();
    if (!kw) return jsonify({ list: [] });
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const base = HOST + '/search/' + encodeURIComponent(kw);
    const url = page === 1 ? base : base + '?page=' + page;
    await warmSession();
    const html = await getText(url, HOST + '/');
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let durl = String(ext.id || '');
    if (!durl) return jsonify({ list: [] });
    if (!/^https?:\/\//i.test(durl)) durl = HOST + (durl.charAt(0) === '/' ? durl : '/' + durl);
    await warmSession();
    const html = await getText(durl, HOST + '/');
    if (!html) return jsonify({ list: [] });
    // og:title 优先，其次 section__title，再次任意 h1，且跳过错误页标题
    const cands = [];
    const ogt = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogt) cands.push(ogt[1]);
    const sht = html.match(/<h1[^>]*class="[^"]*section__title[^"]*"[^>]*>([\s\S]{0,400}?)<\/h1>/i);
    if (sht) cands.push(sht[1]);
    const h1t = html.match(/<h1[^>]*>([\s\S]{0,400}?)<\/h1>/i);
    if (h1t) cands.push(h1t[1]);
    let title = 'JavCT';
    for (let i = 0; i < cands.length; i++) {
        const tt = stripTags(cands[i]);
        if (tt && !/^(403|404|500|Forbidden|Not Found)/i.test(tt)) { title = tt; break; }
    }
    let pic = '';
    const ogm = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogm) pic = ogm[1];
    if (!pic) {
        const im = html.match(/https:\/\/cdn001\.imggle\.net\/[^"'\s<>]+/i);
        if (im) pic = im[0];
    }
    const filmM = html.match(/filmId\s*=\s*["']?(\d+)/i) || html.match(/data-source="(\d+)"/i);
    const filmId = filmM ? filmM[1] : '';
    const ptM = html.match(/window\.__pt\s*=\s*"([^"]+)"/i);
    const pkM = html.match(/window\.__pk\s*=\s*"([^"]+)"/i);
    const pt = ptM ? ptM[1] : '';
    const pk = pkM ? pkM[1] : '';
    const tracks = [];
    const btnRe = /<button[^>]*class="[^"]*btn-player[^"]*"[^>]*>([\s\S]{0,80}?)<\/button>/gi;
    let bm;
    while ((bm = btnRe.exec(html)) !== null) {
        const tag = bm[0];
        if (/btn-player-vip/i.test(tag)) continue; // VIP 绝不碰
        const dm = tag.match(/data-id="(\d+)"/i);
        const sm = tag.match(/data-source="(\d+)"/i);
        const name = stripTags(bm[1]) || '播放';
        const episode = dm ? dm[1] : '';
        const fsrc = sm ? sm[1] : filmId;
        if (!episode || !fsrc) continue;
        tracks.push({
            name: name, pan: '',
            ext: { url: 'javct:' + fsrc + '|' + episode + '|' + pt + '|' + pk, name: title, durl: durl },
        });
    }
    if (!tracks.length) {
        // 无服务器线时回落详情页（播放器自行解析，同 sextb XPTV 的降级做法）
        tracks.push({ name: '网页播放', pan: '', ext: { url: durl, name: title, durl: durl } });
    }
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.url || '');
    const durl = String(ext.durl || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    // 直链（m3u8/mp4）：原样直出，带字幕；详情页回落：原样直出，不搜字幕
    if (/\.m3u8(\?|$)/i.test(id) || /\.mp4(\?|$)/i.test(id)) {
        const result = { urls: [id], headers: [{ 'User-Agent': UA, 'Referer': durl || HOST + '/' }] };
        const name0 = String(ext.name || '');
        if (name0) {
            try {
                const subs = await subSearch(name0);
                if (subs && subs.length) result.subs = subs;
            } catch (e) {}
        }
        return jsonify(result);
    }
    if (/^https?:\/\//i.test(id)) {
        return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': durl || HOST + '/' }] });
    }
    // 服务器线：javct:filmId|episode|pt|pk → POST /ajax/player
    const parts = id.replace(/^javct:/, '').split('|');
    if (parts.length < 4 || !durl) return jsonify({ urls: [], headers: [] });
    const filmId = parts[0], episode = parts[1], pt = parts[2], pk = parts[3];
    const originM = durl.match(/^(https?:\/\/[^\/]+)/i);
    if (!originM) return jsonify({ urls: [], headers: [] });
    const ajaxUrl = originM[1] + '/ajax/player';
    const body = 'episode=' + encodeURIComponent(episode) + '&filmId=' + encodeURIComponent(filmId) + '&pt=' + encodeURIComponent(pt);
    let json = null;
    try {
        const r = await $fetch.post(ajaxUrl, body, {
            headers: {
                'User-Agent': UA,
                'Referer': durl,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest',
            },
        });
        const status = r && typeof r.status === 'number' ? r.status : 200;
        if ((status === 200 || status === undefined) && r && r.data != null) {
            json = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        }
    } catch (e) { json = null; }
    if (!json || json.error) return jsonify({ urls: [], headers: [] });
    let playerHtml = '';
    if (json.player_enc) playerHtml = xorDecrypt(json.player_enc, pk || '');
    else if (json.player) playerHtml = String(json.player);
    if (!playerHtml) return jsonify({ urls: [], headers: [] });
    const result = { urls: [], headers: [{ 'User-Agent': UA, 'Referer': durl }] };
    const em = playerHtml.match(/<iframe[^>]+src="(https?:\/\/[^"]+)"/i)
        || playerHtml.match(/<iframe[^>]+src="(\/\/[^"]+)"/i);
    if (em) {
        let embed = em[1];
        if (embed.indexOf('//') === 0) embed = 'https:' + embed;
        result.urls = [workerUrl(embed, durl)];
    } else {
        const mm = playerHtml.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/i);
        if (mm) result.urls = [mm[0]];
    }
    if (!result.urls.length) return jsonify({ urls: [], headers: [] });
    const name = String(ext.name || '');
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}
const CATS = [
  { type_id: '/uncensored', type_name: '无码' },
  { type_id: '/subtitle', type_name: '字幕' },
  { type_id: '/censored', type_name: '有码' },
  { type_id: '/category/big-tits', type_name: '巨乳' },
  { type_id: '/category/big-asses', type_name: '大屁股' },
  { type_id: '/category/beautiful-girl', type_name: '美少女' },
  { type_id: '/category/cosplay', type_name: '角色扮演' },
  { type_id: '/category/married-woman', type_name: '人妻' },
  { type_id: '/category/mature-woman', type_name: '熟女' },
  { type_id: '/category/milf', type_name: '熟妇' },
  { type_id: '/category/school-girls', type_name: '校园' },
  { type_id: '/category/creampie', type_name: '中出' },
  { type_id: '/category/blowjob', type_name: '口交' },
  { type_id: '/category/drama', type_name: '剧情' },
  { type_id: '/category/lesbian', type_name: '女同' },
  { type_id: '/category/massage', type_name: '按摩' },
  { type_id: '/category/office-lady', type_name: 'OL' },
  { type_id: '/category/outdoor', type_name: '野外' },
  { type_id: '/category/anal', type_name: '肛交' },
  { type_id: '/category/bondage', type_name: '捆绑' },
  { type_id: '/category/orgy', type_name: '群交' },
  { type_id: '/amateur', type_name: '素人' },
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

