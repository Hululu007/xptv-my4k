// Av77 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_av77.js
// 站点 av77.com，服务端渲染列表；详情页内联 Dean Edwards packer 两种方言，
// surrit 主播单走站方自带 pl3 代理（直连 surrit 回 403），按实测档位出线。
// 片名带番号，一律接字幕芯（getPlayinfo 内 subSearch）。
const HOST = 'https://av77.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// 站方自带播单代理（站内 JS 同款拼接方式：原地址直接拼在 ?url= 后，不编码）
const PL3 = 'https://pl3.vvvvvvvv.top/api/play?url=';
const PAGE_SIZE = 24;

function t(v) {
    return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
    return t(s)
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, function (m, n) { try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return m; } })
        .replace(/&#x([0-9a-fA-F]+);/g, function (m, n) { try { return String.fromCharCode(parseInt(n, 16)); } catch (e) { return m; } });
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

function sleep(ms) {
    return new Promise(function (r) {
        if (typeof setTimeout === 'function') setTimeout(r, ms); else r();
    });
}

// 取页：强制拿原始文本。
async function getHtml(url, extraHeaders, timeoutMs) {
    try {
        const r = await $fetch.get(url, {
            headers: Object.assign(headers(), extraHeaders || {}),
            timeout: timeoutMs || 20000,
        });
        const data = r ? r.data : null;
        if (typeof data === 'string') return data;
        if (data) return JSON.stringify(data);
        return '';
    } catch (e) {
        return '';
    }
}

function pl3wrap(u) {
    return PL3 + u;
}

// ---------- Dean Edwards packer 反混淆（无 eval，纯字符串替换） ----------
function unpackDeanEdwards(html) {
    const out = [];
    const pats = [
        /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('((?:\\.|[^'\\])*)',(\d+),(\d+),'((?:\\.|[^'\\])*)'\.split\('\|'\)/g,
        /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\("((?:\\.|[^"\\])*)",(\d+),(\d+),['"]((?:\\.|[^'"\\])*)['"]\.split\(['"]\|['"]\)/g,
    ];
    for (let pi = 0; pi < pats.length; pi++) {
        const re = pats[pi];
        let m;
        while ((m = re.exec(html))) {
            let p = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const a = parseInt(m[2], 10);
            const k = m[4].split('|');
            let c = parseInt(m[3], 10);
            while (c--) {
                if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            }
            out.push(p);
        }
    }
    return out;
}

// 从解开的 packer 代码里取播放源三变量（source 系优先，f/d/b 为回退变量）。
function extractPackedSources(html) {
    const vars = {};
    const codes = unpackDeanEdwards(html);
    for (let i = 0; i < codes.length; i++) {
        const re = /([A-Za-z_$][\w$]*)\s*=\s*'([^']+)'/g;
        let m;
        while ((m = re.exec(codes[i]))) {
            if (/^https?:\/\//i.test(m[2])) vars[m[1]] = m[2];
        }
    }
    return {
        master: vars.source || vars.f || '',
        v842: vars.source842 || vars.d || '',
        v1280: vars.source1280 || vars.b || '',
    };
}

// 无 packer 条目的下载按钮直链 MP4。
function extractDownloadMp4s(html) {
    const out = [];
    const seen = {};
    const dec = decodeHtml(html);
    const re = /<a[^>]+href="(https?:\/\/[^"]+\.mp4[^"]*)"[^>]*>/gi;
    let m;
    while ((m = re.exec(dec))) {
        const u = m[1].replace(/&amp;/g, '&');
        if (/preview\.mp4/i.test(u)) continue;
        if (seen[u]) continue;
        seen[u] = true;
        out.push(u);
    }
    return out;
}

function mp4Label(u) {
    const m = String(u).match(/\/(\d{3,4})p\.mp4/i);
    if (m) return m[1] + 'p';
    if (/fullhd/i.test(u)) return '1080p';
    return '原画';
}

// 变体地址里取档位（如 /720p/、/1280x720/、/842x480/）。
function variantLabelFromPath(u) {
    let m = String(u).match(/\/(\d{3,4})p\//i);
    if (m) return m[1] + 'p';
    m = String(u).match(/\/(\d{3,4})x(\d{3,4})\//i);
    if (m) return Math.min(parseInt(m[1], 10), parseInt(m[2], 10)) + 'p';
    return '原画';
}

// 主播单解析：#EXT-X-STREAM-INF(RESOLUTION=WxH) 下一行是变体地址；
// 无 RESOLUTION 时不猜档位、返回空（调用方单线兜底）。
function parseMaster(text, base) {
    const out = [];
    const seen = {};
    const lines = String(text || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const inf = /#EXT-X-STREAM-INF:([^\n]*)/.exec(lines[i]);
        if (!inf) continue;
        let j = i + 1;
        let uri = '';
        while (j < lines.length) {
            const s = t(lines[j]);
            if (s && s.charAt(0) !== '#') { uri = s; break; }
            j++;
        }
        if (!uri) continue;
        const rm = /RESOLUTION=(\d+)x(\d+)/i.exec(inf[1]);
        if (!rm) continue;
        const label = Math.min(parseInt(rm[1], 10), parseInt(rm[2], 10)) + 'p';
        if (seen[label]) continue;
        seen[label] = true;
        let abs = uri;
        if (!/^https?:\/\//i.test(uri)) {
            const b = base.replace(/\/[^\/]*$/, '/');
            abs = b + uri.replace(/^\//, '');
        }
        out.push({ label: label, url: abs });
    }
    out.sort(function (a, b) { return parseInt(b.label, 10) - parseInt(a.label, 10); });
    return out;
}

// 取主播单（走 pl3 代理；pl3 偶发 500，重试一次）。
async function fetchMasterVariants(master, durl) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const txt = await getHtml(pl3wrap(master), { Referer: durl }, 20000);
        if (txt && txt.indexOf('#EXTM3U') >= 0) return parseMaster(txt, master);
        await sleep(400);
    }
    return [];
}

function parsePagecount(html, page) {
    if (!html) return page;
    let m = html.match(/id="price-currency">\s*\/\s*([\d,]+)/);
    if (m) {
        const n = parseInt(m[1].replace(/,/g, ''), 10);
        if (n > 0) return Math.max(n, page);
    }
    const m2 = html.match(/totalPages:\s*(\d+)/);
    if (m2) {
        const n = parseInt(m2[1], 10);
        if (n > 0) return Math.max(n, page);
    }
    const re = /[?&]page=(\d+)/g;
    let mx = page;
    let mm;
    while ((mm = re.exec(html)) !== null) {
        const n = parseInt(mm[1], 10);
        if (n > 0 && n < 1000000 && n > mx) mx = n;
    }
    return mx;
}

function listUrl(id, sub, page) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    let base = '';
    if (id === 'new') base = '/new';
    else if (id === 'chinese-subtitle') base = '/chinese-subtitle';
    else if (id === 'madou') base = '/madou';
    else if (id === 'kinostream') base = '/kinostream';
    else if (id === 'timestudio') base = '/TIMESTUDIO';
    else if (id === 'anime') base = '/anime';
    else if (id === 'vr') base = '/VR';
    else if (id === 'avtalk') base = '/avtalk';
    else if (id === 'masem') base = '/masem';
    else if (id === 'plantsvscunts') base = '/PLANTSVSCUNTS';
    else if (id === 'genres') base = '/genres/' + encodeURIComponent(sub || GENRE_CARDS[0].v);
    else if (id === 'uncensored') base = '/' + (sub || 'uncensored-leak');
    else if (id === 'amateur') base = '/' + (sub || 'siro');
    else if (id === 'asian') base = '/' + (sub || 'madou');
    else return '';
    return HOST + base + (p > 1 ? '?page=' + p : '');
}

// 列表解析：按 <div class="thumbnail group"> 切块；标题锚 class 含
// text-secondary，封面取 data-src 优先于 src，时长取卡片内第一个 H:MM(:SS)。
function parseList(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const chunks = String(html).split(/<div[^>]*class="thumbnail group"/);
    for (let i = 1; i < chunks.length; i++) {
        const c = chunks[i];
        const hm = c.match(/<a href="(\/[^"]+)"[^>]*>/);
        if (!hm) continue;
        const href = decodeHtml(hm[1]);
        if (!/^\/[A-Za-z0-9][A-Za-z0-9\-._]*$/.test(href)) continue;
        if (seen[href]) continue;
        seen[href] = true;
        let title = '';
        const tm = c.match(/<a[^>]+class="[^"]*text-secondary[^"]*"[^>]*>([\s\S]{0,400}?)<\/a>/i);
        if (tm) title = decodeHtml(tm[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        if (!title) {
            const am = c.match(/<img[^>]+alt="([^"]*)"/i);
            if (am) title = decodeHtml(am[1]);
        }
        if (!title) title = href.slice(1);
        if (/^\{\{|\bitem\.(title|dvd_id)\b/.test(title)) continue;
        let cover = '';
        const dm = c.match(/<img[^>]+data-src="(https?:\/\/[^"]+)"/i);
        const sm = c.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
        if (dm) cover = decodeHtml(dm[1]);
        else if (sm) cover = decodeHtml(sm[1]);
        if (!cover) continue;
        let remarks = '';
        const rm = c.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
        if (rm) remarks = rm[1];
        out.push({ vod_id: HOST + href, vod_name: title, vod_pic: cover, vod_remarks: remarks, ext: { id: HOST + href } });
    }
    return out;
}

function extractTitle(html, fallback) {
    let m = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (m) return decodeHtml(m[1]);
    m = html.match(/<title>([^<]*)<\/title>/i);
    if (m) return decodeHtml(m[1]).replace(/\s*-\s*AV77 AV.*$/i, '').trim();
    return fallback || '';
}

function extractCover(html) {
    const m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (m) return decodeHtml(m[1]);
    return '';
}

function extractDesc(html) {
    const m = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (m) return decodeHtml(m[1]);
    return '';
}
const GENRE_CARDS = [
  { n: '外国女优', v: '外国女优' }, { n: '独家', v: '独家' }, { n: '中出', v: '中出' },
  { n: '单体作品', v: '单体作品' }, { n: '巨乳', v: '巨乳' }, { n: '人妻', v: '人妻' },
  { n: '熟女', v: '熟女' }, { n: '素人', v: '素人' }, { n: '美少女', v: '美少女' },
  { n: '口交', v: '口交' }, { n: '薄格', v: '薄格' }, { n: '多人运动', v: '多人运动' },
  { n: '骑乘', v: '骑乘' }, { n: '痴女', v: '痴女' }, { n: '4小时以上', v: '4小时以上' },
  { n: '女高中生', v: '女高中生' }, { n: '潮吹', v: '潮吹' }, { n: '合集', v: '合集' },
  { n: '自拍', v: '自拍' }, { n: '乳交', v: '乳交' }, { n: '苗条', v: '苗条' },
  { n: '恋物癖', v: '恋物癖' }, { n: '企划', v: '企划' }, { n: '美乳', v: '美乳' },
  { n: '乱伦', v: '乱伦' }, { n: '搭讪', v: '搭讪' }, { n: 'NTR', v: 'NTR' },
  { n: '偷拍', v: '偷拍' }, { n: '颜射', v: '颜射' }, { n: '淫乱', v: '淫乱' },
  { n: '自慰', v: '自慰' }, { n: '剧情', v: '剧情' }, { n: '手淫', v: '手淫' },
  { n: '姐姐', v: '姐姐' }, { n: '羞辱', v: '羞辱' }, { n: '拘束', v: '拘束' },
  { n: '纪录片', v: '纪录片' },
];

const UNCENSORED_CARDS = [
  { n: '無碼流出', v: 'uncensored-leak' }, { n: 'FC2', v: 'fc2' }, { n: 'HEYZO', v: 'heyzo' },
  { n: '東京熱', v: 'tokyohot' }, { n: '一本道', v: '1pondo' }, { n: 'Caribbeancom', v: 'caribbeancom' },
  { n: 'Caribbeancompr', v: 'caribbeancompr' }, { n: '10musume', v: '10musume' },
  { n: 'pacopacomama', v: 'pacopacomama' }, { n: 'Gachinco', v: 'gachinco' },
  { n: 'XXX-AV', v: 'xxxav' }, { n: '人妻斬', v: 'marriedslash' },
  { n: '頑皮 4610', v: 'naughty4610' }, { n: '頑皮 0930', v: 'naughty0930' },
];

const AMATEUR_CARDS = [
  { n: 'SIRO', v: 'siro' }, { n: 'LUXU', v: 'luxu' },
  { n: 'PRESTIGE PREMIUM', v: 'maan' }, { n: 'S-CUTE', v: 'scute' }, { n: 'ARA', v: 'ara' },
];

const ASIAN_CARDS = [
  { n: '麻豆傳媒', v: 'madou' }, { n: 'TWAV', v: 'twav' }, { n: 'Furuke', v: 'furuke' },
  { n: '韓國直播', v: 'klive' }, { n: '中國直播', v: 'clive' }, { n: '抖阴视频', v: 'tiktok' },
  { n: '明星换脸', v: 'starface' }, { n: '主播直播', v: 'cnlive' }, { n: '国产传媒', v: 'cmedia' },
  { n: '玩偶姐姐', v: 'playgirl' }, { n: '网-曝-门', v: 'netdoor' },
];

const CLASSES = [
  { type_id: 'new', type_name: '最近更新' },
  { type_id: 'chinese-subtitle', type_name: '中文字幕' },
  { type_id: 'genres', type_name: '類型' },
  { type_id: 'uncensored', type_name: '無碼影片' },
  { type_id: 'amateur', type_name: '素人' },
  { type_id: 'asian', type_name: '亞洲AV' },
  { type_id: 'madou', type_name: '国产AV' },
  { type_id: 'kinostream', type_name: 'kinostream' },
  { type_id: 'timestudio', type_name: '时间工作室' },
  { type_id: 'anime', type_name: '成人动漫' },
  { type_id: 'vr', type_name: 'VR' },
  { type_id: 'avtalk', type_name: 'AV解说' },
  { type_id: 'masem', type_name: '马赛姆' },
  { type_id: 'plantsvscunts', type_name: '猎奇' },
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


async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'Av77',
        site: HOST,
        tabs: CLASSES.map(function (c) { return { name: c.type_name, ext: { id: c.type_id } }; }),
        filters: {
            genres: [{ key: 'sub', name: '類型', value: GENRE_CARDS }],
            uncensored: [{ key: 'sub', name: '無碼影片', value: UNCENSORED_CARDS }],
            amateur: [{ key: 'sub', name: '素人', value: AMATEUR_CARDS }],
            asian: [{ key: 'sub', name: '亞洲AV', value: ASIAN_CARDS }],
        },
    });
}

