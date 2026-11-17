// 黑料不打烊 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/hlbdy.js
// 入口 hlbdy1.com 只是跳转落地页，文章站走镜像域（线路一至五），按顺序取首个
// 能出文章的镜像域并缓存。封面 pic.*.cn 为加密密文，走 51chigua 解密代理出图。
// 详情视频为 DPlayer 配置或直链；m3u8 出双集（javsb-relay 中转 + 直连）。
// 无番号，不接字幕芯。
const HOSTS = [
    'https://hl365.com/',
    'https://attend.oqzbuzeo.cc/',
    'https://assault.oqzbuzeo.cc/',
    'https://carrier.oqzbuzeo.cc/',
    'https://di59h5e63i08h.cloudfront.net/',
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IMG_PROXY = 'https://51chigua.li768435813.workers.dev/img?url=';
const RELAY_M3U8 = 'https://javsb-relay.li768435813.workers.dev/m3u8?u=';

let ACTIVE_HOST = '';

function H(host) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': host,
    };
}

function sleep(ms) {
    return new Promise(function (r) {
        if (typeof setTimeout === 'function') setTimeout(r, ms); else r();
    });
}

function proxyCover(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (url.indexOf('51chigua.li768435813.workers.dev') >= 0) return url;
    if (/pic\.[a-z0-9]+\.cn/i.test(url)) return IMG_PROXY + encodeURIComponent(url);
    return url;
}

// 站方有抖动/限流，空结果加一次重试（间隔约 2 秒），不要多轮轰炸。
async function getText(url, host) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const r = await $fetch.get(url, { headers: H(host), timeout: 15000 });
            const d = r ? r.data : null;
            const text = typeof d === 'string' ? d : (d == null ? '' : JSON.stringify(d));
            if (text) return text;
        } catch (e) {}
        if (attempt === 0) await sleep(2000);
    }
    return '';
}

// 五路并行取首个能出文章的镜像域（按 HOSTS 顺序优先），会话内缓存。
async function pickHost() {
    if (ACTIVE_HOST) return ACTIVE_HOST;
    const results = await Promise.all(HOSTS.map(function (h) {
        return getText(h, h).then(function (html) {
            return (html && html.indexOf('/archives/') >= 0) ? h : '';
        }).catch(function () { return ''; });
    }));
    let found = '';
    for (let i = 0; i < results.length; i++) {
        if (results[i]) { found = results[i]; break; }
    }
    ACTIVE_HOST = found || HOSTS[0];
    return ACTIVE_HOST;
}

function absUrl(href, host) {
    href = String(href || '').trim();
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    const base = host.replace(/\/$/, '');
    if (href.charAt(0) === '/') return base + href;
    return base + '/' + href;
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function imgOf(block) {
    const clean = block.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let m = clean.match(/z-image-loader-url\s*=\s*"([^"]+)"/i);
    if (m && /^https?:\/\//i.test(m[1])) return m[1];
    const imgs = clean.match(/<img[^>]*>/gi);
    if (imgs) {
        for (let i = 0; i < imgs.length; i++) {
            const sm = imgs[i].match(/(?:data-src|data-original|src)\s*=\s*"([^"]+)"/i);
            if (sm && /^https?:\/\//i.test(sm[1]) && !/data:image/i.test(sm[1])) return sm[1];
        }
    }
    m = clean.match(/background-image\s*:\s*url\(\s*['"]?(https?:[^'")]+)['"]?\s*\)/i);
    if (m) return m[1];
    m = clean.match(/url\(\s*['"]?(https?:[^'")]+)['"]?\s*\)/i);
    if (m) return m[1];
    m = clean.match(/data-(?:cover|image|thumb|poster)\s*=\s*"([^"]+)"/i);
    if (m && /^https?:\/\//i.test(m[1])) return m[1];
    m = clean.match(/https?:\/\/[^"'\s)]+\.(?:jpg|png|jpeg|webp)/i);
    if (m) return m[0];
    return '';
}

function parseArticles(html, host) {
    const items = [];
    const seen = {};
    const push = function (href, title, pic, remarks) {
        if (!href || !title || seen[href]) return;
        seen[href] = true;
        items.push({ vod_id: href, vod_name: title, vod_pic: pic || '', vod_remarks: remarks || '', ext: { id: href } });
    };
    const re = /<article[\s\S]{0,8000}?<\/article>/gi;
    let m;
    const hostBase = host.replace(/\/$/, '');
    while ((m = re.exec(html)) !== null) {
        const blk = m[0];
        const linkRe = /<a[^>]*href="([^"]+)"[^>]*>/gi;
        let lm;
        let href = '';
        while ((lm = linkRe.exec(blk)) !== null) {
            if (lm[1].indexOf('/archives/') >= 0) { href = lm[1]; break; }
        }
        if (!href) continue;
        const url = absUrl(href, host);
        if (!url || (url.indexOf(hostBase) !== 0 && url.indexOf('/archives/') < 0)) continue;
        const hm = blk.match(/<h2[^>]*>([\s\S]{0,300}?)<\/h2>/i);
        const title = hm ? stripTags(hm[1]) : '';
        if (!title || title.length < 2) continue;
        const dm = blk.match(/(\d{4}\/\d{1,2}\/\d{1,2}|\d{4} 年 \d{1,2} 月 \d{1,2} 日)/);
        push(url, title, proxyCover(imgOf(blk)), dm ? dm[1] : '');
        if (items.length >= 60) break;
    }
    if (!items.length) {
        const are = /<a[^>]*href="([^"]*\/archives\/[^"]+\.html)"[^>]*>([\s\S]{0,400}?)<\/a>/gi;
        while ((m = are.exec(html)) !== null) {
            const url = absUrl(m[1], host);
            const title = stripTags(m[2]);
            if (!url || !title || title.length < 2) continue;
            push(url, title, '', '');
            if (items.length >= 60) break;
        }
    }
    return items;
}

function parseCategories(html) {
    const items = [];
    const seen = {};
    const re = /<a[^>]*href="(?:https?:\/\/[^"\/]+)?\/category\/([a-z0-9]+)\/"[^>]*>([^<]{2,20})<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const slug = m[1];
        const name = m[2].trim();
        if (!name || seen[slug]) continue;
        seen[slug] = true;
        items.push({ name: name, ext: { id: '/category/' + slug + '/' } });
    }
    if (items.length < 5) {
        const fallback = [
            { name: '今日看料', ext: { id: '/category/24hcg/' } },
            { name: '每日大赛', ext: { id: '/category/mrds/' } },
            { name: '热门吃瓜', ext: { id: '/category/rgtj/' } },
            { name: '网红吃瓜', ext: { id: '/category/whhl/' } },
            { name: '明星吃瓜', ext: { id: '/category/mxbg/' } },
        ];
        for (let i = 0; i < fallback.length; i++) {
            let dup = false;
            for (let j = 0; j < items.length; j++) {
                if (items[j].ext.id === fallback[i].ext.id) { dup = true; break; }
            }
            if (!dup) items.push(fallback[i]);
        }
    }
    return items;
}

