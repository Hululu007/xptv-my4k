// ASMR吧 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/asmrba.js
const HOST = 'https://www.asmrba.com';
const API = HOST + '/wp-json/wp/v2';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36';

const appConfig = {
    ver: 1,
    title: 'ASMR吧',
    site: HOST,
    tabs: [{ name: '最新更新', ext: { id: 'latest' } }],
};

async function fetchText(url, headers) {
    try {
        const r = await $fetch.get(url, { headers: headers || { 'User-Agent': UA }, timeout: 20000 });
        const d = r ? r.data : null;
        return typeof d === 'string' ? d : (d == null ? '' : JSON.stringify(d));
    } catch (e) {
        return '';
    }
}

async function fetchJson(url, headers) {
    const s = await fetchText(url, headers);
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
}

function text(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function m(s, r) {
    return ((String(s || '').match(r) || [])[1] || '');
}

function abs(base, u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return base + u;
    return base + '/' + u;
}

function card(p) {
    const cover = (p && p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0]) ? p._embedded['wp:featuredmedia'][0].source_url : '';
    return {
        vod_id: String(p.id),
        vod_name: text((p.title && p.title.rendered) || p.title),
        vod_pic: cover || '',
        vod_remarks: text((p.excerpt && p.excerpt.rendered) || ''),
        ext: { id: String(p.id) },
    };
}

async function categories() {
    const a = await fetchJson(API + '/categories?per_page=100');
    if (!Array.isArray(a)) return [];
    return a.map(function (x) { return { name: x.name, ext: { id: String(x.id) } }; });
}

async function pagePosts(page, extra) {
    let q = 'per_page=20&page=' + page + '&_embed=1';
    if (extra) q += extra;
    const j = await fetchJson(API + '/posts?' + q);
    const arr = Array.isArray(j) ? j : [];
    return arr.map(card);
}

async function getConfig() {
    try {
        const cats = await categories();
        if (cats.length) {
            return jsonify({
                ver: 1,
                title: 'ASMR吧',
                site: HOST,
                tabs: [{ name: '最新更新', ext: { id: 'latest' } }].concat(cats),
            });
        }
    } catch (e) {}
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const id = String(ext.id || 'latest');
    let list;
    if (id === 'latest') {
        list = await pagePosts(page, '');
    } else {
        list = await pagePosts(page, '&categories=' + encodeURIComponent(id));
    }
    return jsonify({ list: list });
}

// B站 playurl：qn 定档位；cid 漂移时用 view 接口取当前 cid 重试一次。
async function biliUrl(u) {
    u = String(u || '').replace(/&amp;/g, '&');
    const bvid = m(u, /(BV[0-9A-Za-z]+)/);
    if (!bvid) return '';
    let cid = m(u, /[?&]cid=(\d+)/);
    const qn = m(u, /[?&]qn=(\d+)/) || '64';
    const headers = { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/video/' + bvid + '/' };
    const playurl = async function (c) {
        const j = await fetchJson('https://api.bilibili.com/x/player/playurl?bvid=' + bvid + '&cid=' + c + '&qn=' + qn + '&fnval=0&platform=html5', headers);
        const d = (j && j.data) || {};
        let du = (d.durl && d.durl[0] && d.durl[0].url) || '';
        if (!du && d.dash) du = (d.dash.audio && d.dash.audio[0] && d.dash.audio[0].baseUrl) || (d.dash.video && d.dash.video[0] && d.dash.video[0].baseUrl) || '';
        return du;
    };
    if (!cid) {
        const v = await fetchJson('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, headers);
        cid = String((v && v.data && v.data.cid) || '');
    }
    if (!cid) return '';
    let du = await playurl(cid);
    if (!du) {
        const v = await fetchJson('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, headers);
        const fresh = String((v && v.data && v.data.cid) || '');
        if (fresh && fresh !== cid) du = await playurl(fresh);
    }
    return du;
}

// 详情里对 bilibili iframe 先调一次 playurl（qn=116）读 accept_quality，
// 只对站方真实可用档位出集；取不到时返回 null，调用方回退原单集行为。
const QN_LABEL = { 116: '1080p60', 80: '1080p', 64: '720p', 32: '480p' };
async function biliQualities(u) {
    u = String(u || '').replace(/&amp;/g, '&');
    const bvid = m(u, /(BV[0-9A-Za-z]+)/);
    if (!bvid) return null;
    let cid = m(u, /[?&]cid=(\d+)/);
    const headers = { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/video/' + bvid + '/' };
    if (!cid) {
        const v = await fetchJson('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, headers);
        cid = String((v && v.data && v.data.cid) || '');
    }
    if (!cid) return null;
    const j = await fetchJson('https://api.bilibili.com/x/player/playurl?bvid=' + bvid + '&cid=' + cid + '&qn=116&fnval=0&platform=html5', headers);
    const aq = j && j.data && j.data.accept_quality;
    if (!Array.isArray(aq) || !aq.length) return null;
    const avail = {};
    for (let i = 0; i < aq.length; i++) avail[Number(aq[i])] = true;
    const out = [];
    const order = [116, 80, 64, 32];
    for (let i = 0; i < order.length; i++) {
        const qn = order[i];
        if (!avail[qn]) continue;
        let url = 'https://www.bilibili.com/video/' + bvid + '/?qn=' + qn;
        if (cid) url += '&cid=' + cid;
        out.push({ qn: qn, label: QN_LABEL[qn], url: url });
    }
    return out.length ? out : null;
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    if (!id) return jsonify({ list: [] });
    const p = await fetchJson(API + '/posts/' + encodeURIComponent(id) + '?_embed=1');
    if (!p || !p.id) return jsonify({ list: [] });
    const h = (p.content && p.content.rendered) || '';
    const urls = [];
    const re1 = /https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mp4)[^\s"'<>]*/g;
    let mm;
    while ((mm = re1.exec(h)) !== null) urls.push(mm[0]);
    const re2 = /<iframe[^>]+src="([^"]+)"/g;
    while ((mm = re2.exec(h)) !== null) urls.push(abs(HOST, mm[1]).replace(/&amp;/g, '&'));
    const seen = {};
    const all = [];
    for (let i = 0; i < urls.length; i++) {
        if (!seen[urls[i]]) { seen[urls[i]] = true; all.push(urls[i]); }
    }
    const tracks = [];
    for (let i = 0; i < all.length; i++) {
        const u = all[i];
        if (/bilibili\.com/i.test(u)) {
            let quals = null;
            try { quals = await biliQualities(u); } catch (e) {}
            if (quals) {
                for (let k = 0; k < quals.length; k++) {
                    tracks.push({ name: quals[k].label, pan: '', ext: { url: quals[k].url } });
                }
                continue;
            }
        }
        tracks.push({ name: '第' + (i + 1) + '段', pan: '', ext: { url: u } });
    }
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const u = String(ext.url || '').replace(/&amp;/g, '&');
    if (!u) return jsonify({ urls: [], headers: [] });
    if (/bilibili\.com/i.test(u)) {
        const v = await biliUrl(u);
        if (v) {
            return jsonify({ urls: [v], headers: [{ 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/' }] });
        }
        return jsonify({ urls: [], headers: [] });
    }
    return jsonify({ urls: [u], headers: [{ 'User-Agent': UA }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const list = await pagePosts(page, '&search=' + encodeURIComponent(wd));
    return jsonify({ list: list });
}
