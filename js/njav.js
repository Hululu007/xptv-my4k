// NJAV (www.njav.com) -> CatPawOpen spider
// 站点形态（2026-11-16 亲自用 curl + iPhone UA 实测，全部 200）：内容在 /en/ 路径下
// （无 /en/ 的归档 404）。列表卡 box-item（xvideos/<slug>、javcdn 缩略图、detail 真标题
// ＋ duration 时长），上游每页 12 条、?page=N 翻页，站方称 53 万部。两个站方怪癖
// （2026-11-16 实测）：① 厂牌/题材页末尾斜杠即 404（/en/tags/SIRO 200，/en/tags/SIRO/
// 404），翻页直接 ?page=N；② 搜索区分大小写，大写番号回无关结果（q=MEYD-385 回 12 部
// 无关片，q=meyd-385 精确回 1 部），蜘蛛统一把关键词转小写再查。封面两档：
// resize/ 330px 与 images/ 800px，本蜘蛛用 images/ 大图（/resize/ 换 /images/）。
// 播放链：详情 /en/xvideos/<slug> → 点播页 /vv/<slug> 里 clink() 的 /jm/<base64>
// → 302 upload18.org 播放页 window.PLAYER_CONFIG 的 m3u8 字段＝helvid.com 签名 HLS
// （约 2 小时过期，蜘蛛现铸现用、内存钉存 100 分钟），alternate720 多数片为空。
// 取数头：iPhone UA；取 master 时不要 Referer；桌面 UA 一律 403；helvid 按签名里
// 的设备类别 d=apple 验 UA 类别，铸播必须同类别同出口。
// 分辨率（实测 4 部片，档位按片不同，绝不编造）：master 是多变体 master，1080p+720p+480p、
// 1080p+720p+480p+360p、720p 单档、720p 单档。变体行格式：
// #EXT-X-STREAM-INF:...RESOLUTION=1920x1080,NAME="1080p"，下一行即变体地址（原样用，
// 不要重拼）。变体播单 200、1,765 个分片、首分片 Range 206、首字节 TS 魔数 0x47（已验）。
// 详情时铸造并解析变体、一档一线（高到低）；play() 接到 njav:<slug>@@<档位> 时重新铸造
// （保证新鲜）、重新解析变体、按档位取变体地址。详情铸造失败时仍留一条 lazy“正片”线，
// play 时再铸一次（master 约 2 小时过期，点播时重铸才稳）；铸造两次都失败才回 parse:1
// 嗅探详情页（绝不回 parse:0 + 空 url，那是无限转圈）。
// 字幕：片名带番号才接芯（subExtractCode 能抠出号才登记＋预热），不带不接；只按登记标题
// 取番号，绝不从播放地址域名里抠番号；绝不调 playFinish（芯里未定义）。

const KEY = 'py_njav';
const NAME = 'NJAV';
const HOST = 'https://www.njav.com';
const EN = HOST + '/en';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PLAY_HEADERS = { 'User-Agent': UA }; // 播放头不要 Referer（helvid apple 类配方）

// 顶级分类 10 个：最新更新、新片发布、8 个栏目（/en/<cat>/ 下全部，实测 200）。
const CLASSES = [
  { type_id: 'latest', type_name: '最新更新', path: '/recent-update/' },
  { type_id: 'release', type_name: '新片发布', path: '/new-release/' },
  { type_id: 'censored', type_name: '有码', path: '/censored/' },
  { type_id: 'uncensored', type_name: '无码', path: '/uncensored/' },
  { type_id: 'uncensored-leaked', type_name: '无码流出', path: '/uncensored-leaked/' },
  { type_id: 'amateur', type_name: '素人', path: '/amateur/' },
  { type_id: 'chinese-av', type_name: '国产AV', path: '/chinese-av/' },
  { type_id: 'chinese-live', type_name: '国产直播', path: '/chinese-live/' },
  { type_id: 'korean-live', type_name: '韩国直播', path: '/korean-live/' },
  { type_id: 'english-subtitle', type_name: '英文字幕', path: '/english-subtitle/' },
];

