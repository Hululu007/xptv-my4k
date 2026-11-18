// ---- Buffer 兼容垫片（XPTV 沙箱无 Buffer；仅覆盖 from/toString 的 base64/utf8/latin1/hex 用法） ----
if (typeof Buffer === 'undefined') {
  var Buffer = (function () {
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function utf8Encode(s) {
      var out = [];
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
        else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
          var c2 = s.charCodeAt(i + 1);
          if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
            var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
            out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
            i++;
          } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
        } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
      return out;
    }
    function utf8Decode(bytes) {
      var out = '';
      for (var i = 0; i < bytes.length;) {
        var b = bytes[i];
        if (b < 0x80) { out += String.fromCharCode(b); i++; }
        else if ((b & 0xE0) === 0xC0) { out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F)); i += 2; }
        else if ((b & 0xF0) === 0xE0) { out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F)); i += 3; }
        else if ((b & 0xF8) === 0xF0) {
          var cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
          cp -= 0x10000;
          out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
          i += 4;
        } else { out += String.fromCharCode(b); i++; }
      }
      return out;
    }
    function b64Encode(bytes) {
      var out = '';
      for (var i = 0; i < bytes.length; i += 3) {
        var b1 = bytes[i], b2 = i + 1 < bytes.length ? bytes[i + 1] : 0, b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        out += B64[b1 >> 2] + B64[((b1 & 3) << 4) | (b2 >> 4)] + (i + 1 < bytes.length ? B64[((b2 & 15) << 2) | (b3 >> 6)] : '=') + (i + 2 < bytes.length ? B64[b3 & 63] : '=');
      }
      return out;
    }
    function b64Decode(s) {
      s = String(s || '').replace(/[^A-Za-z0-9+/=]/g, '');
      var out = [];
      for (var i = 0; i < s.length; i += 4) {
        var e1 = B64.indexOf(s.charAt(i)), e2 = B64.indexOf(s.charAt(i + 1)), e3 = B64.indexOf(s.charAt(i + 2)), e4 = B64.indexOf(s.charAt(i + 3));
        if (e1 < 0 || e2 < 0) break;
        out.push((e1 << 2) | (e2 >> 4));
        if (e3 >= 0) out.push(((e2 & 15) << 4) | (e3 >> 2));
        if (e4 >= 0) out.push(((e3 & 3) << 6) | e4);
      }
      return out;
    }
    function wrap(bytes) {
      var arr = bytes.slice();
      arr.toString = function (enc) {
        enc = String(enc || 'utf8').toLowerCase();
        if (enc === 'base64') return b64Encode(arr);
        if (enc === 'latin1' || enc === 'binary') { var s = ''; for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]); return s; }
        if (enc === 'hex') { var h = ''; for (var j = 0; j < arr.length; j++) h += ('0' + arr[j].toString(16)).slice(-2); return h; }
        return utf8Decode(arr);
      };
      return arr;
    }
    function from(input, enc) {
      if (typeof input === 'string') {
        enc = String(enc || 'utf8').toLowerCase();
        if (enc === 'base64') return wrap(b64Decode(input));
        if (enc === 'latin1' || enc === 'binary') { var b = []; for (var i = 0; i < input.length; i++) b.push(input.charCodeAt(i) & 0xFF); return wrap(b); }
        if (enc === 'hex') { var hb = []; for (var k = 0; k + 1 < input.length; k += 2) hb.push(parseInt(input.substr(k, 2), 16)); return wrap(hb); }
        return wrap(utf8Encode(input));
      }
      if (input && typeof input.length === 'number') {
        var ab = [];
        for (var m = 0; m < input.length; m++) ab.push(input[m] & 0xFF);
        return wrap(ab);
      }
      return wrap([]);
    }
    return { from: from, isBuffer: function (x) { return Array.isArray(x) && typeof x.toString === 'function'; } };
  })();
}

