// JaSex - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_jasex.js
// 英文 JAV 站 jasex.st，浏览/播放无登录墙。列表 /censored、/uncensored、
// /engsub、/amateur、/genre/<slug>，翻页 <base>/page-N（28 条/页）。
// 详情页播放服务器 VIP/DST/SHG/LLV/STP，以 data-server 按钮 + episode id
// 给出；逐个解析，各线都列为一集（集名沿用各线自带档位）：
// - VIP（vid-snap-player）：/api/playlist-token/<uuid> 取签名 token t，
//   流为 /v/<t>（302 到签名单档 1080p HLS master；分片 .png 伪装 .ts）。
// - LLV（luluvid）：打包 jwplayer 解包得直链 master m3u8（AES-128，.ts）。
// - SHG（javv）：打包 links{hls3,hls4}，hls3 优先（hls4/hls2 实测 403），
//   720p master.txt 链（.woff2 伪装 .ts）。
// - DST 是 DoodStream（Turnstile 验证墙，跳过、绝不绕过）；STP streamtape
//   未验证，不尝试。各线均为单档，不编造档位。点播时重解用户点的那条线
//   （签名有时效），失败再回退首个可解线、最后回退详情期地址。Referer 须
//   用嵌页地址（vid-snap /v/<token> 用 jasex.st Referer 回 403，用嵌页
//   Referer 回 200）。字幕按条目接：仅标题或地址含番号的条目才调芯
//   （JaSex 详情 facts 与 slug 均带番号，多数条目符合）。
const HOST = 'https://jasex.st';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const VIDSNAP = 'https://vid-snap-player.com';

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); });
}

function cleanLabel(s) {
    return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
        .replace(/[\r\n\t]+/g, ' ').replace(/[$#]/g, '').trim();
}

function clean(s) {
    return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ').trim();
}

function absUrl(u, host) {
    u = String(u || '').trim();
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return host + u;
    return u;
}

function normUrl(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
    return s;
}

async function getHtml(path, referer) {
    let url = String(path || '');
    if (url.indexOf('//') === 0) url = 'https:' + url;
    else if (url.charAt(0) === '/') url = HOST + url;
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 20000,
        });
        if (r && r.status && r.status !== 200) return '';
        return r && typeof r.data === 'string' ? r.data : '';
    } catch (e) { return ''; }
}

async function getJson(url, referer) {
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'application/json' },
            timeout: 20000,
        });
        if (r && r.status && r.status !== 200) return null;
        if (r && r.data && typeof r.data === 'object') return r.data;
        if (r && typeof r.data === 'string' && r.data.trim()) {
            try { return JSON.parse(r.data); } catch (e) { return null; }
        }
        return null;
    } catch (e) { return null; }
}

function parseCards(html) {
    const byUrl = {};
    const order = [];
    const re = /<a class="poster-card" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) {
        const href = m[1].trim();
        const inner = m[2];
        if (!href || href.indexOf('/genre/') === 0 || href.indexOf('/genres') === 0) continue;
        const vUrl = href.indexOf('http') === 0 ? href : HOST + href;
        let it = byUrl[vUrl];
        if (!it) { it = { vod_id: href, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl[vUrl] = it; order.push(vUrl); }
        const imgM = inner.match(/<img[^>]+src="([^"]+)"/i);
        if (imgM && !it.vod_pic) {
            let pic = imgM[1].trim();
            if (pic.indexOf('logo') >= 0) {
                const fb = inner.match(/data-fallback="([^"]+)"/i);
                if (fb) pic = fb[1].trim();
            }
            if (pic) it.vod_pic = normUrl(pic.indexOf('http') === 0 ? pic : absUrl(pic, HOST));
        }
        const tM = inner.match(/poster-card__title">([^<]+)</);
        if (tM && !it.vod_name) it.vod_name = cleanLabel(tM[1]);
        const cM = inner.match(/poster-card__meta">([^<]+)</);
        if (cM && !it.vod_remarks) it.vod_remarks = cleanLabel(cM[1]);
    }
    const out = [];
    order.forEach(function (k) {
        const it = byUrl[k];
        if (it.vod_pic || it.vod_name) {
            if (!it.vod_name) it.vod_name = 'JaSex';
            it.ext = { id: it.vod_id };
            out.push(it);
        }
    });
    return out;
}

