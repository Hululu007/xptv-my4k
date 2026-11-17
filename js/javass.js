// Javass - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/javass.js
// WordPress 视频站 javass.love：首页 60 条/页，分类/标签 20 条/页，
// 搜索 /?s=。播放源（2026-11-12 全分类扫查 217 部详情抽样）：
// 1. Bunny 原生：video-js data-settings 直给 b-cdn.net playlist.m3u8，
//    主播单含 480p/720p/1080p/1440p/2160p 多档（每片 3-4 档，以主播单
//    实测为准），直取 200、无 UA 校验——可播，多清晰度。
// 2. Bunny 嵌套：iframe.mediadelivery.net 嵌套页里含同一 b-cdn.net 播单
//    （取不到时用嵌套地址 guid + 拉流区拼接兜底）。
// 3. Lulu 系嵌套（luluvido/luluvdo/lulust）：嵌套页含 Dean Edwards 打包
//    JS，解出 tnmr.org 签名 master.m3u8（单变体 720p，token 每次取嵌套页
//    现生、8 小时有效、无 IP 成分）；CDN 全程只认浏览器 UA（媒体 UA 在
//    master/变体/密钥/分片四级全部 403）——播放走自建 Cloudflare Worker
//    javass-hls（已部署，根回 "javass hls ok"，2026-11-18 实测活着；
//    Worker 内用浏览器 UA 取数并改写播单，视频流量走 Cloudflare）。
//    坑：tnmr.org 的 WAF 遇 Accept-Language: zh-CN 一律 403，取 Lulu
//    签名 master 必须用 UA+Referer（不带 Accept-Language）；Worker ctx
//    须带 ua（Chrome 131，Worker 默认 UA Chrome 128 会被 WAF 拦 502）。
// 4. hgcloud / upns / playmogo（DoodStream Turnstile）：修不了，不列线。
//    修后可播约 86%；剩余约 13.4% 为站方死嵌套，点开仍无集数，非蜘蛛问题。
// 封面直链无防盗链，站方直连无墙。字幕：片名带番号才调芯，不带不搜。
const HOST = 'https://javass.love';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BUNNY_VZ = 'https://vz-9f2ab8d8-84b.b-cdn.net';
// Lulu 系播放中转：自建 Cloudflare Worker javass-hls（已部署）
const JAVASS_HLS = 'https://javass-hls.li768435813.workers.dev';
const JAVASS_RELAY_KEY = 'lai-hls-1';
const LULU_HOSTS = ['luluvido.com', 'luluvdo.com', 'lulust.com'];

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
        if (typeof data === 'string') return data;
        if (data) return JSON.stringify(data);
        return '';
    } catch (e) {
        return '';
    }
}

// 取播单类地址：只带浏览器 UA + Referer，不带 Accept-Language
// （tnmr.org 的 WAF 遇 Accept-Language: zh-CN 一律回 403）。
async function getMediaText(url, referer) {
    try {
        const r = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/' },
            timeout: 20000,
        });
        const data = r ? r.data : null;
        if (typeof data === 'string') return data;
        if (data) return JSON.stringify(data);
        return '';
    } catch (e) {
        return '';
    }
}

function listUrl(cat, page) {
    page = Math.max(1, parseInt(page, 10) || 1);
    cat = t(cat) || 'home';
    if (cat === 'home' || cat === '') {
        return page <= 1 ? HOST + '/' : HOST + '/page/' + page + '/';
    }
    if (cat.indexOf('tag:') === 0) {
        const slug = cat.slice(4);
        return page <= 1 ? HOST + '/video_tag/' + slug + '/' : HOST + '/video_tag/' + slug + '/page/' + page + '/';
    }
    return page <= 1 ? HOST + '/categories/' + cat + '/' : HOST + '/categories/' + cat + '/page/' + page + '/';
}

