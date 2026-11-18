// 麻豆AI (https://madouai.xyz / https://2048ai.xyz) -> CatPawOpen spider
// Vue SPA + JSON API: 列表 /api/v1/videos, 搜索 /api/v1/videos/search, 详情 /api/v1/videos/{id}
// 播放走站方 m3u8 代理 /api/v1/m3u8/proxy?path= ; 封面走 /api/v1/image/proxy?path=
// 单档 (清单无多码率变体), 不编造清晰度
//
// 2026-11-11 实测结论 (见 madouai_audit):
// 1) spg/ 前缀的视频站方已死: m3u8 代理约半数回 502, 回 200 的分片也全是 403
//    (cdn 拒绝, 换 Referer/换 2048ai.xyz 代理/直连源站均 403; 站方前端 videoPlayback.js
//    用的就是同一代理地址, 故站方自己也播不了 spg/, 不是蜘蛛写法问题)。
//    其余 15 个前缀 (jpd/jpc/jpb/spf/jpe/jpg/spb/spc/spa/spe/bzc/mmc/mib/lfa/jh)
//    分片全部 200 可播。蜘蛛因此过滤掉 spg/ 条目 (列表/搜索不显示, 详情不给播放地址),
//    只剩可播的; AV-中文字幕 / AV-无码流出每页只剩约 7-8 条 (其余是死 spg/), 这是站方
//    片源死了, 不是分类空了。
// 2) 封面: 图片代理支持 size 参数 (X-Image-Size: original/small/thumbnail/medium)。
//    默认 original 是原图 (PNG 2-5MB, GIF 动图 9-16MB, 加载 3-13 秒, 手机上常超时空白)。
//    改要 size=medium (800x450 JPEG, 约 80-150KB), 封面加载大幅提速; 91大神与麻豆原创AI
//    的慢封面/空白封面即由此修好。

const KEY = 'py_madouai';
const NAME = '麻豆AI';
const HOST = 'https://madouai.xyz';
const HOST2 = 'https://2048ai.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 2026-11-19 三腿取 JSON：用户手机直连 madouai.xyz/2048ai.xyz 失败（VM 全通）；site-fetch Worker 腿（JSON 以文本回传）→ 直连两域，首个可解析 JSON 胜出。
const SITE_FETCH = 'https://site-fetch.li768435813.workers.dev';
function parseJsonLoose(data) {
  const s = typeof data === 'string' ? data : (data == null ? '' : JSON.stringify(data));
  if (!s) return null;
  try { const j = JSON.parse(s); return (j && typeof j === 'object') ? j : null; } catch (e) {}
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { const j = JSON.parse(s.slice(a, b + 1)); return (j && typeof j === 'object') ? j : null; } catch (e2) {} }
  return null;
}

