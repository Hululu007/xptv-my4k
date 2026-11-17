// AnySex - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_anysex.js
// 站点 https://anysex.com（KVS 站）；详情页 <source> 直给三至四档 mp4（720p/480p/240p，部分新片另有 1080p，H.264）；
// 播放地址必须带详情页会话 cookie，无 cookie 时新鲜 token 立刻 410，故 detail 登记 cookie、getPlayinfo 带上；
// 顶级分类 7 个（最新/最热/评分最高/4K/全部类别/频道/女优），类别/频道/女优的子筛选在 XPTV 里只用 tabs、默认取首项；
// 字幕不接（欧美站无番号）。
const HOST = 'https://anysex.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;
const SEARCH_SIZE = 50;

// 播放鉴权缓存：播放地址 -> {cookie, referer}（getTracks 登记，getPlayinfo 取用）。
const playAuthCache = new Map();

function cacheAuth(url, cookie, referer) {
    if (!url || !cookie) return;
    playAuthCache.set(url, { cookie, referer });
    if (playAuthCache.size > 200) playAuthCache.delete(playAuthCache.keys().next().value);
}

const CLASSES = [
    { type_id: 'new', type_name: '最新' },
    { type_id: 'popular', type_name: '最热' },
    { type_id: 'toprated', type_name: '评分最高' },
    { type_id: '4k', type_name: '4K' },
    { type_id: 'categories', type_name: '全部类别' },
    { type_id: 'channels', type_name: '频道' },
    { type_id: 'models', type_name: '女优' },
];

// 子筛选默认首项（XPTV 只用 tabs，不展筛选卡片）：类别 step-family、频道 fame-digital、女优 india-summer。
const SUB_DEFAULT = { categories: 'step-family', channels: 'fame-digital', models: 'india-summer' };

function listUrl(tid, sub, page) {
    let base;
    if (tid === 'new') base = HOST + '/videos/new/';
    else if (tid === 'popular') base = HOST + '/videos/most-viewed/';
    else if (tid === 'toprated') base = HOST + '/videos/top-rated/';
    else if (tid === '4k') base = HOST + '/videos/4k/';
    else if (tid === 'categories') base = HOST + '/videos/categories/' + sub + '/';
    else if (tid === 'channels') base = HOST + '/channels/' + sub + '/';
    else if (tid === 'models') base = HOST + '/models/' + sub + '/';
    else base = HOST + '/videos/new/';
    return page > 1 ? base + page + '/' : base;
}

function searchUrl(wd, page) {
    const q = 'q=' + encodeURIComponent(wd);
    return page > 1 ? HOST + '/search/' + page + '/?' + q : HOST + '/search/?' + q;
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

async function getPage(url, referer) {
    try {
        const r = await $fetch.get(url, { headers: headers(referer) });
        const data = r && r.data;
        const html = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
        let cookies = [];
        if (r && r.headers) {
            const sc = r.headers['set-cookie'] || r.headers['Set-Cookie'];
            if (Array.isArray(sc)) cookies = sc;
            else if (typeof r.headers.getSetCookie === 'function') {
                try { cookies = r.headers.getSetCookie(); } catch (e) { /* 忽略 */ }
            }
        }
        return { html, cookies };
    } catch (e) {
        return { html: '', cookies: [] };
    }
}

async function getHtml(url, referer) {
    const p = await getPage(url, referer);
    return p.html;
}

function cookieHeader(cookies) {
    return (cookies || []).map((c) => String(c).split(';')[0].trim()).filter(Boolean).join('; ');
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
    const re = /<a[^>]+href="(https:\/\/anysex\.com\/video\/\d+\/[^"]+\/)"[^>]*class="popfire"[^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
        const href = m[1];
        if (seen.has(href)) continue;
        seen.add(href);
        const tail = html.slice(m.index, m.index + 1800);
        let title = '';
        let pic = '';
        const im = tail.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*alt="([^"]*)"/i)
            || tail.match(/<img[^>]+alt="([^"]*)"[^>]*src="(https?:\/\/[^"]+)"/i);
        if (im) {
            if (/^https?:\/\//i.test(im[1])) { pic = im[1]; title = im[2]; }
            else { title = im[1]; pic = im[2]; }
        }
        if (!title) {
            const tm = tail.match(/<strong class="title">\s*([\s\S]*?)\s*<\/strong>/i);
            if (tm) title = tm[1];
        }
        title = decodeHtml(title);
        const qm = tail.match(/class="is-hd[^"]*">\s*([^<]+?)\s*<\/span>/i);
        const dm = tail.match(/class="duration">\s*([^<]+?)\s*<\/div>/i);
        const remarks = [qm ? t(qm[1]) : '', dm ? t(dm[1]) : ''].filter(Boolean).join(' ');
        out.push({ vod_id: href, vod_name: title || href, vod_pic: pic, vod_remarks: remarks, ext: { id: href } });
    }
    return out;
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'AnySex',
        site: HOST,
        tabs: CLASSES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const tid = String(ext.tid || CLASSES[0].type_id);
    const sub = SUB_DEFAULT[tid] || '';
    const html = await getHtml(listUrl(tid, sub, page));
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = String(ext.id || '');
    const tracks = [];
    if (raw) {
        let url = t(raw);
        if (!/^https?:\/\//i.test(url)) url = absUrl(url);
        const pg = await getPage(url);
        const html = pg.html;
        if (html) {
            const tiers = [];
            const seen = new Set();
            const re = /<source[^>]+src="([^"]+\.mp4[^"]*)"[^>]*title="([^"]+)"[^>]*>/gi;
            let m;
            while ((m = re.exec(html))) {
                const label = t(m[2]);
                if (!label || seen.has(label)) continue;
                seen.add(label);
                tiers.push({ label, url: m[1].replace(/&amp;/g, '&') });
            }
            tiers.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
            const ck = cookieHeader(pg.cookies);
            for (const q of tiers) {
                cacheAuth(q.url, ck, url);
                tracks.push({ name: q.label, pan: '', ext: { url: q.url } });
            }
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    const header = { 'User-Agent': UA, 'Referer': HOST + '/' };
    const hit = playAuthCache.get(url);
    if (hit) {
        if (hit.referer) header.Referer = hit.referer;
        if (hit.cookie) header.Cookie = hit.cookie;
    }
    return jsonify({ urls: [url], headers: [header] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const html = await getHtml(searchUrl(wd, page));
    return jsonify({ list: parseList(html) });
}
