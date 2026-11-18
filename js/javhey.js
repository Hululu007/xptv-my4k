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


// JavHey https://javhey.com/ —— 印尼语 JAV 字幕站（标题/别名均含番号，如 JUL-788、SONE-054）
// 列表：首页卡片 <a href="/video/<id>/<slug>"><img src alt></a>，封面为 javmod.com/javorb.com 直链，无加密
// 分类：/category/<id>/<slug>/，翻页 /category/<id>/<slug>/page=N；首页翻页 /videos/paling-baru/page=N
// 详情：隐藏 input#links 为 base64 编码的 embed 列表（",,," 分隔，12 个 Server）；Server 1 为 javsubindo（页内 var src 直出 m3u8 相对路径）
// 播放：vidhide 系 embed（含 embedwish/vidhidepre/morencius/hgplaycdn）为 Dean Edwards packer 混淆，解包后 links.hls3（.txt 主清单，VM 实测 200 + #EXTM3U + 分片清单可取）
//       > links.hls2（.m3u8 主清单，VM 侧因出口 IP 被 CDN 回 403，设备侧未证实）> links.hls4（embed  host 相对路径 master.m3u8，同上 403 未证实）；
//       单码率（实测 embedwish 852x480 一档；vidhide 档位标签 720p），不编假多档；各 Server 画质可能不同，故按 Server 分开展示
// 搜索：站内搜索表单 action="/search"，但实测 /search?q=<任意词>（含无意义词）均原样返回首页 72 项，未做过滤——故 search 直接返回空列表，绝不假装有结果
// 字幕：与模板同一套 Layer A（见下 sub core，逐字复制，仅 subSlugTitle 保持原样；番号取自标题/slug，JUL-788 类均可命中），按条目接（仅含番号的条目接芯）
const HOST = 'https://javhey.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// 分类：全部取自站内 /categories 实测（id/slug/名均原文）；中文名为用户点名近义项的诚实映射，见 NOTES.md
// 无码流出/无码破解/减码类：Uncensored(76)/Decensored(31)/Sensor Dihapus(222，印尼语“去码”)为站内真实存在的去码类；
// “减码/减少马赛克”无完全对应分类，不硬凑（Digital mosaic 只是马赛克类型，不是减码，故只作普通分类列出，不冒充减码）
const CATS = [
  { v: '76/uncensored', n: '无码流出' },
  { v: '31/decensored', n: '无码破解' },
  { v: '222/sensor-dihapus', n: '去码' },
  { v: '1/big-tits', n: '巨乳' },
  { v: '219/toket-gede', n: '巨乳 (印尼)' },
  { v: '15/super-milk', n: '爆乳' },
  { v: '50/beautiful-breasts', n: '美乳' },
  { v: '48/busty-fetish', n: '巨乳癖' },
  { v: '20/big-butt', n: '大屁股' },
  { v: '231/pantat-besar', n: '大屁股 (印尼)' },
  { v: '41/ass-fetish', n: '臀部癖' },
  { v: '2/censored', n: '有码' },
  { v: '4/digital-mosaic', n: '数码马赛克' },
  { v: '3/creampie', n: '中出' },
  { v: '11/mature-woman', n: '熟女' },
  { v: '10/incest', n: '乱伦' },
  { v: '9/housewife', n: '人妻' },
  { v: '24/aunt', n: '阿姨' },
  { v: '59/female-teacher', n: '女教师' },
  { v: '42/schoolgirl', n: '女学生' },
  { v: '33/blowjob', n: '口交' },
  { v: '14/slut', n: '淫荡' },
  { v: '127/cosplay', n: 'Cosplay' },
  { v: '152/lesbian', n: '女同' },
  { v: '67/bdsm', n: 'BDSM' },
  { v: '5/high-vision', n: '高清' },
];

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
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
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
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
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  try {
    const r = await $fetch.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 字幕芯取数原语（与模板一致）：统一回 {status, body}
async function reqRaw(url, headers, timeoutMs) {
  try {
    const r = await $fetch.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
    const body = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
    return { status: r.status || 0, body, headers: r.headers || {}, err: null };
  } catch (e) {
    return { status: 0, body: '', headers: {}, err: e };
  }
}

// 首页/分类卡片：<a href="/video/<id>/<slug>"><img src alt></a>；alt 含 "JAV Subtitle Indonesia - <番号> <印尼语标题>"
function parseCards(html, host) {
  const byUrl = new Map();
  const re = /<a[^>]+href=["'](\/video\/\d+\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const vUrl = m[1].trim();
    const inner = m[2];
    let it = byUrl.get(vUrl);
    if (!it) { it = { vod_id: vUrl, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(vUrl, it); }
    const imgM = inner.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (imgM && !it.vod_pic) it.vod_pic = normUrl(absUrl(imgM[1].trim(), host));
    const altM = inner.match(/alt=["']([^"']+)["']/i);
    const txt = cleanLabel(altM ? altM[1] : inner);
    if (txt && !it.vod_name) it.vod_name = txt.replace(/^JAV Subtitle Indonesia\s*-\s*/i, '');
    // alt 常被标题内的双引号截断成 bare 番号（如 "ATID-710"）：此时用 URL slug 补全标题
    if (!it.vod_name || /^[A-Z0-9]{2,10}-\d{2,8}$/i.test(it.vod_name)) {
      const slug = (vUrl.split('/')[3] || '').replace(/^[a-z0-9]{2,10}-\d{2,8}-/i, '').replace(/-/g, ' ').trim();
      if (slug) it.vod_name = (it.vod_name ? it.vod_name + ' ' : '') + slug;
    }
    if (!it.vod_name) it.vod_name = '精彩视频';
  }
  return [...byUrl.values()].filter((it) => it.vod_pic || it.vod_name);
}

// ---- embed 解析 ----
// vidhide 系 packer 解包：eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(...)}('...',a,c,'...'.split('|')))
function unpackVidhide(html) {
  const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?return p\}\('([\s\S]*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/);
  if (!m) return '';
  const p = m[1];
  const a = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const k = m[4].split('|');
  if (!a || !c || !k.length) return '';
  const out = p.replace(/\b[0-9a-zA-Z]+\b/g, (w) => {
    const n = parseInt(w, a);
    if (isNaN(n) || n >= c || !k[n]) return w;
    return k[n];
  });
  // 解包文本里引号常带反斜杠转义（qualityLabels\':{\"616\":\"720p\"}），先还原再提取
  return out.replace(/\\(['"])/g, '$1');
}

function embedHostLabel(embedUrl) {
  try {
    const h = new URL(embedUrl).hostname.replace(/^www\./, '');
    const map = { 'javsubindo.world': 'JavSubIndo', 'embedwish.com': 'EmbedWish', 'vidhidepre.com': 'VidHide', 'morencius.com': 'Morencius', 'hgplaycdn.com': 'HgPlay', 'dood.li': 'Dood', 'dropload.io': 'Dropload', 'mixdrop.to': 'MixDrop', 'bestx.stream': 'BestX', 'd000d.com': 'D000D' };
    return map[h] || h;
  } catch (e) { return 'Server'; }
}

// 解析单个 embed 页，返回直链候选 [{url, label}]（label 仅当解包给出 qualityLabels 时才有，绝不编造）
async function resolveEmbed(embedUrl, referer) {
  const out = [];
  const push = (url, label) => {
    url = normUrl(String(url || '').trim());
    if (!url || !/^https?:\/\//.test(url)) return;
    if (!out.some((o) => o.url === url)) out.push({ url, label: label || '' });
  };
  const r = await reqRaw(embedUrl, { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }, 12000);
  if (r.status !== 200 || !r.body) return out;
  const html = r.body;
  const base = embedUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1');
  // JavSubIndo：页内 var src = "/s/<ts>/<hash>/<id>/index.m3u8"
  const srcM = html.match(/var\s+src\s*=\s*"([^"]*index\.m3u8[^"]*)"/);
  if (srcM) push(absUrl(srcM[1].replace(/\\/g, ''), base), '');
  // vidhide 系：解包后 links.hls3 > hls2 > hls4
  const unpacked = unpackVidhide(html);
  if (unpacked) {
    const qM = unpacked.match(/qualityLabels['"]?\s*:\s*\{[^}]*"([^"]+)"\s*:\s*"([^"]+)"/);
    const qLabel = qM ? qM[2] : '';
    const hls3 = unpacked.match(/"hls3"\s*:\s*"([^"]+)"/);
    const hls2 = unpacked.match(/"hls2"\s*:\s*"([^"]+)"/);
    const hls4 = unpacked.match(/"hls4"\s*:\s*"([^"]+)"/);
    if (hls3) push(hls3[1].replace(/\\/g, ''), qLabel);
    if (hls2) push(hls2[1].replace(/\\/g, ''), qLabel);
    if (hls4) push(absUrl(hls4[1].replace(/\\/g, ''), base), qLabel);
  }
  // 通用兜底：页内直出的 m3u8/mp4（dood 系为 Turnstile 验证墙，不在此硬解，见 NOTES）
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/g)) {
    if (!/\.js|\.css/.test(m[0])) push(m[0], '');
  }
  return out;
}

// 详情页隐藏 input#links：base64 -> embed URL 列表（",,," 分隔）
function extractEmbeds(html) {
  const m = String(html || '').match(/id=["']links["'][^>]*value=["']([^"']+)["']/);
  if (!m) return [];
  let dec = '';
  try {
    if (typeof Buffer !== 'undefined') dec = Buffer.from(m[1], 'base64').toString('utf-8');
    else dec = decodeURIComponent(escape(atob(m[1])));
  } catch (e) { return []; }
  return dec.split(',,,').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
}

// ---------------- 字幕聚合 (与 32 个带芯猫源同一套 Layer A，2026-11-02 定版) ----------------
// 槽位：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 键序逐个查、首中即停；命中后严过滤（须含番号或片名全文，无回退）；
// 合并序 = 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；
// 全局上限 10、单槽软上限 8；总预算 6s、失败全静默；无结果时 play 不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 除 1000），无时长不显示、不编造；
// 去重键 = 语言 + 小写名（去扩展名）+ 秒（无时长记 nodur），同名同时长才算重复。






















async function home() {
  const classes = [{ type_id: 'home', type_name: '最新视频' }, { type_id: 'most', type_name: '最多观看' }];
  for (const c of CATS) classes.push({ type_id: 'cat:' + c.v, type_name: c.n });
  let list = [];
  try { list = parseCards(await getHtml('/'), HOST).slice(0, 24); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (zoneId === 'home' || !zoneId) {
    const html = await getHtml(page === 1 ? '/' : ('/videos/paling-baru/page=' + page));
    const list = parseCards(html, HOST);
    const next = html.includes('/videos/paling-baru/page=' + (page + 1));
    return { page, pagecount: next ? page + 1 : page, list };
  }
  if (zoneId === 'most') {
    const html = await getHtml(page === 1 ? '/videos/paling-dilihat' : ('/videos/paling-dilihat/page=' + page));
    const list = parseCards(html, HOST);
    const next = html.includes('/videos/paling-dilihat/page=' + (page + 1));
    return { page, pagecount: next ? page + 1 : page, list };
  }
  const cat = zoneId.startsWith('cat:') ? zoneId.slice(4) : zoneId;
  // 注意：分类页 p1 必须无尾斜杠（带尾斜杠站方回 404）；翻页形如 /category/<id>/<slug>/page=N
  const path = page === 1 ? ('/category/' + cat) : ('/category/' + cat + '/page=' + page);
  const html = await getHtml(path);
  const list = parseCards(html, HOST);
  const next = html.includes('/category/' + cat + '/page=' + (page + 1));
  return { page, pagecount: next ? page + 1 : page, list };
}

async function catSearch() {
  // 站内搜索未做过滤（任意查询均返回首页），返回空列表，不伪造结果
  return { list: [] };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  if (!html) return { list: [] };
  const h1M = html.match(/<h1\s+class=["']product_title["']>([\s\S]*?)<\/h1>/i);
  let mainTitle = '精彩视频';
  if (h1M) mainTitle = cleanLabel(h1M[1]).replace(/^JAV Subtitle Indonesia\s*-\s*/i, '').trim() || '精彩视频';
    // 封面：详情区第一张非 loader 图（alt 即标题）
  let posterPic = '';
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const src = m[0].includes('AjaxLoader') ? '' : m[1].trim();
    if (src && /^https?:\/\//.test(src) || src.startsWith('//')) { posterPic = normUrl(absUrl(src, HOST)); break; }
  }
  const embeds = extractEmbeds(html);
  const options = [];
  if (embeds.length) {
    // 懒解析（2026-11-19 改）：不再在 detail 里预解直链。实测 vidhide 系
    // hls4（embed 宿主直出 master.m3u8，如 morencius）令牌极短命——刚解出
    // 时 200，40 秒后即 403；detail 预解的地址用户点开时早已过期，是本轮
    // “有轨无播”主因。hls3 的 .cfd 宿主已死（DNS 黑洞）、hls2（dramiyos）
    // 令牌虽长（36h）但 VM 侧 403（机房 IP 被挡）。一律只出 Server 名懒解析
    // 轨（@@EMBED:），点播时 play() 现取现解、现验现播，令牌新鲜才有效。
    // 验活只做“该 Server 是否存在 embed”（不取流）：embed 页取不到的
    // Server 不出轨（省掉点开才发现死嵌页）。
    for (const emb of embeds.slice(0, 6)) {
      options.push({ name: embedHostLabel(emb), id: durl + '@@EMBED:' + emb, rank: 0 });
    }
  }
  const playUrl = options.map((o) => o.name + '$' + o.id).join('#');
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: 'HD',
      vod_content: 'JavHey',
      vod_play_from: 'JavHey',
      vod_play_url: playUrl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let target = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
  if (!target) return { parse: 0, url: '' };
  // 懒解析：detail 未能预解时，play 时重取详情、逐个 Server 解直链
  if (target.startsWith('EMBED:')) {
    const emb0 = target.slice(6);
    let resolved = '';
    try {
      const html = await getHtml(durl.replace(HOST, ''));
      const embeds = extractEmbeds(html);
      const ordered = [emb0, ...embeds.filter((e) => e !== emb0)];
      for (const emb of ordered.slice(0, 6)) {
        const streams = await resolveEmbed(emb, durl).catch(() => []);
        if (!streams.length) continue;
        // 快返、不验活：hls4（embed 宿主直出 master.m3u8）令牌仅活 5-10 秒，
        // 验活 GET 会把令牌耗在半路——刚解出就立即返回，播放器数秒内取到
        // 才是活的。hls3 的 .cfd 宿主已死直接跳过；无 hls4 时回落 hls2
        //（dramiyos，令牌 36h，虽 VM 403 但设备出口或可放行）。
        let embHost = '';
        try { embHost = new URL(emb).hostname; } catch (e) {}
        let pick = '';
        for (const st of streams) {
          let h = '';
          try { h = new URL(st.url).hostname; } catch (e) {}
          if (h && embHost && h === embHost) { pick = st.url; break; }
        }
        if (!pick) for (const st of streams) {
          if (/\.cfd\//.test(st.url)) continue;
          if (/dramiyos-cdn\.com/.test(st.url)) { pick = st.url; break; }
        }
        if (!pick) for (const st of streams) {
          if (/\.cfd\//.test(st.url)) continue;
          pick = st.url; break;
        }
        if (pick) { resolved = pick; break; }
      }
    } catch (e) { /* 落入兜底 */ }
    target = resolved || emb0;
  }
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
        const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
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
    const tabs = (CATS.map(c => ({ id: c.v, name: c.n }))).map((c) => ({ name: c.name, ext: { id: c.id } }));
    return jsonify({ ver: 1, title: 'JavHey', site: HOST, tabs });
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
    // 先搜字幕、后解流：hls4（embed 宿主直出）令牌仅活 5-10 秒，解流后
    // 再搜字幕（oracle/SubtitleCat 数秒）会把令牌耗过期、播放器取到 403。
    // 字幕先行，流现解现返，令牌新鲜才有效。
    let subs = null;
    if (name) {
        try {
            subs = await subSearch(name);
        } catch (e) { /* 无字幕不影响播放 */ }
    }
    let r = null;
    try { r = await play({ body: { id } }); } catch (e) { r = null; }
    const url = __s(r && r.url);
    if (!url) return jsonify({ urls: [], headers: [] });
    const result = { urls: [url], headers: [r.header || {}] };
    if (subs && subs.length) result.subs = subs;
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
