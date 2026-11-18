// JavHeo (https://javheo.com) -> CatPawOpen spider
// 探查 (2026-11-13, VM curl iPhone UA 全链实测):
//   列表: 首页 80 条/页, 翻页 /page/N/ (p1/p2/p3 互不重叠); 分类页 /porn/<tag>/ 单页
//     50 条, 无翻页 (/?page=2 与 p1 完全相同、/page/2/ 与 /2 均 404, 不编造 p2)。
//   分类: 站内侧栏 Categories 全表 65 个 + /porn/ 索引页多 1 个 dickdrainers, 共 66;
//     顶级分类 18 个 (最新 + 17 个实测 50 条的标签分类, jav/japanese/japan、
//     school/schoolgirl 首 5 条互不重叠、不是重复分类, 不删任何标签); 每个顶级下挂
//     66 标签筛选卡片 (123AV/hohoj 形态, 不平铺)。
//   搜索: 站内搜索框 JS 跳 /porn/<slug>/ (空格转 -、去非 alnum、小写); /?s= 恒回
//     80 条随机内容 (同查询两次重叠 0、无意义查询也回 80 条), 不是搜索, 不用。
//     /porn/ssni-229/ 实测标题 "Ssni 229 Xxx Download Videos", 50 条均含 229, 搜索可用。
//   详情: /watch/<id>, 标题 <title> 去 " - Watch JAV..." 后缀; 封面 og:image
//     (i.mycdn.me getVideoPreview, 实测 200 image/jpeg)。
//   播放链 (全链实测通): 详情页 -> POST /hash-javheo {mix:"moviesiframe2", num:<id>}
//     -> iframe https://javheo-com.ibhan2.top/iframe/v1/<hash>/<b64>
//     -> 内含 /iframe/convert/v1/<hash>/<b64> (点击后才加载的第二层 iframe)
//     -> Artplayer quality[] 直给 OK.ru mp4 四档 360p/480p/720p/1080p (720P 为默认档);
//     四档 Range 实测全部 206 video/mp4 (Referer 不敏感, 无 UA 则 400, play 须带 UA)。
//     签名 URL 含 expires/srcIp, play() 每次现解现取, 不复用详情时地址。
//   播放全转圈定性 (2026-11-13): 直链本身没坏 (四档 curl 均 206), 正则没坏,
//     断在耗时: 详情已跑完整条 4 步链 (VM 实测 16-27s), play() 又把同一条链重跑
//     一遍 (上一轮 harness 实测 31-43s, hash POST 还曾两次超时 abort 致 720p 空 url),
//     再叠字幕搜索最多 6s, 点播总耗时超 App 等待 -> 一直转圈。修法: 详情解析结果
//     进内存缓存 (TTL 10 分钟, 签名有效期约 2 天), play() 命中缓存直接返回,
//     缓存未命中才重解 (hash POST 失败重试一次); 档位一律按分辨率降序 (1080p 第一位)。
//     缓存与字幕层同款模块级 Map, 依赖详情->点播同一蜘蛛实例 (字幕预热已依赖此点)。
// 字幕: 接 sextb.js 定版字幕芯 (Layer A), 详情页地址为键登记片名、后台预热,
//   play() 有命中才挂 subs。

const KEY = 'py_javheo';
const NAME = 'JavHeo';
const HOST = 'https://javheo.com';
const IFRAME_HOST = 'https://javheo-com.ibhan2.top';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

// 顶级分类: 最新 + 17 个标签分类 (2026-11-13 各实测 /porn/<tag>/ 均 50 条)
const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'jav', type_name: 'JAV' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'fc2', type_name: 'FC2' },
  { type_id: 'japanese', type_name: '日本' },
  { type_id: 'asian', type_name: '亚洲' },
  { type_id: 'chinese', type_name: '中国' },
  { type_id: 'teen-porn', type_name: '少女' },
  { type_id: 'milf', type_name: '熟女' },
  { type_id: 'big-tits', type_name: '巨乳' },
  { type_id: 'schoolgirl', type_name: '校园女生' },
  { type_id: 'housewife', type_name: '人妻' },
  { type_id: 'massage', type_name: '按摩' },
  { type_id: 'lesbian', type_name: '女同' },
  { type_id: 'anal', type_name: '肛交' },
  { type_id: 'creampie', type_name: '中出' },
  { type_id: 'hentai', type_name: '动漫' },
  { type_id: 'heyzo', type_name: 'Heyzo' },
];

