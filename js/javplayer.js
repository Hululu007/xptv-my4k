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

// JavPlayer - mira-cat 蜘蛛初稿（2026-10-31 调研起草，未推送）
// 站点：https://javplayer.org/（与 javct 同模板 family；javct 蜘蛛已验证同款机制）
// 结构（jina 实测，VM 直连遭 WAF 403、App 侧 req 待真机验）：
//  - 列表：卡片 <a href="/v/{slug}" class="card__play">，标题 card__title，
//    封面懒加载：src 是 default-cover.jpg 占位，真实封面在 data-src
//    （cdn001/cdn002.imggle.net/poster/…）；番号在 card__category 锚文本。
//  - 分页：24 条/页。/new-releases 与 /search/<kw> 用干净分页 /pg-N；
//    /censored、/subtitle、/category/<slug> 用带 hash 分页 /<path>-<hash>/pg-N，
//    hash 取自当页 paginator 链接（每列表各异，如 censored-6pccbw9k、
//    big-tits-hipx7w77），页 1 现取现解析；hash 轮换时刷新一次重试。
//  - 详情：/v/{slug}；标题取 og:title（跳过 jina 混入的假 403 标题）；封面
//    og:image（cdna.sextb.net/thumb）或播放器封面（imggle thumb）；
//    服务器按钮 switch-source（F4/DD/US，VIP 按钮绝不碰），data-source=filmId，
//    data-id=episode；页内 filmId 与 window.__pt/__pk；
//    点击 → POST /ajax/player，body {episode, filmId, pt}，头
//    X-Requested-With: XMLHttpRequest；返回 player_enc（xor 解密，密钥 __pk）
//    或 player（iframe）；嵌页按 host 分流到已部署的 sextb-hls Worker
//    （f4scdn/f4jav → /f4，其余 → /v）。
//  - 清晰度：站方给的是服务器选择（F4/DD/US），不是分辨率档，不编造清晰度；
//    Worker /f4 回的是 f4 master 清单（实测预告片 master 仅 720p 一档；
//    正片 master 是否多档待真机验——若多档，播放器侧可自选）。
//  - 搜索：/search/<slug>（slug 化：小写、非字母数字转 -；中文/日文关键词
//    站方 404，故 slug 为空时直接返回空，不发请求）。
//  - 字幕：与猫源 27 源同款芯（迅雷/迅雷看看/SubtitleCat 三槽，见文末字幕节）；
//    番号只从片名取；详情串行预热（并行预热曾把 SubtitleCat 挤挂，ONE 实测教训）。
//  - WAF：VM 直连 403；蜘蛛先 GET 首页暖会话再抓详情/ajax；App 的 req
//    能否过墙、cookie 是否跨请求保持、/ajax/player 实况、DD/US 嵌页 host、
//    正片 master 档位，均待真机验（见 REPORT_javplayer.md）。

const KEY = 'py_javplayer';
const NAME = 'JavPlayer';
const HOST = 'https://javplayer.org';
const WORKER = 'https://sextb-hls.li768435813.workers.dev';
const SITE_FETCH = 'https://site-fetch.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function H(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer || HOST + '/',
  };
}

// 站方 WAF 拦截程序化直连（2026-10-31：VM curl / node / 换 UA 均 403
// "Your request was blocked"，设备侧同样无内容；jina 实测可回真实 HTML）。
// 取数依次走：自家中转 site-fetch → jina → 直连；首个拿到真实 HTML 的胜出。
// site-fetch 需 v3（allowlist 含 javplayer.org；未更新前回 400，自动落到下一腿）。
function looksRealHtml(t) {
  return !!t && t.length > 2000 && !/Your request was blocked|Just a moment|Checking your browser|Attention Required|cf-challenge|cf\.errors/i.test(t);
}
async function getText(url, referer) {
  try {
    const r = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), { headers: H(referer), timeout: 12000 });
    if (r.status === 200 && looksRealHtml(String(r.data || ''))) return String(r.data);
  } catch {}
  try {
    const r = await $fetch.get('https://r.jina.ai/' + url, { headers: Object.assign(H(referer), { 'x-respond-with': 'html' }), timeout: 20000 });
    if (r.status === 200 && looksRealHtml(String(r.data || ''))) return String(r.data);
  } catch {}
  try {
    const { data } = await $fetch.get(url, { headers: H(referer), timeout: 15000 });
    return String(data || '');
  } catch { return ''; }
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function b64Decode(s) {
  let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  try { return Buffer.from(t, 'base64').toString('latin1'); } catch { return ''; }
}

