// 818黑料网 - XPTV csp 格式（csp_818hl）
// 转换自 mira-cat nodejs/src/spider/video/hl818.js（py_818hl）。
// 2026-11-19 修：旧域 cell.lacdfsq.cc 已 NXDOMAIN（站方子域名无 A 记录，站已搬）；
// 改走站方自报永久地址 818hlw1.com（实测直出 30 篇）。/latest/ 与 /hot/ 是站内
// 404 样式页、不可用，tabs 改用站内导航实测的 12 个 /category/ 分类（与猫版一致）。
// 取数双腿（照猫版）：直连（App 侧常被 CF 按出口指纹拦，5s 快失败）→
// javsb-relay /hl?url= 中转（白名单仅 818hlw1.com，实测首页/分类均 200/30 篇）。
// 封面走 bagua-img-proxy 解密代理出图（纯字符串拼接，原样保留）。
// 播放：dplayer 直链 parse:0 直出；仅有观看链接时为网页 URL（嗅探型播放降级：回源页 URL，待真机验）。
const HOST = 'https://818hlw1.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// 2026-11-19 封面根因：bagua-img-proxy 是 AES 解密代理，只认 pic.jtzatly.cn/pic.drleao.cn/pic.qnlycc.cn，
// pic.gyezbp.cn（818/每日大赛封面）一律回 400 "Invalid URL"，且就算放行也会把正常图当加密图解密弄坏。
// 照猫版 proxyCover：pic.*.cn 走 51chigua 透传代理（实测 pic.gyezbp.cn 出真 PNG/JPEG），其余走 bagua 解密代理。
const IMG_PROXY_51 = 'https://51chigua.li768435813.workers.dev/img?url=';
const IMG_PROXY_BAGUA = 'https://bagua-img-proxy.li768435813.workers.dev/img?url=';
const RELAY_HL = 'https://javsb-relay.li768435813.workers.dev/hl?url=';

const appConfig = {
    ver: 1,
    title: '818黑料网',
    site: HOST,
    tabs: [
        { name: '今日吃瓜', ext: { tid: '/category/jrcg/' } },
        { name: '热门大瓜', ext: { tid: '/category/rmdg/' } },
        { name: '每日大赛', ext: { tid: '/category/mrds/' } },
        { name: '反差网黄', ext: { tid: '/category/fcwh/' } },
        { name: '家庭乱伦', ext: { tid: '/category/jtll/' } },
        { name: '撸管必备', ext: { tid: '/category/lgbb/' } },
        { name: '猎奇大赏', ext: { tid: '/category/lqds/' } },
        { name: '街拍流出', ext: { tid: '/category/jplc/' } },
        { name: 'AI短剧', ext: { tid: '/category/aidj/' } },
        { name: '学生校园', ext: { tid: '/category/xsxy/' } },
        { name: '明星黑料', ext: { tid: '/category/mxhl/' } },
        { name: '海外吃瓜', ext: { tid: '/category/hwcg/' } },
    ],
};

function H() {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': HOST,
        'Origin': HOST.replace(/\/$/, ''),
    };
}

