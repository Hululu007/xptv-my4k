// 4KPorno - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_4kporno.js
// 站点 https://www.4kporno.xxx（KVS 站）；详情页 <source> 直给三档 mp4（2160p/720p/480p，H.264）；
// get_file 地址 302 到 fpvcdn 签名地址，签名绑请求方 IP；点播时重拉详情页现取新鲜 <source>
// 地址 + 详情页会话 cookie（PHPSESSID 等）交给播放器，不用详情时 mint 的老 token；
// 顶级分类 4 个（最新/最热/评分最高/全部类别），361 个真实分类在 XPTV 里只用 tabs、默认取首项；
// 字幕不接（欧美站无番号）。
// 2026-11-19 取数加 site-fetch Worker 腿兜底（直连→Worker）：VM 侧全通但设备侧无轨，
// 详情页取数失败是无轨根因。注意 VM 侧 harness 播单验真会报 403 Wrong IP——那是 VM
// 出口 IPv6 每连接轮换、fpvcdn 跟随跳转时 IP 对不上所致，设备侧 IP 稳定不受影响；
// get_file 直取（node/curl）实测 302 到 fpvcdn mp4，链路本身是通的。
const HOST = 'https://www.4kporno.xxx';
const SITE_FETCH = 'https://site-fetch.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;
const SEARCH_SIZE = 24;

const CLASSES = [
    { type_id: 'latest', type_name: '最新' },
    { type_id: 'popular', type_name: '最热' },
    { type_id: 'top', type_name: '评分最高' },
    { type_id: 'categories', type_name: '全部类别' },
];

// 全部类别默认首项 18-years-old（361 分类在 XPTV 里只用 tabs，不展筛选卡片）。
const SUB_DEFAULT = '18-years-old';

function listUrl(eff, page) {
    let base;
    if (eff === 'latest') base = HOST + '/zh/latest-updates/';
    else if (eff === 'popular') base = HOST + '/zh/most-popular/';
    else if (eff === 'top') base = HOST + '/zh/top-rated/';
    else base = HOST + '/zh/categories/' + eff + '/';
    return page > 1 ? base + page + '/' : base;
}

function searchUrl(wd, page) {
    const base = HOST + '/zh/search/' + encodeURIComponent(wd) + '/';
    return page > 1 ? base + page + '/' : base;
}

function t(v) {
    return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
    return t(s)
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return m; } })
        .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return m; } });
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return HOST + u;
    return HOST + '/' + u;
}

function headers(referer) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer || HOST + '/',
    };
}

// 取页：直连优先（列表在设备上直连是通的；详情 <source> 的 token 绑
// 请求方 IP，直连才能给设备铸出可用 token）→ 直连空/失败时走自家
// site-fetch Worker 腿兜底（白名单含 www.4kporno.xxx）。注意：经 Worker
// 取到的 <source> token 绑 Worker IP，getPlayinfo 点播时仍会直连重取，
// 所以这里的 Worker 腿只用来“拿到详情页、解析出档位”，不影响播放。
async function getHtml(url, referer) {
    const asText = (d) => (typeof d === 'string' ? d : (d ? JSON.stringify(d) : ''));
    try {
        const r = await $fetch.get(url, { headers: headers(referer) });
        const t = asText(r && r.data);
        if (t && t.length > 2000) return t;
    } catch (e) {}
    try {
        const r = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), { headers: headers(referer), timeout: 15000 });
        const t = asText(r && r.data);
        if (t && t.length > 2000) return t;
    } catch (e) {}
    // 2026-11-19：再加 jina 腿兜底（设备侧直连+Worker 都失败时，jina 常能拿到详情页）
    try {
        const r = await $fetch.get('https://r.jina.ai/' + url, { headers: Object.assign(headers(referer), { 'x-respond-with': 'html' }), timeout: 20000 });
        const t = asText(r && r.data);
        if (t && t.length > 2000) return t;
    } catch (e) {}
    return '';
}

// 取页 + set-cookie（详情页会话：PHPSESSID 等；播放地址须带同会话 cookie，
// 否则站方可能 410/403）。$fetch 回的 headers 可能是数组、getSetCookie 函数
// 或逗号合并串，三种都兼容；解析失败时 cookie 留空、不阻塞播放。
async function getPage(url, referer) {
    try {
        const r = await $fetch.get(url, { headers: headers(referer) });
        const data = r && r.data;
        const html = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
        if (html && html.length > 2000) {
            let cookies = [];
            if (r && r.headers) {
                const sc = r.headers['set-cookie'] || r.headers['Set-Cookie'];
                if (Array.isArray(sc)) cookies = sc;
                else if (typeof sc === 'string' && sc) cookies = [sc];
                else if (typeof r.headers.getSetCookie === 'function') {
                    try { cookies = r.headers.getSetCookie(); } catch (e) {}
                }
            }
            return { html, cookies };
        }
    } catch (e) {}
    // 直连拿不到详情页时走 site-fetch 腿兜底（无 cookie 也能播，见验证：
    // get_file 直取不带 cookie 也 302 到 fpvcdn；token 由本次重取现铸）。
    try {
        const r = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), { headers: headers(referer), timeout: 15000 });
        const data = r && r.data;
        const html = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
        if (html && html.length > 2000) return { html, cookies: [] };
    } catch (e) {}
    return { html: '', cookies: [] };
}