// JavFeed（javfeed.site）- mira-cat 猫源蜘蛛
// 站点：Next.js 站，VM 直连可达。列表页含 JSON-LD ItemList（VideoObject：
// url/name/thumbnailUrl），详情页 og:video 给主清单，4 档清晰度。
// 关键：分清单的分片是 TS 内容却用 videoN.jpeg 后缀下发（同 MissAV 先例，
// 播放器建不起时间轴、不能拖进度）——故每条清晰度线路都走本地
// /proxy/m3u8 代理（同 ero 蜘蛛先例）：代理实时拉清单，把分片行改写
// 成绝对地址 + ?x=.ts 后缀，分片仍直连源站、不经代理；代理拉取失败
// 时 302 回源清单，不比旧行为更差。
// 清晰度诚实说明：只出站方主清单里实际有的档位（360p/480p/720p/1080p），
// 绝不编造。分类：只收录实测 200 且有内容的原生分类/标签（见 CATS 注释）。

const KEY = 'py_javfeed';
const NAME = 'JavFeed';
const HOST = 'https://javfeed.site';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return m; } })
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCharCode(parseInt(d, 10)); } catch (e) { return m; } })
    .replace(/\s+/g, ' ').trim();
}
function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return HOST + (u.startsWith('/') ? u : '/' + u);
}

// ---------- HTTP（只走框架 req） ----------
async function reqGet(url, headers, timeoutMs) {
  try {
    const r = await $fetch.get(url, { headers: headers || {}, timeout: timeoutMs || 15000 });
    const text = typeof r.data === 'string' ? r.data : (r.data === null || r.data === undefined ? '' : JSON.stringify(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}

// ---------- 分类 ----------
// type_id 约定：latest=最新（/），c:<slug>=原生分类（/category/<slug>），
// t:<slug>=标签（/tag/<slug>）。全部 2026-10-31 VM 实测 200 且有内容：
// latest 24 条；uncensored-leak 24 条；big-breasts 24 条；big-ass 24 条
// （big-butt 只有 7 条，故大屁股改用 big-ass）；mature-woman 24 条；
// beautiful-breasts 24 条；4k 24 条；wife 24 条；hd 24 条；creampie 24 条；
// slut 24 条；vr 24 条；individual 24 条；squirting 24 条。
// 删掉的候选：tag/leak 只有 1 条，不列入。
// 名称注意：mature-woman 标 熟女，不标人妻；人妻另有 wife 分类支撑。
const CATS = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 't:uncensored-leak', type_name: '无码流出' },
  { type_id: 'c:big-breasts', type_name: '巨乳' },
  { type_id: 't:big-ass', type_name: '大屁股' },
  { type_id: 'c:mature-woman', type_name: '熟女' },
  { type_id: 'c:beautiful-breasts', type_name: '美乳' },
  { type_id: 't:4k', type_name: '4K' },
  { type_id: 'c:wife', type_name: '人妻' },
  { type_id: 'c:hd', type_name: '高清' },
  { type_id: 'c:creampie', type_name: '中出' },
  { type_id: 'c:slut', type_name: '淫女' },
  { type_id: 'c:vr', type_name: 'VR' },
  { type_id: 'c:individual', type_name: '个人拍摄' },
  { type_id: 'c:squirting', type_name: '潮吹' },
];

// ---------- 列表解析 ----------
// 优先 JSON-LD（VideoObject：name/thumbnailUrl/contentUrl），兜底用
// /video/ 链接 + fourhoi 封面按顺序对齐。
function parseList(html) {
  const out = [];
  if (!html) return out;
  const re = /"@type":"VideoObject","name":"((?:\\.|[^"\\])*?)","description":"(?:\\.|[^"\\])*?","thumbnailUrl":"([^"]+)","uploadDate":"[^"]*","contentUrl":"(https:\/\/javfeed\.site\/video\/([a-z0-9\-]+))"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let name = m[1] || '';
    try { name = JSON.parse('"' + name + '"'); } catch (e) { /* 保持原样 */ }
    out.push({ vod_id: m[4], vod_name: clean(name), vod_pic: m[2], vod_remarks: '' });
    if (out.length >= 100) break;
  }
  if (out.length) return out;
  const slugs = [];
  const seen = new Set();
  for (const sm of html.matchAll(/href="\/video\/([a-z0-9\-]+)"/g)) {
    if (!seen.has(sm[1])) { seen.add(sm[1]); slugs.push(sm[1]); }
  }
  const pics = [...html.matchAll(/<img[^>]+src="(https:\/\/fourhoi\.com\/[^"]+)"/g)].map((x) => x[1]);
  slugs.forEach((slug, i) => {
    out.push({ vod_id: slug, vod_name: slug.toUpperCase(), vod_pic: pics[i] || '', vod_remarks: '' });
  });
  return out;
}