// 厂牌 18 个（首页导航实测，与 REX 模块一致；值即站内 tag 名，建 URL 时 encode）。
const TAGS = ['SIRO', 'LUXU', '200GANA', 'FC2', 'HEYZO', 'CARIBBEANCOM', '10MUSUME', 'PACOPACOMAMA', 'S-CUTE', 'PRESTIGE PREMIUM', 'ARA', 'ACZD', 'NNPJ', 'MRHP', 'DOCP', 'C0930', 'H0930', 'H4610'];
// 题材 23 个（REX 模块枚举，详情页 genre 链接实测在站；值即站内 genre 名，建 URL 时 encode）。
const GENRES = [
  { n: '中出', v: 'Creampie' }, { n: '美少女', v: 'Beautiful Girl' }, { n: '痴女', v: 'Slut' },
  { n: '口交', v: 'Blowjob' }, { n: '主观视角', v: 'POV' }, { n: '单体', v: 'Solowork' },
  { n: '人妻', v: 'Married Woman' }, { n: '主妇', v: 'Housewife' }, { n: 'NTR', v: 'Ntr' },
  { n: '剧情', v: 'Drama' }, { n: '不伦', v: 'Affair' }, { n: '出轨妻', v: 'Cheating Wife' },
  { n: '近亲', v: 'Incest' }, { n: '巨乳', v: 'Large Breasts' }, { n: '贫乳', v: 'Small Breasts' },
  { n: '学生', v: 'School Girls' }, { n: '义姐妹', v: 'Step Sister' }, { n: '乳交', v: 'Tits Fuck' },
  { n: '自慰', v: 'Masturbation' }, { n: '野外', v: 'Public Sex' }, { n: '无码', v: 'Uncensored' },
  { n: '高清', v: 'Hi-Def' }, { n: '长片4H+', v: 'Over 4 Hours' },
];

const PAGE_SIZE = 12;

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return m; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return m; } });
}

function bigCover(u) {
  return String(u || '').replace('/resize/', '/images/');
}

function unescapeCfg(s) {
  return String(s || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"');
}

// 取页： + transformResponse 恒等（rdd22 教训：JSON 回包会被 axios
// 解析成对象）；3 次重试；App 内无全局 fetch，fetch 分支只在有 fetch 的环境生效。
async function getHtml(url, referer) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': referer || HOST + '/',
  };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await $fetch.get(url, { headers, timeout: 20000 });
      if (r && r.status === 200 && r.data) return String(r.data);
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers });
        if (r && r.ok) return await r.text();
      }
    } catch (e) {}
      }
  return '';
}

// 取 master：只带 iPhone UA，不要 Referer（2026-11-16 实测：无 Referer 200；
// 桌面 UA 一律 403；helvid 按签名 d=apple 验 UA 类别）。
async function getMaster(url) {
  const headers = { 'User-Agent': UA };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await $fetch.get(url, { headers, timeout: 20000 });
      if (r && r.status === 200 && r.data) return String(r.data);
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers });
        if (r && r.ok) return await r.text();
      }
    } catch (e) {}
      }
  return '';
}