// 标签全表 (侧栏 Categories 65 个 + /porn/ 索引页 dickdrainers, 2026-11-13 实录)
const TAGS = [
  { n: 'anal', v: 'anal' },
  { n: 'asian', v: 'asian' },
  { n: 'asiansexdiary', v: 'asiansexdiary' },
  { n: 'bangbros', v: 'bangbros' },
  { n: 'bban', v: 'bban' },
  { n: 'bbw', v: 'bbw' },
  { n: 'bdsm', v: 'bdsm' },
  { n: 'big tits', v: 'big-tits' },
  { n: 'blacked', v: 'blacked' },
  { n: 'blackedraw', v: 'blackedraw' },
  { n: 'brazzers', v: 'brazzers' },
  { n: 'bukkake', v: 'bukkake' },
  { n: 'chinese', v: 'chinese' },
  { n: 'creampie', v: 'creampie' },
  { n: 'cumshot', v: 'cumshot' },
  { n: 'czech', v: 'czech' },
  { n: 'dasd', v: 'dasd' },
  { n: 'ddfnetwork', v: 'ddfnetwork' },
  { n: 'deepthroat', v: 'deepthroat' },
  { n: 'defloration', v: 'defloration' },
  { n: 'digital mosaic', v: 'digital-mosaic' },
  { n: 'digitalplayground', v: 'digitalplayground' },
  { n: 'dickdrainers', v: 'dickdrainers' },
  { n: 'ebony', v: 'ebony' },
  { n: 'family', v: 'family' },
  { n: 'fc2', v: 'fc2' },
  { n: 'gangbang', v: 'gangbang' },
  { n: 'girlsdoporn', v: 'girlsdoporn' },
  { n: 'group sex', v: 'group-sex' },
  { n: 'hentai', v: 'hentai' },
  { n: 'heyzo', v: 'heyzo' },
  { n: 'housewife', v: 'housewife' },
  { n: 'japan', v: 'japan' },
  { n: 'japanese', v: 'japanese' },
  { n: 'jav', v: 'jav' },
  { n: 'julesjordan', v: 'julesjordan' },
  { n: 'lesbian', v: 'lesbian' },
  { n: 'lisa ann', v: 'lisa-ann' },
  { n: 'married woman', v: 'married-woman' },
  { n: 'massage', v: 'massage' },
  { n: 'meyd', v: 'meyd' },
  { n: 'milf', v: 'milf' },
  { n: 'mom', v: 'mom' },
  { n: 'naughty america', v: 'naughty-america' },
  { n: 'niksindian', v: 'niksindian' },
  { n: 'nurse', v: 'nurse' },
  { n: 'office', v: 'office' },
  { n: 'pervmom', v: 'pervmom' },
  { n: 'pornstar', v: 'pornstar' },
  { n: 'pppd', v: 'pppd' },
  { n: 'public', v: 'public' },
  { n: 'school', v: 'school' },
  { n: 'schoolgirl', v: 'schoolgirl' },
  { n: 'squirt', v: 'squirt' },
  { n: 'ssis', v: 'ssis' },
  { n: 'ssni', v: 'ssni' },
  { n: 'stepmom', v: 'stepmom' },
  { n: 'stockings', v: 'stockings' },
  { n: 'teacher porn', v: 'teacher-porn' },
  { n: 'teen porn', v: 'teen-porn' },
  { n: 'thai', v: 'thai' },
  { n: 'tushy', v: 'tushy' },
  { n: 'uncensored', v: 'uncensored' },
  { n: 'vixen', v: 'vixen' },
  { n: 'wife', v: 'wife' },
  { n: 'woodmancastingx', v: 'woodmancastingx' },
];

// 筛选卡片: 每个顶级分类下挂全部 66 个标签 (子分类), 不平铺
const FILTERS = {};
for (const c of CLASSES) FILTERS[c.type_id] = [{ key: 'sub', name: '标签', value: TAGS }];

