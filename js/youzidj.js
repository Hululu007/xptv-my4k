// 柚子短剧 - XPTV csp 格式（csp_youzidj）
// 转换自 mira-cat nodejs/src/spider/video/youzidj.js（py_youzidj），站点 https://youzidj.com
// 播放主链（同猫版，补上猫版缺的年龄确认）：POST /api/account/bootstrap 建访客会话（JSON 对象 body）→
// POST /age-check（表单 decision=accepted，带 Origin + Sec-Fetch 头）取年龄确认 cookie →
// POST /api/playback/{videoId}?mode=native 换流地址（相对路径 /media/.../native-current.mp4，
// 站方 307 跳到 master.m3u8），三步的 cookie（访客 + 年龄 + 播放）都带在播放头里。
// 注意：年龄确认只在 303 跳转响应里 Set-Cookie，$fetch 须回 303 原响应（opts 带 redirect:'manual'）才能取到；
// 若运行时的 $fetch 强制跟随跳转、取不到该 cookie，播放会 403，只能走 Worker 中转（见下）。
// 拿不到流返回空，绝不回集页面地址。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）。
const SITE = 'https://youzidj.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

// 2026-11-19 三腿取数：用户手机直连 youzidj.com 失败（VM 全通）；site-fetch Worker 腿 → jina 腿 → 直连，首个真 HTML 胜出。
// 注意：只改列表/详情/搜索的 GET 取页。会话类 POST（bootstrap / age-check / playback）带 cookie，
// Worker 不透传 Cookie，改走 Worker 会丢会话，故一律保留直连。
const SITE_FETCH = 'https://site-fetch.li768435813.workers.dev';
function looksRealHtml(t) {
    return !!t && t.length > 2000 && !/Just a moment|Checking your browser|cf-challenge|__cf_chl|Attention Required|cf-wrapper|cf\.errors|Enable JavaScript and cookies/i.test(t);
}

const GENRES = [
    ['cultivation', '修仙'], ['wealthy-family', '豪门'], ['urban', '都市'], ['costume', '古装'],
    ['family-ethics', '家庭伦理'], ['martial-arts', '武侠'], ['campus', '校园'],
];

const TAGS = [
    ['romance', '情感'], ['yu-jie', '御姐'], ['ni-xi', '逆袭'], ['tiao-jiao', '调教'], ['shu-nu', '熟女'],
    ['ren-qi', '人妻'], ['hou-gong', '后宫'], ['tou-qing', '偷情'], ['qi-huan', '奇幻'], ['xi-tong', '系统'],
    ['nu-pu', '女仆'], ['luo-li', '萝莉'], ['lu-mao', '绿帽'], ['xuan-yi', '悬疑'], ['mu-zi', '母子'],
    ['jiao-shi', '教师'], ['apocalypse', '末日'], ['chong-sheng', '重生'], ['chuan-yue', '穿越'],
    ['fu-nu', '父女'], ['jie-di', '姐弟'],
];

const CATS = [['all', '全部短剧']]
    .concat(GENRES.map(([slug, name]) => ['g_' + slug, name]))
    .concat(TAGS.map(([slug, name]) => ['t_' + slug, name]));

const appConfig = {
    ver: 1,
    title: '柚子短剧',
    site: SITE,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

let accountPair = '';
let agePair = '';

function t(v) {
    return String(v == null ? '' : v).trim();
}

function clean(s) {
    return t(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
}

function fixUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return SITE + (u.startsWith('/') ? u : '/' + u);
}

async function getHtml(url) {
    const headers = { 'User-Agent': UA, 'Referer': REFERER, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
    try {
        const r = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), { headers: headers, timeout: 12000 });
        if (r && r.status === 200 && looksRealHtml(String(r.data || ''))) return String(r.data);
    } catch (e) {}
    try {
        const h2 = Object.assign({}, headers, { 'x-respond-with': 'html' });
        const r = await $fetch.get('https://r.jina.ai/' + url, { headers: h2, timeout: 20000 });
        if (r && r.status === 200 && looksRealHtml(String(r.data || ''))) return String(r.data);
    } catch (e) {}
    try {
        const { data, status } = await $fetch.get(url, { headers: headers, timeout: 15000 });
        if ((status === undefined || status === 200) && typeof data === 'string' && data) return data;
    } catch (e) {}
    return '';
}

