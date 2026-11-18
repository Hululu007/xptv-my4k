// OpenLoad - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/py_openload.js
// 站点 https://openload.mov（WordPress 聚合站，汇总 StreamHG / VidHide / Streamtape / DoodStream 等 embed）；
// 分类：最新/モザイク除去/アダルトビデオ/無修正/素人AV/素人投稿/VR + 急上昇/人気 两个榜单页（单页）；
// 前 60 热门标签筛选在 XPTV 里不展；列表分页 /page/N/；搜索走 WP REST /wp-json/wp/v2/posts?search=
// （/?s= 被站方 CF 拦 403），REST 无封面，逐条取详情页 div.history 的 data-thumb 补（前 8 条、3 并发）；
// 详情：packed JS（Dean Edwards）里是各集各线路的 iframe，自研纯 JS 解包器（无 eval）；
// 集数/线路标签从 #episode / #server 读，embed 按定义顺序配对；asianclub.tv、vidoza.net、streamsb.net 三死线直滤；
// 播放（IP 绑定地址现铸现用）：详情时现解每条 embed（3 并发），死线丢弃；StreamHG 系取 links.hls2 签名 master
// （须探活 master + variant 全链，死链判 DEAD 不交播放器）；streamtape 取 robotlink 拼 get_video，
// 点播时跟 302 拿 tapecontent 直链 MP4；vsembed 走站内下载 API（/api/download/tiers 取真实档位 1080p/720p/540p，
// /api/download/get 302 到直链 MP4，点播时现取现跟）；dood / javstream 等解不出直链的回站内嵌页嗅探；
// 2026-11-18 修：getPlayinfo 绝不返回嵌页/详情页地址当播放地址（解不出真流就返回空）；探活 403 不判死链，
// 签名 master 的 token 绑 ASN/IP，当前出口不匹配时 master 照样 403，设备单出口 IP 上可能正常，照常返回真流地址。
// 带字幕（有番号）。
const HOST = 'https://openload.mov';
const SITE_FETCH = 'https://site-fetch.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function headers(referer) {
    return {
        'User-Agent': UA,
        'Referer': referer || (HOST + '/'),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
}

function t(v) { return String(v == null ? '' : v).trim(); }

function escHtml(s) {
    return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

const CLASSES = [
    { type_id: 'latest', type_name: '最新', path: '' },
    { type_id: 'mosaic', type_name: 'モザイク除去', path: '/%e3%83%a2%e3%82%b6%e3%82%a4%e3%82%af%e9%99%a4%e5%8e%bb' },
    { type_id: 'av', type_name: 'アダルトビデオ', path: '/av' },
    { type_id: 'uncensored', type_name: '無修正', path: '/uncensored' },
    { type_id: 'amav', type_name: '素人AV', path: '/amav' },
    { type_id: 'amateur', type_name: '素人投稿', path: '/amateur' },
    { type_id: 'vr', type_name: 'VR', path: '/vr' },
    { type_id: 'soaring', type_name: '急上昇', path: '/soaring' },
    { type_id: 'popularity', type_name: '人気', path: '/popularity' },
];
const PATH_BY_ID = {};
for (const c of CLASSES) PATH_BY_ID[c.type_id] = c.path;

async function getHtml(url, referer) {
    for (let i = 0; i < 3; i++) {
        try {
            const r = await $fetch.get(url, { headers: headers(referer), timeout: 15000 });
            if (r && r.status === 200 && r.data) return String(r.data);
        } catch (e) {}
    }
    // 直连三试皆空时走自家 site-fetch Worker 腿兜底（白名单含 openload.mov）。
    try {
        const r = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), { headers: headers(referer), timeout: 15000 });
        if (r && r.status === 200 && r.data) return String(r.data);
    } catch (e) {}
    return '';
}

async function getHtmlOnce(url, referer) {
    try {
        const r = await $fetch.get(url, { headers: headers(referer), timeout: 12000 });
        if (!r) return { status: 0, body: '' };
        return { status: r.status || 0, body: r.data ? String(r.data) : '' };
    } catch (e) {
        return { status: 0, body: '' };
    }
}

