
// Beeg - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_beeg.js
// 站点新版前端（externulls 栈），store API。播放模板含有效期，play() 每次现取现解，不缓存地址。
// 搜索站方走 WebSocket，蜘蛛改为标签 slug 匹配。无番号，不接字幕芯。
const STORE = 'https://store.externulls.com';
const VIDEO = 'https://video.beeg.com';
const THUMBS = 'https://thumbs.externulls.com';
const SITE = 'https://beeg.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;

const TAG_CARDS = [
  { n: "Anal", v: "anal" },
  { n: "Blowjob", v: "blowjob" },
  { n: "Lesbian", v: "lesbian" },
  { n: "Teen", v: "teen" },
  { n: "MILF", v: "milf" },
  { n: "Mature", v: "mature" },
  { n: "Amateur Girl", v: "amateur" },
  { n: "Hardcore", v: "hardcore" },
  { n: "3some", v: "threesome" },
  { n: "Brunette", v: "brunette" },
  { n: "Blonde", v: "blonde" },
  { n: "Asian", v: "asian" },
  { n: "Black Girl", v: "ebony" },
  { n: "Latina", v: "latina" },
  { n: "POV", v: "pov" },
  { n: "Creampie", v: "creampie" },
  { n: "Squirting", v: "squirting" },
  { n: "Bondage & Discipline", v: "bondage" },
  { n: "Fetish", v: "fetish" },
  { n: "Interracial", v: "interracial" },
  { n: "Redhead", v: "redhead" },
  { n: "Public", v: "public" },
  { n: "Masturbation", v: "masturbation" },
  { n: "Webcam", v: "webcam" },
  { n: "Tattoo", v: "tattoo" },
  { n: "Orgy", v: "orgy" },
  { n: "Deepthroat", v: "deepthroat" },
  { n: "Handjob", v: "handjob" },
  { n: "Doggy", v: "doggystyle" },
  { n: "Missionary", v: "missionary" },
  { n: "Babe", v: "babe" },
  { n: "Lingerie", v: "lingerie" },
  { n: "Stockings", v: "stockings" },
  { n: "Heels", v: "heels" },
  { n: "Massage", v: "massage" },
  { n: "Casting", v: "casting" },
  { n: "Mom", v: "stepmom" },
  { n: "Sister", v: "stepsister" },
  { n: "Cheating", v: "cheating" },
  { n: "Wife", v: "wife" },
  { n: "Girlfriend", v: "girlfriend" },
  { n: "Cumshot", v: "cumshot" },
  { n: "Facial", v: "facial" },
  { n: "DP", v: "dp" },
  { n: "Gangbang", v: "gangbang" },
  { n: "Fisting", v: "fisting" },
  { n: "Pegging", v: "pegging" },
  { n: "Strap-On", v: "strapon" },
  { n: "Voyeur", v: "voyeur" },
  { n: "Exhibitionist", v: "exhibitionist" },
  { n: "Outdoor", v: "outdoor" },
  { n: "Car", v: "car" },
  { n: "Office", v: "office" },
  { n: "Teacher", v: "teacher" },
  { n: "Nurse", v: "nurse" },
  { n: "Maid", v: "maid" },
  { n: "Cosplay", v: "cosplay" },
  { n: "Hentai", v: "hentai" },
  { n: "Cartoon", v: "cartoon" },
  { n: "3D-CGI", v: "3d" },
  { n: "VR", v: "vr" },
  { n: "Hairy", v: "hairy" },
  { n: "Shaved", v: "shaved" },
  { n: "Piercing", v: "piercing" },
  { n: "Solo", v: "solo" },
  { n: "Couple", v: "couple" },
  { n: "Group", v: "group" },
  { n: "Party", v: "party" },
  { n: "Cuckold", v: "cuckold" },
  { n: "FemDom", v: "femdom" },
  { n: "Dominant", v: "dominant" },
  { n: "Submissive", v: "submissive" },
  { n: "Spanking", v: "spanking" },
  { n: "Bukkake", v: "bukkake" },
  { n: "Swallowing", v: "swallow" },
  { n: "Rimjob", v: "rimming" },
  { n: "Toy", v: "toys" },
  { n: "Dildo", v: "dildo" },
  { n: "Vibrator", v: "vibrator" }
];