function listUrlFor(tid, page) {
  const p = page > 1 ? '/page/' + page : '';
  if (tid === 'latest') return HOST + '/' + (page > 1 ? 'page/' + page : '');
  if (tid.indexOf('c:') === 0) return HOST + '/category/' + tid.slice(2) + p;
  if (tid.indexOf('t:') === 0) return HOST + '/tag/' + tid.slice(2) + p;
  return HOST + '/' + (page > 1 ? 'page/' + page : '');
}

async function listPage(url) {
  const r = await reqGet(url, { 'User-Agent': UA });
  if (r.status !== 200 || !r.body) return { list: [], more: false };
  const list = parseList(r.body);
  return { list, more: list.length >= PAGE_SIZE };
}

// ---------- 字幕聚合（与猫源 27 源同款芯一致；番号只从片名取） ----------
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。

// ---------- m3u8 本地代理（同 ero 蜘蛛先例） ----------
// detail 的播放地址为本地代理地址；代理实时拉清单并改写——媒体清单的分片行
// 改成源站绝对地址 + ?x=.ts 后缀（分片仍直连源站、不经代理）；主清单的
// variant 行改指回代理。代理拉取失败时 302 回源清单，不比旧行为更差。
function b64url(s) {
  try {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
// 构造本地代理地址（js2p://_WEB_ 为 App 动态地址 scheme，同 missav 先例）
function proxyUrl(reqIn, path, targetUrl, referer) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}
async function fetchPlaylistText(url, referer) {
  try {
    const r = await $fetch.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/' },
      timeout: 20000,
      });
    const text = typeof r.data === 'string' ? r.data : '';
    if (r.status >= 200 && r.status < 300 && text) return text;
  } catch (e) { /* 落空走 302 降级 */ }
  return '';
}
function rewriteM3u8(raw, playlistUrl, selfBase, referer) {
  const isMaster = raw.includes('#EXT-X-STREAM-INF');
  const lines = String(raw).split(/\r?\n/);
  const out = lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) {
      if (s.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (all, uri) => {
          try { return `URI="${new URL(uri, playlistUrl).toString()}"`; } catch (e) { return all; }
        });
      }
      return line;
    }
    let abs;
    try { abs = new URL(s, playlistUrl).toString(); } catch (e) { return line; }
    if (isMaster) {
      return `${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}`;
    }
    return abs + (abs.includes('?') ? '&' : '?') + 'x=.ts';
  });
  return out.join('\n');
}
// GET /proxy/m3u8?u={b64url 清单地址}&r={b64url referer}
async function m3u8Proxy(request, reply) {
  const q = request?.query || {};
  if (!q.u) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST + '/';
  try {
    target = unb64url(q.u);
    if (q.r) referer = unb64url(q.r) || referer;
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  const raw = await fetchPlaylistText(target, referer);
  if (!raw || !raw.includes('#EXTM3U')) { reply.redirect(target); return; }
  const host = request.headers && request.headers.host;
  const selfBase = host
    ? `http://${host}/spider/${KEY}/3`
    : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
  reply.header('Content-Type', 'application/vnd.apple.mpegurl');
  reply.header('Cache-Control', 'no-cache');
  reply.send(rewriteM3u8(raw, target, selfBase, referer));
}

// ---------- 接口 ----------
async function home() {
  try {
    const r = await listPage(HOST + '/');
    return { class: CATS, list: r.list };
  } catch (e) {
    return { class: CATS, list: [] };
  }
}
async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || 'latest');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let r = { list: [], more: false };
  try {
    r = await listPage(listUrlFor(tid, page));
  } catch (e) { r = { list: [], more: false }; }
  return { page, pagecount: r.more ? page + 1 : page, list: r.list };
}
async function catSearch(reqIn) {
  const body = reqIn?.body || {};
  const kw = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  // 搜索翻页未坐实（/?s=<kw>&page=N 实测回 0 条），故只回 p1
  if (!kw || page > 1) return { page, pagecount: page, list: [] };
  try {
    const r = await listPage(HOST + '/?s=' + encodeURIComponent(kw));
    return { page: 1, pagecount: 1, list: r.list };
  } catch (e) {
    return { page: 1, pagecount: 1, list: [] };
  }
}
async function detail(reqIn) {
  const body = reqIn?.body || {};
  let slug = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  slug = slug.replace(/^https?:\/\/javfeed\.site\/video\//i, '').replace(/^\/video\//i, '').replace(/\/$/, '');
  if (!slug || /^https?:\/\//i.test(slug)) return { list: [] };
  const durl = HOST + '/video/' + slug;
  const r = await reqGet(durl, { 'User-Agent': UA });
  if (r.status !== 200 || !r.body) return { list: [] };
  const html = r.body;
  const title = clean((html.match(/property="og:title" content="([^"]*)"/) || [])[1] || (html.match(/<title>([^<]*)<\/title>/) || [])[1] || slug);
  const pic = absUrl((html.match(/property="og:image" content="([^"]*)"/) || [])[1] || '');
  const ogVideo = (html.match(/property="og:video" content="([^"]*)"/) || [])[1] || '';
  if (!ogVideo) return { list: [] };
  const masterUrl = absUrl(ogVideo);
  // 取主清单，解析各档（只出站方实际有的档位）
  const mr = await reqGet(masterUrl, { 'User-Agent': UA, Referer: durl });
  const lines = [];
  if (mr.status === 200 && mr.body && mr.body.includes('#EXTM3U')) {
    const mlines = String(mr.body).split(/\r?\n/);
    const quals = [];
    for (let i = 0; i < mlines.length; i++) {
      const s = mlines[i].trim();
      const res = s.match(/RESOLUTION=\d+x(\d+)/);
      if (s.startsWith('#EXT-X-STREAM-INF') && res) {
        const uri = (mlines[i + 1] || '').trim();
        if (uri && !uri.startsWith('#')) {
          let abs;
          try { abs = new URL(uri, masterUrl).toString(); } catch (e) { abs = ''; }
          if (abs) quals.push({ h: parseInt(res[1], 10), url: abs });
        }
      }
    }
    quals.sort((a, b) => b.h - a.h);
    for (const q of quals) {
      // XPTV 无本地蜘蛛服务：js2p:// 代理地址在 XPTV 里是死链，直接给变体直链
      // （分片为 .jpeg，与 Ero/HornyJav 同类，播放器能否建时间轴以真机为准）
      lines.push({ name: q.h + 'p', url: q.url });
    }
  }
  if (!lines.length) {
    // 主清单取不到时退回自适应线（直出主清单，XPTV 无本地代理）
    lines.push({ name: '自适应', url: masterUrl });
  }
  // 字幕预热：按每条线路登记片名；后台逐条串行找字幕（不 await，
  // 不一拥而上——并行预热曾挤挂 SubtitleCat）
      return {
    list: [{
      vod_id: slug,
      vod_name: title,
      vod_pic: pic,
      vod_remarks: '',
      vod_play_from: NAME,
      vod_play_url: lines.map((l) => l.name + '$' + l.url).join('#'),
    }],
  };
}
async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const idx = id.indexOf('$');
  let url = idx >= 0 ? id.slice(idx + 1) : id;
  url = t(url);
  if (!url) return { parse: 0, url: '' };
  // 字幕：detail 预热过则命中缓存/在途，一般不增加点播延迟；无命中不带 subs 键
    const result = { parse: 0, url, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
    return result;
}

// ---------------- 字幕聚合试点 (XPTV 版, 2026-10-23 新芯) ----------------
// 本试点只加在 avdb: 验证 XPTV 播放器是否渲染 getPlayinfo 返回的
// subs 字幕位。2026-10-23 按用户反馈换芯 (旧芯多键合并+只排序不
// 过滤, 片名键召回别片字幕灌满前 10、SubtitleCat 被挤出): 改照
// 用户自有迅雷看看组件 (xunlei.subtitle) 原法 ——
//   (a) 搜索键按序逐个查、首个有结果的键即停;
//   (b) 严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可) 或片
//       名全文, 不含全扔; 有番号时过滤到空即空 (不回退), 无番
//       号时回退名单也要过片名词元闸门 (单字模糊召回过不了);
//   (c) 打分照组件: cid_match 100000、含番号 +25000、oracle 自
//       带 Score/FingerprintScore、下载量、时长/大小。
// 槽位 (用户钦定优先级, 同走 oracle 接口):
//   迅雷 (档位 0): 键序 [番号, 紧凑番号]
//   迅雷看看 (档位 1): 组件完整键序 [番号, 紧凑番号, 番号+标题,
//     紧凑番号+标题, 全标题]
//   SubtitleCat (档位 2): 搜索页 -> 字幕页 -> 按语言直链, 同样
//     过严过滤。
// 合并: URL 去重 (重复条目标高档位来源) -> 档位 -> 语言 (简中>
// 繁中>双语>英文>日文>其他) -> 分数; 全局上限 10、单槽软上限 8
// (保 SubtitleCat 有位置); 只收 .srt/.vtt/.ass/.ssa 直链, 命中
// 以 [{name,url,format}] 挂到 getPlayinfo 返回对象。
// XPTV 适配: HTTP 全走 $fetch.get (两源皆 GET, 不依赖未证实的
// $fetch.post); 不用 setTimeout, 时长由单请求超时兜底 (oracle
// 5s / SubtitleCat 搜索 5s + 字幕页 4s, 三槽并行); 不依赖跨调
// 用全局状态 — 片名由 track.ext 从 getTracks 带入, 搜索在
// getPlayinfo 内一次完成, 失败全静默; 无命中时返回不带 subs
// 键, 与未接入前逐字一致。SubHD (下载被站方门控 403) 与射手
// assrt (源站 522 不可达) 不接入, 与猫版口径一致。
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


// ---------------- XPTV 适配层（薄适配：复用上方猫源 home/category/detail/play/search） ----------------
function __s(v) { return String(v == null ? '' : v).trim(); }

async function getConfig() {
    const tabs = (CATS.map(c => ({ id: c.type_id, name: c.type_name }))).map((c) => ({ name: c.name, ext: { id: c.id } }));
    return jsonify({ ver: 1, title: 'JavFeed', site: HOST, tabs });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = __s(ext.id || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let res;
    try { res = await category({ body: { id, page } }); } catch (e) { res = null; }
    const list = (res && Array.isArray(res.list) ? res.list : []).map((v) => ({
        vod_id: v.vod_id, vod_name: v.vod_name, vod_pic: v.vod_pic, vod_remarks: v.vod_remarks,
        ext: { id: v.vod_id, name: v.vod_name },
    }));
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = __s(ext.id || '');
    const tracks = [];
    let d = null;
    try { d = await detail({ body: { id } }); } catch (e) { d = null; }
    const vod0 = (d && Array.isArray(d.list) && d.list[0]) || null;
    const playUrl = __s(vod0 && vod0.vod_play_url);
    if (playUrl) {
    const segs = playUrl.split('$$$');
    for (const seg of segs) {
        const eps = String(seg || '').split('#').filter(Boolean);
        for (const ep of eps) {
            const di = ep.indexOf('$');
            const nm = di > 0 ? ep.slice(0, di) : '正片';
            tracks.push({ name: nm, pan: '', ext: { url: ep, id: ep, name: nm } });
        }
    }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = __s(ext.url || ext.id || '');
    const name = __s(ext.name || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    let r = null;
    try { r = await play({ body: { id } }); } catch (e) { r = null; }
    const url = __s(r && r.url);
    if (!url) return jsonify({ urls: [], headers: [] });
    const result = { urls: [url], headers: [r.header || {}] };
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) { /* 无字幕不影响播放 */ }
    }
    return jsonify(result);
}

async function search(ext) {
    ext = argsify(ext);
    const wd = __s(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let res = null;
    try { res = await catSearch({ body: { wd, page } }); } catch (e) { res = null; }
    const list = (res && Array.isArray(res.list) ? res.list : []).map((v) => ({
        vod_id: v.vod_id, vod_name: v.vod_name, vod_pic: v.vod_pic, vod_remarks: v.vod_remarks,
        ext: { id: v.vod_id, name: v.vod_name },
    }));
    return jsonify({ list });
}