async function fetchEmbed(url, referer) {
    let lastStatus = 0;
    let lastBody = '';
    for (let i = 0; i < 3; i++) {
        try {
            const r = await $fetch.get(url, { headers: headers(referer), timeout: 8000 });
            if (r) {
                lastStatus = r.status || 0;
                if (r.status === 404) return { status: 404, body: '' };
                if (r.status === 200 && r.data) return { status: 200, body: String(r.data) };
                lastBody = r.data ? String(r.data) : '';
            }
        } catch (e) {}
    }
    // 直连三试无果时走 site-fetch 腿（mixdrop.co 除外：该域 DNS 已死，
    // Worker 也解析不出，见 normEmbed 的域名迁移）。
    try {
        const r = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), { headers: headers(referer), timeout: 12000 });
        if (r && r.status === 200 && r.data) return { status: 200, body: String(r.data) };
        if (r && r.status === 404) return { status: 404, body: '' };
    } catch (e) {}
    return { status: lastStatus, body: lastBody };
}

// mixdrop 域名已迁移：mixdrop.co DNS 解析失败（2026-11-19 实测 jina 报
// EAI_AGAIN、直连 000），现行域为 mixdrop.ag（302 到 mxdrop.click）。
// 嵌页地址统一改写到活域；mixdrop 播放器为 JS 驱动、静态取页拿不到直链，
// 仅 mixdrop 的视频仍解不出（见 resolveEmbed 的 mixdrop 分支说明）。
function normEmbed(u) {
    let s = String(u || '').trim();
    if (!s) return s;
    s = s.replace(/^https?:\/\/mixdrop\.co\//i, 'https://mixdrop.ag/');
    return s;
}

async function getRest(url) {
    for (let i = 0; i < 3; i++) {
        try {
            const r = await $fetch.get(url, {
                headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': HOST + '/' },
                timeout: 8000,
            });
            if (r && r.status === 200 && r.data) {
                let posts = null;
                try { posts = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; } catch (e) {}
                if (posts) {
                    const hdrs = (r.headers) || {};
                    const tp = hdrs['x-wp-totalpages'] || hdrs['X-WP-TotalPages'];
                    return { posts, totalPages: tp ? (parseInt(tp, 10) || 1) : 1 };
                }
            }
        } catch (e) {}
    }
    return { posts: null, totalPages: 1 };
}

function jsUnescape(s) {
    let out = '';
    let i = 0;
    while (i < s.length) {
        const c = s.charAt(i);
        if (c === '\\' && i + 1 < s.length) {
            const n = s.charAt(i + 1);
            if (n === "'") { out += "'"; i += 2; }
            else if (n === '\\') { out += '\\'; i += 2; }
            else if (n === 'n') { out += '\n'; i += 2; }
            else if (n === 'r') { out += '\r'; i += 2; }
            else if (n === 't') { out += '\t'; i += 2; }
            else if (n === 'x' && i + 3 < s.length) { out += String.fromCharCode(parseInt(s.substr(i + 2, 2), 16)); i += 4; }
            else if (n === 'u' && i + 5 < s.length) { out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16)); i += 6; }
            else { out += n; i += 2; }
        } else { out += c; i++; }
    }
    return out;
}

function olUnpack(packed) {
    if (!packed) return '';
    const m = packed.match(/\}\('((?:\\'|[^'])*)',(\d+),(\d+),'((?:\\'|[^'])*)'\.split\('\|'\)(?:,0,\{\})?\)\)/);
    if (!m) return '';
    const payload = jsUnescape(m[1]);
    const base = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const keys = m[4].split('|');
    const enc = (x) => (x < base ? '' : enc(parseInt(x / base))) + ((x = x % base) > 35 ? String.fromCharCode(x + 29) : x.toString(36));
    if (packed.indexOf('d[e(c)]=k[c]') >= 0) {
        const d = {};
        for (let i = 0; i < count; i++) d[enc(i)] = keys[i] || enc(i);
        return payload.replace(/\b\w+\b/g, (w) => (d[w] !== undefined ? d[w] : w));
    }
    let p = payload;
    for (let c = count - 1; c >= 0; c--) {
        if (keys[c]) p = p.replace(new RegExp('\\b' + c.toString(base) + '\\b', 'g'), keys[c]);
    }
    return p;
}

function unpackDetailEmbeds(html) {
    const re = /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)(?:,0,\{\})?\)\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const up = olUnpack(m[0]);
        if (up && up.indexOf('<iframe') >= 0) {
            const out = [];
            const ire = /<iframe[^>]*src="([^"]+)"/g;
            let im;
            while ((im = ire.exec(up)) !== null) out.push(normEmbed(im[1]));
            if (out.length) return out;
        }
    }
    return [];
}