function xorStr(raw, key) {
  if (!key) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

function latin1ToUtf8(s) {
  try { return Buffer.from(s, 'latin1').toString('utf8'); } catch { return s; }
}

// xorDecrypt：javct 同款（atob 不一定可用，base64 走 Buffer；密钥为空只解码）
function xorDecrypt(enc, key) {
  if (!enc) return '';
  const decoded = b64Decode(enc);
  if (!key) return latin1ToUtf8(decoded);
  return latin1ToUtf8(xorStr(decoded, key));
}

function isF4Host(host) { return /f4scdn\.com|f4jav\.xyz/i.test(host || ''); }
function hostOf(url) {
  const m = String(url || '').match(/^https?:\/\/([^/]+)/i);
  return m ? m[1] : '';
}
function workerUrl(embed, durl) {
  const host = hostOf(embed);
  const path = isF4Host(host) ? '/f4' : '/v';
  return WORKER + path + '?u=' + encodeURIComponent(embed) + '&r=' + encodeURIComponent(durl);
}

// ---------- 列表解析（javct 同款：锚点扫描 + 锚点前 900 字内最后一个 img + 顺序对齐标题/番号） ----------
function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]*href="(https:\/\/javplayer\.org\/v\/[a-z0-9\-]+|\/v\/[a-z0-9\-]+)"[^>]*class="[^"]*card__play[^"]*"[^>]*>([\s\S]{0,1500}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (!/^https?:\/\//i.test(href)) href = HOST + href;
    if (seen.has(href)) continue;
    seen.add(href);
    let pic = '';
    const before = html.slice(Math.max(0, m.index - 900), m.index);
    const imgs = [...before.matchAll(/<img[^>]*>/gi)];
    const im = imgs.length ? imgs[imgs.length - 1][0] : null;
    if (im) {
      const dm = im.match(/data-src="([^"]+)"/i);
      const sm = im.match(/src="([^"]+)"/i);
      const cand = (dm && dm[1]) || (sm && sm[1]) || '';
      if (cand && !/default-cover/i.test(cand) && !/data:image/i.test(cand)) {
        pic = /^https?:\/\//i.test(cand) ? cand : HOST + (cand.startsWith('/') ? cand : '/' + cand);
      }
    }
    items.push({ vod_id: href, vod_name: '', vod_pic: pic, vod_remarks: '' });
    if (items.length >= 60) break;
  }
  const titles = [...html.matchAll(/class="[^"]*card__title[^"]*"[^>]*>([\s\S]{0,500}?)<\/[^>]+>/gi)].map(x => stripTags(x[1]));
  const codes = [...html.matchAll(/<a[^>]*href="https:\/\/javplayer\.org\/v\/[a-z0-9\-]+"[^>]*>([A-Z0-9\-]{4,})<\/a>/gi)].map(x => x[1]);
  items.forEach((it, i) => {
    if (titles[i]) it.vod_name = titles[i];
    if (codes[i]) it.vod_remarks = codes[i];
    if (!it.vod_name) {
      const slug = (it.vod_id.match(/\/v\/([a-z0-9\-]+)/i) || [])[1] || '';
      it.vod_name = slug ? slug.toUpperCase() : NAME;
      if (!it.vod_remarks && slug) it.vod_remarks = slug.toUpperCase();
    }
  });
  return items.filter(it => it.vod_name && it.vod_name.length >= 2);
}

