// AVPorn - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/avporn.js
// Nuxt 3 站，主域 avporn.co，给定域为入口镜像。列表走 JSON API；
// 详情页 JSON-LD 的 contentUrl 即带签名的 manifest，detail 现取；
// 封面 AES 加密存储，必须走站方 /_img?u= 图片代理；短剧走 drama API，集数现取签名。
// 单档，不编造清晰度。片名带番号，接字幕芯（getPlayinfo 内 subSearch）。
const HOST = 'https://11.bkskfhqdfas.icu';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function headers() {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': HOST + '/',
    };
}

function t(v) {
    return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
    return t(s)
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return HOST + u;
    return HOST + '/' + u;
}

// 封面必须走站方 /_img?u= 图片代理（封面 AES 加密存储，直链返回 application/octet-stream）。
function proxyCover(url) {
    url = t(url);
    if (!url) return '';
    if (url.indexOf('/_img?u=') >= 0) {
        return url.replace(/^https?:\/\/avporn\.co\//i, HOST + '/');
    }
    return HOST + '/_img?u=' + encodeURIComponent(absUrl(url));
}

function fmtDur(sec) {
    sec = parseInt(sec, 10);
    if (!sec || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = (m < 10 ? '0' : '') + m;
    const ss = (s < 10 ? '0' : '') + s;
    return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
}

// ISO8601 时长 PT2H29M35S -> 秒
function parseIsoDur(s) {
    const m = t(s).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (parseInt(m[1] || '0', 10) * 3600)
        + (parseInt(m[2] || '0', 10) * 60)
        + parseInt(m[3] || '0', 10);
}

async function getHtml(url) {
    try {
        const r = await $fetch.get(url, { headers: headers(), timeout: 20000 });
        const d = r ? r.data : null;
        return typeof d === 'string' ? d : (d == null ? '' : JSON.stringify(d));
    } catch (e) {
        return '';
    }
}

async function getJson(url) {
    try {
        const r = await $fetch.get(url, { headers: headers(), timeout: 20000 });
        const d = r ? r.data : null;
        if (d && typeof d === 'object') return d;
        const s = typeof d === 'string' ? d : '';
        return s ? JSON.parse(s) : null;
    } catch (e) {
        return null;
    }
}

// /api/v1/video/list 返回的条目 -> 卡片
function videoItemToCard(it) {
    if (!it || it.id == null) return null;
    const dur = fmtDur(it.durationSeconds);
    const code = t(it.code);
    return {
        vod_id: 'v:' + it.id,
        vod_name: decodeHtml(it.title || ('视频 ' + it.id)),
        vod_pic: proxyCover(it.coverUrl || ''),
        vod_remarks: dur + (code ? ' · ' + code : ''),
        ext: { id: 'v:' + it.id },
    };
}

// 视频列表 HTML (vcard) -> 卡片，用于搜索页
function parseVcardHtml(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const re = /<a href="\/videos\/(\d+)\/" class="vcard__link">([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const id = m[1];
        if (seen[id]) continue;
        const body = m[2];
        let title = '';
        const am = body.match(/alt="([^"]{2,200})"/i);
        if (am) title = decodeHtml(am[1]);
        if (!title) continue;
        seen[id] = true;
        let pic = '';
        const nm = body.match(/<noscript><img[^>]*src="([^"]+)"/i);
        if (nm) pic = nm[1];
        else {
            const im = body.match(/(?:src|data-src)="([^"]+)"/i);
            if (im) pic = im[1];
        }
        let remarks = '';
        const dm = body.match(/<span class="dur">([^<]+)<\/span>/i);
        if (dm) remarks = t(dm[1]);
        const bm = body.match(/<span class="vcard__badge">([^<]+)<\/span>/i);
        if (bm) remarks = remarks ? remarks + ' · ' + t(bm[1]) : t(bm[1]);
        out.push({
            vod_id: 'v:' + id,
            vod_name: title,
            vod_pic: proxyCover(pic),
            vod_remarks: remarks,
            ext: { id: 'v:' + id },
        });
    }
    return out;
}