// POST JSON 接口：返回 { status, data, setCookie[] }；setCookie 尽力从响应头各形态里取（运行时未证实回传）
async function postJson(url, referer, cookie) {
    const headers = {
        'User-Agent': UA,
        'Referer': referer || REFERER,
        'Origin': SITE,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    if (cookie) headers['Cookie'] = cookie;
    try {
        const r = await $fetch.post(url, {}, { headers: headers });
        let data = r.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = null; } }
        let sc = [];
        const h = r.headers || r.header || {};
        const raw = h['set-cookie'] || h['Set-Cookie'] || (typeof h.getSetCookie === 'function' ? h.getSetCookie() : null) || (typeof h.get === 'function' ? h.get('set-cookie') : null);
        if (raw) sc = Array.isArray(raw) ? raw : [raw];
        return { status: r.status || 200, data: data, setCookie: sc };
    } catch (e) {
        return { status: 0, data: null, setCookie: [] };
    }
}

function pickCookie(setCookie, namePrefix) {
    for (const line of setCookie || []) {
        const m = String(line).match(new RegExp('^(' + namePrefix + '[^=]*)=([^;]+)'));
        if (m) return { name: m[1], value: m[2], pair: m[1] + '=' + m[2] };
    }
    return null;
}

async function ensureAccount(force) {
    if (!force && accountPair) return accountPair;
    const r = await postJson(SITE + '/api/account/bootstrap', REFERER, '');
    const c = pickCookie(r.setCookie, 'eden_account');
    if (c) {
        accountPair = c.pair;
        return accountPair;
    }
    return accountPair || '';
}