function parseServers(html) {
    const servers = [];
    const re = /<button[^>]*data-server="(\d+)"[^>]*data-episode="(\d+)"[^>]*>([\s\S]*?)<\/button>/g;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) {
        const name = cleanLabel(m[3]).replace(/\s+/g, ' ').trim();
        if (m[2]) servers.push({ server: m[1], episode: m[2], name: name || ('Server ' + m[1]) });
    }
    // VIP 在前，其余按页内顺序
    servers.sort(function (a, b) { return (a.name === 'VIP' ? -1 : b.name === 'VIP' ? 1 : 0); });
    return servers;
}

// Dean Edwards 打包解包（LLV/SHG 嵌页的 jwplayer setup 被打包；纯字符串
// 操作，不 eval：按字典替换解出源码，再读出流地址）
function unpackPacked(html) {
    const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)/);
    if (!m) return '';
    const packed = m[1];
    const radix = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const dict = m[4].split('|');
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const baseN = function (n, b) {
        if (n === 0) return '0';
        let out = '';
        while (n > 0) { out = chars[n % b] + out; n = Math.floor(n / b); }
        return out;
    };
    let out = packed;
    for (let cc = count - 1; cc >= 0; cc--) {
        const word = dict[cc];
        if (!word) continue;
        const re = new RegExp('\\b' + baseN(cc, radix) + '\\b', 'g');
        out = out.replace(re, function () { return word; });
    }
    return out;
}

function embedOrigin(embed) {
    const m = String(embed || '').match(/^(https?:\/\/[^\/]+)/i);
    return m ? m[1] : '';
}