function proxyCover(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (url.indexOf('data:') === 0) return url;
    if (url.indexOf('51chigua.li768435813.workers.dev') >= 0 || url.indexOf('bagua-img-proxy') >= 0) return url;
    if (/^https?:\/\/pic\.[^\/]*\.cn\//i.test(url)) return IMG_PROXY_51 + encodeURIComponent(url);
    return IMG_PROXY_BAGUA + encodeURIComponent(url);
}

function isRealPage(html) {
    const s = String(html || '');
    return s.indexOf('818黑料网') >= 0 && (s.indexOf('/category/') >= 0 || s.indexOf('/archives/') >= 0);
}

async function getText(url) {
    // ① 直连（5s 快失败：App 侧常被 CF 按出口指纹拦，挂满超时拖垮取数）
    try {
        const { data } = await $fetch.get(url, { headers: H(), timeout: 5000 });
        const t = typeof data === 'string' ? data : String(data || '');
        if (isRealPage(t)) return t;
    } catch (e) {}
    // ② javsb-relay /hl 中转（10s）
    try {
        const { data } = await $fetch.get(RELAY_HL + encodeURIComponent(url), { headers: H(), timeout: 10000 });
        const t = typeof data === 'string' ? data : String(data || '');
        if (isRealPage(t)) return t;
    } catch (e) {}
    return '';
}

function imgOf(html) {
    const clean = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let m = clean.match(/z-image-loader-url\s*=\s*"([^"]+)"/i);
    if (m && /^https?:\/\//i.test(m[1])) return m[1];
    m = clean.match(/<img[^>]*class="[^"]*blog-background[^"]*"[^>]*>/i);
    if (m) {
        const sm = m[0].match(/(?:z-image-loader-url|data-src|src)\s*=\s*"([^"]+)"/i);
        if (sm && /^https?:\/\//i.test(sm[1]) && !/data:image/i.test(sm[1])) return sm[1];
    }
    m = clean.match(/https?:\/\/[^"'\s)]+\.(?:jpg|png|jpeg|webp)/i);
    if (m) return m[0];
    m = clean.match(/url\s*\(\s*['"]?([^"'\)]+)['"]?\s*\)/i);
    if (m) {
        const u = m[1].trim();
        if (/^https?:\/\//i.test(u)) return u;
    }
    return '';
}

function parseArticles(html) {
    const items = [];
    if (!html) return items;
    const re = /<article[\s\S]{0,3000}?<\/article>/gi;
    let m;
    const seen = new Set();
    while ((m = re.exec(html)) !== null) {
        const blk = m[0];
        const a = blk.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
        if (!a) continue;
        const href = a[1].trim();
        if (!href || href === '#' || seen.has(href)) continue;
        seen.add(href);
        const t = blk.match(/<h2[^>]*>([^<]{2,120})<\/h2>/i)
            || blk.match(/class="entry-title"[^>]*>([^<]{2,120})/i)
            || blk.match(/class="post-title"[^>]*>([^<]{2,120})/i);
        const title = t ? t[1].trim() : '';
        if (!title) continue;
        const tm = blk.match(/<time[^>]*>([^<]{2,40})<\/time>/i);
        items.push({
            vod_id: href,
            vod_name: title,
            vod_pic: proxyCover(imgOf(blk)),
            vod_remarks: tm ? tm[1].trim() : '',
            ext: { id: href },
        });
        if (items.length >= 30) break;
    }
    return items;
}

function parseCategories(html) {
    const items = [];
    const re = /<li[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]{2,20})<\/a>\s*<\/li>/gi;
    const seen = new Set();
    let m;
    while ((m = re.exec(html)) !== null) {
        const href = m[1].trim(), name = m[2].trim();
        if (!href || href === '#' || !name || seen.has(href)) continue;
        seen.add(href);
        items.push({ name, ext: { tid: href } });
    }
    return items;
}

function buildGroups(vod) {
    const froms = String(vod.vod_play_from || '').split('$$$');
    const urlGroups = String(vod.vod_play_url || '').split('$$$');
    const list = [];
    urlGroups.forEach((g, gi) => {
        const flag = froms[gi] || froms[0] || '在线播放';
        const tracks = [];
        g.split('#').forEach((item) => {
            const idx = item.indexOf('$');
            if (idx < 0) return;
            const name = item.slice(0, idx) || '播放';
            const pid = item.slice(idx + 1);
            if (!pid) return;
            tracks.push({ name, pan: '', ext: { id: pid, flag } });
        });
        if (tracks.length) list.push({ title: flag, tracks });
    });
    return list;
}

async function getConfig() {
    // 静态 tabs：12 个站内导航实测分类（2026-11-19，818hlw1.com 首页导航）。
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (tid.includes('@folder')) {
        const raw = tid.replace('@folder', '');
        const url = raw.startsWith('http') ? raw : HOST.replace(/\/$/, '') + raw;
        const html = await getText(url);
        const videos = [];
        const re = /<h2[^>]*>([^<]{2,120})<\/h2>[\s\S]{0,500}?<a[^>]*href="([^"]+)"[^>]*>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            videos.push({ vod_id: m[2], vod_name: m[1].trim(), vod_pic: '', vod_remarks: '', ext: { id: m[2] } });
            if (videos.length >= 60) break;
        }
        return jsonify({ list: videos });
    }
    let base;
    if (/^https?:\/\//i.test(tid)) base = tid.replace(/\/+$/, '');
    else base = (HOST.replace(/\/$/, '') + '/' + tid.replace(/^\/+/, '')).replace(/\/+$/, '');
    const url = page === 1 ? (base + '/') : (base + '/' + page + '/');
    const html = await getText(url);
    return jsonify({ list: parseArticles(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = String(ext.id || '');
    if (!raw) return jsonify({ list: [] });
    const url = /^https?:\/\//i.test(raw) ? raw : HOST.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);
    const html = await getText(url);
    const plist = [];
    // 2026-11-19 播放根因之二：站内 class 是 "mep3tuv dplayer"（多 class），
    // 旧正则写死 class="dplayer" 永远 0 匹配；且 data-config 用双引号
    // （data-config="{&quot;...}"），旧正则只认单引号。改多 class + 双引号/单引号
    // 都认（\1 回指开引号），再反转义 &quot; 后解析。
    const dre = /class="[^"]*dplayer[^"]*"[^>]*data-config=(["'])([\s\S]*?)\1/gi;
    let m;
    let c = 0;
    while ((m = dre.exec(html)) !== null) {
        c++;
        try {
            const cfgStr = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const cfg = JSON.parse(cfgStr);
            const vu = (cfg && cfg.video && cfg.video.url) || '';
            if (vu) plist.push('视频' + c + '$' + vu);
        } catch (e) {}
    }
    if (!plist.length) {
        const lre = /<a[^>]*href="([^"]+)"[^>]*>([^<]*(?:点击观看|观看|播放|视频|第一弹|第二弹|第三弹)[^<]*)<\/a>/gi;
        let i = 0;
        while ((m = lre.exec(html)) !== null) {
            i++;
            let href = m[1].trim();
            const name = m[2].replace(/点击观看[：:]/, '').replace(/点击观看/, '').trim() || ('视频' + i);
            if (!/^https?:\/\//i.test(href)) {
                href = HOST.replace(/\/$/, '') + (href.startsWith('/') ? href : '/' + href);
            }
            plist.push(name + '$' + href);
        }
    }
    const vod = {
        vod_play_from: '818黑料网',
        vod_play_url: plist.length ? plist.join('#') : ('未找到视频源$' + url),
    };
    return jsonify({ list: buildGroups(vod) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (!id) return jsonify({ urls: [], headers: [] });
    // 媒体直链 parse:0 直出；网页 URL 为嗅探型降级（见文件头注）
    return jsonify({ urls: [id], headers: [H()] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = page === 1
        ? (HOST + 'search/' + encodeURIComponent(wd) + '/')
        : (HOST + 'search/' + encodeURIComponent(wd) + '/' + page + '/');
    const html = await getText(url);
    return jsonify({ list: parseArticles(html) });
}