// ---------- 分类 ----------
const CATS = [
  { type_id: '/new-releases', type_name: '最新' },
  { type_id: 'kw_jianma', type_name: '减码' },
  { type_id: '/category/big-tits', type_name: '巨乳' },
  { type_id: '/category/big-asses', type_name: '大屁股' },
  { type_id: '/category/married-woman', type_name: '人妻' },
  { type_id: 'kw_zhifu', type_name: '制服' },
  { type_id: '/category/creampie', type_name: '中出' },
  { type_id: '/amateur', type_name: '素人' },
  { type_id: '/uncensored', type_name: '无码' },
  { type_id: '/subtitle', type_name: '字幕' },
  { type_id: '/censored', type_name: '有码' },
  { type_id: '/category/anal', type_name: '肛交' },
  { type_id: '/category/av-idol', type_name: 'AV偶像' },
  { type_id: '/category/beautiful-girl', type_name: '美少女' },
  { type_id: '/category/beautiful-pussy', type_name: '美穴' },
  { type_id: '/category/blowjob', type_name: '口交' },
  { type_id: '/category/bondage', type_name: '捆绑' },
  { type_id: '/category/bukkake', type_name: '多人颜射' },
  { type_id: '/category/cheating-wife', type_name: '出轨人妻' },
  { type_id: '/category/cosplay', type_name: '角色扮演' },
  { type_id: '/category/cumshot', type_name: '射精' },
  { type_id: '/category/deep-throat', type_name: '深喉' },
  { type_id: '/category/doggy-style', type_name: '后入' },
  { type_id: '/category/drama', type_name: '剧情' },
  { type_id: '/category/facials', type_name: '颜射' },
  { type_id: '/category/featured-actress', type_name: '明星女优' },
  { type_id: '/category/female-boss', type_name: '女上司' },
  { type_id: '/category/foot-fetish', type_name: '恋足' },
  { type_id: '/category/handjob', type_name: '手淫' },
  { type_id: '/category/huge-dick-large-dick', type_name: '巨根' },
  { type_id: '/category/huge-tits', type_name: '爆乳' },
  { type_id: '/category/idol--celebrity', type_name: '偶像明星' },
  { type_id: '/category/incest', type_name: '乱伦' },
  { type_id: '/category/jav-uncensored', type_name: '无修正' },
  { type_id: '/category/lesbian', type_name: '女同' },
  { type_id: '/category/lingerie', type_name: '内衣' },
  { type_id: '/category/massage', type_name: '按摩' },
  { type_id: '/category/mature-woman', type_name: '成熟女性' },
  { type_id: '/category/milf', type_name: '熟妇' },
  { type_id: '/category/nice-tits', type_name: '美乳' },
  { type_id: '/category/office-lady', type_name: 'OL' },
  { type_id: '/category/orgy', type_name: '群交' },
  { type_id: '/category/outdoor', type_name: '野外' },
  { type_id: '/category/prostitutes', type_name: '妓女' },
  { type_id: '/category/rape', type_name: '强奸' },
  { type_id: '/category/school-girls', type_name: '校园女生' },
  { type_id: '/category/sex-toys', type_name: '情趣用品' },
  { type_id: '/category/shame', type_name: '羞耻' },
  { type_id: '/category/shemale', type_name: '人妖' },
  { type_id: '/category/slender', type_name: '苗条' },
  { type_id: '/category/squirting', type_name: '潮吹' },
  { type_id: '/category/stepfamily', type_name: '继亲' },
  { type_id: '/category/stepmom', type_name: '继母' },
  { type_id: '/category/tall-girl', type_name: '高个女孩' },
  { type_id: '/category/threesome--foursome', type_name: '3P4P' },
  { type_id: '/category/various-worker', type_name: '各行各业' },
  { type_id: '/category/voyeur', type_name: '偷窥' },
  { type_id: '/category/urination', type_name: '排尿' },
  { type_id: '/category/abuse', type_name: '虐待' },
  { type_id: '/category/reducing-mosaic', type_name: '薄码' },
  { type_id: '/category/masturbation', type_name: '自慰' },
  { type_id: '/category/cuckold', type_name: '绿帽' },
  { type_id: '/category/slut', type_name: '痴女' },
  { type_id: '/category/english-subtitle', type_name: '英文字幕' },
];