function hostOf(url) {
    // 不用 new URL：XPTV 沙箱与本地 harness 未必提供 URL 全局（实测 vm 沙箱里
    // typeof URL 为 undefined，旧 hostOf 抛错被 catch 吃掉回 ''，导致所有
    // embed 都判 sniff、getPlayinfo 只能回嵌页地址）。纯正则取 host。
    const m = String(url || '').match(/^[a-z][a-z0-9+.-]*:\/\/([^\/:?#]+)/i);
    return m ? m[1].toLowerCase() : '';
}

function resolveUrl(u, base) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    const b = String(base || '');
    if (u.charAt(0) === '/') {
        const m = b.match(/^(https?:\/\/[^\/]+)/i);
        return (m ? m[1] : '') + u;
    }
    const idx = b.lastIndexOf('/');
    const dir = idx >= 0 ? b.slice(0, idx + 1) : b + '/';
    return dir + u;
}

const DEAD_HOSTS = ['asianclub.tv', 'vidoza.net', 'streamsb.net'];
function isDeadEmbed(url) {
    const h = hostOf(url);
    return DEAD_HOSTS.indexOf(h) >= 0;
}

function isHgHost(h) {
    return h === 'iplayerhls.com' || h === 'callistanise.com' || h === 'minochinos.com' ||
        h === 'streamhide.to' || h === 'likessb.com' || h === 'sbstream.net';
}
function isStreamtape(h) {
    return h === 'streamtape.com';
}

async function probeHlsText(url, referer) {
    try {
        const r = await $fetch.get(url, { headers: headers(referer), timeout: 6000 });
        if (r && r.data) {
            const s = String(r.data);
            if (r.status === 200 && s.indexOf('#EXTM3U') === 0) return { ok: true, status: 200, text: s };
            return { ok: false, status: r.status || 0, text: s };
        }
    } catch (e) {}
    return { ok: false, status: 0, text: '' };
}

function firstVariantUri(masterText, masterUrl) {
    const lines = String(masterText || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i].trim();
        if (ln.indexOf('#EXT-X-STREAM-INF') === 0) {
            for (let j = i + 1; j < lines.length; j++) {
                const u = lines[j].trim();
                if (!u) continue;
                if (u.charAt(0) === '#') break;
                return resolveUrl(u, masterUrl);
            }
            return '';
        }
    }
    return '';
}

async function probeHlsChain(masterUrl, referer) {
    // 返回 'live' | 'forbidden' | 'dead'：403 是签名 token 的 ASN/IP 绑定
    // 在当前出口不匹配（VM 侧常见：token asn=13335，VM 出口 AS394192），
    // 不是链路已死，不作死链判；404/超时/空/非 M3U8 才是死链。
    const m = await probeHlsText(masterUrl, referer);
    if (m.ok) {
        if (m.text.indexOf('#EXTINF') >= 0) return 'live';
        const v = firstVariantUri(m.text, masterUrl);
        if (!v) return 'live';
        const vt = await probeHlsText(v, referer);
        if (vt.ok) return 'live';
        if (vt.status === 403) return 'forbidden';
        return 'dead';
    }
    if (m.status === 403) return 'forbidden';
    return 'dead';
}

async function resolveHg(embed) {
    const f = await fetchEmbed(embed, embed);
    if (f.status === 404) return 'DEAD';
    const html = f.body;
    if (!html) return '';
    if (/no longer available|has been deleted|file not found|video not found|this video (has been )?deleted/i.test(html)) return 'DEAD';
    const re = /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)(?:,0,\{\})?\)\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const up = olUnpack(m[0]);
        if (!up || up.indexOf('hls2') < 0) continue;
        const hls2 = (up.match(/"hls2"\s*:\s*"([^"]+)"/) || [])[1] || '';
        const hls3 = (up.match(/"hls3"\s*:\s*"([^"]+)"/) || [])[1] || '';
        const hls4 = (up.match(/"hls4"\s*:\s*"([^"]+)"/) || [])[1] || '';
        // 探活 403 不判死：签名 token 绑 ASN/IP，当前出口不匹配时 master 照样 403，
        // 但设备上（单出口 IP）可能正常，照常返回 master 由播放器再试；只有
        // 404/超时/空/非 M3U8 的死链才判 DEAD（op-1042218 教训仍保留）。
        if (hls2) {
            if ((await probeHlsChain(hls2, embed)) !== 'dead') return hls2;
            return 'DEAD';
        }
        if (hls3) {
            if ((await probeHlsChain(hls3, embed)) !== 'dead') return hls3;
            return 'DEAD';
        }
        if (hls4) {
            const u = resolveUrl(hls4, embed);
            if ((await probeHlsChain(u, embed)) !== 'dead') return u;
            return 'DEAD';
        }
    }
    return '';
}

