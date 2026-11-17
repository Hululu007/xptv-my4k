// 黄视频 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/huangvideo.js
// Rails 站：视频库 /videos、短剧库 /c/shorts（/series/<id> 分集，每集一个
// /videos/<id>）、博主 /creators/<slug>。详情 data-xg-player-source-value
// 直给 master.m3u8（h.matecdn.com）。播放链（2026-11-12 实测）：master/
// 变体/分片全程强制 Referer: https://huang.video/*（无 Referer 一律 403），
// 播放器不把 play 的 header 转发给变体/分片请求，故直出 master 在 App 里
// 必死——播放一律走 huangvideo-hls Worker（/p/ 变体播单 + /f/ 分片，Worker
// 内注入 Referer 并改写播单）；Worker 已部署并于 2026-11-18 实测验通
// （master 200、变体 200、450 分片改写为 /f/）。封面直链无防盗链，取页
// 直连无验证墙。分辨率按 master 真实变体出线（实测均只含 720p 一档，
// 单档只列一条，绝不硬编）。片名全为中文标题、基本不含番号，只有抠出
// 番号的片才调字幕芯（猫源同款守门），其余不搜字幕。
const HOST = 'https://huang.video';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// 播放中转 Worker（用户 Cloudflare 账号，已部署，2026-11-18 实测验通）
const WORKER = 'https://huangvideo-hls.li768435813.workers.dev';
const RELAY_KEY = 'lai-hls-1';

function t(v) { return String(v == null ? '' : v).trim(); }

function decodeHtml(s) {
    return t(s)
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, function (m, n) { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return m; } })
        .replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return m; } });
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return HOST + u;
    return HOST + '/' + u;
}

// 相对地址解析（不用 new URL）：处理根相对与目录相对两种情形。
function resolveUrl(base, rel) {
    if (!rel) return '';
    if (/^https?:\/\//i.test(rel)) return rel;
    if (rel.indexOf('//') === 0) return 'https:' + rel;
    const b = base.split('?')[0].split('#')[0];
    if (rel.charAt(0) === '/') {
        const m = b.match(/^(https?:\/\/[^\/]+)/i);
        return (m ? m[1] : '') + rel;
    }
    return b.slice(0, b.lastIndexOf('/') + 1) + rel;
}

function headers(referer) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer || HOST + '/',
    };
}

async function getHtml(url) {
    try {
        const r = await $fetch.get(url, { headers: headers(), timeout: 20000 });
        const text = r && typeof r.data === 'string' ? r.data : (r && r.data != null ? JSON.stringify(r.data) : '');
        const status = r && typeof r.status === 'number' ? r.status : (text ? 200 : 0);
        if (status >= 200 && status < 300) return text;
        return '';
    } catch (e) {
        return '';
    }
}

// 取播单文本（m3u8）：必须带 Referer（CDN 强制）
async function getText(url, hdrs) {
    try {
        const r = await $fetch.get(url, { headers: hdrs || {}, timeout: 20000 });
        const text = r && typeof r.data === 'string' ? r.data : '';
        const status = r && typeof r.status === 'number' ? r.status : (text ? 200 : 0);
        if (status >= 200 && status < 300) return text;
        return '';
    } catch (e) {
        return '';
    }
}

function listUrl(cat, page) {
    page = Math.max(1, parseInt(page, 10) || 1);
    cat = t(cat) || 'home';
    if (cat === 'home') return HOST + '/';
    if (cat === 'videos') return HOST + '/videos?page=' + page;
    if (cat === 'shorts') return HOST + '/c/shorts?page=' + page;
    if (cat.indexOf('c:') === 0) return HOST + '/creators/' + cat.slice(2) + '?page=' + page;
    return HOST + '/';
}

