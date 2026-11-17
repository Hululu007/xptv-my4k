// 91大赛 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/dycg66.js
// 站点 https://www.dycg66.com/（Typecho Xc 主题）；封面 pic.hdhwqx.cn 须走 51chigua 解密代理；
// 详情 dplayer data-config 里 video.url 即 m3u8 直链（带时效 token，详情时现取）；
// 双线路：中转集（javsb-relay 只改写非直连 host 的分片/密钥）+ 直连集，两条都列为 tracks；无字幕。
const HOST = 'https://www.dycg66.com/';
const PROXY = 'https://51chigua.li768435813.workers.dev/img?url=';
const RELAY_M3U8 = 'https://javsb-relay.li768435813.workers.dev/m3u8?u=';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TABS = [
    { type_id: 'jrds/', type_name: '今日大赛' },
    { type_id: 'rsds/', type_name: '热搜大赛' },
    { type_id: 'mrds/', type_name: '每日大赛' },
    { type_id: 'aidj/', type_name: 'AI短剧' },
    { type_id: 'nsds/', type_name: '女神大赛' },
    { type_id: 'llds/', type_name: '乱伦大赛' },
    { type_id: 'xyds/', type_name: '学院大赛' },
    { type_id: 'whds/', type_name: '网红大赛' },
    { type_id: 'lyds/', type_name: '撸友看片' },
    { type_id: 'sjbzq/', type_name: '优选投放区' },
    { type_id: 'qwds/', type_name: '奇闻大赛' },
    { type_id: 'mxds/', type_name: '明星吃瓜' },
    { type_id: 'ntds/', type_name: '女同大赛' },
    { type_id: 'wmds/', type_name: '污漫大赛' },
];

function H(referer) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer || HOST,
    };
}

async function getText(url, referer) {
    try {
        const res = await $fetch.get(url, { headers: H(referer) });
        const data = (res && res.data !== undefined) ? res.data : res;
        return String(data || '');
    } catch (e) { return ''; }
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function proxyPic(pic) {
    if (!pic) return '';
    if (pic.startsWith('http')) return PROXY + encodeURIComponent(pic);
    return pic;
}

function parseList(html) {
    const items = [];
    const seen = new Set();
    const chunks = String(html).split('<li class="Xc_home_article-si');
    for (let i = 1; i < chunks.length; i++) {
        const blk = chunks[i];
        const am = blk.match(/<a href="([^"]*\/archives\/\d+\/)"[^>]*title="([^"]*)"/i)
            || blk.match(/<a href="([^"]*\/archives\/\d+\/)"/i);
        if (!am) continue;
        const href = am[1];
        const url = href.startsWith('http') ? href : HOST.replace(/\/$/, '') + href;
        if (seen.has(url)) continue;
        const hm = blk.match(/<h2 class="title">([^<]+)<\/h2>/i);
        const title = stripTags(hm ? hm[1] : (am[2] || ''));
        if (!title || title.length < 2) continue;
        const pm = blk.match(/data-src="(https?:[^"]+)"/i);
        seen.add(url);
        items.push({ vod_id: url, vod_name: title, vod_pic: proxyPic(pm ? pm[1] : ''), ext: { id: url } });
        if (items.length >= 20) break;
    }
    return items;
}

function parseDetail(html, rawId) {
    const hm = html.match(/<h1[^>]*>([\s\S]{0,400}?)<\/h1>/i);
    const title = hm ? stripTags(hm[1]) : '91大赛';
    const eps = [];
    const divs = [...html.matchAll(/<div class="dplayer"([^>]*)>/gi)];
    for (const d of divs) {
        const attrs = d[1];
        const cm = attrs.match(/data-config="([^"]*)"/i);
        let url = '';
        if (cm) {
            const cfgText = cm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            try {
                const cfg = JSON.parse(cfgText);
                if (cfg && cfg.video && cfg.video.url) url = cfg.video.url;
            } catch (e) {}
            if (!url) {
                const um = cfgText.match(/"url"\s*:\s*"(https?:[^"]+\.m3u8[^"]*)"/i);
                if (um) url = um[1];
            }
        }
        if (!url) continue;
        url = url.replace(/\\u0026/g, '&');
        eps.push({ name: '第' + (eps.length + 1) + '集', url });
    }
    let pic = '';
    const dm = html.match(/<div class="dplayer"[^>]*data-config="([^"]*)"/i);
    if (dm) {
        try {
            const cfg = JSON.parse(dm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
            if (cfg && cfg.video && cfg.video.pic) {
                const p = cfg.video.pic;
                pic = proxyPic(p.startsWith('http') ? p : 'https://pic.hdhwqx.cn' + p);
            }
        } catch (e) {}
    }
    return { vod_id: rawId, vod_name: title, vod_pic: pic, vod_remarks: eps.length ? '共' + eps.length + '集' : '', eps };
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: '91大赛',
        site: HOST,
        tabs: TABS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'mrds/');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const base = HOST + 'category/' + tid.replace(/^\/+/, '').replace(/\/+$/, '');
    const url = page === 1 ? (base + '/') : (base + '/' + page + '/');
    const html = await getText(url, HOST);
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = String(ext.id || '').trim();
    const tracks = [];
    if (raw) {
        const url = /^https?:\/\//i.test(raw) ? raw : HOST + String(raw).replace(/^\/+/, '');
        const html = await getText(url, HOST);
        const d = parseDetail(html, raw);
        const wrapEp = (u) => (/\.m3u8/i.test(u) ? RELAY_M3U8 + encodeURIComponent(u) : u);
        if (d.eps.length === 1) {
            tracks.push({ name: '正片·中转', pan: '', ext: { url: wrapEp(d.eps[0].url) } });
            tracks.push({ name: '正片·直连', pan: '', ext: { url: d.eps[0].url } });
        } else {
            for (const e of d.eps) {
                tracks.push({ name: e.name + '·中转', pan: '', ext: { url: wrapEp(e.url) } });
                tracks.push({ name: e.name + '·直连', pan: '', ext: { url: e.url } });
            }
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [url], headers: [H(HOST)] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = HOST + 'search/' + encodeURIComponent(wd) + '/';
    if (page > 1) url += page + '/';
    const html = await getText(url, HOST);
    return jsonify({ list: parseList(html) });
}