function t(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, d) => { const c = parseInt(d, 10); return (c > 0 && c < 0x110000) ? String.fromCodePoint(c) : m; })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { const c = parseInt(h, 16); return (c > 0 && c < 0x110000) ? String.fromCodePoint(c) : m; });
}

function cleanText(s) {
  return decodeHtml(t(String(s || '').replace(/<[^>]*>/g, ' ')));
}

async function getHtml(url, headers, timeoutMs) {
  try {
    const r = await $fetch.get(url, {
      headers: Object.assign({ 'User-Agent': UA, 'Referer': HOST + '/' }, headers || {}),
      timeout: timeoutMs || 15000,
      });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

async function postForm(url, fields, headers, timeoutMs) {
  const body = Object.keys(fields || {}).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(fields[k])).join('&');
  try {
    const r = await $fetch.post(url, body, {
      headers: Object.assign({
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      }, headers || {}),
      timeout: timeoutMs || 15000,
      });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

// 列表解析: <a href="/watch/<id>"> 卡片, 内含 img 封面与标题文本
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a[^>]*href="\/watch\/([A-Za-z0-9]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (!id || seen.has(id)) continue;
    const body = m[2] || '';
    const title = cleanText(body);
    if (!title) continue;
    const im = body.match(/<img[^>]+src="([^"]+)"/i);
    const cm = title.match(/([A-Za-z]{2,10}-?\d{3,8}[A-Za-z]?)/);
    seen.add(id);
    out.push({
      vod_id: HOST + '/watch/' + id,
      vod_name: title,
      vod_pic: im ? im[1] : '',
      vod_remarks: cm ? cm[1] : '',
    });
  }
  return out;
}

function normLabel(s) {
  let l = t(s).toLowerCase();
  if (/^\d+$/.test(l)) l += 'p';
  return l;
}