function parseList(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const re = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const body = m[1];
        const am = body.match(/<a[^>]+href=["'](\/(?:videos|series)\/\d+)["']/i);
        if (!am) continue;
        const href = absUrl(am[1]);
        if (seen[href]) continue;
        seen[href] = 1;
        let title = '';
        const tm = body.match(/<h3[^>]*>\s*<a[^>]*>([^<]{1,200})<\/a>/i);
        if (tm) title = tm[1];
        if (!title) {
            const alm = body.match(/aria-label=["']([^"']{1,200})["']/i);
            if (alm) title = alm[1];
        }
        title = decodeHtml(title);
        if (!title) continue;
        let cover = '';
        const im = body.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (im) cover = absUrl(im[1]);
        let remarks = '';
        const dm = body.match(/<span[^>]*badge[^>]*>([^<]+)<\/span>/i);
        if (dm) remarks = t(dm[1]);
        out.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks, ext: { id: href } });
    }
    return out;
}

function extractTitle(html, fallback) {
    let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (m) return decodeHtml(m[1]).replace(/\s*\|\s*黄视频\s*$/i, '').trim();
    m = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
    if (m) return decodeHtml(m[1]);
    m = html.match(/<title>([^<]+)<\/title>/i);
    if (m) return decodeHtml(m[1]).replace(/\s*\|\s*黄视频\s*$/i, '').trim();
    return fallback || '';
}

function extractCover(html) {
    const m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (m) return absUrl(m[1]);
    return '';
}

function extractMaster(html) {
    if (!html) return '';
    let m = html.match(/data-xg-player-source-value="([^"]+)"/i);
    if (m) return m[1].replace(/&amp;/g, '&');
    m = html.match(/"contentUrl"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
    if (m) return m[1].replace(/&amp;/g, '&');
    return '';
}

// 解析 master 播单的真实变体（RESOLUTION 或路径档位名），按带宽从高到低排
function parseVariants(masterText, baseUrl) {
    const out = [];
    if (!masterText || masterText.indexOf('#EXTM3U') < 0) return out;
    const lines = String(masterText).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const s = t(lines[i]);
        if (s.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        const uri = t(lines[i + 1] || '');
        if (!uri || uri.charAt(0) === '#') continue;
        let bw = 0;
        const bm = s.match(/BANDWIDTH=(\d+)/i);
        if (bm) bw = parseInt(bm[1], 10) || 0;
        let label = '';
        const rm = s.match(/RESOLUTION=\d+x(\d+)/i);
        if (rm) label = rm[1] + 'p';
        if (!label) {
            const um = uri.match(/(^|\/)(\d{3,4}p)(\/|$)/i);
            if (um) label = um[2].toLowerCase();
        }
        if (!label) label = bw > 0 ? Math.round(bw / 1000) + 'k' : '播放';
        out.push({ label: label, url: resolveUrl(baseUrl, uri), bw: bw });
    }
    out.sort(function (a, b) { return b.bw - a.bw; });
    return out;
}