// AV解说列表 HTML (shorts-card) -> 卡片
function parseShortsHtml(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const re = /<a href="\/short-video\/(\d+)\/" class="shorts-card">([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const id = m[1];
        if (seen[id]) continue;
        const body = m[2];
        let title = '';
        const tm = body.match(/shorts-card__title">([^<]{2,200})</i)
            || body.match(/alt="([^"]{2,200})"/i);
        if (tm) title = decodeHtml(tm[1]);
        if (!title) continue;
        seen[id] = true;
        let pic = '';
        const nm = body.match(/<noscript><img[^>]*src="([^"]+)"/i);
        if (nm) pic = nm[1];
        let remarks = '';
        const dm = body.match(/shorts-card__dur">([^<]+)</i);
        if (dm) remarks = t(dm[1]);
        out.push({
            vod_id: 'sv:' + id,
            vod_name: title,
            vod_pic: proxyCover(pic),
            vod_remarks: remarks,
            ext: { id: 'sv:' + id },
        });
    }
    return out;
}

// 短剧列表 HTML (sd-card) -> 卡片，单页无翻页
function parseDramaHtml(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const re = /<a href="\/short-drama\/(\d+)\/ep-1\/"[^>]*class="sd-card__art[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const id = m[1];
        if (seen[id]) continue;
        const body = m[2];
        let title = '';
        const am = body.match(/alt="([^"]{2,200})"/i);
        if (am) title = decodeHtml(am[1]);
        if (!title) continue;
        seen[id] = true;
        let pic = '';
        const nm = body.match(/<noscript><img[^>]*src="([^"]+)"/i);
        if (nm) pic = nm[1];
        out.push({
            vod_id: 'sd:' + id,
            vod_name: title,
            vod_pic: proxyCover(pic),
            vod_remarks: '短剧',
            ext: { id: 'sd:' + id },
        });
    }
    return out;
}