// 列表解析：box-item 卡；href="xvideos/<slug>" 在缩略图与标题两处各出现一次，按 slug 去重。
function parseCards(html) {
  const items = [];
  if (!html) return items;
  const seen = new Set();
  const parts = String(html).split('box-item');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].slice(0, 2500);
    const hrefM = /href="xvideos\/([a-z0-9][a-z0-9-]*)"/.exec(chunk);
    if (!hrefM) continue;
    const slug = hrefM[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const imgM = /data-src="([^"]+)"/.exec(chunk) || /<img[^>]+src="(https:\/\/static\.javcdn[^"]+)"/.exec(chunk);
    const cover = imgM ? bigCover(imgM[1]) : ('https://static.javcdn.vip/images/' + slug + '/thumb_h.webp');
    const nameM = /<div class="detail">\s*<a[^>]*>([^<]+)<\/a>/.exec(chunk) || /<div class="name">([^<]+)<\/div>/.exec(chunk);
    const title = nameM ? decodeHtml(nameM[1]).trim() : slug.toUpperCase();
    const durM = /<div class="duration">([^<]+)<\/div>/.exec(chunk) || /<i class="ribbon">([^<]+)<\/i>/.exec(chunk);
    const dur = durM ? durM[1].trim() : '';
    items.push({
      vod_id: 'njav:' + slug,
      vod_name: title,
      vod_pic: cover,
      vod_remarks: dur,
    });
  }
  return items;
}

// 变体解析：NAME="1080p" 优先，缺失时按 RESOLUTION 就近映射标准档；高到低排序、按档去重。
function parseMaster(text) {
  const out = [];
  const seen = new Set();
  const STD = [240, 360, 480, 720, 1080, 1440, 2160];
  const lines = String(text || '').split(/\r?\n/);
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
    const nm = /NAME="([^"]+)"/.exec(inf[1]);
    if (nm && /^\d+p$/i.test(nm[1])) label = nm[1].toLowerCase();
    if (!label) {
      const rm = /RESOLUTION=(\d+)x(\d+)/i.exec(inf[1]);
      if (rm) {
        const mn = Math.min(parseInt(rm[1], 10), parseInt(rm[2], 10));
        let best = STD[0], bd = 1e9;
        for (const s of STD) { const d = Math.abs(s - mn); if (d < bd) { bd = d; best = s; } }
        label = best + 'p';
      }
    }
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, url: uri });
  }
  out.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
  return out;
}

// 铸造：/vv/<slug> → /jm/<token>（自动跟随 302 到 upload18 播放页）
// → PLAYER_CONFIG 的 m3u8（helvid 签名 HLS）＋ alternate720。钉存 100 分钟。
const mintCache = new Map();
async function mint(slug) {
  const cached = mintCache.get(slug);
  if (cached && cached.exp > Date.now() + 60000) return cached;
  const detailUrl = EN + '/xvideos/' + slug;
  const vv = await getHtml(HOST + '/vv/' + slug, detailUrl);
  const jmM = /"(\/jm\/[A-Za-z0-9+/=]+)"/.exec(vv);
  if (!jmM) return null;
  const play = await getHtml(HOST + jmM[1], HOST + '/vv/' + slug);
  const mM = /"m3u8"\s*:\s*"([^"]+)"/.exec(play);
  if (!mM) return null;
  const aM = /"alternate720"\s*:\s*"([^"]*)"/.exec(play);
  const res = {
    u: unescapeCfg(mM[1]),
    alt: aM ? unescapeCfg(aM[1]) : '',
    exp: Date.now() + 100 * 60 * 1000,
  };
  if (!res.u) return null;
  mintCache.set(slug, res);
  if (mintCache.size > 200) mintCache.delete(mintCache.keys().next().value);
  return res;
}

// 现铸现解档位：{ tiers: [{label, url}], alt }；取不到 master 时 tiers 为空。
async function resolveTiers(slug) {
  const minted = await mint(slug);
  if (!minted) return { tiers: [], alt: '' };
  const masterText = await getMaster(minted.u);
  const tiers = parseMaster(masterText);
  return { tiers, alt: minted.alt || '' };
}

function parseSlug(raw) {
  const s = t(raw);
  if (!s) return '';
  const m = /^njav:([a-z0-9][a-z0-9-]*)/.exec(s);
  if (m) return m[1];
  const u = /\/xvideos\/([a-z0-9][a-z0-9-]*)/.exec(s);
  if (u) return u[1];
  if (/^[a-z0-9][a-z0-9-]*$/.test(s)) return s;
  return '';
}