// ---------- Worker 中转 ----------
// base64url（纯 JS；目标地址与 ctx 均为 ASCII）
const B64_A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64url(s) {
    s = String(s);
    let out = '';
    for (let i = 0; i < s.length; i += 3) {
        const a = s.charCodeAt(i);
        const b = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        const c = i + 2 < s.length ? s.charCodeAt(i + 2) : 0;
        out += B64_A.charAt(a >> 2);
        out += B64_A.charAt(((a & 3) << 4) | (b >> 4));
        out += i + 1 < s.length ? B64_A.charAt(((b & 15) << 2) | (c >> 6)) : '=';
        out += i + 2 < s.length ? B64_A.charAt(c & 63) : '=';
    }
    return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function relayPlaylistUrl(targetUrl) {
    const ctx = JSON.stringify({ r: HOST + '/', k: RELAY_KEY });
    return WORKER + '/p/' + b64url(targetUrl) + '/' + b64url(ctx);
}

// 现取详情页 + master，返回真实变体（供 getTracks / getPlayinfo 共用）
async function resolveVariants(vid) {
    const durl = HOST + '/videos/' + vid;
    const html = await getHtml(durl);
    if (!html) return { durl: durl, variants: [], name: '' };
    const master = extractMaster(html);
    const name = extractTitle(html, durl);
    if (!master) return { durl: durl, variants: [], name: name };
    const mt = await getText(master, { 'User-Agent': UA, 'Referer': durl });
    return { durl: durl, variants: parseVariants(mt, master), name: name };
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: '黄视频',
        site: HOST,
        tabs: CLASSES.map(function (c) { return { name: c.type_name, ext: { id: c.type_id } }; }),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.id || 'home');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    // 首页只有一页，p>1 回空
    if (id === 'home' && page > 1) return jsonify({ list: [] });
    let list = [];
    try {
        const html = await getHtml(listUrl(id, page));
        list = parseList(html);
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = t(ext.text);
    if (!kw) return jsonify({ list: [] });
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = HOST + '/search?q=' + encodeURIComponent(kw) + '&page=' + page;
    let list = [];
    try {
        const html = await getHtml(url);
        list = parseList(html);
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let url = String(ext.id || '');
    if (!url) return jsonify({ list: [] });
    if (!/^https?:\/\//i.test(url)) url = absUrl(url);
    const html = await getHtml(url);
    if (!html) return jsonify({ list: [] });
    const name = extractTitle(html, url);
    // 短剧分集页：/series/<id>，每集是一个 /videos/<id>（只取“第N集”锚点）
    if (/\/series\/\d+/.test(url)) {
        const eps = [];
        const seen = {};
        const re = /<a[^>]+href=["'](\/videos\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const label = decodeHtml(t(m[2]).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
            const em = label.match(/第\s*(\d+)\s*集/);
            if (!em) continue;
            const vid = m[1].replace('/videos/', '');
            if (seen[vid]) continue;
            seen[vid] = 1;
            eps.push({ n: parseInt(em[1], 10), vid: vid });
        }
        eps.sort(function (a, b) { return a.n - b.n; });
        const tracks = eps.map(function (e) {
            return { name: '第' + e.n + '集', pan: '', ext: { url: 'hv:' + e.vid + ':auto', name: name } };
        });
        if (!tracks.length) return jsonify({ list: [] });
        return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
    }
    // 单视频页：现取 master 真实变体出线
    const vid = (url.match(/\/videos\/(\d+)/) || [])[1] || '';
    if (!vid) return jsonify({ list: [] });
    const tracks = [];
    const master = extractMaster(html);
    if (master) {
        const mt = await getText(master, { 'User-Agent': UA, 'Referer': url });
        const variants = parseVariants(mt, master);
        variants.forEach(function (v) {
            tracks.push({ name: v.label, pan: '', ext: { url: 'hv:' + vid + ':' + v.label, name: name } });
        });
    }
    // 兜底：详情时 master 没取到也留一条线，播时现解（签名/网络抖动时重试）
    if (!tracks.length) tracks.push({ name: '播放', pan: '', ext: { url: 'hv:' + vid + ':auto', name: name } });
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = t(ext.url);
    const m = id.match(/^hv:(\d+):(.+)$/);
    if (!m) return jsonify({ urls: [], headers: [] });
    const vid = m[1];
    const want = m[2];
    const res = await resolveVariants(vid);
    if (!res.variants.length) return jsonify({ urls: [], headers: [] });
    let hit = null;
    if (want && want !== 'auto') {
        res.variants.forEach(function (v) { if (!hit && v.label === want) hit = v; });
    }
    if (!hit) hit = res.variants[0];
    const result = {
        urls: [relayPlaylistUrl(hit.url)],
        headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }],
    };
    // 字幕：只有片名能抠出番号的片才搜（猫源同款守门；本站片名基本无番号）
    const name = String(ext.name || res.name || '');
    if (name && subExtractCode(name)) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'videos', type_name: '视频库' },
  { type_id: 'shorts', type_name: '短剧库' },
  // 糖心Vlog 组：站内 42 个博主，按 /creators 页顺序取前 12
  { type_id: 'c:fortunecutie', type_name: '糖心·饼干姐姐' },
  { type_id: 'c:xiaoxinnai', type_name: '糖心·小欣奈' },
  { type_id: 'c:91qsxw', type_name: '糖心·情深叉喔' },
  { type_id: 'c:baihumiao', type_name: '糖心·白虎喵' },
  { type_id: 'c:nana-taipei', type_name: '糖心·台北娜娜' },
  { type_id: 'c:zyxm711', type_name: '糖心·梓怡学妹' },
  { type_id: 'c:tumeijiang', type_name: '糖心·兔美酱' },
  { type_id: 'c:mengzaier', type_name: '糖心·萌崽儿' },
  { type_id: 'c:jijiaolian', type_name: '糖心·鸡教练' },
  { type_id: 'c:qiobnxingcai', type_name: '糖心·桥本香菜' },
  { type_id: 'c:beer-pineapple', type_name: '糖心·菠萝啤beer' },
  { type_id: 'c:labotianxin', type_name: '糖心·蜡笔甜心' },
  // 网红福利姬组：站内 33 个博主，按 /creators 页顺序取前 10
  { type_id: 'c:tututugirls', type_name: '福利姬·Nina妈妈' },
  { type_id: 'c:laohucai', type_name: '福利姬·老虎菜' },
  { type_id: 'c:unababyainio', type_name: '福利姬·火爆李老师' },
  { type_id: 'c:yooheejade', type_name: '福利姬·小Annie' },
  { type_id: 'c:tthenmei', type_name: '福利姬·小小t' },
  { type_id: 'c:looks199', type_name: '福利姬·深圳第一深情' },
  { type_id: 'c:gomu', type_name: '福利姬·咕姆gomu' },
  { type_id: 'c:tiaotiaosheep', type_name: '福利姬·跳跳羊' },
  { type_id: 'c:yizhidingmei', type_name: '福利姬·一只顶美' },
  { type_id: 'c:ququ999999', type_name: '福利姬·趣趣' },
  // 探花大神组：站内 10 个博主，全部
  { type_id: 'c:anmoxiaozi', type_name: '探花·按摩小子' },
  { type_id: 'c:dududown2ride', type_name: '探花·dududown2ride' },
  { type_id: 'c:tangbohu', type_name: '探花·唐伯虎' },
  { type_id: 'c:pdx739', type_name: '探花·派大星(伊藤诚)' },
  { type_id: 'c:lixunhuan', type_name: '探花·李寻欢探花' },
  { type_id: 'c:zaixaiwanglaoshi', type_name: '探花·在下王老师' },
  { type_id: 'c:ubersex24h', type_name: '探花·深海杀人鲸-小张历险记' },
  { type_id: 'c:haodadebaomihua', type_name: '探花·好大的爆米花' },
  { type_id: 'c:kanocoxx', type_name: '探花·杭州黑人博主kanocoxx' },
  { type_id: 'c:tailang', type_name: '探花·泰浪探花' },
  // PMV 组：站内 7 个博主，全部
  { type_id: 'c:tianshuihongliu', type_name: 'PMV·天水洪流PMV' },
  { type_id: 'c:maroji', type_name: 'PMV·MarojiPMV' },
  { type_id: 'c:fraudworkpmv', type_name: 'PMV·海绵婊婊PMV' },
  { type_id: 'c:klao', type_name: 'PMV·K佬PMV' },
  { type_id: 'c:pmvtik', type_name: 'PMV·PmvTik' },
  { type_id: 'c:zhangyuge-pmv', type_name: 'PMV·章鱼哥PMV' },
  { type_id: 'c:daluanjiang', type_name: 'PMV·大卵酱PMV' },
  // ASMR 组：站内 1 个博主
  { type_id: 'c:xizhou', type_name: 'ASMR·你的好朋友西洲' },
  // 短剧工作室组：站内 6 个，全部（/c/shorts 页创作者）
  { type_id: 'c:huangdou', type_name: '短剧·黄豆魔改短剧' },
  { type_id: 'c:crdj91', type_name: '短剧·91成人短剧' },
  { type_id: 'c:yeguoduanju', type_name: '短剧·野果短剧' },
  { type_id: 'c:chengguo', type_name: '短剧·橙果短剧' },
  { type_id: 'c:huang-guo', type_name: '短剧·黄果短剧' },
  { type_id: 'c:huangguo', type_name: '短剧·黄果AI短剧' },
  { type_id: 'c:short-videos', type_name: '短剧·短剧放映室' },
  { type_id: 'c:ai2048', type_name: '短剧·2048AI短剧' },
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