const STUDIO_CARDS = [
  { n: "Evil Angel", v: "evilangel" },
  { n: "21 Sextury", v: "21sextury" },
  { n: "Naughty America", v: "naughtyamerica" },
  { n: "Wicked", v: "wicked" },
  { n: "Vivid", v: "vivid" },
  { n: "Penthouse", v: "penthouse" },
  { n: "Homemade", v: "private" },
  { n: "Marc Dorcel", v: "marcdorcel" },
  { n: "Porn World", v: "ddfnetwork" },
  { n: "Babe", v: "babes" },
  { n: "Team Skeet", v: "teamskeet" },
  { n: "Nubiles", v: "nubiles" },
  { n: "Vixen", v: "vixen" },
  { n: "Tushy", v: "tushy" },
  { n: "Blacked", v: "blacked" },
  { n: "Deep", v: "deeper" },
  { n: "Jules Jordan", v: "julesjordan" },
  { n: "Manuel Ferrara", v: "manuelferrara" },
  { n: "Joy Mii", v: "joymii" },
  { n: "Met Art", v: "metart" },
  { n: "Sex Art", v: "sexart" },
  { n: "Erotica X", v: "eroticax" },
  { n: "New Sensations", v: "newsensations" },
  { n: "Elegant Angel", v: "elegantangel" },
  { n: "Zero Tolerance", v: "zerotolerance" },
  { n: "Devil's Film", v: "devilsfilm" },
  { n: "Girlfriends Films", v: "girlfriendsfilms" },
  { n: "Girlsway", v: "girlsway" },
  { n: "Mom-Daughter", v: "mommysgirl" },
  { n: "Pure Taboo", v: "puretaboo" },
  { n: "Bratty Sis", v: "brattysis" },
  { n: "Family Strokes", v: "familystrokes" },
  { n: "Siblings", v: "stepsiblings" },
  { n: "MILF", v: "mylf" },
  { n: "Public Agent", v: "publicagent" },
  { n: "X Confessions", v: "xconfessions" },
  { n: "Tricky Old Teacher", v: "trickyoldteacher" },
  { n: "Old-Young", v: "oldandyoung" },
  { n: "Mature NL", v: "maturenl" },
  { n: "Anilos", v: "anilos" },
  { n: "Karups", v: "karups" },
  { n: "Anal Vids", v: "legalporno" },
  { n: "Ass Traffic", v: "asstraffic" },
  { n: "Rocco Siffredi", v: "roccosiffredi" }
]
;

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

function sleep(ms) {
    return new Promise(function (r) {
        if (typeof setTimeout === 'function') setTimeout(r, ms); else r();
    });
}