function listUrlFor(id, page, flt) {
  const tag = t(flt.tag || (flt.tag && flt.tag.value) || '');
  const genre = t(flt.genre || (flt.genre && flt.genre.value) || '');
  let base;
  let noSlash = false;
  if (tag) { base = EN + '/tags/' + encodeURIComponent(tag); noSlash = true; }
  else if (genre) { base = EN + '/genre/' + encodeURIComponent(genre); noSlash = true; }
  else {
    const c = CLASSES.find((x) => x.type_id === id) || CLASSES[0];
    base = EN + c.path.replace(/\/$/, '');
  }
  const p = Math.max(1, parseInt(page, 10) || 1);
  // 厂牌/题材页：末尾斜杠即 404（2026-11-16 实测：/en/tags/SIRO 200，/en/tags/SIRO/ 404）；
  // 翻页直接 ?page=N。栏目页带斜杠正常。
  if (noSlash) return p <= 1 ? base : base + '?page=' + p;
  return p <= 1 ? base + '/' : base + '/?page=' + p;
}

async function init() {
  return {};
}

async function home() {
  const cls = CLASSES.map((c) => ({ type_id: c.type_id, type_name: c.type_name }));
  const filters = {};
  const groups = [
    { key: 'tag', name: '厂牌', value: TAGS.map((x) => ({ n: x, v: x })) },
    { key: 'genre', name: '题材', value: GENRES.map((g) => ({ n: g.n, v: g.v })) },
  ];
  for (const c of CLASSES) filters[c.type_id] = groups;
  return { class: cls, filters };
}

async function category(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const id = String(body.id || body.tid || 'latest');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const flt = body.filters || body.extend || {};
  const html = await getHtml(listUrlFor(id, page, flt));
  const list = parseCards(html);
  // 上游每页 12 条：满页说明可能还有下一页，短页即末页。
  const pagecount = list.length >= PAGE_SIZE ? page + 1 : page;
  return { page, pagecount, limit: PAGE_SIZE, total: list.length, list };
}

async function catSearch(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const wd = t(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: 1, limit: PAGE_SIZE, total: 0, list: [] };
  // 搜索区分大小写：大写番号返回无关结果（2026-11-16 实测：q=MEYD-385 回 12 部无关片，
  // q=meyd-385 精确回 1 部）；统一转小写再查。
  let url = EN + '/search?q=' + encodeURIComponent(wd.toLowerCase());
  if (page > 1) url += '&page=' + page;
  const html = await getHtml(url);
  const list = parseCards(html);
  const pagecount = list.length >= PAGE_SIZE ? page + 1 : page;
  return { page, pagecount, limit: PAGE_SIZE, total: list.length, list };
}

