// ChineseAV - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/chineseav.js
// WordPress 7.1.4 + KingTube 主题的中文 AV tube 站 chineseav.net。
// 列表 article.thumb-block；详情页 iframe src 即直链 m3u8
// （t27.cdn2020.com）；封面与视频均无 Referer 门禁，可直链；
// m3u8 单档，只出一条播放线。66 个顶级平铺分类（传媒/厂牌名，
// 无子分类），首页最新放第一位。片名带番号时接字幕芯。
const HOST = 'https://chineseav.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function headers() {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': HOST + '/',
    };
}

async function getHtml(url) {
    try {
        const r = await $fetch.get(url, { headers: headers(), timeout: 20000 });
        const data = r ? r.data : null;
        if (data) return typeof data === 'string' ? data : JSON.stringify(data);
        return '';
    } catch (e) {
        return '';
    }
}

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

function listUrl(cat, page) {
    page = Math.max(1, parseInt(page, 10) || 1);
    cat = t(cat) || 'home';
    if (cat === 'home' || cat === '') {
        return page <= 1 ? HOST + '/' : HOST + '/page/' + page + '/';
    }
    const path = HOST + '/category/' + cat + '/';
    return page > 1 ? path + 'page/' + page + '/' : path;
}

function parseList(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const re = /<article[^>]+class="[^"]*thumb-block[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const body = m[1];
        const am = body.match(/<a[^>]+href=["'](https?:\/\/chineseav\.net\/[^"']+\/)["'][^>]*title=["']([^"']+)["']/i)
            || body.match(/<a[^>]+title=["']([^"']+)["'][^>]+href=["'](https?:\/\/chineseav\.net\/[^"']+\/)["']/i);
        let href = '', title = '';
        if (am) {
            if (/^https?:\/\//i.test(am[1])) { href = am[1]; title = am[2]; }
            else { title = am[1]; href = am[2]; }
        } else {
            const hm = body.match(/<a[^>]+href=["'](https?:\/\/chineseav\.net\/[^"']+\/)["']/i);
            if (hm) href = hm[1];
        }
        if (!href) continue;
        if (seen[href]) continue;
        // 只保留视频详情链接，排除分类/标签/演员等归档页
        if (/\/category\/|\/tag\/|\/actor\/|\/actors\/|\/tags\//i.test(href)) continue;
        seen[href] = 1;
        const im = body.match(/<img[^>]+class=["'][^"']*video-main-thumb[^"']*["'][^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)
            || body.match(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]+class=["'][^"']*video-main-thumb[^"']*["']/i)
            || body.match(/<img[^>]+(?:src|data-src|data-lazy-src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        const cover = im ? absUrl(im[1]) : '';
        if (!title) {
            const tm = body.match(/<h[123][^>]*>\s*<a[^>]*>([^<]{2,200})<\/a>/i)
                || body.match(/alt=["']([^"']{2,200})["']/i);
            if (tm) title = tm[1];
        }
        title = decodeHtml(title);
        if (!title) title = href.replace(HOST, '').replace(/\//g, '');
        let remarks = '';
        const dm = body.match(/<span[^>]*class=["'][^"']*duration[^"']*["'][^>]*>([^<]+)<\/span>/i)
            || body.match(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/);
        if (dm) remarks = t(dm[1]);
        out.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks, ext: { id: href } });
    }
    return out;
}

function extractPlay(html) {
    const seen = {};
    const sources = [];
    function add(url) {
        url = t(url);
        if (!url || seen[url]) return;
        if (!/^https?:\/\//i.test(url)) return;
        if (!/\.m3u8/i.test(url)) return;
        seen[url] = 1;
        sources.push(url);
    }
    // 详情页 iframe src 即直链 m3u8
    const ims = html.match(/<iframe[^>]+src=["']([^"']+\.m3u8[^"']*)["']/gi) || [];
    for (let i = 0; i < ims.length; i++) {
        const um = ims[i].match(/src=["']([^"']+)["']/i);
        if (um) add(um[1].replace(/&amp;/g, '&'));
    }
    // 兜底：页内任意 .m3u8
    if (!sources.length) {
        const m3 = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi) || [];
        for (let i = 0; i < m3.length; i++) add(m3[i].replace(/&amp;/g, '&'));
    }
    return sources;
}

function extractTitle(html, fallback) {
    let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (m) return decodeHtml(m[1]).replace(/\s*[-|–]\s*CHINESEAV.*$/i, '').trim();
    m = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
    if (m) return decodeHtml(m[1]);
    m = html.match(/<title>([^<]+)<\/title>/i);
    if (m) return decodeHtml(m[1]).replace(/\s*[-|–].*$/, '').trim();
    return fallback || '';
}

function extractCover(html) {
    const m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (m) return absUrl(m[1]);
    return '';
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'ChineseAV',
        site: HOST,
        tabs: CLASSES.map(function (c) { return { name: c.type_name, ext: { id: c.type_id } }; }),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.id || 'home');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let list = [];
    try {
        const html = await getHtml(listUrl(id, page));
        list = parseList(html);
    } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = String(ext.text || '').trim();
    if (!kw) return jsonify({ list: [] });
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let url = HOST + '/?s=' + encodeURIComponent(kw);
    if (page > 1) url = HOST + '/page/' + page + '/?s=' + encodeURIComponent(kw);
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
    const sources = extractPlay(html);
    if (!sources.length) return jsonify({ list: [] });
    // 单档：只出一条播放线
    return jsonify({
        list: [{
            title: '在线播放',
            tracks: [{ name: '播放', pan: '', ext: { url: sources[0], name: name } }],
        }],
    });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    const result = { urls: [url], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] };
    const name = String(ext.name || '');
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: '3xchina-net', type_name: '3XCHINA' },
  { type_id: 'absolute-media', type_name: 'Absolute Media' },
  { type_id: 'aishen-media', type_name: '爱神传媒' },
  { type_id: 'angel-pictures', type_name: 'Angel Pictures' },
  { type_id: 'asian-hot-media', type_name: 'Asian Hot Media' },
  { type_id: 'av-emperor-media', type_name: 'AV帝王传媒' },
  { type_id: 'banana-video-media', type_name: '香蕉视频传媒' },
  { type_id: 'bronze-film', type_name: 'Bronze Film' },
  { type_id: 'candy-heart-vlog', type_name: '糖心Vlog' },
  { type_id: 'cat-claw-video', type_name: '猫爪视频' },
  { type_id: 'changzhi-media', type_name: '常知传媒' },
  { type_id: 'chinese-porn', type_name: '国产' },
  { type_id: 'crazy-video-media', type_name: '疯狂视频传媒' },
  { type_id: 'doll-sister', type_name: '娃娃姐妹' },
  { type_id: 'domestic-av', type_name: '国产AV' },
  { type_id: 'douyin-media', type_name: '抖音传媒' },
  { type_id: 'drama', type_name: '剧情' },
  { type_id: 'eagle-av', type_name: '鹰眼AV' },
  { type_id: 'ed-mosaic', type_name: 'ED马赛克' },
  { type_id: 'edison-media', type_name: '爱迪生传媒' },
  { type_id: 'elephant-media', type_name: '大象传媒' },
  { type_id: 'eros-media', type_name: 'Eros Media' },
  { type_id: 'fang-lang-media', type_name: '放浪传媒' },
  { type_id: 'guanxi-media', type_name: '关系传媒' },
  { type_id: 'hot-pepper-original', type_name: '辣椒原创' },
  { type_id: 'idol-media', type_name: '偶像传媒' },
  { type_id: 'jelly-media', type_name: '果冻传媒' },
  { type_id: 'jingdong-pictures', type_name: '京东影业' },
  { type_id: 'julu-entertainment-media', type_name: '巨鹿娱乐传媒' },
  { type_id: 'juxiang-entertainment-media', type_name: '聚香娱乐传媒' },
  { type_id: 'korean-adult-films', type_name: '韩国成人' },
  { type_id: 'lmg-film-industry-media', type_name: 'LMG影业传媒' },
  { type_id: 'madou-media', type_name: '麻豆传媒' },
  { type_id: 'maini-media', type_name: '麦尼传媒' },
  { type_id: 'mama-media', type_name: '妈妈传媒' },
  { type_id: 'meat-media', type_name: '肉传媒' },
  { type_id: 'mg-film-industry-media', type_name: 'MG影业传媒' },
  { type_id: 'micro-circle', type_name: '微圈' },
  { type_id: 'millennium-media', type_name: '千年传媒' },
  { type_id: 'mr-rabbit', type_name: '兔子先生' },
  { type_id: 'multi-p', type_name: 'Multi-P' },
  { type_id: 'omi-international-media', type_name: 'Omi国际传媒' },
  { type_id: 'peach-video-media', type_name: '蜜桃视频传媒' },
  { type_id: 'porn-story', type_name: '情色故事' },
  { type_id: 'pussy-hunter', type_name: '猎艳' },
  { type_id: 'red-light-video', type_name: '红灯视频' },
  { type_id: 'rou-video', type_name: '肉视频' },
  { type_id: 'royal-chinese', type_name: '皇家华人' },
  { type_id: 'sa-international-media', type_name: 'SA国际传媒' },
  { type_id: 'sex-control', type_name: '性控' },
  { type_id: 'shaking-yin-media', type_name: '抖阴传媒' },
  { type_id: 'starry-sky-unlimited-media', type_name: '星空无限传媒' },
  { type_id: 'start-media-sex-vision-media', type_name: '星视传媒' },
  { type_id: 'sugar-heart-vlog', type_name: '糖心Vlog' },
  { type_id: 'sweet-heart-vlog', type_name: '甜心Vlog' },
  { type_id: 'three-wolf-media', type_name: '三狼传媒' },
  { type_id: 'tianmei-media', type_name: '天美传媒' },
  { type_id: 'timi-media', type_name: '蒂米传媒' },
  { type_id: 'utopia-media', type_name: '乌托邦传媒' },
  { type_id: 'venus', type_name: '维纳斯' },
  { type_id: 'victorias-secret-media', type_name: '维密传媒' },
  { type_id: 'watanabe-media', type_name: '渡边传媒' },
  { type_id: 'wechat-media', type_name: '微信传媒' },
  { type_id: 'wemiquan-media', type_name: '微密圈传媒' },
  { type_id: 'xingba-media', type_name: '星吧传媒' },
  { type_id: 'xingkong-unlimited-media', type_name: '星空无限传媒' },
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

