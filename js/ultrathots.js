// UltraThots - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/ultra.js
const KEY = "py_ultrathots";
const NAME = "UltraThots";
const HOST = "https://ultrathots.com/";
const VIDEOPATH = "videos/";
const CATEGORIES = [{ type_id: "australian/", type_name: "Australian" }, { type_id: "british/", type_name: "British" }, { type_id: "canadian/", type_name: "Canadian" }, { type_id: "italian/", type_name: "Italian" }, { type_id: "onlyfans/", type_name: "Onlyfans" }, { type_id: "amateur/", type_name: "Amateur" }, { type_id: "big-tits/", type_name: "Big Tits" }, { type_id: "babe/", type_name: "Babe" }, { type_id: "big-ass/", type_name: "Big Ass" }, { type_id: "masturbation/", type_name: "Masturbation" }, { type_id: "blowjob/", type_name: "Blowjob" }, { type_id: "sextapes/", type_name: "Sextapes" }, { type_id: "solo-female/", type_name: "Solo Female" }, { type_id: "blonde/", type_name: "Blonde" }, { type_id: "hardcore/", type_name: "Hardcore" }, { type_id: "toys/", type_name: "Toys" }, { type_id: "pov/", type_name: "Pov" }, { type_id: "cumshot/", type_name: "Cumshot" }, { type_id: "anal/", type_name: "Anal" }, { type_id: "big-dick/", type_name: "Big Dick" }, { type_id: "tattooed-women/", type_name: "Tattooed Women" }, { type_id: "brunette/", type_name: "Brunette" }, { type_id: "milf/", type_name: "Milf" }, { type_id: "striptease/", type_name: "Striptease" }, { type_id: "lesbian/", type_name: "Lesbian" }, { type_id: "asian/", type_name: "Asian" }, { type_id: "threesome/", type_name: "Threesome" }, { type_id: "public/", type_name: "Public" }, { type_id: "bbc/", type_name: "Bbc" }, { type_id: "ppv/", type_name: "Ppv" }, { type_id: "creampie/", type_name: "Creampie" }, { type_id: "joi/", type_name: "Joi" }, { type_id: "german/", type_name: "German" }];

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  function H(referer) {
    return { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': referer || HOST };
  }
  async function getText(url, referer) {
    try {
      const res = await $fetch.get(url, { headers: H(referer), timeout: 20000, maxRedirects: 10 });
      const data = (res && res.data !== undefined) ? res.data : res;
      return String(data || '');
    } catch { return ''; }
  }
  function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  }
  function parseList(html) {
    const items = [];
    const seen = new Set();
    const escHost = HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('<a[^>]*href="(' + escHost + VIDEOPATH + '\\d+/[^"]+)"[^>]*title="([^"]*)"', 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = m[1];
      if (seen.has(url)) continue;
      const seg = html.slice(m.index, m.index + 3000);
      const im = seg.match(/data-original="(https?:[^"]+)"/i) || seg.match(/<img[^>]*src="(https?:[^"]+)"/i);
      const title = stripTags(m[2]);
      if (!title || title.length < 2) continue;
      seen.add(url);
      items.push({ vod_id: url, vod_name: title, vod_pic: im ? im[1] : '' });
      if (items.length >= 24) break;
    }
    return items;
  }
  async function init() { return {}; }
  async function home() {
    const html = await getText(HOST, HOST);
    return { class: CATEGORIES, filters: {}, list: parseList(html) };
  }
  async function category(reqIn) {
    const body = reqIn?.body || {};
    const tid = String(body.id || CATEGORIES[0].type_id);
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    const base = HOST + 'categories/' + tid.replace(/^\/+/, '').replace(/\/+$/, '');
    const url = page === 1 ? (base + '/') : (base + '/' + page + '/');
    const html = await getText(url, HOST);
    const list = parseList(html);
    return { page, pagecount: 9999, limit: 90, total: list.length ? 999999 : 0, list };
  }
  async function detail(reqIn) {
    const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
    const list = [];
    for (const raw of ids.filter(Boolean)) {
      const url = /^https?:\/\//i.test(raw) ? raw : HOST + String(raw).replace(/^\/+/, '');
      const html = await getText(url, HOST);
      const tm = html.match(/<title>([\s\S]{0,300}?)<\/title>/i);
      const vm = html.match(/video_url['"]?\s*[:=]\s*['"]([^'"]+)/i) || html.match(/https?:\/\/[^\s"'<>]+\/get_file\/[^\s"'<>]+\.mp4[^\s"'<>]*/i);
      const pm = html.match(/preview_url['"]?\s*[:=]\s*['"]([^'"]+)/i);
      const videoUrl = vm ? vm[1].replace(/&amp;/g, '&') : '';
      // 2026-10-29：原只取标注 480p 的 video_url，故观感低。实测另有 video_alt_url
      // （标注 720p、真实文件更大）；video_alt_url2 实测恒为 ?login 登录页，绝不采用；
      // 也不按文件名拼 _1080p（已证 404）。无 alt 的视频保持单条。
      const am = html.match(/video_alt_url['"]?\s*[:=]\s*['"]([^'"]+)/i);
      let altUrl = am ? am[1].replace(/&amp;/g, '&') : '';
      if (!altUrl || !/get_file/i.test(altUrl) || altUrl.includes('?login')) altUrl = '';
      const t1 = (html.match(/video_url_text['"]?\s*[:=]\s*['"]([^'"]+)/i) || [])[1] || '';
      const t2 = (html.match(/video_alt_url_text['"]?\s*[:=]\s*['"]([^'"]+)/i) || [])[1] || '';
      const lab = (t) => {
        const s = String(t || '').replace(/[^0-9pP]/g, '');
        if (/^\d+p$/i.test(s)) return s.toLowerCase();
        return '';
      };
      const l1 = lab(t1) || '480p';
      const l2 = lab(t2) || (altUrl.match(/_(\d+)p\.mp4/i) ? altUrl.match(/_(\d+)p\.mp4/i)[1] + 'p' : '720p');
      let playUrl = '';
      if (videoUrl && altUrl) {
        // 高清档放前面，默认先播高清
        const lines = [];
        const put = (h, u) => { const n = parseInt(h, 10) || 0; lines.push({ h: n, s: h + '$' + u }); };
        put(l2, altUrl); put(l1, videoUrl);
        lines.sort((a, b) => b.h - a.h);
        playUrl = lines.map(x => x.s).join('#');
      } else if (videoUrl) playUrl = '播放$' + videoUrl;
      else playUrl = '未找到视频源$' + raw;
      list.push({
        vod_id: raw,
        vod_name: tm ? stripTags(tm[1]) : NAME,
        vod_pic: pm ? pm[1] : '',
        vod_play_from: NAME,
        vod_play_url: playUrl,
      });
    }
    return { list };
  }
  async function play(reqIn) {
    let id = String(reqIn?.body?.id || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();
    const isVideo = /\.(m3u8|mp4)/i.test(id);
    return { parse: isVideo ? 0 : 1, url: id, header: H(HOST) };
  }
  async function searchCat(reqIn) {
    const body = reqIn?.body || {};
    const wd = String(body.wd || '').trim();
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    if (!wd) return { page, pagecount: page, limit: 90, total: 0, list: [] };
    let url = HOST + 'search/' + encodeURIComponent(wd) + '/';
    if (page > 1) url += page + '/';
    const html = await getText(url, HOST);
    const list = parseList(html);
    return { page, pagecount: 9999, limit: 90, total: list.length, list };
  }

// 猫版字幕芯已移除（字幕改由 XPTV 版 subSearch 在 getPlayinfo 内按片名查）；旧调用留空壳，避免残留调用报错。
async function subSearchAll() { return []; }
function subWarm() {}
function subRegister() {}
function subAttach(r) { return r; }
function subCacheName() {}
function subSlugTitle() { return ''; }
const subNameCache = new Map();
const subResultCache = new Map();

// ---------------- XPTV 适配层 ----------------
// 猫源 home/category/detail/play/search 原样保留；以下 5 个 XPTV 入口做薄适配。
async function getConfig() {
    const h = await home();
    const tabs = (h && Array.isArray(h.class) ? h.class : []).map((c) => ({ name: String(c.type_name || ''), ext: { id: String(c.type_id || '') } }));
    return jsonify({ ver: 1, title: 'UltraThots', site: 'https://ultrathots.com/', tabs: tabs.length ? tabs : [{ name: '全部', ext: { id: '' } }] });
}

async function getCards(ext) {
    ext = argsify(ext);
    const r = await category({ body: { id: ext.id || '', page: ext.page || 1 } });
    const list = (r && Array.isArray(r.list) ? r.list : []).map((c) => ({
        vod_id: String(c.vod_id || ''),
        vod_name: c.vod_name || '',
        vod_pic: c.vod_pic || '',
        vod_remarks: c.vod_remarks || '',
        ext: { id: String(c.vod_id || ''), name: c.vod_name || '' },
    }));
    return jsonify({ list });
}

function parseTracks(playUrl, vodName) {
    const tracks = [];
    if (!playUrl) return tracks;
    const groups = String(playUrl).split('$$$');
    for (const g of groups) {
        for (const ep of g.split('#')) {
            if (!ep) continue;
            const idx = ep.indexOf('$');
            const nm = idx >= 0 ? ep.slice(0, idx) : '播放';
            const u = idx >= 0 ? ep.slice(idx + 1) : ep;
            if (u) tracks.push({ name: nm || '播放', pan: '', ext: { url: u, name: vodName || '' } });
        }
    }
    return tracks;
}

async function getTracks(ext) {
    ext = argsify(ext);
    const r = await detail({ body: { id: ext.id } });
    const item = (r && Array.isArray(r.list) && r.list[0]) || null;
    const tracks = item ? parseTracks(item.vod_play_url, item.vod_name) : [];
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    const r = await play({ body: { id: url } });
    const result = { urls: [r.url || url], headers: [r.header || {}] };

    return jsonify(result);
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    if (!wd) return jsonify({ list: [] });
    const r = await searchCat({ body: { wd, page: ext.page || 1 } });
    const list = (r && Array.isArray(r.list) ? r.list : []).map((c) => ({
        vod_id: String(c.vod_id || ''),
        vod_name: c.vod_name || '',
        vod_pic: c.vod_pic || '',
        vod_remarks: c.vod_remarks || '',
        ext: { id: String(c.vod_id || ''), name: c.vod_name || '' },
    }));
    return jsonify({ list });
}