function cardHas(list, v) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].v === v) return true;
    }
    return false;
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const id = String(ext.id || 'new');
    const sub = String(ext.sub || (ext.extend && ext.extend.sub) || '');
    // 筛选值本身定路径（与当前顶级无关）：题材 -> /genres/<名>，
    // 無碼/素人/亞洲值 -> /<值>；未命中时回落 listUrl 按顶级解释。
    let url = '';
    if (sub) {
        if (cardHas(GENRE_CARDS, sub)) url = HOST + '/genres/' + encodeURIComponent(sub);
        else if (cardHas(UNCENSORED_CARDS, sub) || cardHas(AMATEUR_CARDS, sub) || cardHas(ASIAN_CARDS, sub)) url = HOST + '/' + sub;
    }
    if (!url) url = listUrl(id, sub, page);
    else if (page > 1) url += '?page=' + page;
    if (!url) return jsonify({ list: [] });
    const html = await getHtml(url);
    const list = parseList(html);
    return jsonify({ list: list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let durl = t(ext.id);
    if (!durl) return jsonify({ list: [] });
    if (!/^https?:\/\//i.test(durl)) durl = absUrl(durl);
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    const name = extractTitle(html, durl);
    // 播放线：packer 源优先，下载 MP4 兜底；无源则出空线（不编造）。
    // packer 也可能直接给 MP4：MP4 直出原链接，不当 m3u8 取主播单、不二次包 pl3。
    const srcs = extractPackedSources(html);
    const lines = [];
    const isMp4 = function (u) { return /\.mp4(\?|#|$)/i.test(String(u || '')); };
    if (srcs.master && isMp4(srcs.master)) {
        lines.push({ label: mp4Label(srcs.master), url: srcs.master });
    } else if (srcs.master) {
        if (/player\.xxnet999\.com/i.test(srcs.master)) {
            lines.push({ label: '原画', url: srcs.master });
        } else {
            const variants = await fetchMasterVariants(srcs.master, durl);
            if (variants.length) {
                for (let i = 0; i < variants.length; i++) {
                    lines.push({ label: variants[i].label, url: variants[i].url });
                }
            } else {
                const single = srcs.v1280 || srcs.v842 || '';
                if (single) {
                    if (isMp4(single)) lines.push({ label: mp4Label(single), url: single });
                    else lines.push({ label: variantLabelFromPath(single), url: pl3wrap(single) });
                } else {
                    lines.push({ label: '原画', url: pl3wrap(srcs.master) });
                }
            }
        }
    }
    if (!lines.length) {
        const mp4s = extractDownloadMp4s(html);
        for (let i = 0; i < mp4s.length; i++) {
            lines.push({ label: mp4Label(mp4s[i]), url: mp4s[i] });
        }
    }
    const tracks = [];
    for (let i = 0; i < lines.length; i++) {
        tracks.push({ name: lines[i].label, pan: '', ext: { url: lines[i].url, name: name } });
    }
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return jsonify({ urls: [], headers: [] });
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

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = HOST + '/search/' + encodeURIComponent(wd);
    if (page > 1) url += '?page=' + page;
    const html = await getHtml(url);
    const list = parseList(html);
    return jsonify({ list: list });
}