async function resolveStreamtape(embed) {
    const f = await fetchEmbed(embed, embed);
    if (f.status === 404) return 'DEAD';
    const html = f.body;
    if (!html) return '';
    if (/no longer available|has been deleted|file not found|video not found|this video (has been )?deleted/i.test(html)) return 'DEAD';
    const m = html.match(/get_video\?id=([^']*)'\s*\+\s*\('([^']*)'\)((?:\.substring\(\d+\))*)?/);
    if (m) {
        let tail = m[2];
        const subs = (m[3] || '').match(/substring\((\d+)\)/g) || [];
        for (const s of subs) {
            const n = parseInt((s.match(/(\d+)/) || [])[1] || '0', 10) || 0;
            tail = tail.substring(n);
        }
        return 'https://streamtape.com/get_video?id=' + m[1] + tail;
    }
    const m2 = html.match(/get_video\?id=([A-Za-z0-9]+)&expires=(\d+)&ip=([^"'\s&<>]+)&token=([^"'\s&<>]+)/);
    if (m2) return 'https://streamtape.com/get_video?id=' + m2[1] + '&expires=' + m2[2] + '&ip=' + m2[3] + '&token=' + m2[4];
    return '';
}

function isDirectMedia(u) {
    return u.indexOf('.m3u8') >= 0 || u.indexOf('/get_video?') >= 0 || /\.mp4(\?|#|$)/.test(u);
}

function isMixdrop(h) {
    return h === 'mixdrop.co' || h === 'mixdrop.ag' || h === 'mxdrop.click' || h.endsWith('.mixdrop.co') || h.endsWith('.mixdrop.ag') || h.endsWith('.mxdrop.click');
}

// mixdrop：播放器为 JS 驱动（MDCore.wurl 由 player JS 动态取），静态取页
// 通常拿不到直链；只做保守尝试——页内若出现 mixdrop/mxdrop 域的直链
// mp4/m3u8（或 wurl 值）就取用，否则回 '' 走 sniff（getPlayinfo 回空，
// 绝不把嵌页地址当播放地址）。实测样本 op-510638 的两个 mixdrop 文件均
// 已删（mxdrop.click 回 "We can't find the video"），该片本就播不了。
async function resolveMixdrop(embed) {
    const f = await fetchEmbed(embed, embed);
    const html = f.body || '';
    if (!html) return '';
    if (/we can't find the video|video (has been )?deleted|no longer available/i.test(html)) return 'DEAD';
    const m = html.match(/["'](https?:\/\/[a-z0-9-]+\.(?:mxdrop\.click|mixdrop\.ag|mixdrop\.co)\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i)
        || html.match(/wurl\s*=\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
    if (m && m[1]) {
        const u = m[1];
        return u.indexOf('.m3u8') >= 0 ? { kind: 'hls', url: u } : { kind: 'mp4', url: u };
    }
    return '';
}

async function resolveEmbed(embed) {
    const h = hostOf(embed);
    if (!h) return { kind: 'sniff', url: embed };
    if (isHgHost(h)) {
        const u = await resolveHg(embed);
        if (u === 'DEAD') return { kind: 'dead', url: embed };
        if (u) return { kind: 'hls', url: u };
    } else if (isStreamtape(h)) {
        const u = await resolveStreamtape(embed);
        if (u === 'DEAD') return { kind: 'dead', url: embed };
        if (u) return { kind: 'mp4', url: u };
    } else if (isMixdrop(h)) {
        const r = await resolveMixdrop(embed);
        if (r === 'DEAD') return { kind: 'dead', url: embed };
        if (r) return r;
    }
    return { kind: 'sniff', url: embed };
}

async function resolveAll(embeds) {
    const out = new Array(embeds.length);
    let idx = 0;
    async function worker() {
        while (idx < embeds.length) {
            const i = idx++;
            try {
                out[i] = await resolveEmbed(embeds[i]);
            } catch (e) {
                out[i] = { kind: 'sniff', url: embeds[i] };
            }
        }
    }
    await Promise.all([worker(), worker(), worker()]);
    return out;
}

function isMediaFileUrl(u) {
    return /tapecontent\.net|\.mp4(\?|#|$)/i.test(u || '');
}

async function followRedirect(url, referer) {
    let cur = url;
    for (let hop = 0; hop < 2; hop++) {
        let loc = '';
        let done = '';
        try {
            const r = await $fetch.get(cur, { headers: headers(referer), timeout: 6000, maxRedirects: 0 });
            if (r) {
                if (r.status >= 300 && r.status < 400) {
                    const hdrs = r.headers || {};
                    loc = hdrs.location || hdrs.Location || '';
                } else if (r.status === 200) {
                    done = r.finalUrl || r.url || '';
                }
            }
        } catch (e) {}
        if (loc) {
            cur = resolveUrl(loc, cur);
            if (!cur) return '';
            if (isMediaFileUrl(cur)) return cur;
            continue;
        }
        if (done && isMediaFileUrl(done)) return done;
        return '';
    }
    return isMediaFileUrl(cur) ? cur : '';
}

function vsIdOf(embed) {
    const parts = String(embed || '').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

async function vsTiers(embed) {
    try {
        const id = vsIdOf(embed);
        if (!id) return [];
        const r = await $fetch.get('https://vsembed.com/api/download/tiers?s=' + encodeURIComponent(id), {
            headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': embed },
            timeout: 10000,
        });
        if (!r || r.status !== 200 || !r.data) return [];
        const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        const tiers = (j && j.data && j.data.tiers) || [];
        return tiers.filter((x) => x && /^\d+p$/.test(String(x.file || ''))).map((x) => String(x.file));
    } catch (e) { return []; }
}

async function vsDownloadUrl(embed, tier) {
    try {
        const id = vsIdOf(embed);
        if (!id || !tier) return '';
        const u = 'https://vsembed.com/api/download/get?s=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(tier);
        return await followRedirect(u, embed);
    } catch (e) { return ''; }
}

function parseList(html) {
    const list = [];
    if (!html) return list;
    const re = /<a href="(https:\/\/openload\.mov\/[^"]*?\/op-\d+\/)"[^>]*>\s*<div class="post-list-image">\s*<img src="([^"]+)"[^>]*?alt="([^"]*)"[^>]*>(?:\s*<div[^>]*>\s*<\/div>)?\s*<\/div>\s*<span>([\s\S]*?)<\/span>\s*(?:<div class="post-list-time">([^<]*)<\/div>)?/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(html)) !== null) {
        const url = m[1];
        if (seen.has(url)) continue;
        seen.add(url);
        const title = escHtml(m[4] || m[3] || '');
        if (!title) continue;
        list.push({
            vod_id: url,
            vod_name: title,
            vod_pic: m[2] || '',
            vod_remarks: t(m[5] || ''),
            // 卡片必须带 ext.id：XPTV 把 card.ext 传给 getTracks，缺 ext 时
            // 设备侧 getTracks 收不到 id、0 轨（2026-11-19 根因，harness 会
            // 用 vod_id 兜底所以 VM 侧看不出来）。
            ext: { id: url },
        });
    }
    return list;
}

function parsePagecount(html) {
    if (!html) return 1;
    const pages = [];
    const re = /\/page\/(\d+)\//g;
    let m;
    while ((m = re.exec(html)) !== null) pages.push(parseInt(m[1], 10) || 1);
    if (!pages.length) return 1;
    return Math.max.apply(null, pages);
}

function pagePath(path, page) {
    if (!page || page <= 1) return path || '/';
    return (path || '') + '/page/' + page + '/';
}

function parseDetail(html, durl) {
    const title = escHtml(((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/\s*-\s*OPENLOAD\.PRO\s*$/, ''));
    const pic = (html.match(/data-thumb="([^"]+)"/) || [])[1] || '';
    const epBlock = (html.match(/<div id="episode">([\s\S]*?)<\/div>/) || [])[1] || '';
    const epNums = (epBlock.match(/<span[^>]*>(\d+)<\/span>/g) || []).length || 1;
    const parts = [];
    const serverRe = /<div id="e(\d+)"[^>]*>([\s\S]*?)<\/div>/g;
    let sm;
    while ((sm = serverRe.exec(html)) !== null) {
        const labels = [];
        const lre = /<span[^>]*>([^<]+)<\/span>/g;
        let lm;
        while ((lm = lre.exec(sm[2])) !== null) labels.push(t(lm[1]));
        if (labels.length) parts.push(labels);
    }
    const embeds = unpackDetailEmbeds(html).filter((u) => !isDeadEmbed(u));
    return { title, pic, epNums, parts, embeds };
}

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
        title: 'OpenLoad',
        site: HOST,
        tabs: CLASSES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'latest');
    const page = parseInt(ext.page || 1, 10) || 1;
    let url;
    if (id === 'soaring' || id === 'popularity') {
        url = HOST + PATH_BY_ID[id] + '/';
    } else {
        url = HOST + pagePath(PATH_BY_ID[id] || '', page);
    }
    const html = await getHtml(url);
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id || '');
    const list = [];
    if (id) {
        const durl = id.indexOf('http') === 0 ? id : HOST + id;
        const html = await getHtml(durl);
        const d = parseDetail(html, durl);
        const title = d.title || durl;
        const jobs = [];
        {
            let ei = 0;
            const nParts0 = Math.max(d.parts.length, 1);
            for (let pi = 0; pi < nParts0; pi++) {
                const labels = d.parts[pi] || ['HG'];
                for (let si = 0; si < labels.length; si++) {
                    const emb = d.embeds[ei++] || '';
                    if (emb) jobs.push({ pi, label: labels[si], embed: emb });
                }
            }
        }
        const solved = await resolveAll(jobs.map((j) => j.embed));
        const vsTierMap = {};
        {
            const vsJobs = [];
            const vsSeen = {};
            for (let k = 0; k < jobs.length; k++) {
                const emb = jobs[k].embed || '';
                if (hostOf(emb) !== 'vsembed.com' || vsSeen[emb]) continue;
                vsSeen[emb] = true;
                const r = solved[k];
                if (r && (r.kind === 'hls' || r.kind === 'mp4')) continue;
                vsJobs.push((async () => {
                    try {
                        const tiers = await vsTiers(emb);
                        if (tiers && tiers.length) vsTierMap[emb] = tiers;
                    } catch (e) {}
                })());
            }
            await Promise.all(vsJobs);
        }
        const nParts = Math.max(d.parts.length, 1);
        for (let pi = 0; pi < nParts; pi++) {
            const tracks = [];
            for (let k = 0; k < jobs.length; k++) {
                if (jobs[k].pi !== pi) continue;
                const r = solved[k];
                if (!r || r.kind === 'dead') continue;
                if (r.kind === 'hls' || r.kind === 'mp4') {
                    tracks.push({ name: jobs[k].label, pan: '', ext: { url: durl + '@@' + jobs[k].embed + '@@' + r.url, name: title } });
                } else if (vsTierMap[jobs[k].embed]) {
                    for (const tier of vsTierMap[jobs[k].embed]) {
                        tracks.push({ name: jobs[k].label + '·' + tier, pan: '', ext: { url: durl + '@@' + jobs[k].embed + '@@' + tier, name: title } });
                    }
                } else {
                    tracks.push({ name: jobs[k].label, pan: '', ext: { url: durl + '@@' + jobs[k].embed, name: title } });
                }
            }
            if (tracks.length) {
                list.push({ title: nParts > 1 ? '第' + (pi + 1) + '集' : '播放线路', tracks });
            }
        }
        if (!list.length) {
            list.push({ title: '播放线路', tracks: [{ name: '网页播放', pan: '', ext: { url: durl, name: title } }] });
        }
    }
    return jsonify({ list });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.url || '').trim();
    const name = t(ext.name || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    const withSubs = async (url, referer) => {
        const result = { urls: [url], headers: [{ 'User-Agent': UA, 'Referer': referer }] };
        if (name) {
            try {
                const subs = await subSearch(name);
                if (subs && subs.length) result.subs = subs;
            } catch (e) {}
        }
        return jsonify(result);
    };
    const empty = () => jsonify({ urls: [], headers: [] });
    try {
        let durl = '';
        let embed = id;
        let oldUrl = '';
        const parts = id.split('@@');
        if (parts.length >= 3) {
            durl = parts[0];
            embed = parts[1];
            oldUrl = parts.slice(2).join('@@');
        } else if (parts.length === 2) {
            durl = parts[0];
            embed = parts[1];
        }
        // 裸站内详情页（网页播放兜底行）：重拉详情页取首条 embed 再解；无 embed 则空
        if (embed.indexOf('openload.mov') >= 0 && embed.indexOf('/op-') >= 0) {
            const html = await getHtml(embed);
            const d = parseDetail(html, embed);
            if (d.embeds && d.embeds.length) {
                durl = embed;
                embed = d.embeds[0];
                oldUrl = '';
            } else {
                return empty();
            }
        }
        // 绝不返回页面地址当播放地址：解不出真流就返回空
        if (embed.indexOf('http') !== 0) return empty();
        if (hostOf(embed) === 'vsembed.com') {
            let tier = /^\d+p$/.test(oldUrl || '') ? oldUrl : '';
            if (!tier) {
                try {
                    const tiers = await vsTiers(embed);
                    if (tiers && tiers.length) tier = tiers[0];
                } catch (e) {}
            }
            if (tier) {
                const u = await vsDownloadUrl(embed, tier);
                if (u) return withSubs(u, embed);
            }
            return empty();
        }
        if (isDirectMedia(embed) && !oldUrl) {
            return withSubs(embed, durl || embed);
        }
        // 点播时对点的这条线重新现解：HG 系取新鲜 hls2 签名 master，
        // ST 取 get_video 后跟 302 拿 tapecontent 直链，VS 走下载 API；
        // 现解出的真流地址直接返回，不再用探活二次拦截（探活 403 只是
        // token 的 ASN/IP 绑定在当前出口不匹配，不是链路已死）。
        let r = null;
        try {
            r = await resolveEmbed(embed);
        } catch (e) {
            r = null;
        }
        if (r && (r.kind === 'hls' || r.kind === 'mp4')) {
            let playUrl = r.url;
            if (r.kind === 'mp4' && r.url.indexOf('/get_video?') >= 0) {
                try {
                    const followed = await followRedirect(r.url, embed);
                    if (followed) playUrl = followed;
                } catch (e) {}
            }
            return withSubs(playUrl, embed);
        }
        // 现解失败：回详情时旧直链兜底；m3u8 旧链只拦死链（404/超时/非 M3U8），
        // 403（ASN 绑定）不拦，宁可交给播放器再试，也不返回嵌页地址。
        if (oldUrl && isDirectMedia(oldUrl)) {
            let playUrl = oldUrl;
            if (oldUrl.indexOf('/get_video?') >= 0) {
                try {
                    const followed = await followRedirect(oldUrl, embed);
                    if (followed) playUrl = followed;
                } catch (e) {}
            }
            if (playUrl.indexOf('.m3u8') >= 0) {
                let st = 'dead';
                try { st = await probeHlsChain(playUrl, embed); } catch (e) {}
                if (st === 'dead') return empty();
            }
            return withSubs(playUrl, durl || embed);
        }
        return empty();
    } catch (e) {
        return empty();
    }
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text || '');
    const page = parseInt(ext.page || 1, 10) || 1;
    if (!wd) return jsonify({ list: [] });
    const url = HOST + '/wp-json/wp/v2/posts?search=' + encodeURIComponent(wd) + '&per_page=20&page=' + page;
    const res = await getRest(url);
    const posts = res.posts;
    if (!posts || !posts.length) return jsonify({ list: [] });
    const list = posts.map((p) => ({
        vod_id: p.link || '',
        vod_name: escHtml((p.title && p.title.rendered) || ''),
        vod_pic: '',
        vod_remarks: (p.date || '').slice(0, 10),
        // 卡片必须带 ext.id（同上）。
        ext: { id: p.link || '' },
    })).filter((v) => v.vod_id && v.vod_name);
    const thumbJobs = list.slice(0, 8);
    let thumbIdx = 0;
    async function thumbWorker() {
        while (thumbIdx < thumbJobs.length) {
            const v = thumbJobs[thumbIdx++];
            try {
                const f = await getHtmlOnce(v.vod_id, v.vod_id);
                const m = f.body.match(/data-thumb="([^"]+)"/);
                if (m) v.vod_pic = m[1];
            } catch (e) {}
        }
    }
    await Promise.all([thumbWorker(), thumbWorker(), thumbWorker()]);
    return jsonify({ list });
}
