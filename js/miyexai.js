// 蜜夜AI - XPTV csp 格式
// 转换自 lailai-rex 模块 lai_miyexai_1.0.2.js（REX Widget 写法重写）；站点 https://littlepervert.com，AI 成人短剧（竖屏、多集）。
// 分类：5 分组 66 子分类，列表页 /zh-CN/c/<slug>/ 一次渲染全部剧集，本地按 20 条一页切分；详情页 /zh-CN/s/<slug>/ 内嵌 eps JSON。
// 播放：签名 m3u8 只有 15 分钟有效且疑似绑取会话，直出恒 403；首行走用户自建 Worker miyexai-hls（/p?s=<slug>&n=<集>，Worker 内现铸现取），直连签名行回落。
// 单档 720p 竖屏，无多清晰度；无番号，不接字幕。
const HOST = 'https://littlepervert.com';
const MIYEXAI_HLS = 'https://miyexai-hls.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 20;

const appConfig = {
    ver: 1,
    title: '蜜夜AI',
    site: HOST,
    tabs: [
        { name: "禁忌", ext: { sub: "off-limits" } },
        { name: "第一人称", ext: { sub: "pov" } },
        { name: "喜剧", ext: { sub: "comedy" } },
        { name: "慢热", ext: { sub: "slow-burn" } },
        { name: "对手与复仇", ext: { sub: "rivals" } },
        { name: "郊区", ext: { sub: "suburbia" } },
        { name: "旅行", ext: { sub: "travel" } },
        { name: "奇幻", ext: { sub: "fantasy" } },
        { name: "办公室", ext: { sub: "office" } },
        { name: "历史", ext: { sub: "historical" } },
        { name: "室友", ext: { sub: "roommates" } },
        { name: "科幻", ext: { sub: "sci-fi" } },
        { name: "保镖与制服", ext: { sub: "bodyguard" } },
        { name: "3P", ext: { sub: "threesome" } },
        { name: "继母", ext: { sub: "stepmom" } },
        { name: "熟女", ext: { sub: "milf" } },
        { name: "人妻", ext: { sub: "wife" } },
        { name: "女王", ext: { sub: "femdom" } },
        { name: "强势女", ext: { sub: "dominant-women" } },
        { name: "绿帽", ext: { sub: "cuckold" } },
        { name: "群交", ext: { sub: "group" } },
        { name: "魔物娘", ext: { sub: "monster-girl" } },
        { name: "女女", ext: { sub: "girl-girl" } },
        { name: "差点被抓", ext: { sub: "almost-caught" } },
        { name: "重组家庭", ext: { sub: "blended-family" } },
        { name: "出轨", ext: { sub: "cheating" } },
        { name: "游戏与挑战", ext: { sub: "dares" } },
        { name: "三角恋", ext: { sub: "love-triangle" } },
        { name: "偷窥", ext: { sub: "voyeur" } },
        { name: "王室", ext: { sub: "royalty" } },
        { name: "摔角", ext: { sub: "wrestling" } },
        { name: "角色扮演游戏", ext: { sub: "roleplay" } },
        { name: "婚礼", ext: { sub: "wedding" } },
        { name: "公共场所", ext: { sub: "public" } },
        { name: "勒索", ext: { sub: "blackmail" } },
        { name: "贞操", ext: { sub: "chastity" } },
        { name: "恋足", ext: { sub: "foot-fetish" } },
        { name: "BDSM", ext: { sub: "bdsm" } },
        { name: "家中", ext: { sub: "home" } },
        { name: "泳池", ext: { sub: "pool" } },
        { name: "派对", ext: { sub: "party" } },
        { name: "海滩与游艇", ext: { sub: "beach" } },
        { name: "淋浴", ext: { sub: "shower" } },
        { name: "车内", ext: { sub: "car" } },
        { name: "户外", ext: { sub: "outdoors" } },
        { name: "卧室", ext: { sub: "bedroom" } },
        { name: "酒店", ext: { sub: "hotel" } },
        { name: "健身房", ext: { sub: "gym" } },
        { name: "白人", ext: { sub: "white" } },
        { name: "20多岁", ext: { sub: "age-20s" } },
        { name: "金发", ext: { sub: "blonde" } },
        { name: "巨乳", ext: { sub: "busty" } },
        { name: "纤瘦", ext: { sub: "slim" } },
        { name: "30多岁", ext: { sub: "age-30s" } },
        { name: "运动型", ext: { sub: "athletic" } },
        { name: "棕发", ext: { sub: "brunette" } },
        { name: "彩色头发", ext: { sub: "colored-hair" } },
        { name: "红发", ext: { sub: "redhead" } },
        { name: "黑发", ext: { sub: "black-hair" } },
        { name: "40岁以上", ext: { sub: "age-40s" } },
        { name: "丰满", ext: { sub: "curvy" } },
        { name: "巨臀", ext: { sub: "big-ass" } },
        { name: "拉丁裔", ext: { sub: "latina" } },
        { name: "亚洲人", ext: { sub: "asian" } },
        { name: "娇小", ext: { sub: "petite" } },
        { name: "黑人", ext: { sub: "ebony" } }
    ],
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
    let r = t(s)
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    r = r.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
    r = r.replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16)));
    return r;
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return HOST + u;
    return HOST + '/' + u;
}

async function getHtml(url, referer) {
    try {
        const r = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': referer || HOST + '/zh-CN/',
            },
        });
        const data = r ? r.data : null;
        return data == null ? '' : (typeof data === 'string' ? data : JSON.stringify(data));
    } catch (e) {
        return '';
    }
}

async function getJson(url) {
    const txt = await getHtml(url);
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
}