// 列表解析：每条一个 <article>；封面在 .post-thumbnail 的 background-image
// 里，标题与详情链接在 <a class="post-permalink" title href>，时长在 .video-length。
function parseList(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const re = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
    let m;
    while ((m = re.exec(html))) {
        const body = m[1];
        const am = body.match(/<a[^>]+class="[^"]*post-permalink[^"]*"[^>]+title="([^"]+)"[^>]+href="([^"]+)"[^>]*>/i)
            || body.match(/<a[^>]+title="([^"]+)"[^>]+href="([^"]+)"[^>]*class="[^"]*post-permalink[^"]*"[^>]*>/i)
            || body.match(/<a[^>]+href="(https?:\/\/javass\.love\/video\/[^"\/]+\/)"[^>]*title="([^"]+)"[^>]*>/i);
        let href = '', title = '';
        if (am) {
            if (/^https?:\/\//i.test(am[1])) { href = am[1]; title = am[2]; }
            else { title = am[1]; href = am[2]; }
        }
        if (!href || !/\/video\/[A-Za-z0-9]+\/$/.test(href)) continue;
        if (seen[href]) continue;
        seen[href] = 1;
        const cm = body.match(/background-image:\s*url\(([^)]+)\)/i);
        let cover = cm ? absUrl(cm[1].replace(/["']/g, '').trim()) : '';
        if (!cover) {
            const im = body.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i)
                || body.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"[^>]*>/i)
                || body.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
            if (im) cover = absUrl(im[1]);
        }
        title = decodeHtml(title);
        if (!title) {
            const hm = body.match(/<h2[^>]*>\s*<a[^>]*>([^<]{2,200})<\/a>/i);
            if (hm) title = decodeHtml(hm[1]);
        }
        if (!title) title = href;
        let remarks = '';
        const dm = body.match(/class="[^"]*video-length[^"]*"[^>]*>\s*([^<]{1,12})\s*</i);
        if (dm) remarks = t(dm[1]);
        out.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks, ext: { id: href } });
    }
    return out;
}

function extractTitle(html, fallback) {
    let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (m) return decodeHtml(m[1]).replace(/\s*[—–-]\s*JAV ASS LOVER.*$/i, '').trim();
    m = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
    if (m) return decodeHtml(m[1]);
    m = html.match(/<title>([^<]+)<\/title>/i);
    if (m) return decodeHtml(m[1]).replace(/\s*[—–-]\s*JAV ASS LOVER.*$/i, '').trim();
    return fallback || '';
}

function extractCover(html) {
    const m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
        || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (m) return absUrl(m[1]);
    return '';
}

// 主播单解析：每档取文件夹名作档位（480p/720p/1080p/1440p/2160p），
// 无文件夹名时按 RESOLUTION 最小边就近取标准档；返回按档位从高到低排好的 [{label, url}]。
function parseMaster(text, base) {
    const out = [];
    const seen = {};
    const lines = String(text || '').split(/\r?\n/);
    const STD = [240, 360, 480, 720, 1080, 1440, 2160];
    for (let i = 0; i < lines.length; i++) {
        const inf = /#EXT-X-STREAM-INF:([^\n]*)/.exec(lines[i]);
        if (!inf) continue;
        let j = i + 1, uri = '';
        while (j < lines.length) {
            const s = t(lines[j]);
            if (s && s.charAt(0) !== '#') { uri = s; break; }
            j++;
        }
        if (!uri) continue;
        let label = '';
        const fm = uri.match(/^([0-9]+p)\//i);
        if (fm) label = fm[1].toLowerCase();
        else {
            const rm = /RESOLUTION=(\d+)x(\d+)/i.exec(inf[1]);
            if (rm) {
                const mn = Math.min(parseInt(rm[1], 10), parseInt(rm[2], 10));
                let best = STD[0], bd = 1e9;
                for (let k = 0; k < STD.length; k++) { const d = Math.abs(STD[k] - mn); if (d < bd) { bd = d; best = STD[k]; } }
                label = best + 'p';
            }
        }
        if (!label || seen[label]) continue;
        seen[label] = 1;
        out.push({ label: label, url: resolveUrl(base, uri) });
    }
    out.sort(function (a, b) { return parseInt(b.label, 10) - parseInt(a.label, 10); });
    return out;
}

// Bunny 原生：video-js data-settings JSON 里的 sources[0].src 即主播单地址。
function extractBunnyMaster(html) {
    const m = html.match(/data-settings="([^"]{0,6000})"/i);
    if (!m) return '';
    let s = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    s = s.replace(/\\\//g, '/');
    const sm = s.match(/"sources"\s*:\s*\[\s*\{\s*"src"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
    if (sm) return sm[1].replace(/\\\//g, '/');
    return '';
}

// Bunny 嵌套：取第一个 iframe.mediadelivery.net 嵌套地址。
function extractMediadeliveryEmbed(html) {
    const iframes = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/gi) || [];
    for (let i = 0; i < iframes.length; i++) {
        const um = iframes[i].match(/src="([^"]+)"/i);
        if (um && /iframe\.mediadelivery\.net\/embed\//i.test(um[1])) return um[1].replace(/&amp;/g, '&');
    }
    return '';
}

async function resolveMediadelivery(embedUrl) {
    const page = await getHtml(embedUrl);
    const m = page.match(/https?:\/\/[a-z0-9\-]+\.b-cdn\.net\/[a-f0-9\-]+\/playlist\.m3u8/i);
    if (m) return m[0];
    const gm = embedUrl.match(/\/embed\/\d+\/([a-f0-9\-]{36})/i);
    if (gm) return BUNNY_VZ + '/' + gm[1] + '/playlist.m3u8';
    return '';
}

// ---------- Lulu 系嵌套（Dean Edwards 打包解包 + javass-hls 中转） ----------
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

// 详情页取第一个 Lulu iframe（文档顺序第一个即主播放器；描述区的 hgcloud iframe 在后，不误取）。
function extractLuluEmbed(html) {
    const iframes = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/gi) || [];
    for (let i = 0; i < iframes.length; i++) {
        const um = iframes[i].match(/src="([^"]+)"/i);
        if (um && /lulu(?:vido|vdo|st)\.com\/e\//i.test(um[1])) return um[1].replace(/&amp;/g, '&');
    }
    return '';
}

// Dean Edwards 打包解包（无 eval，纯字符串替换；Lulu 嵌套页实测结构）
function unpackDeanEdwards(html) {
    const m = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)\)/);
    if (!m) return '';
    let p = m[1].replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const a = parseInt(m[2], 10);
    const k = m[4].split('|');
    let c = parseInt(m[3], 10);
    while (c--) {
        if (k[c]) {
            const word = k[c];
            p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), function () { return word; });
        }
    }
    return p;
}