// 干净分页（无 hash）：/new-releases、/search/<kw>
const CLEAN_PATHS = new Set(['/new-releases']);
function isCleanPath(path) {
  if (CLEAN_PATHS.has(path)) return true;
  if (path.indexOf('/search/') === 0) return true;
  return false;
}

const PGBASE = {}; // path -> hash 分页前缀（...-hash/pg-）
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function extractPgBase(html, path) {
  const re1 = new RegExp('href="(https://javplayer\\.org' + escRe(path) + '-[A-Za-z0-9]+)/pg-2"');
  const m1 = html.match(re1);
  if (m1) return m1[1] + '/pg-';
  const re2 = new RegExp('action="(' + escRe(path) + '-[A-Za-z0-9]+)/"');
  const m2 = html.match(re2);
  if (m2) return HOST + m2[1] + '/pg-';
  return '';
}

async function fetchList(path, page) {
  if (isCleanPath(path)) {
    const url = HOST + path + (page > 1 ? '/pg-' + page : '');
    const html = await getText(url, HOST + '/');
    const list = parseCards(html);
    return { list, more: list.length >= 24 };
  }
  let base = PGBASE[path];
  if (page === 1 || !base) {
    const html = await getText(HOST + path, HOST + '/');
    const list = parseCards(html);
    const nb = extractPgBase(html, path);
    if (nb) PGBASE[path] = nb;
    if (page === 1) return { list, more: list.length >= 24 };
    if (!nb) return { list: [], more: false };
    base = nb;
  }
  // 注意：extractPgBase 返回的前缀本身已以 '/pg-' 结尾，这里只补页码，
  // 绝不能再拼一次 'pg-'（否则会拼成 .../pg-pg-2，实测踩过的坑）。
  let html = await getText(base + page, HOST + '/');
  let list = parseCards(html);
  if (!list.length) {
    // hash 可能已轮换：刷新一次页 1 再重试
    const html1 = await getText(HOST + path, HOST + '/');
    const nb = extractPgBase(html1, path);
    if (nb && nb !== base) {
      PGBASE[path] = nb;
      html = await getText(nb + page, HOST + '/');
      list = parseCards(html);
    }
  }
  return { list, more: list.length >= 24 };
}

// ---------- 关键词分类（站方无原生对应时用标题+番号文本匹配；仿 py_one kw_* 机理） ----------
// 底源为 /new-releases（干净分页），逐页顺序扫、上限 8 页（防无底洞）；
// 三个关键词分类共用底页缓存；匹配只用列表卡片自带的标题+番号（卡片不带标签，
// 逐卡抓详情太贵，故不含标签——见报告）。
const KW = [
  // 减码 = 番号 -rm 后缀（站方减码版标记；new-releases p1 实测 24 条中 12 条带 -rm）。
  // 旧 无码流出（流出|泄露|leaked）在站内标题+番号中几乎无命中，致分类为空，2026-10-31 设备侧坐实。
  { id: 'kw_jianma', re: /-rm$/i },
  { id: 'kw_zhifu', re: /制服|セーラー|女子校生|女子○生|女教師|ブレザー|学園/ },
];
const KWALL = {};
const NEWREL = {}; // 底页 -> 卡片
async function kwItems(kw, page, size) {
  let st = KWALL[kw.id];
  if (!st) { st = { items: [], seen: {}, page: 0, done: false }; KWALL[kw.id] = st; }
  const need = page * size;
  while (st.items.length < need && !st.done) {
    const bp = st.page + 1;
    if (bp > 8) { st.done = true; break; }
    let cards = NEWREL[bp];
    if (!cards) {
      const html = await getText(HOST + '/new-releases' + (bp > 1 ? '/pg-' + bp : ''), HOST + '/');
      cards = parseCards(html);
      NEWREL[bp] = cards;
    }
    st.page = bp;
    if (!cards.length) { st.done = true; break; }
    for (const it of cards) {
      if (st.seen[it.vod_id]) continue;
      const txt = (it.vod_name || '') + ' ' + (it.vod_remarks || '');
      if (!kw.re.test(txt)) continue;
      st.seen[it.vod_id] = 1;
      st.items.push(it);
    }
    if (cards.length < 24) st.done = true;
  }
  const from = (page - 1) * size;
  return { list: st.items.slice(from, from + size), more: !st.done || st.items.length > page * size };
}