function slugFromUrl(url) {
    const m = String(url || '').match(/\/zh-CN\/s\/([^\/\?#]+)/i);
    return m ? m[1] : '';
}

function extractJsonByKey(html, key) {
    const re = new RegExp('"' + key + '"\\s*:\\s*(\\[|\\{)');
    const m = re.exec(html);
    if (!m) return null;
    const start = m.index + m[0].length - 1;
    const open = html[start];
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < html.length; i++) {
        const ch = html[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === open) depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0) {
                try { return JSON.parse(html.slice(start, i + 1)); } catch (e) { return null; }
            }
        }
    }
    return null;
}

function parseCards(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const chunks = String(html).split('<div class="card"');
    for (let i = 1; i < chunks.length; i++) {
        const c = chunks[i];
        const hm = c.match(/<a[^>]+href="(\/zh-CN\/s\/[^"\/]+\/)"[^>]*>/i);
        if (!hm) continue;
        const url = absUrl(hm[1]);
        if (seen[url]) continue;
        seen[url] = 1;
        const im = c.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
        let title = '';
        let pic = '';
        if (im) {
            pic = absUrl(im[1]);
            const am = im[0].match(/alt="([^"]*)"/i);
            if (am) title = decodeHtml(am[1]);
        }
        if (!title) {
            const tm = c.match(/<span[^>]*class="ctitle"[^>]*>([^<]+)<\/span>/i)
                || c.match(/<h[23][^>]*>([^<]{2,120})<\/h/i);
            if (tm) title = decodeHtml(tm[1]);
        }
        let remarks = '';
        const em = c.match(/<span[^>]*class="epn"[^>]*aria-label="([^"]*)"/i)
            || c.match(/aria-label="(\d+\s*集)"/i);
        if (em) remarks = decodeHtml(em[1]).replace(/\s+/g, '');
        out.push({ vod_id: url, vod_name: title || slugFromUrl(url) || url, vod_pic: pic, vod_remarks: remarks, ext: { id: url, name: title || slugFromUrl(url) } });
    }
    return out;
}

function parseJsonLd(html) {
    const out = [];
    const seen = {};
    if (!html) return out;
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        let d = null;
        try { d = JSON.parse(m[1]); } catch (e) { continue; }
        const arr = Array.isArray(d) ? d : [d];
        for (const it of arr) {
            if (!it || it['@type'] !== 'ItemList') continue;
            const els = it.itemListElement || [];
            for (const el of els) {
                const item = el && el.item ? el.item : null;
                if (!item || !item.url) continue;
                const url = absUrl(item.url);
                if (seen[url]) continue;
                seen[url] = 1;
                out.push({ vod_id: url, vod_name: decodeHtml(item.name || slugFromUrl(url)), vod_pic: absUrl(item.image || ''), vod_remarks: '', ext: { id: url, name: decodeHtml(item.name || slugFromUrl(url)) } });
            }
        }
    }
    return out;
}

function parseList(html) {
    const list = parseCards(html);
    return list.length ? list : parseJsonLd(html);
}

function paginate(list, page) {
    const total = list.length;
    const pagecount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pagecount) return [];
    const start = (page - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const sub = String(ext.sub || 'off-limits');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const html = await getHtml(HOST + '/zh-CN/c/' + encodeURIComponent(sub) + '/');
    const list = paginate(parseList(html), page);
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const pageUrl = String(ext.id || '');
    const slug = slugFromUrl(pageUrl);
    const tracks = [];
    if (slug) {
        const html = await getHtml(pageUrl, pageUrl);
        let plays = [];
        if (html) {
            const eps = extractJsonByKey(html, 'eps');
            if (Array.isArray(eps)) {
                const sorted = eps.slice().sort((a, b) => (parseInt(a.n, 10) || 0) - (parseInt(b.n, 10) || 0));
                for (const e of sorted) {
                    const n = parseInt(e.n, 10);
                    if (n) plays.push(n);
                }
            }
        }
        if (!plays.length) {
            const fresh = await getJson(HOST + '/p?s=' + encodeURIComponent(slug));
            if (fresh && fresh.ok && fresh.u) {
                plays = Object.keys(fresh.u).map((k) => parseInt(k, 10)).filter((n) => n > 0).sort((a, b) => a - b);
            }
        }
        for (const n of plays) {
            tracks.push({ name: '第' + n + '集', pan: '', ext: { url: pageUrl + '@@LP:' + slug + ':' + n, name: '' } });
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const raw = String(ext.url || '');
    if (!raw) return jsonify({ urls: [], headers: [] });
    const at = raw.indexOf('@@LP:');
    if (at >= 0) {
        const tok = raw.slice(at + 5);
        const parts = tok.split(':');
        const slug = parts[0];
        const n = parts[1];
        const urls = [MIYEXAI_HLS + '/p?s=' + encodeURIComponent(slug) + '&n=' + encodeURIComponent(n)];
        try {
            const fresh = await getJson(HOST + '/p?s=' + encodeURIComponent(slug));
            if (fresh && fresh.ok && fresh.u && fresh.u[n]) urls.push(absUrl(String(fresh.u[n]).replace(/\\u0026/g, '&')));
        } catch (e) {}
        return jsonify({ urls, headers: [{ 'User-Agent': UA }] });
    }
    if (/\.m3u8(\?|#|$)/i.test(raw)) {
        return jsonify({ urls: [raw], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/zh-CN/' }] });
    }
    return jsonify({ urls: [raw], headers: [{ 'User-Agent': UA }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const html = await getHtml(HOST + '/zh-CN/search/?q=' + encodeURIComponent(wd));
    const list = paginate(parseList(html), page);
    return jsonify({ list });
}