function extractVideo(html) {
    const clean = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let m = clean.match(/<video[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
    m = clean.match(/<source[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
    if (m) return m[1];
    m = clean.match(/data-config='([^']+)'/i) || clean.match(/data-config="([^"]+)"/i);
    if (m) {
        try {
            const cfg = JSON.parse(m[1]);
            const vu = (typeof cfg.video === 'string') ? cfg.video : ((cfg.video && cfg.video.url) || '');
            if (vu) return vu;
        } catch (e) {}
    }
    m = clean.match(/["']?url["']?\s*:\s*["'](https?:[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
    if (m) return m[1];
    const urls = [];
    const ure = /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/gi;
    let um;
    while ((um = ure.exec(clean)) !== null) urls.push(um[0]);
    for (let i = 0; i < urls.length; i++) {
        if (/\.m3u8/i.test(urls[i])) return urls[i];
    }
    if (urls.length) return urls[0];
    m = clean.match(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i);
    if (m) return m[1];
    return '';
}

async function getConfig() {
    try {
        const host = await pickHost();
        const html = await getText(host, host);
        const cats = parseCategories(html);
        if (cats.length) {
            return jsonify({
                ver: 1,
                title: '黑料不打烊',
                site: host,
                tabs: [{ name: '最新', ext: { id: '' } }].concat(cats),
            });
        }
    } catch (e) {}
    return jsonify({
        ver: 1,
        title: '黑料不打烊',
        site: HOSTS[0],
        tabs: [
            { name: '最新', ext: { id: '' } },
            { name: '今日看料', ext: { id: '/category/24hcg/' } },
            { name: '每日大赛', ext: { id: '/category/mrds/' } },
            { name: '热门吃瓜', ext: { id: '/category/rgtj/' } },
            { name: '网红吃瓜', ext: { id: '/category/whhl/' } },
            { name: '明星吃瓜', ext: { id: '/category/mxbg/' } },
        ],
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const host = await pickHost();
    const tid = String(ext.id || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let base;
    if (/^https?:\/\//i.test(tid)) base = tid.replace(/\/+$/, '');
    else base = (host.replace(/\/$/, '') + '/' + tid.replace(/^\/+/, '')).replace(/\/+$/, '');
    const url = page === 1 ? (base + '/') : (base + '/' + page + '/');
    const html = await getText(url, host);
    const list = parseArticles(html, host);
    return jsonify({ list: list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const host = await pickHost();
    const raw = String(ext.id || '');
    if (!raw) return jsonify({ list: [] });
    const url = /^https?:\/\//i.test(raw) ? raw : host.replace(/\/$/, '') + (raw.charAt(0) === '/' ? raw : '/' + raw);
    const html = await getText(url, host);
    const vu = extractVideo(html);
    if (!vu) return jsonify({ list: [] });
    const tracks = [];
    if (/\.m3u8/i.test(vu)) {
        tracks.push({ name: '中转', pan: '', ext: { url: RELAY_M3U8 + encodeURIComponent(vu) } });
    }
    tracks.push({ name: '直连', pan: '', ext: { url: vu } });
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '').trim();
    if (!url || !/\.(m3u8|mp4)/i.test(url)) return jsonify({ urls: [], headers: [] });
    const host = ACTIVE_HOST || HOSTS[0];
    return jsonify({ urls: [url], headers: [H(host)] });
}

async function search(ext) {
    ext = argsify(ext);
    const host = await pickHost();
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const base = host + 'search/' + encodeURIComponent(wd);
    const url = page === 1 ? (base + '/') : (base + '/' + page + '/');
    const html = await getText(url, host);
    const list = parseArticles(html, host);
    return jsonify({ list: list });
}