// 单个嵌页地址解为 { url, embed, label } 或 null。
// - vid-snap-player（VIP）：签名 token API，单档 1080p。
// - luluvid（LLV）/ javv（SHG）：打包 jwplayer 解包取流地址。
// - playmogo/DoodStream（DST）：Turnstile 验证墙，跳过。
// - streamtape（STP）及其他：未验证，不尝试。
async function resolveEmbed(embed, durl, serverName) {
    if (!embed) return null;
    if (embed.indexOf('vid-snap-player.com/embed/') >= 0) {
        const uuid = embed.split('/').filter(Boolean).pop().split('?')[0];
        if (!uuid) return null;
        const tj = await getJson(VIDSNAP + '/api/playlist-token/' + encodeURIComponent(uuid), embed);
        const token = tj && tj.t ? String(tj.t) : '';
        if (token) return { url: VIDSNAP + '/v/' + token, embed: embed, label: (serverName || 'VIP') + '·1080p' };
        return null;
    }
    if (embed.indexOf('playmogo.com') >= 0 || embed.indexOf('dood') >= 0) return null;
    if (embed.indexOf('luluvid.xyz') < 0 && embed.indexOf('javv.xyz') < 0) return null;
    const page = await getHtml(embed, durl);
    if (!page) return null;
    // 打包体里的字符串引号是反斜杠转义的（\"），先还原再匹配，
    // 否则 SHG 的 links 值永远匹配不到。
    const setup = unpackPacked(page).replace(/\\"/g, '"').replace(/\\\//g, '/');
    if (!setup) return null;
    // SHG links 优先（hls3 稳定，hls4 备选；hls2 实测 403，已排除）
    const linksM = setup.match(/links\s*=\s*\{([^}]*)\}/);
    if (linksM) {
        const getLink = function (key) {
            const lm = linksM[1].match(new RegExp(key + '"?\\s*:\\s*"([^"]+)"'));
            return lm ? lm[1].replace(/\\\//g, '/') : '';
        };
        const keys = ['hls3', 'hls4'];
        for (let i = 0; i < keys.length; i++) {
            let link = getLink(keys[i]);
            if (!link) continue;
            if (link.charAt(0) === '/') link = embedOrigin(embed) + link;
            if (link.indexOf('m3u8') >= 0 || link.indexOf('master.txt') >= 0) {
                return { url: link, embed: embed, label: (serverName || 'SHG') + '·720p' };
            }
        }
    }
    // LLV：sources:[{file:"...master.m3u8..."}]
    const fileM = setup.match(/file:\s*"([^"]+\.m3u8[^"]*)"/);
    if (fileM) {
        const link = fileM[1].replace(/\\\//g, '/');
        return { url: link, embed: embed, label: (serverName || 'LLV') + '·Original' };
    }
    return null;
}

// 单线解析：取 /api/episodes/<id>/player 的 embed_url 再解。失败 null。
async function resolveOneServer(sv, durl) {
    const pj = await getJson(HOST + '/api/episodes/' + encodeURIComponent(sv.episode) + '/player', durl);
    const embed = pj && pj.data && pj.data.embed_url ? String(pj.data.embed_url) : '';
    if (!embed) return null;
    const res = await resolveEmbed(embed, durl, sv.name);
    if (!res) return null;
    return { url: res.url, embed: res.embed, label: res.label, server: sv.server, episode: sv.episode };
}

async function resolveFromServers(servers, durl) {
    for (let i = 0; i < servers.length; i++) {
        const res = await resolveOneServer(servers[i], durl).catch(function () { return null; });
        if (res) return res;
    }
    return null;
}

// 各线全解、全列为集；某线解失败跳过、不阻塞其他线。
async function resolveAllServers(servers, durl) {
    const out = [];
    for (let i = 0; i < servers.length; i++) {
        const res = await resolveOneServer(servers[i], durl).catch(function () { return null; });
        if (res) out.push(res);
    }
    return out;
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'JaSex',
        site: HOST,
        tabs: MAIN_CLASSES.map(function (c) { return { name: c.type_name, ext: { id: c.type_id } }; }),
        filters: {
            genre_zone: [{ key: 'sub', name: '题材', value: GENRES.map(function (g) { return { n: g.n, v: g.v }; }) }],
        },
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const zoneId = String(ext.id || 'home');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const sub = String(ext.sub || (ext.extend && ext.extend.sub) || '').trim();
    let base = '/';
    if (zoneId === 'home' || !zoneId) {
        base = '/';
    } else if (zoneId === 'genre_zone') {
        if (!sub) return jsonify({ list: [] });
        base = '/genre/' + sub;
    } else if (zoneId.indexOf('genre/') === 0) {
        base = '/' + zoneId;
    } else {
        base = '/' + zoneId;
    }
    if (base === '/') {
        let list = [];
        try { list = parseCards(await getHtml('/')); } catch (e) { list = []; }
        return jsonify({ list: list });
    }
    const path = page === 1 ? base : base + '/page-' + page;
    let list = [];
    try { list = parseCards(await getHtml(path)); } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = String(ext.text || '').trim();
    if (!kw) return jsonify({ list: [] });
    let list = [];
    try { list = parseCards(await getHtml('/search?q=' + encodeURIComponent(kw))); } catch (e) { list = []; }
    return jsonify({ list: list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const rawId = String(ext.id || '');
    if (!rawId) return jsonify({ list: [] });
    const durl = rawId.indexOf('http') === 0 ? rawId : HOST + (rawId.charAt(0) === '/' ? rawId : '/' + rawId);
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    const tM = html.match(/<title>(.*?)<\/title>/i);
    let mainTitle = 'JaSex';
    if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*[·\-]\s*Jasex\s*$/i, '').trim() || 'JaSex';
    const codeM = html.match(/<dt>Code<\/dt>\s*<dd>([^<]+)<\/dd>/i);
    const code = codeM ? cleanLabel(codeM[1]) : '';
    // 字幕按条目接：仅标题或地址含番号的条目才把片名放进 ext.name
    const subName = (code || subExtractCode(durl)) ? ((code ? code + ' ' : '') + mainTitle) : '';
    let posterPic = '';
    const stillM = html.match(/player__still"[\s\S]{0,600}?<img[^>]+src="([^"]+)"/i);
    if (stillM) posterPic = normUrl(stillM[1].trim());
    if (!posterPic) {
        const pm = html.match(/https:\/\/pics\.jasex\.st\/posters\/[^\s"'<>]+/);
        if (pm) posterPic = pm[0];
    }
    const servers = parseServers(html);
    let streams = await resolveAllServers(servers, durl);
    if (!streams.length) {
        const one = await resolveFromServers(servers, durl).catch(function () { return null; });
        if (one) streams = [one];
    }
    if (!streams.length) return jsonify({ list: [] });
    const tracks = streams.map(function (s) {
        return {
            name: s.label, pan: '',
            ext: { url: 'jasex:' + s.server + '|' + s.episode, name: subName, durl: durl, embed: s.embed, stored: s.url },
        };
    });
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.url || '');
    const durl = String(ext.durl || '');
    const stored = String(ext.stored || '');
    const storedEmbed = String(ext.embed || '');
    const m = id.match(/^jasex:(\d+)\|(\d+)$/);
    // 点播时重解用户点的那条线（签名有时效）；失败再回退首个可解线、
    // 最后回退详情期地址。
    let fresh = null;
    if (m && durl) {
        try { fresh = await resolveOneServer({ server: m[1], episode: m[2], name: '' }, durl); } catch (e) { fresh = null; }
    }
    if (!fresh && durl) {
        try {
            const html = await getHtml(durl);
            if (html) fresh = await resolveFromServers(parseServers(html), durl);
        } catch (e) { fresh = null; }
    }
    const url = fresh ? fresh.url : stored;
    if (!url) return jsonify({ urls: [], headers: [] });
    // Referer 须用嵌页地址（vid-snap /v/<token> 用 jasex.st Referer 回 403）
    const result = {
        urls: [url],
        headers: [{
            'User-Agent': UA,
            'Referer': (fresh && fresh.embed) || storedEmbed || VIDSNAP + '/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }],
    };
    const name = String(ext.name || '');
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}
const GENRES = [{"v": "solowork", "n": "Solowork"}, {"v": "creampie", "n": "Creampie"}, {"v": "big-tits", "n": "Big Tits"}, {"v": "married-woman", "n": "Married Woman"}, {"v": "blowjob", "n": "Blowjob"}, {"v": "slender", "n": "Slender"}, {"v": "beautiful-girl", "n": "Beautiful Girl"}, {"v": "slut", "n": "Slut"}, {"v": "amateur", "n": "Amateur"}, {"v": "mature-woman", "n": "Mature Woman"}, {"v": "cuckold", "n": "Cuckold"}, {"v": "pov", "n": "POV"}, {"v": "pretty-tits", "n": "Pretty Tits"}, {"v": "drama", "n": "Drama"}, {"v": "squirting", "n": "Squirting"}, {"v": "digital-mosaic", "n": "Digital Mosaic"}, {"v": "nasty-hardcore", "n": "Nasty, Hardcore"}, {"v": "3p-4p", "n": "3P, 4P"}, {"v": "hi-def", "n": "Hi-Def"}, {"v": "acme-orgasm", "n": "Acme · Orgasm"}, {"v": "cowgirl", "n": "Cowgirl"}, {"v": "kiss", "n": "Kiss"}, {"v": "titty-fuck", "n": "Titty Fuck"}, {"v": "school-girls", "n": "School Girls"}, {"v": "pantyhose", "n": "Pantyhose"}, {"v": "facials", "n": "Facials"}, {"v": "older-sister", "n": "Older Sister"}, {"v": "handjob", "n": "Handjob"}, {"v": "deep-throating", "n": "Deep Throating"}, {"v": "uniform", "n": "Uniform"}, {"v": "ol", "n": "OL"}, {"v": "paipan", "n": "Paipan"}, {"v": "promiscuity", "n": "Promiscuity"}, {"v": "4k", "n": "4K"}, {"v": "affair", "n": "Affair"}, {"v": "debut-production", "n": "Debut Production"}, {"v": "sweet-ass", "n": "Sweet Ass"}, {"v": "abuse", "n": "Abuse"}, {"v": "cosplay", "n": "Cosplay"}, {"v": "huge-butt", "n": "Huge Butt"}, {"v": "other-fetish", "n": "Other Fetish"}, {"v": "risky-mosaic", "n": "Risky Mosaic"}, {"v": "humiliation", "n": "Humiliation"}, {"v": "cunnilingus", "n": "Cunnilingus"}, {"v": "anal", "n": "Anal"}, {"v": "female-teacher", "n": "Female Teacher"}, {"v": "relatives", "n": "Relatives"}, {"v": "urination", "n": "Urination"}, {"v": "subjectivity", "n": "Subjectivity"}, {"v": "documentary", "n": "Documentary"}, {"v": "masturbation", "n": "Masturbation"}, {"v": "butt", "n": "Butt"}, {"v": "dirty-words", "n": "Dirty Words"}, {"v": "lesbian", "n": "Lesbian"}, {"v": "tall", "n": "Tall"}, {"v": "bukkake", "n": "Bukkake"}, {"v": "cum", "n": "Cum"}, {"v": "planning", "n": "Planning"}, {"v": "entertainer", "n": "Entertainer"}, {"v": "fair-skin", "n": "Fair Skin"}, {"v": "leg-fetish", "n": "Leg Fetish"}, {"v": "submissive-woman", "n": "Submissive Woman"}, {"v": "footjob", "n": "Footjob"}, {"v": "sister", "n": "Sister"}, {"v": "toy", "n": "Toy"}, {"v": "lotion", "n": "Lotion"}, {"v": "bareback", "n": "Bareback"}, {"v": "female-college-student", "n": "Female College Student"}, {"v": "submissive-men", "n": "Submissive Men"}, {"v": "huge-cock", "n": "Huge Cock"}, {"v": "back", "n": "Back"}, {"v": "restraint", "n": "Restraint"}, {"v": "gal", "n": "Gal"}, {"v": "hot-spring", "n": "Hot Spring"}, {"v": "school-swimsuit", "n": "School Swimsuit"}, {"v": "various-professions", "n": "Various Professions"}, {"v": "voyeur", "n": "Voyeur"}, {"v": "close-up", "n": "Close Up"}, {"v": "nurse", "n": "Nurse"}, {"v": "prostitutes", "n": "Prostitutes"}, {"v": "sexy-legs", "n": "Sexy Legs"}, {"v": "virgin-man", "n": "Virgin Man"}, {"v": "black-hair", "n": "Black Hair"}, {"v": "nampa", "n": "Nampa"}, {"v": "shibari", "n": "Shibari"}, {"v": "69", "n": "69"}, {"v": "sm", "n": "SM"}, {"v": "sweat", "n": "Sweat"}, {"v": "best-omnibus", "n": "Best, Omnibus"}, {"v": "girl", "n": "Girl"}, {"v": "lesbian-kiss", "n": "Lesbian Kiss"}, {"v": "massage", "n": "Massage"}, {"v": "rape", "n": "Rape"}, {"v": "beauty-shop", "n": "Beauty Shop"}, {"v": "drug", "n": "Drug"}, {"v": "vibe", "n": "Vibe"}, {"v": "av-idol", "n": "AV Idol"}, {"v": "busty-fetish", "n": "Busty Fetish"}, {"v": "conceived", "n": "Conceived"}, {"v": "cross-dressing", "n": "Cross Dressing"}, {"v": "cum-in-mouth", "n": "Cum-in-Mouth"}, {"v": "threesome-foursome", "n": "Threesome / Foursome"}, {"v": "tits", "n": "Tits"}, {"v": "transsexual", "n": "Transsexual"}, {"v": "lingerie", "n": "Lingerie"}, {"v": "long-boots", "n": "Long Boots"}, {"v": "mother", "n": "Mother"}, {"v": "subordinates-colleagues", "n": "Subordinates / Colleagues"}, {"v": "training", "n": "Training"}, {"v": "anal-sex-ts", "n": "Anal Sex (TS)"}, {"v": "bbw", "n": "BBW"}, {"v": "clumsy-and-absent-minded", "n": "Clumsy And Absent-minded"}, {"v": "gangbang", "n": "Gangbang"}, {"v": "school-stuff", "n": "School Stuff"}, {"v": "cheating-wife", "n": "Cheating Wife"}, {"v": "female-investigator", "n": "Female Investigator"}, {"v": "image-video", "n": "Image Video"}, {"v": "kimono-mourning", "n": "Kimono, Mourning"}, {"v": "maid", "n": "Maid"}, {"v": "model", "n": "Model"}, {"v": "nymphomaniac", "n": "Nymphomaniac"}, {"v": "stepmother", "n": "Stepmother"}, {"v": "ultra-huge-tits", "n": "Ultra-Huge Tits"}, {"v": "childhood-friend", "n": "Childhood Friend"}, {"v": "date", "n": "Date"}, {"v": "electric-massager", "n": "Electric Massager"}, {"v": "female-boss", "n": "Female Boss"}, {"v": "finger-fuck", "n": "Finger Fuck"}, {"v": "masturbation-support", "n": "Masturbation Support"}, {"v": "original-collaboration", "n": "Original Collaboration"}, {"v": "outdoors", "n": "Outdoors"}, {"v": "prank", "n": "Prank"}, {"v": "school-uniform", "n": "School Uniform"}, {"v": "secretary", "n": "Secretary"}, {"v": "swimwear", "n": "Swimwear"}, {"v": "underwear", "n": "Underwear"}, {"v": "bitch", "n": "Bitch"}, {"v": "cheating-being-cheated-on-ntr", "n": "Cheating/Being Cheated On/NTR"}, {"v": "enema", "n": "Enema"}, {"v": "evil", "n": "Evil"}, {"v": "facesitting", "n": "Facesitting"}, {"v": "mini", "n": "Mini"}, {"v": "piss-drinking", "n": "Piss Drinking"}, {"v": "bath", "n": "Bath"}, {"v": "bride-young-wife", "n": "Bride, Young Wife"}, {"v": "business-attire", "n": "Business Attire"}, {"v": "cervix", "n": "Cervix"}, {"v": "delusion", "n": "Delusion"}, {"v": "elder-male", "n": "Elder Male"}, {"v": "erotic-wear", "n": "Erotic Wear"}, {"v": "harlem", "n": "Harlem"}, {"v": "impromptu-sex", "n": "Impromptu Sex"}, {"v": "insult", "n": "Insult"}, {"v": "milf", "n": "Milf"}, {"v": "sunburn", "n": "Sunburn"}, {"v": "actress-best", "n": "Actress Best"}, {"v": "anal-sex", "n": "Anal Sex"}, {"v": "athlete", "n": "Athlete"}, {"v": "aunt", "n": "Aunt"}, {"v": "car-sex", "n": "Car Sex"}, {"v": "fan-appreciation", "n": "Fan Appreciation"}, {"v": "fisting", "n": "Fisting"}, {"v": "glasses", "n": "Glasses"}, {"v": "how-to", "n": "How To"}, {"v": "idols-and-entertainers", "n": "Idols And Entertainers"}, {"v": "married-women-housewives", "n": "Married Women/housewives"}, {"v": "no-bra", "n": "No Bra"}, {"v": "sailor-suit", "n": "Sailor Suit"}, {"v": "stewardess", "n": "Stewardess"}, {"v": "widow", "n": "Widow"}, {"v": "adopted-daughter", "n": "Adopted Daughter"}, {"v": "ai-generated-works", "n": "AI-Generated Works"}, {"v": "bloomers", "n": "Bloomers"}, {"v": "celebrity", "n": "Celebrity"}, {"v": "club-activities-manager", "n": "Club Activities / Manager"}, {"v": "confinement", "n": "Confinement"}, {"v": "daydreamers", "n": "Daydreamers"}, {"v": "fantasy", "n": "Fantasy"}, {"v": "gag-comedy", "n": "Gag · Comedy"}, {"v": "hard-sex", "n": "Hard Sex"}, {"v": "hypnosis", "n": "Hypnosis"}, {"v": "landlady-hostess", "n": "Landlady, Hostess"}, {"v": "male-squirting", "n": "Male Squirting"}, {"v": "molester", "n": "Molester"}, {"v": "multiple-story", "n": "Multiple Story"}, {"v": "muscle", "n": "Muscle"}, {"v": "naked-apron", "n": "Naked Apron"}, {"v": "premature-ejaculation", "n": "Premature Ejaculation"}, {"v": "race-queen", "n": "Race Queen"}, {"v": "shotacon", "n": "Shotacon"}, {"v": "tsundere", "n": "Tsundere"}, {"v": "30-s", "n": "30's"}, {"v": "blu-ray", "n": "Blu-ray"}, {"v": "breast-milk", "n": "Breast Milk"}, {"v": "bunny-girl", "n": "Bunny Girl"}, {"v": "couple", "n": "Couple"}, {"v": "cusco", "n": "Cusco"}, {"v": "dildo", "n": "Dildo"}, {"v": "emmanuel", "n": "Emmanuel"}, {"v": "experience-confession", "n": "Experience Confession"}, {"v": "flexible", "n": "Flexible"}, {"v": "high-quality-vr", "n": "High-Quality VR"}, {"v": "knee-socks", "n": "Knee Socks"}, {"v": "leotard", "n": "Leotard"}, {"v": "love", "n": "Love"}, {"v": "mini-skirt", "n": "Mini Skirt"}, {"v": "object-insertion", "n": "Object Insertion"}, {"v": "outdoors-exposure", "n": "Outdoors/Exposure"}, {"v": "pantyhose-and-tights", "n": "Pantyhose And Tights"}, {"v": "reversed-role", "n": "Reversed Role"}, {"v": "sexy", "n": "Sexy"}, {"v": "small-breasts-flat-chested", "n": "Small Breasts / Flat-chested"}, {"v": "soapland", "n": "Soapland"}, {"v": "spanking", "n": "Spanking"}, {"v": "time-stop", "n": "Time Stop"}, {"v": "vomit", "n": "Vomit"}, {"v": "voyeurism-and-peeping", "n": "Voyeurism And Peeping"}, {"v": "white-actress", "n": "White Actress"}, {"v": "yoga", "n": "Yoga"}, {"v": "20-s", "n": "20's"}, {"v": "40-s", "n": "40's"}, {"v": "50-s", "n": "50's"}, {"v": "8kvr", "n": "8KVR"}, {"v": "anchorwoman", "n": "Anchorwoman"}, {"v": "av-open-2015-actress-dept", "n": "AV OPEN 2015 Actress Dept."}, {"v": "bondage", "n": "Bondage"}, {"v": "candle", "n": "Candle"}, {"v": "dance", "n": "Dance"}, {"v": "dead-drunk", "n": "Dead Drunk"}, {"v": "defecation", "n": "Defecation"}, {"v": "egg-vibrator", "n": "Egg Vibrator"}, {"v": "female-doctor", "n": "Female Doctor"}, {"v": "granny", "n": "Granny"}, {"v": "hospital-clinic", "n": "Hospital / Clinic"}, {"v": "instructor", "n": "Instructor"}, {"v": "kimono", "n": "Kimono"}, {"v": "loli", "n": "Loli"}, {"v": "look-alike", "n": "Look-alike"}, {"v": "miss", "n": "Miss"}, {"v": "mistress", "n": "Mistress"}, {"v": "naive", "n": "Naive"}, {"v": "otaku", "n": "Otaku"}, {"v": "post", "n": "Post"}, {"v": "receptionist", "n": "Receptionist"}, {"v": "reluctant", "n": "Reluctant"}, {"v": "sex-conversion-feminized", "n": "Sex Conversion / Feminized"}, {"v": "shave", "n": "Shave"}, {"v": "torture", "n": "Torture"}, {"v": "travel", "n": "Travel"}, {"v": "tutor", "n": "Tutor"}, {"v": "vr", "n": "VR"}, {"v": "vr-exclusive", "n": "VR Exclusive"}, {"v": "young-wife", "n": "Young Wife"}];
const MAIN_CLASSES = [
  { type_id: 'home', type_name: '最新推荐' },
  { type_id: 'censored', type_name: '有码' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'engsub', type_name: '英字' },
  { type_id: 'amateur', type_name: '素人' },
  // User-requested near-matches that genuinely exist on this site:
  { type_id: 'genre/big-tits', type_name: '巨乳 Big Tits' },
  { type_id: 'genre/huge-butt', type_name: '大屁股 Huge Butt' },
  { type_id: 'genre/sweet-ass', type_name: '好屁股 Sweet Ass' },
  { type_id: 'genre/digital-mosaic', type_name: '数码马赛克 Digital Mosaic' },
  { type_id: 'genre/risky-mosaic', type_name: '风险马赛克 Risky Mosaic' },
  { type_id: 'genre_zone', type_name: '题材全部' },
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

