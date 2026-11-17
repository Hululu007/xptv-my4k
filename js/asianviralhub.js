// AsianViralHub - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/asian.js（KVS 同构站，配置内联）
// 站点 https://asianviralhub.com/（KVS tube）；详情 flashvars 里 video_url 即 mp4 直链（带时效 token，详情时现取）；无字幕。
const HOST = 'https://asianviralhub.com/';
const VIDEOPATH = 'video/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CATEGORIES = [
    { type_id: 'leaked/', type_name: 'Leaked' },
    { type_id: 'porn/', type_name: 'Porn' },
    { type_id: 'sextape/', type_name: 'Sextape' },
    { type_id: 'solo/', type_name: 'Solo' },
    { type_id: 'av-idol/', type_name: 'AV Idol' },
    { type_id: 'porn-actress/', type_name: 'Porn Actress' },
    { type_id: 'ai-generated/', type_name: 'AI Generated' },
    { type_id: 'fisting/', type_name: 'Fisting' },
    { type_id: 'south-korean/', type_name: 'South Korean' },
    { type_id: 'camgirl/', type_name: 'Camgirl' },
    { type_id: 'housewife/', type_name: 'Housewife' },
    { type_id: 'jav-uncensored/', type_name: 'JAV Uncensored' },
    { type_id: 'xxx/', type_name: 'XXX' },
    { type_id: 'xx/', type_name: 'XX' },
    { type_id: 'blonde/', type_name: 'Blonde' },
    { type_id: 'bigbooty/', type_name: 'Bigbooty' },
    { type_id: 'hairy/', type_name: 'Hairy' },
    { type_id: 'striptease/', type_name: 'Striptease' },
    { type_id: 'twerking/', type_name: 'Twerking' },
    { type_id: 'riding-dildo/', type_name: 'Riding Dildo' },
    { type_id: 'ebony/', type_name: 'Ebony' },
    { type_id: 'close-up/', type_name: 'Close Up' },
    { type_id: 'fake-tits/', type_name: 'Fake Tits' },
    { type_id: 'smoking/', type_name: 'Smoking' },
    { type_id: 'roommate/', type_name: 'Roommate' },
    { type_id: 'pajamas/', type_name: 'Pajamas' },
    { type_id: 'music/', type_name: 'Music' },
    { type_id: 'desires/', type_name: 'Desires' },
];

function H(referer) {
    return { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': referer || HOST };
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

function parseList(html) {
    const items = [];
    const seen = new Set();
    const escHost = HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('<a[^>]*href="(' + escHost + VIDEOPATH + '\\d+/[^"]+)"[^>]*title="([^"]*)"', 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
        const url = m[1];
        if (seen.has(url)) continue;
        const seg = html.slice(m.index, m.index + 3000);
        const im = seg.match(/data-original="(https?:[^"]+)"/i) || seg.match(/<img[^>]*src="(https?:[^"]+)"/i);
        const title = stripTags(m[2]);
        if (!title || title.length < 2) continue;
        seen.add(url);
        items.push({ vod_id: url, vod_name: title, vod_pic: im ? im[1] : '', ext: { id: url } });
        if (items.length >= 24) break;
    }
    return items;
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'AsianViralHub',
        site: HOST,
        tabs: CATEGORIES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || CATEGORIES[0].type_id);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const base = HOST + 'categories/' + tid.replace(/^\/+/, '').replace(/\/+$/, '');
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
        const vm = html.match(/video_url['"]?\s*[:=]\s*['"]([^'"]+)/i) || html.match(/https?:\/\/[^\s"'<>]+\/get_file\/[^\s"'<>]+\.mp4[^\s"'<>]*/i);
        const videoUrl = vm ? vm[1] : '';
        if (videoUrl) tracks.push({ name: '播放', pan: '', ext: { url: videoUrl } });
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