// 从详情页 HTML 取 JSON-LD VideoObject 的 contentUrl / 标题 / 简介 / 封面 / 时长 / 番号
function extractVideoDetail(html) {
    const out = { manifest: '', title: '', desc: '', pic: '', durSec: 0, code: '' };
    if (!html) return out;
    const cm = html.match(/"contentUrl"\s*:\s*"([^"]+manifest\.m3u8[^"]*)"/i);
    if (cm) out.manifest = cm[1];
    // 番号只在详情页「番号」栏（detail-meta__code），不在标题里；兜底取面包屑末项
    let km = html.match(/detail-meta__code[\s\S]{0,400}?<span>([A-Za-z0-9][A-Za-z0-9\-]{2,24})<\/span>/i);
    if (!km) km = html.match(/"@type":"ListItem","position":\d+,"name":"([A-Za-z]{2,10}-\d{2,8}[A-Za-z]?)"/i);
    if (km) out.code = t(km[1]);
    let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (m) out.title = decodeHtml(m[1]).replace(/\s*[｜|]\s*免费高清观看\s*-\s*AVporn\s*$/i, '').replace(/\s*-\s*AVporn\s*$/i, '');
    m = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    if (m) out.desc = decodeHtml(m[1]);
    m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (m) out.pic = m[1];
    m = html.match(/"duration"\s*:\s*"([^"]+)"/i);
    if (m) out.durSec = parseIsoDur(m[1]);
    return out;
}
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'hot', type_name: '热门' },
  { type_id: 'cat:1', type_name: '日本AV' },
  { type_id: 'cat:3', type_name: '无码影片' },
  { type_id: 'cat:4', type_name: '中文字幕' },
  { type_id: 'cat:5', type_name: '素人' },
  { type_id: 'cat:6', type_name: '剧情' },
  { type_id: 'cat:7', type_name: '人妻熟女' },
  { type_id: 'cat:8', type_name: '制服' },
  { type_id: 'cat:9', type_name: '职场OL' },
  { type_id: 'cat:10', type_name: '角色扮演' },
  { type_id: 'cat:11', type_name: '调教SM' },
  { type_id: 'cat:12', type_name: '成人综艺' },
  { type_id: 'cat:13', type_name: '魔镜号' },
  { type_id: 'cat:14', type_name: '家庭乱伦' },
  { type_id: 'cat:31', type_name: 'NTR' },
  { type_id: 'cat:42', type_name: '多人运动' },
  { type_id: 'cat:2', type_name: '国产精选' },
  { type_id: 'cat:38', type_name: '素人原创' },
  { type_id: 'cat:35', type_name: '国产自拍' },
  { type_id: 'cat:40', type_name: '探花系列' },
  { type_id: 'cat:46', type_name: '麻豆传媒' },
  { type_id: 'cat:48', type_name: '糖心vlog' },
  { type_id: 'cat:36', type_name: '情侣自拍' },
  { type_id: 'cat:37', type_name: '网红主播' },
  { type_id: 'cat:39', type_name: '剧情' },
  { type_id: 'cat:41', type_name: '偷拍' },
  { type_id: 'cat:49', type_name: '蜜桃传媒' },
  { type_id: 'cat:50', type_name: '星空传媒' },
  { type_id: 'cat:51', type_name: '天美传媒' },
  { type_id: 'cat:52', type_name: '香蕉视频' },
  { type_id: 'cat:53', type_name: '果冻传媒' },
  { type_id: 'cat:54', type_name: '杏吧原版' },
  { type_id: 'cat:55', type_name: '精东影业' },
  { type_id: 'shortvideo', type_name: 'AV解说' },
  { type_id: 'shortdrama', type_name: '短剧' },
  { type_id: 'tag:1', type_name: '巨乳' },
  { type_id: 'tag:116', type_name: '酒店' },
  { type_id: 'tag:159', type_name: '中文字幕' },
  { type_id: 'tag:166', type_name: '素人' },
  { type_id: 'tag:184', type_name: '黑丝' },
  { type_id: 'tag:263', type_name: '河北彩花' },
  { type_id: 'tag:342', type_name: '口交' },
  { type_id: 'tag:22', type_name: '熟女' },
  { type_id: 'tag:23', type_name: '苗条' },
  { type_id: 'tag:20', type_name: '童颜' },
  { type_id: 'tag:348', type_name: '清纯' },
  { type_id: 'tag:21', type_name: '御姐' },
  { type_id: 'tag:34', type_name: '丰满' },
  { type_id: 'tag:29', type_name: '美腿' },
  { type_id: 'tag:349', type_name: '性感' },
  { type_id: 'tag:350', type_name: '素颜' },
  { type_id: 'tag:50', type_name: '人妻' },
  { type_id: 'tag:46', type_name: '女教师' },
  { type_id: 'tag:72', type_name: '女上司' },
  { type_id: 'tag:56', type_name: '护士' },
  { type_id: 'tag:71', type_name: '邻居太太' },
  { type_id: 'tag:351', type_name: '职场OL' },
  { type_id: 'tag:57', type_name: '女仆' },
  { type_id: 'tag:76', type_name: '寡妇' },
  { type_id: 'tag:58', type_name: '空姐' },
  { type_id: 'tag:107', type_name: '深喉' },
  { type_id: 'tag:109', type_name: '足交' },
  { type_id: 'tag:112', type_name: '骑乘位' },
  { type_id: 'tag:119', type_name: '捆绑' },
  { type_id: 'tag:111', type_name: '后入' },
  { type_id: 'tag:108', type_name: '乳交' },
  { type_id: 'tag:104', type_name: '颜射' },
  { type_id: 'tag:103', type_name: '内射' },
  { type_id: 'tag:352', type_name: 'SM调教' },
  { type_id: 'tag:156', type_name: '无码' },
  { type_id: 'tag:353', type_name: '4K超清' },
  { type_id: 'tag:163', type_name: 'VR' },
  { type_id: 'tag:354', type_name: '经典作品' },
  { type_id: 'tag:355', type_name: '新人出道' },
  { type_id: 'tag:356', type_name: '剧情长片' },
  { type_id: 'tag:181', type_name: '完整版' },
  { type_id: 'tag:357', type_name: '独家作品' },
  { type_id: 'tag:183', type_name: '破解版' },
  { type_id: 'tag:54', type_name: 'JK制服' },
  { type_id: 'tag:358', type_name: '瑜伽裤' },
  { type_id: 'tag:53', type_name: '制服' },
  { type_id: 'tag:195', type_name: '和服' },
  { type_id: 'tag:197', type_name: '泳装' },
  { type_id: 'tag:359', type_name: '旗袍' },
  { type_id: 'tag:188', type_name: '高跟鞋' },
  { type_id: 'tag:185', type_name: '丝袜' },
  { type_id: 'tag:360', type_name: '职业装' },
  { type_id: 'tag:262', type_name: '三上悠亚' },
  { type_id: 'tag:271', type_name: '石川澪' },
  { type_id: 'tag:365', type_name: '枫可怜' },
  { type_id: 'tag:366', type_name: '八木奈奈' },
  { type_id: 'tag:295', type_name: '葵司' },
  { type_id: 'tag:272', type_name: '桃乃木香奈' },
  { type_id: 'tag:274', type_name: '天使萌' },
  { type_id: 'tag:276', type_name: '相泽南' },
  { type_id: 'tag:267', type_name: '明里紬' },
  { type_id: 'tag:48', type_name: '办公室' },
  { type_id: 'tag:361', type_name: '居家' },
  { type_id: 'tag:261', type_name: '温泉' },
  { type_id: 'tag:362', type_name: '浴室' },
  { type_id: 'tag:240', type_name: '厨房' },
  { type_id: 'tag:363', type_name: '户外' },
  { type_id: 'tag:125', type_name: '电车' },
  { type_id: 'tag:364', type_name: '摄影棚' },
  { type_id: 'tag:301', type_name: '学校' },
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
        title: 'AVPorn',
        site: HOST,
        tabs: CLASSES.map(function (c) { return { name: c.type_name, ext: { id: c.type_id } }; }),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const id = String(ext.id || 'home');
    const size = 20;

    // AV解说：HTML 列表
    if (id === 'shortvideo') {
        const url = page <= 1 ? HOST + '/short-video/' : HOST + '/short-video/?page=' + page;
        const list = parseShortsHtml(await getHtml(url));
        return jsonify({ list: list });
    }
    // 短剧：HTML 列表，单页
    if (id === 'shortdrama') {
        const list = page > 1 ? [] : parseDramaHtml(await getHtml(HOST + '/short-drama/'));
        return jsonify({ list: list });
    }

    // 视频列表走 JSON API
    let qs = 'sort=latest&page=' + page + '&size=' + size;
    if (id === 'hot') qs = 'sort=popular&page=' + page + '&size=' + size;
    else if (id.indexOf('cat:') === 0) qs = 'categoryIds=' + id.slice(4) + '&sort=latest&page=' + page + '&size=' + size;
    else if (id.indexOf('tag:') === 0) qs = 'tagIds=' + id.slice(4) + '&sort=latest&page=' + page + '&size=' + size;
    else if (id !== 'home' && id !== '') qs = 'categoryIds=' + encodeURIComponent(id) + '&sort=latest&page=' + page + '&size=' + size;

    const json = await getJson(HOST + '/api/v1/video/list?' + qs);
    const videos = json && json.data && json.data.videos;
    const items = (videos && Array.isArray(videos.items)) ? videos.items : [];
    const list = [];
    for (let i = 0; i < items.length; i++) {
        const c = videoItemToCard(items[i]);
        if (c) list.push(c);
    }
    return jsonify({ list: list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const rawId = String(ext.id || '').trim();
    if (!rawId) return jsonify({ list: [] });

    // 短剧：走 drama API，集数放 token，播放时现取签名
    if (rawId.indexOf('sd:') === 0 || /\/short-drama\/(\d+)/.test(rawId)) {
        const did = rawId.indexOf('sd:') === 0 ? rawId.slice(3) : (rawId.match(/\/short-drama\/(\d+)/) || [])[1];
        const json = await getJson(HOST + '/api/v1/drama/' + did);
        const d = json && json.data;
        if (!d) return jsonify({ list: [] });
        const eps = Array.isArray(d.episodes) ? d.episodes : [];
        const title = decodeHtml(d.title || ('短剧 ' + did));
        const tracks = [];
        for (let i = 0; i < eps.length; i++) {
            const n = eps[i].episodeNo;
            if (n == null) continue;
            tracks.push({ name: '第' + n + '集', pan: '', ext: { url: 'drama:' + did + ':' + n, name: title } });
        }
        if (!tracks.length) return jsonify({ list: [] });
        return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
    }

    // 视频 / AV解说：详情页 HTML，JSON-LD contentUrl 现取签名 manifest
    let vid = '';
    let pageUrl = '';
    if (rawId.indexOf('sv:') === 0 || /\/short-video\/(\d+)/.test(rawId)) {
        vid = rawId.indexOf('sv:') === 0 ? rawId.slice(3) : (rawId.match(/\/short-video\/(\d+)/) || [])[1];
        pageUrl = HOST + '/short-video/' + vid + '/';
    } else if (rawId.indexOf('v:') === 0 || /\/videos\/(\d+)/.test(rawId) || /^\d+$/.test(rawId)) {
        vid = rawId.indexOf('v:') === 0 ? rawId.slice(2) : (rawId.match(/\/videos\/(\d+)/) || [null, rawId.replace(/[^0-9]/g, '')])[1];
        pageUrl = HOST + '/videos/' + vid + '/';
    } else {
        return jsonify({ list: [] });
    }
    if (!vid) return jsonify({ list: [] });

    const html = await getHtml(pageUrl);
    const det = extractVideoDetail(html);
    if (!det.manifest) return jsonify({ list: [] });
    const manifest = absUrl(det.manifest);
    const title = det.title || vid;
    // 字幕登记名 = 番号 + 标题（番号只在详情页「番号」栏，不在标题里）；
    // 放在 track.ext.name 里，getPlayinfo 按它调 subSearch。
    const subName = det.code ? det.code + ' ' + title : title;
    return jsonify({ list: [{ title: '在线播放', tracks: [{ name: '播放', pan: '', ext: { url: manifest, name: subName } }] }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.url || '').trim();
    if (!id) return jsonify({ urls: [], headers: [] });
    const name = String(ext.name || '');
    // 字幕搜索先启动，与签名现取并行。
    const subsP = name ? subSearch(name).catch(function () { return []; }) : null;
    // 短剧集 token：现取签名 manifest
    const dm = id.match(/^drama:(\d+):(\d+)$/);
    if (dm) {
        const json = await getJson(HOST + '/api/v1/drama/' + dm[1] + '/episodes/' + dm[2] + '/play');
        const playUrl = json && json.data && json.data.playUrl;
        if (!playUrl) return jsonify({ urls: [], headers: [] });
        const result = { urls: [absUrl(playUrl)], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] };
        if (subsP) {
            const subs = await subsP;
            if (subs && subs.length) result.subs = subs;
        }
        return jsonify(result);
    }
    // 视频 / AV解说：manifest 直链（detail 现取的签名地址）
    const result = { urls: [absUrl(id)], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] };
    if (subsP) {
        const subs = await subsP;
        if (subs && subs.length) result.subs = subs;
    }
    return jsonify(result);
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    // 注意：/search?q= 会 301 到 /search/?q=，直接用带斜杠的形式
    let url = HOST + '/search/?q=' + encodeURIComponent(wd);
    if (page > 1) url += '&page=' + page;
    const list = parseVcardHtml(await getHtml(url));
    return jsonify({ list: list });
}