// 分类: 最近更新(无 categoryId, 默认最新在前) + 23 个视频子分类 (GET /api/v1/categories?type=video 实测)
// 注意: 前端 3 个菜单组 (原创精选/国产视频/中文AV) 只是导航分组, API 不认 menuId 参数,
// 无法按菜单组取列表, 故不单列菜单组分类, 子分类本身已按 menuId 归属, 浏览子分类即可覆盖
const CLASSES = [
  { type_id: 'latest', type_name: '最近更新' },
  { type_id: 'cat:1', type_name: '国产自拍' },
  { type_id: 'cat:2', type_name: 'AV - 中文字幕' },
  { type_id: 'cat:8', type_name: 'AV - 无码流出' },
  { type_id: 'cat:21', type_name: '反差母狗' },
  { type_id: 'cat:27', type_name: '每日更新' },
  { type_id: 'cat:4', type_name: '探花大神' },
  { type_id: 'cat:7', type_name: '91大神' },
  { type_id: 'cat:10', type_name: '麻豆x性吧联合原创' },
  { type_id: 'cat:13', type_name: '清纯少女' },
  { type_id: 'cat:6', type_name: '麻豆原创AI' },
  { type_id: 'cat:20', type_name: '破解偷拍' },
  { type_id: 'cat:14', type_name: '重口调教' },
  { type_id: 'cat:19', type_name: '黑料吃瓜' },
  { type_id: 'cat:28', type_name: '世界杯专栏' },
  { type_id: 'cat:15', type_name: '直播大秀' },
  { type_id: 'cat:22', type_name: '白虎嫩妹' },
  { type_id: 'cat:9', type_name: '麻豆传媒' },
  { type_id: 'cat:16', type_name: '网红主播' },
  { type_id: 'cat:23', type_name: '家庭乱伦' },
  { type_id: 'cat:17', type_name: '媚黑母狗' },
  { type_id: 'cat:24', type_name: '熟女偷情' },
  { type_id: 'cat:18', type_name: '白虎少女' },
  { type_id: 'cat:25', type_name: '网黄原创' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/media/',
  };
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

/** JSON 取数: 先 site-fetch Worker 腿（两域）, 再直连两域, 再失败走 fetch 兜底 (App 内无全局 fetch, 用 typeof 守卫) */
async function apiGet(path) {
  const hosts = [HOST, HOST2];
  for (const h of hosts) {
    try {
      const r = await $fetch.get(SITE_FETCH + '/?u=' + encodeURIComponent(h + path), { headers: headers(), timeout: 12000 });
      if (r && r.status === 200) {
        const j = parseJsonLoose(r.data);
        if (j) return j;
      }
    } catch (e) { /* try next leg */ }
  }
  for (const h of hosts) {
    try {
      const { data } = await $fetch.get(h + path, { headers: headers(), timeout: 20000 });
      if (data == null) continue;
      if (typeof data === 'string') {
        try { return JSON.parse(data); } catch (e) { continue; }
      }
      return data;
    } catch (e) { /* try next host */ }
  }
  if (typeof fetch !== 'undefined') {
    for (const h of hosts) {
      try {
        const r = await fetch(h + path, { headers: headers() });
        if (!r || !r.ok) continue;
        return await r.json();
      } catch (e) { /* try next host */ }
    }
  }
  return null;
}

/** 封面地址: 列表 API 已给 /api/v1/image/proxy?path=... 直接拼主域;
    搜索 API 给裸路径 image/... 直接取会 404, 须包一层图片代理。
    一律加 size=medium (800x450 JPEG, 约 80-150KB): 默认 original 是原图
    (PNG 2-5MB、GIF 动图 9-16MB), 手机上加载极慢或超时空白。 */
function coverUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  let url;
  if (u.indexOf('/api/v1/image/proxy') === 0) url = HOST + u;
  else if (u.charAt(0) === '/') url = HOST + '/api/v1/image/proxy?path=' + encodeURIComponent(u.slice(1));
  else url = HOST + '/api/v1/image/proxy?path=' + encodeURIComponent(u);
  if (url.indexOf('size=') === -1) url += '&size=medium';
  return url;
}

