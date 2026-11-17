// 91吃瓜 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/cg91.js
// 站点 https://www.91cg1.com/（Typecho Mirages）；封面 pic.hdhwqx.cn 走 51chigua 解密代理；
// 详情 dplayer data-config 里 video.url 即 m3u8 直链（带 auth_key 时效 token，详情时现取）；
// 双线路：中转（javsb-relay 只包 .m3u8）在前、直连在后；首段清单间歇回 200 空体，探针探到空体时重拉详情拿新 token；无字幕。
const HOST = 'https://www.91cg1.com/';
const PROXY = 'https://51chigua.li768435813.workers.dev/img?url=';
const RELAY_M3U8 = 'https://javsb-relay.li768435813.workers.dev/m3u8?u=';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TABS = [
    { type_id: 'zxcghl/', type_name: '今日吃瓜' },
    { type_id: 'dydj/', type_name: 'AI短剧' },
    { type_id: 'mrds/', type_name: '每日大赛' },
    { type_id: 'sstp/', type_name: '实时偷拍' },
    { type_id: 'rsdg/', type_name: '最高点击' },
    { type_id: 'lpsd/', type_name: '深夜撸片' },
    { type_id: 'hjll/', type_name: '海角乱伦' },
    { type_id: '91th/', type_name: '91探花' },
    { type_id: 'crdm/', type_name: '成人动漫' },
    { type_id: 'zdtop/', type_name: '91周榜' },
    { type_id: 'ydtop/', type_name: '91月榜' },
    { type_id: 'bcdg/', type_name: '必吃大瓜' },
    { type_id: 'whhl/', type_name: '网红黑料' },
    { type_id: 'mxhl/', type_name: '明星黑料' },
    { type_id: 'qwys/', type_name: '社会奇闻' },
    { type_id: 'xsjlb/', type_name: '师生专栏' },
    { type_id: 'fclv/', type_name: '反差靓女' },
    { type_id: 'gcwh/', type_name: '网黄合集' },
    { type_id: 'aikj/', type_name: '明星AI' },
    { type_id: 'zptp/', type_name: '自拍偷拍' },
    { type_id: 'lqzk/', type_name: '猎奇重口' },
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
    return String(s || '')
        .replace(/<div class="wrap">[\s\S]*?<\/div>/gi, '')
        .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function proxyPic(pic) {
    if (!pic) return '';
    if (pic.startsWith('http')) return PROXY + encodeURIComponent(pic);
    return pic;
}

function parseList(html) {
    const items = [];
    const seen = new Set();
    const chunks = String(html).replace(/https:\/\/www\.91cg1\.com\/archives\//g, '/archives/').split('<a href="/archives/');
    for (let i = 1; i < chunks.length; i++) {
        const blk = chunks[i].slice(0, 8000);
        const idm = blk.match(/^(\d+)\//);
        if (!idm) continue;
        const url = HOST + 'archives/' + idm[1] + '/';
        if (seen.has(url)) continue;
        const hm = blk.match(/<h2 class="post-card-title"[^>]*>([\s\S]{0,800}?)<\/h2>/i);
        const title = hm ? stripTags(hm[1]) : '';
        if (!title || title.length < 2) continue;
        const pm = blk.match(/loadBannerDirect\('([^']+)'/i);
        seen.add(url);
        items.push({ vod_id: url, vod_name: title, vod_pic: proxyPic(pm ? pm[1] : ''), ext: { id: url } });
        if (items.length >= 24) break;
    }
    return items;
}

function extractEps(html) {
    const eps = [];
    const divs = [...html.matchAll(/<div class="dplayer"([^>]*)>/gi)];
    for (const d of divs) {
        const attrs = d[1];
        const cm = attrs.match(/data-config='([^']*)'/i) || attrs.match(/data-config="([^"]*)"/i);
        let url = '';
        if (cm) {
            const cfgText = cm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            try {
                const cfg = JSON.parse(cfgText);
                if (cfg && cfg.video && cfg.video.url) url = cfg.video.url;
            } catch (e) {}
            if (!url) {
                const um = cfgText.match(/"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
                if (um) url = um[1].replace(/\\\//g, '/');
            }
        }
        if (!url) continue;
        url = url.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
        const tm = attrs.match(/data-video_title="([^"]*)"/i);
        eps.push({ name: tm ? stripTags(tm[1]) : '', url });
    }
    return eps;
}

// 首段清单间歇回 200 空体（0 字节）时播放器只会转圈：探直链清单体长，
// 体长为 0 时重拉一次详情拿新 token 再探一次；两次都空仍按主干交出。
// 只探 m3u8 清单，绝不探 mp4；多集并发探。
async function probeEps(eps, articleUrl) {
    const idxs = eps.map((e, i) => (/\.m3u8/i.test(e.url) ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return eps;
    const lens = await Promise.all(idxs.map((i) => getText(eps[i].url, HOST).then((s) => s.length).catch(() => -1)));
    if (!lens.some((n) => n === 0)) return eps;
    const html2 = await getText(articleUrl, HOST);
    if (!html2) return eps;
    const eps2 = extractEps(html2);
    const out = eps.slice();
    for (let k = 0; k < idxs.length; k++) {
        if (lens[k] !== 0) continue;
        const i = idxs[k];
        if (eps2[i] && /\.m3u8/i.test(eps2[i].url)) {
            await getText(eps2[i].url, HOST);
            out[i] = { name: out[i].name, url: eps2[i].url };
        }
    }
    return out;
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: '91吃瓜',
        site: HOST,
        tabs: TABS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'zxcghl/');
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
        const eps = await probeEps(extractEps(html), url);
        const wrapEp = (u) => (/\.m3u8/i.test(u) ? RELAY_M3U8 + encodeURIComponent(u) : u);
        if (eps.length === 1) {
            tracks.push({ name: '播放·中转', pan: '', ext: { url: wrapEp(eps[0].url) } });
            tracks.push({ name: '播放·直连', pan: '', ext: { url: eps[0].url } });
        } else {
            eps.forEach((e, i) => {
                const name = e.name || ('第' + (i + 1) + '集');
                tracks.push({ name: name + '·中转', pan: '', ext: { url: wrapEp(e.url) } });
                tracks.push({ name: name + '·直连', pan: '', ext: { url: e.url } });
            });
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