// 取 Lulu 签名 master：同一 file_code 在三 host 间按顺序尝试，解打包 JS 得 tnmr.org 签名播单。
async function resolveLulu(embedUrl, referer) {
    const cm = String(embedUrl || '').match(/\/e\/([A-Za-z0-9]+)/);
    if (!cm) return '';
    const code = cm[1];
    const firstHost = (String(embedUrl).match(/https?:\/\/([^\/]+)/) || [])[1] || '';
    const hosts = [];
    if (firstHost) hosts.push(firstHost);
    for (let i = 0; i < LULU_HOSTS.length; i++) if (hosts.indexOf(LULU_HOSTS[i]) < 0) hosts.push(LULU_HOSTS[i]);
    for (let i = 0; i < hosts.length; i++) {
        let page = '';
        try {
            const r = await $fetch.get('https://' + hosts[i] + '/e/' + code, {
                headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
                timeout: 15000,
            });
            const data = r ? r.data : null;
            page = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
        } catch (e) { page = ''; }
        if (!page) continue;
        const unpacked = unpackDeanEdwards(page);
        if (!unpacked) continue;
        const um = unpacked.match(/https?:\/\/[a-z0-9\-.]+\.tnmr\.org\/[^\s"'\\]+\.m3u8[^\s"'\\]*/i);
        if (um) return um[0];
    }
    return '';
}

// Lulu 签名 master 走 Worker /p/ 路由；ctx 带 Referer、密钥与 UA
// （Worker 默认 UA Chrome 128 会被 tnmr WAF 拦 502，须带 Chrome 131）。
function luluWorkerUrl(master) {
    const ctx = b64url(JSON.stringify({ r: HOST + '/', k: JAVASS_RELAY_KEY, ua: UA }));
    return JAVASS_HLS + '/p/' + b64url(master) + '/' + ctx;
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'Javass',
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
    // 字幕：片名带番号才把片名放进 ext.name，不带则留空（getPlayinfo 便不搜）
    const subName = subExtractCode(name) ? name : '';
    const tracks = [];
    // 播放线：Bunny 两路取真实档位；Lulu 系现解签名 master 走 javass-hls
    // Worker 出单档 720p（master 需先实取一次确认档位，取不到不列线）；
    // hgcloud/upns/playmogo 不列线（见文件头）。
    let master = extractBunnyMaster(html);
    if (!master) {
        const embed = extractMediadeliveryEmbed(html);
        if (embed) master = await resolveMediadelivery(embed);
    }
    if (master) {
        const masterText = await getHtml(master);
        const variants = parseMaster(masterText, master);
        if (variants.length) {
            variants.forEach(function (v) {
                tracks.push({ name: v.label, pan: '', ext: { url: v.url, name: subName } });
            });
        } else {
            tracks.push({ name: '原画', pan: '', ext: { url: master, name: subName } });
        }
    }
    if (!tracks.length) {
        const luluEmbed = extractLuluEmbed(html);
        if (luluEmbed) {
            const luluMaster = await resolveLulu(luluEmbed, url);
            if (luluMaster) {
                // 实取 master 确认档位（Lulu 单变体，实测为 1280x720）；取不到则不列线。
                // 必须用 getMediaText（不带 Accept-Language），否则 tnmr 回 403。
                const luluText = await getMediaText(luluMaster, url);
                const luluVariants = parseMaster(luluText, luluMaster);
                if (luluVariants.length) {
                    // 只列这一档，Worker 地址指向 master，播放器在改写后的 master
                    // 里只见到这一个变体。绝不把同一地址按档位重复列。
                    tracks.push({ name: luluVariants[0].label, pan: '', ext: { url: luluWorkerUrl(luluMaster), name: subName } });
                }
            }
        }
    }
    if (!tracks.length) return jsonify({ list: [] });
    return jsonify({ list: [{ title: '在线播放', tracks: tracks }] });
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
  { type_id: '4k', type_name: '4K' },
  { type_id: 'english-subtitled', type_name: 'English Subtitled' },
  { type_id: 'highlighted', type_name: 'Highlighted' },
  { type_id: 'jav-censured', type_name: 'Censured' },
  { type_id: 'jav-uncensored', type_name: 'Uncensored' },
  { type_id: 'vr', type_name: 'VR' },
  { type_id: 'tag:jav-big-ass', type_name: '标签·jav-big-ass' },
  { type_id: 'tag:big-ass-japanese-porn', type_name: '标签·big-ass-japanese-porn' },
  { type_id: 'tag:amateur', type_name: '标签·amateur' },
  { type_id: 'tag:creampie', type_name: '标签·creampie' },
  { type_id: 'tag:big-tits', type_name: '标签·big-tits' },
  { type_id: 'tag:big-ass-cowgirl', type_name: '标签·big-ass-cowgirl' },
  { type_id: 'tag:huge-butt', type_name: '标签·huge-butt' },
  { type_id: 'tag:big-ass', type_name: '标签·big-ass' },
  { type_id: 'tag:big-butt-pawg', type_name: '标签·big-butt-pawg' },
  { type_id: 'tag:asian-big-ass', type_name: '标签·asian-big-ass' },
  { type_id: 'tag:cowgirl', type_name: '标签·cowgirl' },
  { type_id: 'tag:big-ass-pantyhose', type_name: '标签·big-ass-pantyhose' },
  { type_id: 'tag:doggystyle', type_name: '标签·doggystyle' },
  { type_id: 'tag:japanese-big-ass', type_name: '标签·japanese-big-ass' },
  { type_id: 'tag:jav-big-butt', type_name: '标签·jav-big-butt' },
  { type_id: 'tag:oiled', type_name: '标签·oiled' },
  { type_id: 'tag:subbed', type_name: '标签·subbed' },
  { type_id: 'tag:voluptuous-ass', type_name: '标签·voluptuous-ass' },
  { type_id: 'tag:big-ass-nurse', type_name: '标签·big-ass-nurse' },
  { type_id: 'tag:deepthroat', type_name: '标签·deepthroat' },
  { type_id: 'tag:dildo-riding', type_name: '标签·dildo-riding' },
  { type_id: 'tag:pounding', type_name: '标签·pounding' },
  { type_id: 'tag:retsu-dao', type_name: '标签·retsu-dao' },
  { type_id: 'tag:sacananoco', type_name: '标签·sacananoco' },
  { type_id: 'tag:waka-misono', type_name: '标签·waka-misono' },
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