async function getJson(url, timeoutMs) {
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': SITE + '/', 'Accept': 'application/json,*/*' },
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

async function getText(url, timeoutMs) {
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': SITE + '/' },
            timeout: timeoutMs || 15000,
        });
        const data = r ? r.data : null;
        if (typeof data === 'string') return data;
        if (data) return JSON.stringify(data);
        return '';
    } catch (e) {
        return '';
    }
}

function titleOf(item) {
    const data = (item && item.file && Array.isArray(item.file.data)) ? item.file.data : [];
    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        if (d && d.cd_column === 'sf_name' && d.cd_value) return t(d.cd_value);
    }
    return '';
}

function itemToVod(item) {
    if (!item || !item.file || item.file.id == null) return null;
    const id = String(item.file.id);
    const title = titleOf(item) || ('Beeg ' + id);
    return {
        vod_id: id,
        vod_name: title,
        vod_pic: THUMBS + '/videos/' + id + '/0.webp',
        vod_remarks: durStr(item.file.fl_duration),
        ext: { id: id },
    };
}

async function listByTag(slug, page) {
    const offset = (page - 1) * PAGE_SIZE;
    const arr = await getJson(STORE + '/tag/videos/' + encodeURIComponent(slug) + '?limit=' + PAGE_SIZE + '&offset=' + offset);
    const items = Array.isArray(arr) ? arr : [];
    const list = [];
    for (let i = 0; i < items.length; i++) {
        const v = itemToVod(items[i]);
        if (v) list.push(v);
    }
    return { list: list };
}

// master 解析：#EXT-X-STREAM-INF(RESOLUTION=WxH) 下一行为变体地址。
// 变体地址三种形态：//ip...（协议相对，补 https:）、/key=...（补 VIDEO）、https://...（原样）。
function parseMaster(text) {
    const out = [];
    const seen = {};
    const lines = String(text || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const s = t(lines[i]);
        if (s.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        const rm = s.match(/RESOLUTION=(\d+)x(\d+)/i);
        const height = rm ? parseInt(rm[2], 10) : 0;
        let url = '';
        for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
            const u = t(lines[j]);
            if (u && u.charAt(0) !== '#') { url = u; break; }
        }
        if (!url) continue;
        if (url.indexOf('//') === 0) url = 'https:' + url;
        else if (url.charAt(0) === '/') url = VIDEO + url;
        const label = height ? (height + 'p') : '原画';
        if (seen[label]) continue;
        seen[label] = true;
        out.push({ label: label, height: height, url: url });
    }
    out.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
    return out;
}

// 取某片的变体表：play_url 模板 -> master 文本 -> 变体数组。
// 站方接口偶有瞬时空回，模板/master 各重试一次。
async function fetchVariants(id) {
    for (let att = 0; att < 2; att++) {
        const tpl = await getText(STORE + '/video/play_url/' + encodeURIComponent(id));
        const template = t(tpl);
        if (template && template.indexOf('media=') >= 0) {
            const master = await getText(VIDEO + '/' + template);
            if (master.indexOf('#EXTM3U') >= 0) {
                const vs = parseMaster(master);
                if (vs.length) return vs;
            }
        }
        if (att === 0) await sleep(1200);
    }
    return [];
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'Beeg',
        site: SITE,
        tabs: [
            { name: '热门标签', ext: { id: 'tags' } },
            { name: '热门频道', ext: { id: 'studios' } },
        ],
        filters: {
            tags: [{ key: 'sub', name: '标签', value: TAG_CARDS }],
            studios: [{ key: 'sub', name: '频道', value: STUDIO_CARDS }],
        },
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const id = String(ext.id || 'tags');
    const sub = String(ext.sub || (ext.extend && ext.extend.sub) || '');
    if (id === 'tags') return jsonify(await listByTag(sub || TAG_CARDS[0].v, page));
    if (id === 'studios') return jsonify(await listByTag(sub || STUDIO_CARDS[0].v, page));
    return jsonify({ list: [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const item = await getJson(STORE + '/facts/file/' + encodeURIComponent(id));
    if (!item || !item.file) return jsonify({ list: [] });
    const vod = itemToVod(item);
    if (!vod) return jsonify({ list: [] });
    // 变体实测档位出线；取不到变体时留一条自动线，play() 里现解。
    const variants = await fetchVariants(id);
    const tracks = [];
    if (variants.length) {
        for (let i = 0; i < variants.length; i++) {
            tracks.push({ name: variants[i].label, pan: '', ext: { url: 'beeg:' + id + ':' + variants[i].label } });
        }
    } else {
        tracks.push({ name: '自动', pan: '', ext: { url: 'beeg:' + id + ':auto' } });
    }
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.url || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    const m = id.match(/^beeg:([^:]+):(.+)$/);
    if (!m) {
        if (/\.m3u8(\?|$)/i.test(id)) {
            return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': SITE + '/' }] });
        }
        if (/^\d+$/.test(id)) {
            const vs = await fetchVariants(id);
            if (vs.length) return jsonify({ urls: [vs[0].url], headers: [{ 'User-Agent': UA, 'Referer': SITE + '/' }] });
        }
        return jsonify({ urls: [], headers: [] });
    }
    const vid = m[1];
    const want = m[2];
    const variants = await fetchVariants(vid);
    if (!variants.length) return jsonify({ urls: [], headers: [] });
    let hit = null;
    if (want && want !== 'auto') {
        for (let i = 0; i < variants.length; i++) {
            if (variants[i].label === want) { hit = variants[i]; break; }
        }
        if (!hit) {
            const wn = String(want).replace(/p$/i, '');
            for (let i = 0; i < variants.length; i++) {
                if (String(variants[i].height) === wn) { hit = variants[i]; break; }
            }
        }
    }
    if (!hit) hit = variants[0];
    return jsonify({ urls: [hit.url], headers: [{ 'User-Agent': UA, 'Referer': SITE + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    // 站方搜索为 WebSocket，蜘蛛无此通道；改为标签 slug 匹配：
    // 先试空格转连字符的 slug，无结果再试去掉分隔符的 slug。
    const base = wd.toLowerCase().replace(/[\s_]+/g, '-');
    let res = await listByTag(base, page);
    if (!res.list.length) {
        const stripped = base.replace(/-/g, '');
        if (stripped !== base) res = await listByTag(stripped, page);
    }
    return jsonify(res);
}