function cookieHeader(cookies) {
    const parts = [];
    for (const c of (cookies || [])) {
        // 合并串按逗号切（Expires 里的逗号切出的段无 '=' 会被滤掉），
        // 每段只取第一个 ';' 之前的名值对。
        for (const seg of String(c).split(',')) {
            const nv = seg.split(';')[0].trim();
            if (nv && nv.indexOf('=') > 0) parts.push(nv);
        }
    }
    const seen = new Set();
    return parts.filter((p) => {
        const k = p.split('=')[0];
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    }).join('; ');
}

// 详情页 <source> 三档：有几档出几档，绝不硬编
// 2026-11-19：src/label 的引号双/单都认（设备侧回的 HTML 引号风格可能与 VM 不同，旧正则只认 src 单引号+label 双引号）
function parseSources(html) {
    const quals = [];
    const seen = new Set();
    if (!html) return quals;
    const re = /<source[^>]+src=(["'])([^"']+\.mp4[^"']*)\1[^>]*label=(["'])([^"']+)\3[^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
        const label = t(m[4]);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        quals.push({ label, url: m[2].replace(/&amp;/g, '&') });
    }
    quals.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
    return quals;
}

function pagecountFromHtml(html, page, list, pageSize) {
    let max = 0;
    const pi = html.indexOf('pagination');
    if (pi >= 0) {
        const blk = html.slice(pi, pi + 6000);
        const end = blk.indexOf('</ul>');
        const seg = end >= 0 ? blk.slice(0, end) : blk;
        const re = /<a[^>]*>\s*(\d+)\s*<\/a>/g;
        let m;
        while ((m = re.exec(seg))) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
        const re2 = /href="[^"]*\/(\d+)\/"/g;
        while ((m = re2.exec(seg))) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
    }
    if (max >= page) return max;
    return list.length < pageSize ? page : page + 1;
}

function parseList(html) {
    const out = [];
    const seen = new Set();
    if (!html) return out;
    const re = /<a[^>]+href="(https:\/\/www\.4kporno\.xxx\/zh\/videos\/\d+\/[^"]+\/)"[^>]*title="([^"]+)"[^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
        const href = m[1];
        if (seen.has(href)) continue;
        seen.add(href);
        const title = decodeHtml(m[2]);
        const tail = html.slice(m.index, m.index + 2500);
        let pic = '';
        const dm = tail.match(/data-src="(https?:\/\/[^"]+)"/i);
        if (dm) pic = dm[1];
        else {
            const sm = tail.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
            if (sm && sm[1].indexOf('data:image') !== 0) pic = sm[1];
        }
        let remarks = '';
        const um = tail.match(/<span class="duration">\s*([^<]+?)\s*<\/span>/i);
        if (um) remarks = t(um[1]).replace(/^完整视频\s*/, '');
        out.push({ vod_id: href, vod_name: title || href, vod_pic: pic, vod_remarks: remarks, ext: { id: href } });
    }
    return out;
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: '4KPorno',
        site: HOST,
        tabs: CLASSES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const tid = String(ext.tid || CLASSES[0].type_id);
    const eff = tid === 'categories' ? SUB_DEFAULT : tid;
    const html = await getHtml(listUrl(eff, page));
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = String(ext.id || '');
    const tracks = [];
    if (raw) {
        let url = t(raw);
        if (!/^https?:\/\//i.test(url)) url = absUrl(url);
        const html = await getHtml(url);
        const quals = parseSources(html);
        for (const q of quals) tracks.push({ name: q.label, pan: '', ext: { url: q.url, durl: url, label: q.label } });
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    const durl = String(ext.durl || '');
    const label = String(ext.label || '');
    // 点播时重拉详情页现取新鲜 <source> 地址 + 当次会话 cookie：<source> 里
    // 的 token 只在当次详情会话有效，详情时的老 token 到点播时可能已失效，
    // 播放器拿老地址请求 get_file 会 403 Wrong IP。
    if (durl) {
        try {
            const pg = await getPage(durl, durl);
            if (pg.html) {
                const quals = parseSources(pg.html);
                let pick = null;
                if (label) pick = quals.find((q) => q.label === label) || null;
                if (!pick && quals.length) pick = quals[0];
                if (pick) {
                    const hdrs = { 'User-Agent': UA, 'Referer': durl };
                    const ck = cookieHeader(pg.cookies);
                    if (ck) hdrs.Cookie = ck;
                    return jsonify({ urls: [pick.url], headers: [hdrs] });
                }
            }
        } catch (e) {}
    }
    // 重取失败：回落详情时的老地址（仍是真流地址，不是页面）
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const html = await getHtml(searchUrl(wd, page));
    return jsonify({ list: parseList(html) });
}