/** spg/ 前缀的视频站方分片已死 (全 403, 约半数清单还 502), 播不了, 直接过滤 */
function isPlayable(videoUrl) {
  videoUrl = t(videoUrl);
  if (!videoUrl) return false;
  if (/^https?:\/\//i.test(videoUrl)) return true;
  return videoUrl.indexOf('spg/') !== 0;
}

/** 播放地址: .m3u8 相对路径走站方 m3u8 代理 (直接拼主域取回的是 SPA 空壳);
    .mp4 直接用原地址 */
function playUrl(videoUrl) {
  videoUrl = t(videoUrl);
  if (!videoUrl) return '';
  if (/^https?:\/\//i.test(videoUrl)) return videoUrl;
  if (/\.m3u8(\?|$)/i.test(videoUrl)) {
    return HOST + '/api/v1/m3u8/proxy?path=' + encodeURIComponent(videoUrl);
  }
  if (videoUrl.charAt(0) === '/') return HOST + videoUrl;
  return HOST + '/' + videoUrl;
}

function fmtDur(sec) {
  sec = parseInt(sec, 10);
  if (!sec || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = (h > 0 ? String(m) : String(m));
  const ss = s < 10 ? '0' + s : String(s);
  if (h > 0) return h + ':' + (m < 10 ? '0' + m : m) + ':' + ss;
  return mm + ':' + ss;
}

function toVod(it) {
  if (!it || it.id == null) return null;
  if (!isPlayable(it.videoUrl)) return null; // spg/ 站方已死, 不显示 (点开也播不了)
  const dur = fmtDur(it.durationSec);
  const remarks = [dur, it.categoryName].filter(Boolean).join(' · ');
  return {
    vod_id: String(it.id),
    vod_name: t(it.title) || ('视频 ' + it.id),
    vod_pic: coverUrl(it.coverUrl),
    vod_remarks: remarks,
  };
}

function parseListData(json) {
  if (!json) return { items: [], total: 0, totalPages: 1 };
  const data = json.data || json;
  const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
  const total = parseInt(data.total, 10) || items.length;
  const totalPages = parseInt(data.totalPages, 10) || 1;
  return { items, total, totalPages };
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'latest');
  const size = 30;
  let path;
  if (id === 'latest' || id === '' || id === 'home') {
    path = '/api/v1/videos?page=' + page + '&size=' + size;
  } else if (id.indexOf('cat:') === 0) {
    path = '/api/v1/videos?categoryId=' + encodeURIComponent(id.slice(4)) + '&page=' + page + '&size=' + size;
  } else {
    // 兼容直接传数字分类 id
    path = '/api/v1/videos?categoryId=' + encodeURIComponent(id) + '&page=' + page + '&size=' + size;
  }
  const json = await apiGet(path);
  const { items, total, totalPages } = parseListData(json);
  const list = [];
  for (const it of items) {
    const v = toVod(it);
    if (v) list.push(v);
  }
  return {
    page,
    pagecount: totalPages,
    limit: list.length || size,
    total,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const vid = String(raw || '').match(/(\d+)/)?.[1] || '';
  if (!vid) return { list: [] };

  const json = await apiGet('/api/v1/videos/' + vid);
  const it = json ? (json.data || json) : null;
  if (!it || it.id == null) return { list: [] };

  // spg/ 站方片源已死 (分片全 403): 不给播放地址, 避免点开无限转圈; 备注明示
  if (!isPlayable(it.videoUrl)) {
    return {
      list: [{
        vod_id: String(it.id),
        vod_name: t(it.title) || ('视频 ' + it.id),
        vod_pic: coverUrl(it.coverUrl),
        vod_content: t(it.description),
        vod_remarks: [fmtDur(it.durationSec), it.categoryName, '片源失效'].filter(Boolean).join(' · '),
        vod_play_from: NAME,
        vod_play_url: '',
      }],
    };
  }
  const url = playUrl(it.videoUrl);
  const eps = url ? ['播放$' + url] : [];
  // 字幕：播放地址无番号，必须按标题登记；后台预热（不 await）
  if (url) {
                  }
  return {
    list: [{
      vod_id: String(it.id),
      vod_name: t(it.title) || ('视频 ' + it.id),
      vod_pic: coverUrl(it.coverUrl),
      vod_content: t(it.description),
      vod_remarks: [fmtDur(it.durationSec), it.categoryName].filter(Boolean).join(' · '),
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const url = String(body.id || '');
  // 字幕：detail 预热过则命中缓存/在途；无命中不带 subs 键
    const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/media/' },
  };
    return result;
}

async function catSearch(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const size = 30;
  const json = await apiGet('/api/v1/videos/search?q=' + encodeURIComponent(wd) + '&page=' + page + '&size=' + size);
  const { items, total, totalPages } = parseListData(json);
  const list = [];
  for (const it of items) {
    const v = toVod(it);
    if (v) list.push(v);
  }
  return {
    page,
    pagecount: totalPages,
    limit: list.length || size,
    total,
    list,
  };
}

// ---------- 字幕聚合 companion helpers（core 本身不含，见 /tmp/sp_py_javtiful.js） ----------
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
    return jsonify({ ver: 1, title: '麻豆AI', site: HOST, tabs });
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