let WARMED = false;
async function warmSession() {
  if (WARMED) return;
  WARMED = true;
  await getText(HOST + '/', HOST + '/');
}

async function init() { return {}; }

async function home() {
  await warmSession();
  const html = await getText(HOST + '/new-releases', HOST + '/');
  return { class: CATS, filters: {}, list: parseCards(html) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  let tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '/new-releases');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let r = { list: [], more: false };
  try {
    await warmSession();
    if (tid.indexOf('kw_') === 0) {
      const kw = KW.find((k) => k.id === tid);
      if (kw) r = await kwItems(kw, page, 24);
    } else {
      const path = tid.replace(/^\/+/, '');
      r = await fetchList('/' + path, page);
    }
  } catch (e) { r = { list: [], more: false }; }
  return { page, pagecount: r.more ? page + 1 : page, list: r.list };
}

function slugify(wd) {
  return String(wd || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function catSearch(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const slug = slugify(wd);
  if (!slug) return { page, pagecount: page, list: [] };
  try {
    await warmSession();
    const r = await fetchList('/search/' + slug, page);
    return { page, pagecount: r.more ? page + 1 : page, list: r.list };
  } catch (e) {
    return { page, pagecount: page, list: [] };
  }
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const ids = Array.isArray(body.id) ? body.id : [body.id];
  const list = [];
  for (const raw of ids.filter(Boolean)) {
    let durl = String(raw).trim();
    if (!/^https?:\/\//i.test(durl)) durl = HOST + (durl.startsWith('/') ? durl : '/' + durl);
    await warmSession();
    const html = await getText(durl, HOST + '/');
    if (!html) continue;
    // 标题：og:title 优先，其次 section__title h1，再次任意 h1，跳过错误页标题
    // （jina 加工页会混入假 403 标题；真实页同样跳过错误标题是安全的）
    const cands = [];
    const ogt = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogt) cands.push(ogt[1]);
    const sht = html.match(/<h1[^>]*class="[^"]*section__title[^"]*"[^>]*>([\s\S]{0,400}?)<\/h1>/i);
    if (sht) cands.push(sht[1]);
    const h1t = html.match(/<h1[^>]*>([\s\S]{0,400}?)<\/h1>/i);
    if (h1t) cands.push(h1t[1]);
    let title = 'JavPlayer';
    for (const c of cands) {
      const t = stripTags(c);
      if (t && !/^(403|404|500|Forbidden|Not Found)/i.test(t)) { title = t; break; }
    }
    let pic = '';
    const ogm = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogm) pic = ogm[1];
    if (!pic) {
      const cim = html.match(/<img[^>]*class="cover"[^>]*src="([^"]+)"/i);
      if (cim) pic = cim[1];
    }
    if (!pic) {
      const im = html.match(/https:\/\/cdn001\.imggle\.net\/[^"' \s<>]+/i);
      if (im) pic = im[0];
    }
    const filmM = html.match(/filmId\s*=\s*["']?(\d+)/i) || html.match(/data-source="(\d+)"/i);
    const filmId = filmM ? filmM[1] : '';
    const ptM = html.match(/window\.__pt\s*=\s*"([^"]+)"/i);
    const pkM = html.match(/window\.__pk\s*=\s*"([^"]+)"/i);
    const pt = ptM ? ptM[1] : '';
    const pk = pkM ? pkM[1] : '';
    const lines = [];
    const btnRe = /<button[^>]*class="[^"]*btn-player[^"]*"[^>]*>([\s\S]{0,80}?)<\/button>/gi;
    let bm;
    while ((bm = btnRe.exec(html)) !== null) {
      const tag = bm[0];
      if (/btn-player-vip/i.test(tag)) continue; // VIP 绝不碰
      const dm = tag.match(/data-id="(\d+)"/i);
      const sm = tag.match(/data-source="(\d+)"/i);
      const name = stripTags(bm[1]) || '播放';
      const episode = dm ? dm[1] : '';
      const fsrc = sm ? sm[1] : filmId;
      if (!episode || !fsrc) continue;
      lines.push(name + '$' + fsrc + '|' + episode + '|' + pt + '|' + pk + '|' + durl);
    }
    if (!lines.length) lines.push('网页播放$' + durl);
    // 元数据进简介
    const meta = [];
    const rt = html.match(/<span>Running time:<\/span>\s*([^<]*)/i);
    if (rt) meta.push('时长：' + stripTags(rt[1]));
    const rd = html.match(/<span>Release Date:<\/span>\s*([^<]*)/i);
    if (rd) meta.push('发行：' + stripTags(rd[1]));
    const st = html.match(/<span>Studio:<\/span>([\s\S]{0,300}?)<\/li>/i);
    if (st) meta.push('片商：' + stripTags(st[1]));
    const cats = [...html.matchAll(/<a[^>]*href="https:\/\/javplayer\.org\/category\/[^"]+"[^>]*>([^<]+)<\/a>/gi)].map(x => stripTags(x[1]));
    if (cats.length) meta.push('分类：' + cats.join('、'));
    const desc = html.match(/<div class="card__description">([\s\S]{0,2000}?)<\/div>/i);
    const content = (meta.join('\n') + (desc ? '\n' + stripTags(desc[1]) : '')).trim();
    list.push({
      vod_id: durl,
      vod_name: title,
      vod_pic: pic,
      vod_remarks: meta.slice(0, 2).join(' · '),
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: lines.join('#'),
    });
    // 字幕预热：按每条播放 token 登记片名；后台逐条串行（不 await、不并行——
    // 并行预热曾把 SubtitleCat 挤挂，见 ONE 实测教训）
    const toks = lines.map((l) => l.split('$').slice(1).join('$')).filter((t) => t.indexOf('|') >= 0);
          }
  return { list };
}

async function ajaxPlayer(filmId, episode, pt, durl) {
  let ajaxUrl = '';
  try { ajaxUrl = new URL(durl).origin + '/ajax/player'; } catch { return null; }
  const body = 'episode=' + encodeURIComponent(episode) + '&filmId=' + encodeURIComponent(filmId) + '&pt=' + encodeURIComponent(pt);
  const headers = {
    'User-Agent': UA,
    'Referer': durl,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  };
  // ① 中转 POST（需 site-fetch v3：allowlist 含 javplayer.org + POST 透传；
  // 未更新前中转回 400/非 JSON，自动落到直连，不影响旧行为）
  try {
    const r = await $fetch.post(SITE_FETCH + '/?u=' + encodeURIComponent(ajaxUrl), body, { headers, timeout: 15000 });
    if (r.status === 200 && r.data != null) {
      const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      if (j && (j.player || j.player_enc)) return j;
    }
  } catch (e) {}
  // ② 直连 POST
  try {
    const { data, status } = await $fetch.post(ajaxUrl, body, { headers, timeout: 15000 });
    if (status === 200 && data != null) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
  } catch (e) {}
  return null;
}

async function play(reqIn) {
  let id = String(reqIn?.body?.id || '').trim();
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  if (/\.m3u8(\?|$)/i.test(id) || /\.mp4(\?|$)/i.test(id)) {
    return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  // 服务器线：filmId|episode|pt|pk|durl
  const parts = id.split('|');
  if (parts.length < 5) {
    return { parse: 1, url: /^https?:\/\//i.test(id) ? id : HOST + '/', header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  const filmId = parts[0], episode = parts[1];
  let pt = parts[2];
  const pk = parts[3];
  const durl = parts.slice(4).join('|');
  // 字幕与 ajax 并行发起（不串行叠加延迟）
    let json = await ajaxPlayer(filmId, episode, pt, durl);
  if (!json || json.error) {
    // pt 可能已轮换过期：重抓详情取新 pt/pk 与同服务器 episode，重试一次
    try {
      const html = await getText(durl, HOST + '/');
      const ptM = html.match(/window\.__pt\s*=\s*"([^"]+)"/i);
      const pkM = html.match(/window\.__pk\s*=\s*"([^"]+)"/i);
      const btnRe = /<button[^>]*class="[^"]*btn-player[^"]*"[^>]*>([\s\S]{0,80}?)<\/button>/gi;
      let bm, newEp = '', newFilm = '';
      while ((bm = btnRe.exec(html)) !== null) {
        if (/btn-player-vip/i.test(bm[0])) continue;
        const dm = bm[0].match(/data-id="(\d+)"/i);
        const sm = bm[0].match(/data-source="(\d+)"/i);
        if (dm && dm[1] === episode) { newEp = dm[1]; newFilm = sm ? sm[1] : filmId; break; }
      }
      if (ptM && newEp) {
        pt = ptM[1];
        json = await ajaxPlayer(newFilm, newEp, pt, durl);
        if (json && !json.error && pkM) {
          // 用新 pk 解密（见下）
          json.__freshPk = pkM[1];
        }
      }
    } catch (e) {}
  }
  if (!json || json.error) return { parse: 0, url: '' };
  let playerHtml = '';
  const usePk = (json.__freshPk || pk || '');
  if (json.player_enc) playerHtml = xorDecrypt(json.player_enc, usePk);
  else if (json.player) playerHtml = String(json.player);
  if (!playerHtml) return { parse: 0, url: '' };
  const em = playerHtml.match(/<iframe[^>]+src="(https?:\/\/[^"]+)"/i)
    || playerHtml.match(/<iframe[^>]+src="(\/\/[^"]+)"/i);
    if (em) {
    let embed = em[1];
    if (embed.startsWith('//')) embed = 'https:' + embed;
    const result = { parse: 0, url: workerUrl(embed, durl), header: { 'User-Agent': UA, 'Referer': durl } };
        return result;
  }
  const mm = playerHtml.match(/https?:\/\/[^"' \s<>]+\.(?:m3u8|mp4)(?:\?[^"' \s<>]*)?/i);
  if (mm) {
    const result = { parse: 0, url: mm[0], header: { 'User-Agent': UA, 'Referer': durl } };
        return result;
  }
  return { parse: 0, url: '' };
}

// ---------- 字幕聚合（与猫源 27 源同款芯；番号只从片名取，不从播放地址取） ----------
// 三槽：迅雷（键序 [番号， 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 两迅雷槽同走同一 oracle 接口、合并按 URL 去重、同条归高档位；合并序 =
// 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；全局上限 10、
// 单槽软上限 8。严过滤（条目须含番号或片名全文，无回退，宁缺毋滥）；
// 全程 req 主栈、逐请求超时 3s、总预算 6s、失败全静默、无命中不带 subs 键。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。
// 去重键用秒（2026-11-02 名字+时长口径）：毫秒值 >100000 除 1000；
// 无时长记 nodur（沿用名字去重）；同名同时长才算重复。

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
    return jsonify({ ver: 1, title: 'JavPlayer', site: HOST, tabs });
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