// 年龄确认：POST /age-check 表单，成功 303 + Set-Cookie 年龄确认 cookie。
// 该 cookie 只在 303 响应里出现：opts 带 redirect:'manual'，让 $fetch 回 303 原响应而非跟随跳转；
// 若运行时强制跟随跳转、取不到该 cookie，播放会 403，只能走 Worker 中转。
async function ensureAge(epUrl, acct, force) {
    if (!force && agePair) return agePair;
    let path = '/';
    try { path = new URL(epUrl).pathname; } catch (e) {}
    const body = 'return_to=' + encodeURIComponent(path) + '&decision=accepted';
    const headers = {
        'User-Agent': UA,
        'Referer': epUrl,
        'Origin': SITE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
    };
    if (acct) headers['Cookie'] = acct;
    try {
        const r = await $fetch.post(SITE + '/age-check', body, { headers: headers, redirect: 'manual' });
        const h = r.headers || r.header || {};
        const raw = h['set-cookie'] || h['Set-Cookie'] || (typeof h.getSetCookie === 'function' ? h.getSetCookie() : null) || (typeof h.get === 'function' ? h.get('set-cookie') : null);
        const sc = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
        const c = pickCookie(sc, 'eden_age_');
        if (c) {
            agePair = c.pair;
            return agePair;
        }
    } catch (e) {}
    return '';
}

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const parts = String(html || '').split('<article class="drama-card');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i].slice(0, 6000);
        const hm = block.match(/href="(https:\/\/youzidj\.com\/dramas\/[a-z0-9\-]+\/season-\d+\/)"/);
        if (!hm) continue;
        const url = hm[1];
        if (seen.has(url)) continue;
        seen.add(url);
        let title = '';
        const tm = block.match(/drama-card-title"[^>]*title="([^"]+)"/) || block.match(/drama-card-title"[^>]*>([^<]+)</);
        if (tm) title = clean(tm[1]);
        if (!title) {
            const am = block.match(/<img[^>]+alt="([^"]+?)海报"/);
            if (am) title = clean(am[1]);
        }
        let pic = '';
        const pm = block.match(/(\/catalogue-art\/[0-9a-f\-]+-960\.webp)/);
        if (pm) pic = SITE + pm[1];
        let remarks = '';
        const rm = block.match(/home-card-episodes-long">([^<]+)</);
        if (rm) remarks = clean(rm[1]);
        out.push({
            vod_id: url,
            vod_name: title || url,
            vod_pic: pic,
            vod_remarks: remarks,
            ext: { id: url },
        });
    }
    return out;
}

function catBase(tid) {
    let id = String(tid == null ? '' : tid).trim();
    try { id = decodeURIComponent(id); } catch (e) {}
    if (!id || id === 'all') return SITE + '/dramas/';
    let m = id.match(/^(?:g_|genre:)(.+)$/);
    if (m) return SITE + '/dramas/category/' + m[1] + '/';
    m = id.match(/^(?:t_|tag:)(.+)$/);
    if (m) return SITE + '/tags/' + m[1] + '/';
    const g = GENRES.find((x) => x[0] === id || x[1] === id);
    if (g) return SITE + '/dramas/category/' + g[0] + '/';
    const tg = TAGS.find((x) => x[0] === id || x[1] === id);
    if (tg) return SITE + '/tags/' + tg[0] + '/';
    return SITE + '/dramas/';
}

function findSeason(ld) {
    if (!ld || typeof ld !== 'object') return null;
    if (Array.isArray(ld)) {
        for (const x of ld) { const s = findSeason(x); if (s) return s; }
        return null;
    }
    if (Array.isArray(ld.episode)) return ld;
    if (ld['@graph']) return findSeason(ld['@graph']);
    return null;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'all');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const base = catBase(tid);
    const url = page > 1 ? base + 'page/' + page + '/' : base;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = /^https?:\/\//i.test(id) ? id : SITE + '/dramas/' + id.replace(/^\/+|\/+$/g, '') + '/season-1/';
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    let episodes = [];
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const b of lds) {
        let obj = null;
        try { obj = JSON.parse(b[1]); } catch (e) {}
        const season = findSeason(obj);
        if (!season) continue;
        episodes = (season.episode || []).map((ep) => ({
            n: parseInt(ep.episodeNumber, 10) || 0,
            label: clean(ep.name || ''),
            url: fixUrl(ep.url || ''),
        })).filter((ep) => ep.url);
        if (episodes.length) break;
    }
    if (!episodes.length) {
        const re = /href="(https:\/\/youzidj\.com\/dramas\/[a-z0-9\-]+\/season-\d+-episode-(\d+)\/)"/g;
        const seen = new Set();
        let m;
        while ((m = re.exec(html)) !== null) {
            if (seen.has(m[1])) continue;
            seen.add(m[1]);
            episodes.push({ n: parseInt(m[2], 10) || episodes.length + 1, label: '', url: m[1] });
        }
    }
    episodes.sort((a, b) => a.n - b.n);
    const tracks = episodes.map((ep) => ({
        name: ep.label || ('第' + ep.n + '集'),
        pan: '',
        ext: { id: ep.url, flag: '柚子短剧' },
    }));
    return jsonify({ list: [{ title: '柚子短剧', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    const epUrl = fixUrl(id);
    const empty = () => jsonify({ urls: [], headers: [] });

    const html = await getHtml(epUrl);
    const vm = html && html.match(/data-video="([0-9a-f\-]{36})"/);
    if (!vm) return empty();
    const videoId = vm[1];
    const pm = html.match(/data-price="([^"]*)"/);
    const price = pm ? pm[1] : '0';
    if (price !== '0') return empty();

    let acct = await ensureAccount(false);
    let age = await ensureAge(epUrl, acct, false);
    if (!acct || !age) return empty();

    const playOnce = async (cookie) => {
        return postJson(SITE + '/api/playback/' + videoId + '?mode=native', epUrl, cookie);
    };
    let r = await playOnce([acct, age].filter(Boolean).join('; '));
    if (r.status === 401) {
        acct = await ensureAccount(true);
        r = await playOnce([acct, age].filter(Boolean).join('; '));
    }
    if (r.status === 403) {
        // 年龄确认过期/失效：重做一次年龄确认再试
        age = await ensureAge(epUrl, acct, true);
        if (!age) return empty();
        r = await playOnce([acct, age].filter(Boolean).join('; '));
    }
    if (r.status === 402) return empty();
    const data = r.data && typeof r.data === 'object' ? r.data : null;
    const playCookie = pickCookie(r.setCookie, 'eden_play_');
    if (r.status !== 200 || !data || !data.url || !playCookie) return empty();
    const cookie = [acct, age, playCookie.pair].filter(Boolean).join('; ');
    return jsonify({
        urls: [fixUrl(data.url)],
        headers: [{ 'User-Agent': UA, 'Referer': epUrl, 'Cookie': cookie }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    if (page > 1) return jsonify({ list: [] });
    const html = await getHtml(SITE + '/search/?q=' + encodeURIComponent(wd));
    return jsonify({ list: html ? parseCards(html) : [] });
}
