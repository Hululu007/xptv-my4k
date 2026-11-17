// ASMRHoney - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_asmrhoney.js
// 站点全站静态 JSON 数据文件，无登录墙。详情 videoUrl 为 cdn 直链 MP4，单档原画。
// 无番号，不接字幕芯。
const HOST = 'https://asmrhoney.com';
const DATA = HOST + '/data';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 48;
const FILTER_SIZE = 24;
const INDEX_TTL = 10 * 60 * 1000;

// 触发音卡片：triggers.json 的 37 个里索引有内容的 32 个。
const TRIGGER_CARDS = [
    { n: '助眠向', v: 'sfw' },
    { n: '18+', v: 'nsfw' },
    { n: '口腔音', v: 'mouth_sounds' },
    { n: '舔耳', v: 'ear_licking' },
    { n: '触发音', v: 'trigger_sounds' },
    { n: '角色扮演', v: 'roleplay' },
    { n: '丝袜', v: 'pantyhose' },
    { n: '情趣', v: 'sexy' },
    { n: '摩擦', v: 'scratching' },
    { n: '耳语', v: 'whisper' },
    { n: '湿润', v: 'wet' },
    { n: '视觉触发', v: 'vision' },
    { n: '吃耳朵', v: 'eareating' },
    { n: '舌头', v: 'tongue' },
    { n: '足', v: 'feet' },
    { n: '弹舌', v: 'tonguevibrating' },
    { n: '亲吻', v: 'kiss' },
    { n: '轻敲', v: 'tapping' },
    { n: 'vtuber', v: 'vtuber' },
    { n: '呼吸', v: 'breathing' },
    { n: '芦荟胶', v: 'aloevera' },
    { n: '助眠', v: 'sleep_aid' },
    { n: '掏耳', v: 'ear_cleaning' },
    { n: '陪伴', v: 'comfort' },
    { n: '吃播', v: 'eating' },
    { n: '心跳', v: 'heart' },
    { n: '软声', v: 'soft_spoken' },
    { n: '专注', v: 'focus' },
    { n: '水声', v: 'water' },
    { n: '接吻', v: 'kissing' },
    { n: '视觉刺激', v: 'visual_triggers' },
    { n: '经典咏流传', v: 'oldbutgole' },
];

const LANG_CARDS = [
    { n: '混合', v: 'mixed' },
    { n: '英文', v: 'en' },
    { n: '中文', v: 'zh' },
    { n: '日文', v: 'ja' },
    { n: '韩文', v: 'ko' },
];

const appConfig = {
    ver: 1,
    title: 'ASMRHoney',
    site: HOST,
    tabs: [
        { name: '最新', ext: { id: 'latest' } },
        { name: '触发音', ext: { id: 'trigger' } },
        { name: '语言', ext: { id: 'lang' } },
    ],
    filters: {
        trigger: [{ key: 'sub', name: '触发音', value: TRIGGER_CARDS }],
        lang: [{ key: 'sub', name: '语言', value: LANG_CARDS }],
    },
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function durStr(sec) {
    sec = Math.floor(Number(sec) || 0);
    if (sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = h > 0 ? ('0' + m).slice(-2) : String(m);
    const ss = ('0' + s).slice(-2);
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

async function getJson(url, timeoutMs) {
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'application/json,*/*' },
            timeout: timeoutMs || 15000,
        });
        const data = r ? r.data : null;
        if (data == null) return null;
        if (typeof data === 'string') {
            const txt = data.trim();
            if (!txt) return null;
            try { return JSON.parse(txt); } catch (e) { return null; }
        }
        return data;
    } catch (e) {
        return null;
    }
}

// 全量索引（站方前端同款本地过滤源），模块级缓存 10 分钟。
let indexCache = null;
let indexCacheTs = 0;
async function getIndex() {
    if (indexCache && Date.now() - indexCacheTs < INDEX_TTL) return indexCache;
    const j = await getJson(DATA + '/clips-search.json', 30000);
    const clips = j && Array.isArray(j.clips) ? j.clips : [];
    if (clips.length) {
        indexCache = clips;
        indexCacheTs = Date.now();
    }
    return clips;
}

function clipToVod(c) {
    if (!c || !c.slug) return null;
    const title = t(c.title) || t(c.title_en) || c.slug;
    return {
        vod_id: String(c.slug),
        vod_name: title,
        vod_pic: t(c.coverUrl) || t(c.coverWebpUrl) || '',
        vod_remarks: durStr(c.duration),
        ext: { id: String(c.slug) },
    };
}

function paginate(arr, page, size) {
    const total = arr.length;
    const pagecount = Math.max(1, Math.ceil(total / size));
    const start = (page - 1) * size;
    const slice = arr.slice(start, start + size);
    const list = [];
    for (let i = 0; i < slice.length; i++) {
        const v = clipToVod(slice[i]);
        if (v) list.push(v);
    }
    return { list: list };
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const id = String(ext.id || 'latest');
    const sub = String(ext.sub || (ext.extend && ext.extend.sub) || '');
    if (id === 'latest') {
        const j = await getJson(DATA + '/clips-page-' + page + '.json');
        const clips = j && Array.isArray(j.clips) ? j.clips : [];
        const list = [];
        for (let i = 0; i < clips.length; i++) {
            const v = clipToVod(clips[i]);
            if (v) list.push(v);
        }
        return jsonify({ list: list });
    }
    if (id === 'trigger') {
        const tag = sub || TRIGGER_CARDS[0].v;
        const clips = (await getIndex()).filter(function (c) { return Array.isArray(c.tags) && c.tags.indexOf(tag) >= 0; });
        return jsonify(paginate(clips, page, FILTER_SIZE));
    }
    if (id === 'lang') {
        const lang = sub || LANG_CARDS[0].v;
        const clips = (await getIndex()).filter(function (c) { return c.language === lang; });
        return jsonify(paginate(clips, page, FILTER_SIZE));
    }
    return jsonify({ list: [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const slug = t(ext.id);
    if (!slug) return jsonify({ list: [] });
    const j = await getJson(DATA + '/clips/' + encodeURIComponent(slug) + '.json');
    const c = j && j.clip ? j.clip : null;
    if (!c) return jsonify({ list: [] });
    const videoUrl = t(c.videoUrl);
    if (!videoUrl) return jsonify({ list: [] });
    return jsonify({ list: [{ title: '在线播放', tracks: [{ name: '原画', pan: '', ext: { url: videoUrl } }] }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.url || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    if (/^https?:\/\//i.test(id) && /\.mp4(\?|#|$)/i.test(id)) {
        return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
    }
    // 裸 slug：现取详情拿 videoUrl。
    const j = await getJson(DATA + '/clips/' + encodeURIComponent(id) + '.json');
    const videoUrl = j && j.clip ? t(j.clip.videoUrl) : '';
    if (!videoUrl) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [videoUrl], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim().toLowerCase();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const clips = (await getIndex()).filter(function (c) {
        const hay = [c.title, c.title_en, c.title_ja, c.title_ko, c.creator]
            .map(function (x) { return String(x || '').toLowerCase(); }).join(' ');
        return hay.indexOf(wd) >= 0;
    });
    return jsonify(paginate(clips, page, FILTER_SIZE));
}