function resNum(label) {
  const m = String(label || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// 播放链解析缓存: 详情已跑过链, 点播直接复用, 不重跑 4 步 (见文件头定性)。
// TTL 10 分钟 (签名 URL 有效期约 2 天); 与字幕层同款模块级 Map。
const RESOLVE_TTL = 10 * 60 * 1000;
const resolveCache = new Map(); // watchId -> { ts, chain }

// 播放链现解: POST hash-javheo -> iframe v1 -> convert 页 -> Artplayer quality[]
// 返回 { qualities: [{ label, url }] (分辨率降序), defaultLabel, convertUrl }
async function resolvePlay(watchId, durl) {
  const empty = { qualities: [], defaultLabel: '', convertUrl: '' };
  if (!watchId) return empty;
  const cached = resolveCache.get(watchId);
  if (cached && Date.now() - cached.ts < RESOLVE_TTL && cached.chain.qualities.length) {
    return cached.chain;
  }
  // hash POST 曾在 VM 侧超时 abort 过一次 (上一轮 720p 空 url), 失败重试一次
  let embedHtml = '';
  for (let attempt = 0; attempt < 2 && !embedHtml; attempt++) {
    embedHtml = await postForm(HOST + '/hash-javheo',
      { mix: 'moviesiframe2', num: watchId }, { 'Referer': durl }, 15000);
  }
  if (!embedHtml) return empty;
  const im = embedHtml.match(/<iframe[^>]+src="(https?:\/\/javheo-com\.ibhan2\.top\/iframe\/v1\/[^"]+)"/i);
  if (!im) return empty;
  const iframeUrl = im[1];
  const v1Html = await getHtml(iframeUrl, { 'Referer': durl }, 15000);
  if (!v1Html) return empty;
  // convert 地址在 v1 页 JS 里是绝对地址 (src=\"https://javheo-com.ibhan2.top/iframe/convert/v1/...\"),
  // /iframe 前是域名不是引号, 不能要求引号紧贴 /iframe; 尾部 \" 的反斜杠也要排除
  const cm = v1Html.match(/https?:\/\/javheo-com\.ibhan2\.top(\/iframe\/convert\/v1\/[^"'\\\s]+)/i)
    || v1Html.match(/["'](\/iframe\/convert\/v1\/[^"'\\\s]+)["']/i);
  if (!cm) return empty;
  const convertUrl = IFRAME_HOST + cm[1];
  const convHtml = await getHtml(convertUrl, { 'Referer': iframeUrl }, 15000);
  if (!convHtml) return empty;
  const qualities = [];
  const re = /\{\s*(?:default:\s*true,\s*)?html:\s*'([^']+)'\s*,\s*url:\s*'([^']+)'/g;
  let qm;
  while ((qm = re.exec(convHtml)) !== null) {
    const label = normLabel(qm[1]);
    if (label && qm[2] && !qualities.some((q) => q.label === label)) {
      qualities.push({ label, url: qm[2] });
    }
  }
  const dm = convHtml.match(/default:\s*true,\s*html:\s*'([^']+)'/);
  const defaultLabel = dm ? normLabel(dm[1]) : (qualities.length ? qualities[qualities.length - 1].label : '');
  // 档位一律最高在前、依次递减 (只列 convert 页实给的档, 不编造)
  qualities.sort((a, b) => resNum(b.label) - resNum(a.label));
  const chain = { qualities, defaultLabel, convertUrl };
  if (qualities.length) {
    resolveCache.set(watchId, { ts: Date.now(), chain });
    if (resolveCache.size > 200) resolveCache.delete(resolveCache.keys().next().value);
  }
  return chain;
}

async function home() {
  const html = await getHtml(HOST + '/');
  return { class: CLASSES, filters: FILTERS, list: parseList(html).slice(0, 30) };
}

async function tagPage(tag, page) {
  // 标签分类页单页 50 条、无翻页: p>1 直接空
  if (page > 1) return { page, pagecount: 1, limit: 50, total: 50, list: [] };
  const html = await getHtml(HOST + '/porn/' + tag.v + '/');
  const list = parseList(html);
  return { page, pagecount: 1, limit: list.length || 50, total: list.length, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'latest');
  const extend = body.filters || body.extend || {};
  const sub = t(extend.sub || '');
  // 筛选卡片值本身定路径 (与当前顶级无关, av77/123AV 同款)
  const tag = TAGS.find((x) => x.v === sub);
  if (tag) return tagPage(tag, page);
  // 顶级标签分类: /porn/<tag>/ 单页
  const cat = CLASSES.find((c) => c.type_id === id && c.type_id !== 'latest');
  if (cat) {
    const ctag = TAGS.find((x) => x.v === cat.type_id);
    if (ctag) return tagPage(ctag, page);
  }
  const url = page <= 1 ? HOST + '/' : HOST + '/page/' + page + '/';
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 80,
    total: 999 * 80,
    list,
  };
}

// 搜索走站内搜索框同款: /porn/<slug>/ (空格转 -、去非 alnum、小写)
function slugifyQuery(wd) {
  let s = t(wd).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
  s = s.toLowerCase().replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}

async function catSearch(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const slug = slugifyQuery(wd);
  if (!slug) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  if (page > 1) return { page, pagecount: 1, limit: 50, total: 50, list: [] };
  const html = await getHtml(HOST + '/porn/' + slug + '/');
  const list = parseList(html);
  return { page, pagecount: 1, limit: list.length || 50, total: list.length, list };
}

function watchIdOf(durl) {
  const m = String(durl || '').match(/\/watch\/([A-Za-z0-9]+)/i);
  return m ? m[1] : '';
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let durl = t(raw);
  if (!durl) return { list: [] };
  if (!/^https?:\/\//i.test(durl)) durl = HOST + durl;
  const watchId = watchIdOf(durl);
  const html = await getHtml(durl);
  if (!html) return { list: [] };

  let name = '';
  const tm = html.match(/<title>([^<]*)<\/title>/i);
  if (tm) {
    name = cleanText(tm[1]).replace(/\s*-\s*Watch JAV.*$/i, '').replace(/\s*-\s*JavHeo.*$/i, '').trim();
  }
  let pic = '';
  const ogm = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogm) pic = ogm[1];
  if (!pic) {
    const im = html.match(/<img[^>]+src="(https:\/\/cdn-img\.ibhan2\.top[^"]+)"/i);
    if (im) pic = im[1];
  }

  // 详情现解档位 (降序, 1080p 在前); 失败则留一条 正片 线, play() 里现解
  let lines = [];
  const chain = await resolvePlay(watchId, durl);
  if (chain.qualities.length) {
    lines = chain.qualities.map((q) => q.label + '$heo:' + watchId + ':' + q.label);
  }
  if (!lines.length) lines = ['正片$heo:' + watchId + ':auto'];

  const vod = {
    vod_id: durl,
    vod_name: name || watchId,
    vod_pic: pic,
    vod_play_from: NAME,
    vod_play_url: lines.join('#'),
  };
    return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const m = id.match(/^heo:([A-Za-z0-9]+):(.+)$/);
  if (!m) return { parse: 0, url: '' };
  const watchId = m[1];
  const want = m[2];
  const durl = HOST + '/watch/' + watchId;

  // 现解 (签名 URL 含 expires/srcIp, 不复用详情时地址; 详情已解过则走缓存)
  const chain = await resolvePlay(watchId, durl);
  if (!chain.qualities.length) return { parse: 0, url: '' };
  let hit = null;
  if (want && want !== 'auto') hit = chain.qualities.filter((q) => q.label === want)[0];
  // 未点名档位 (正片线) 或档位失配时给最高档, 不给站方默认 720p
  if (!hit) hit = chain.qualities[0];
    return {
    parse: 0,
    url: hit.url,
    header: { 'User-Agent': UA, 'Referer': chain.convertUrl || durl },
  };
}

// ---------------- 字幕聚合 (Layer A 铺开, 2026-10-23) ----------------
// 与 bestjavporn 试点同一实现 (提交 9c339419, 用户真机确认
// MiraPlayer 可加载并选择字幕): 点播时按片名/番号并行搜迅雷看看
// oracle (首档; 「迅雷」与「迅雷看看」实为同一接口) + SubtitleCat
// (第二档), 合并排序 = 来源档位 -> 语言 (简中>繁中>双语>英文>
// 其他) -> 番号命中 -> 热度, 只收 .srt/.vtt/.ass/.ssa 直链, 上限
// 10 条, 以 TVBox 标准 subs:[{name,url,format}] 挂到 play 结果。
// 总预算 6s、单请求 4~5s、全程框架 req (NOFETCH 安全)、结果缓存
// 10 分钟 (空结果不缓存); 无命中时不带 subs 键, play 返回与接入
// 前逐字段一致。SubHD (下载被站方门控) 与射手 (源站 522) 不接入。


// subHttp: 与试点 reqRaw 同语义 (状态码不抛错、仅 2xx 给正文、
// 文本恒等变换防自动 JSON 解析), 底层框架 req。

// play 入参归一: 个别 App 会把 "集名$播放id" 整段传回, 集名短且
// 不含 {/http 时剥掉前缀, 与 detail 登记的 episode id 对齐。

// detail 侧登记: 片名按 [detail 入参 id, vod_id, 每个 episode 的
// 播放 id] 多键写入 subNameCache, 并以首个 episode id 预热搜索。

// play 侧挂载: 仅当结果带非空 url 且字幕有命中时才加 subs 键。

// ---------------- 字幕聚合 (Layer A 重写, 2026-10-23) ----------------
// 按用户自有迅雷看看 REX 组件 (xunlei.subtitle) 的方法重写: 旧版把
// [番号, 全标题, 番号+标题] 多个键的召回合并成一池只排序不过滤,
// 全标题键的模糊召回灌进大量别片字幕 (实测 JUR-887 全标题键池
// 前排即 JUX-021 等别片), 且迅雷档位恒占满上限 10, SubtitleCat
// 永远挤不进来。新版三招 (与组件一致):
// (a) 键序逐个查、首个有结果的键即停 — 番号键命中的池小而准;
// (b) 命中后严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可)
//     或片名全文, 不含的全扔, 无回退 (组件原法的回退宽松名单
//     在冷门番号上会把邻近番号的模糊池整池放行, 实测有害已删;
//     乱码单字键亦实测能召回无关字幕, 同样靠严过滤挡下);
// (c) 组件打分: cid_match 100000、含番号 +25000, 再加 oracle 自
//     带 score / fingerprintScore / 下载量, 按名+址去重取 top。
// 槽位 (用户钦定): 迅雷 (键序 [番号, 紧凑番号]) > 迅雷看看
// (组件完整键序 [番号, 紧凑番号, 番号+标题, 紧凑番号+标题,
// 全标题]) > SubtitleCat; 两迅雷槽同走同一 oracle 接口、不管
// 重不重复, 合并按 URL 去重、同条归高档位。合并序 = 档位 ->
// 语言 (简中>繁中>双语>英文>日文>其他, 沿用 subLangOf 口径)
// -> 分数; 全局上限 10、单槽软上限 8 (SubtitleCat 留位)。
// 全程 subHttp (框架 req 主栈), 迅雷系逐请求超时 3s、键序串行
// 首中即停; 总预算 6s、失败全静默; 无结果时 play 返回对象不带
// subs 键, 与未接入前逐字段一致。SubHD (下载被站方门控) 与
// 射手 (源站 522) 仍不接入。
   // durl -> 片名 (detail 时 best-effort 写入)
 // durl -> {ts, subs}



// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)

// 搜索上下文: 片名、番号、紧凑番号、标题部分 (去番号与噪声词)

// 迅雷槽键序: 只番号两键 (锚定)

// 迅雷看看槽键序: 组件完整键序 (番号、紧凑番号、番号+标题、
// 紧凑番号+标题、全标题), 逐个查、首中即停。

// 严过滤的匹配文本 (组件口径: 片名 + 上下文, 全小写与去分隔符两形)

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 其他)


// 文本字幕格式判定: 文件名扩展名 > 条目 ext 字段 > url 后缀;
// 压缩包一律剔除 (与组件 getExt 口径一致, 只认 srt/vtt/ass/ssa)。

// 裸哈希名不可读: 显示名换成番号字幕 (匹配/过滤仍用原名)

// oracle 单键查询 (同趟搜索内按键缓存, 两槽共用, 不重复发请求)

// oracle 条目归一 (组件 normalizeResult 的字段口径)

// 严过滤 (组件口径): 条目 name/langs/ext 须含番号 (原形或宽松
// 形) 或片名全文, 否则扔掉。片名分支必须守非空: 个别蜘蛛的
// 播放 id 与 detail 登记键对不上时片名缓存会落空 (title=''),
// 空串是任何字符串的子串, 不守就会全池放行 (bigbuttshub 实测
// 教训: 假番号 EMPTY-24 搜出的 Sherlock 剧集字幕整页漏入)。

// 组件打分 (scoreItem 的电影路径): cid_match 100000、含番号
// +25000、oracle 自带 score/fingerprintScore、下载量、时长/大小。

// 迅雷系槽位 (迅雷 tier 0 / 迅雷看看 tier 1): 键序逐个查、首个
// 有结果的键即停; 命中池只过严过滤、无任何回退 — 组件原法的
// 「过滤到空回退宽松名单」在冷门番号上实测有害 (oracle 对无精
// 确字幕的番号返回邻近番号的模糊池, 回退等于整池垃圾放行:
// MOGK-006 挂上 MOGK-004/002、FC2-PPV-4991508 挂上他人番号),
// 与「宁缺毋滥」冲突, 故删除 (与 REX 版相关性闸门口径一致)。

// SubtitleCat 槽 (tier 2): 沿用旧芯搜索/解析 (按番号键搜、逐页
// 取按语言分的直链), 同样过严过滤 (无回退)。

// 合并: 档位 -> 语言 -> 分数; 按 URL 去重 (同条归先到高档位);
// 全局上限 10、单槽软上限 8 (给 SubtitleCat 留位)。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。
// 去重键用秒（2026-11-02 名字+时长口径）：毫秒值 >100000 除 1000；
// 无时长记 nodur（沿用名字去重）；同名同时长才算重复。

 // durl -> Promise<subs> (detail 预热与 play 共用同一趟)


// detail 入口即预热 (不 await): 慢出口下单趟搜索可达数秒, 让它
// 与详情页的铸造链并行跑, 用户点播时 play 直接命中缓存/在途。

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
    return jsonify({ ver: 1, title: 'JavHeo', site: HOST, tabs });
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