async function detail(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const slug = parseSlug(raw);
  if (!slug) return { list: [] };
  const durl = EN + '/xvideos/' + slug;
  const html = await getHtml(durl);
  if (!html) return { list: [] };
  const h1M = /<h1>([^<]+)<\/h1>/.exec(html);
  const title = h1M ? decodeHtml(h1M[1]).trim() : slug.toUpperCase();
  const postM = /data-poster="([^"]+)"/.exec(html);
  const cover = postM ? bigCover(postM[1]) : ('https://static.javcdn.vip/images/' + slug + '/thumb_h.webp');
  const lenM = /data-len="([^"]+)"/.exec(html);
  const dur = lenM ? lenM[1] : '';
  const dateM = /"uploadDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/.exec(html);
  const genres = [];
  const gRe = /href="genre\/([^"]+)"/g;
  let gm;
  while ((gm = gRe.exec(html)) !== null) {
    const gn = decodeHtml(gm[1]);
    if (gn && genres.indexOf(gn) < 0) genres.push(gn);
  }
  const content = [dur, dateM ? dateM[1] : '', genres.length ? genres.join(' / ') : ''].filter(Boolean).join(' · ');
  // 播放线：现铸现解变体，一档一线（高到低）；单档片只有一段；alternate720 只在
  // 主 master 无变体时作 720P 备用线；铸造失败留 lazy“正片”线，play 时再铸一次。
  const eps = [];
  let tiers = [];
  try {
    const r = await resolveTiers(slug);
    tiers = r.tiers || [];
    if (tiers.length) {
      for (const v of tiers) eps.push(v.label + '$njav:' + slug + '@@' + v.label);
    } else if (r.alt) {
      eps.push('720P$njav:' + slug + '@@ALT');
    }
  } catch (e) {}
  if (!eps.length) eps.push('正片$njav:' + slug + '@@BEST');
  // 字幕：片名带番号才接（subExtractCode 能抠出号才登记＋预热），不带不接。
    return {
    list: [{
      vod_id: 'njav:' + slug,
      vod_name: title,
      vod_pic: cover,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const id = t(raw);
  if (!id) return { parse: 0, url: '' };
  // 防御：若 id 本身就是 helvid 地址，直接交播放器（不经过铸造）。
  if (/^https?:\/\/helvid\.com\//i.test(id)) {
    return { parse: 0, url: id, header: PLAY_HEADERS };
  }
  const m = /^njav:([a-z0-9][a-z0-9-]*)(?:@@(.+))?$/.exec(id);
  if (!m) return { parse: 0, url: '' };
  const slug = m[1];
  const want = (m[2] || 'BEST').toUpperCase();
  const durl = EN + '/xvideos/' + slug;
  // 铸造失败先重试一次（清缓存重铸），仍失败回 parse:1 嗅探详情页。
  let resolved = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) mintCache.delete(slug);
      resolved = await resolveTiers(slug);
      if (resolved && (resolved.tiers.length || resolved.alt)) break;
    } catch (e) {}
    resolved = null;
  }
  if (!resolved || (!resolved.tiers.length && !resolved.alt)) {
    return { parse: 1, url: durl };
  }
  let url = '';
  if (want === 'ALT') {
    url = resolved.alt || (resolved.tiers.length ? resolved.tiers[0].url : '');
  } else if (want === 'BEST') {
    url = resolved.tiers.length ? resolved.tiers[0].url : resolved.alt;
  } else {
    const hit = resolved.tiers.find((v) => v.label.toUpperCase() === want);
    url = hit ? hit.url : (resolved.tiers.length ? resolved.tiers[0].url : resolved.alt);
  }
  if (!url) return { parse: 1, url: durl };
  // 字幕：只在 detail 登记过（即片名带番号）的地址上查；无登记不带 subs 键。
    const result = { parse: 0, url, header: PLAY_HEADERS };
    return result;
}


// ---------- 字幕聚合 companion helpers（core 本身不含） ----------
// reqRaw：框架 req，2xx 才回 body，永不抛错；clean：去标签/空白（core 的 subSlugTitle 用到）。
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}


// ---------------- 字幕聚合 (与 32 个带芯猫源同一套 Layer A，2026-11-02 定版) ----------------
// 槽位：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 键序逐个查、首中即停；命中后严过滤（须含番号或片名全文，无回退）；
// 合并序 = 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；
// 全局上限 10、单槽软上限 8；总预算 6s、失败全静默；无结果时 play 不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 除 1000），无时长不显示、不编造；
// 去重键 = 语言 + 小写名（去扩展名）+ 秒（无时长记 nodur），同名同时长才算重复。

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
    const tabs = (CLASSES.map(c => ({ id: c.type_id, name: c.type_name }))).map((c) => ({ name: c.name, ext: { id: c.id } }));
    return jsonify({ ver: 1, title: 'NJAV', site: HOST, tabs });
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
            const pid = di >= 0 ? ep.slice(di + 1) : ep;
            if (!pid) continue;
            tracks.push({ name: nm, pan: '', ext: { url: pid, id: pid, name: nm } });
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
