// 悟空传媒 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/wukong.js
// 悟空传媒 (https://qcfit2u1.chuanqi74.sbs) -> CatPawOpen spider
// MacCMS 站: /play/<id>.html 详情页 -> /v-p/<id>-<线>-1.html 播放页, player_data JSON 直给 m3u8 (encrypt:0, trysee:0, 无 VIP 墙)
// 注意: 站前有一道门 (gate 页, 空标题 + #xkEnter 按钮): 首次 GET 只回 5KB gate 页, JS 里含 var token='...',
// 设 Cookie xk_gate=<token> 再 GET 才能看到真站; token 每次取 gate 页时刷新, 有效 24 小时。getHtml 内自动过门,
// cookie 缓存在模块变量 gateCookie, 失效 (再次命中 gate 页) 时重新取 token。切勿请求站内统计像素 (wkyl188.shoujiduoduo.cc)。
// 单档: 每片只有一条 m3u8 (直出 media playlist, 无 STREAM-INF 变体; 个别是单变体 master, 如 852x480 一档),
// 站方只给一条流, 无分辨率可选, 不编档位; 每片通常只有 1 条播放线 (HD高清1线, 少数只有 2线), 详情现解每条线的直链。
// 分片是 .jpg 后缀伪装的 TS (个别 AES-128), iOS 原生 HLS 可播; m3u8 直取无需 Referer; 封面直链无防盗链。
// 分类: 首页最新 + 4 个排行 + 40 个视频分类 + 88 个标签 (标签名与分类重名 9 个, 故标签类名前加 “标签·” 区分)。
// 小说图片 8 个是文章/图片类 (无视频), 不进分类。
// 分类页: /vod/<id>.html (第1页), /vod/<id>-<N>.html (翻页); 标签: /tag/<id>.html, /tag/<id>-<N>.html;
// 排行: /label/rank.html (总浏览) /rankweek.html (周) /rankmonth.html (月) /rankscore.html (评分), 均单页;
// 搜索: /sou/-.html?wd=<关键词> (第1页), /sou/<关键词>-<N>.html (翻页)。
// 翻页 (2026-11-11 修): 分类/标签/搜索的真实总页数取自分页器“共X条，Y/Z页” (parsePager)，
// 首页最新与 4 个排行单页、无分页器，pagecount 固定为 1（旧版 p1 误报 999，App 翻到空页报无法加载更多）；
// 小分类超尾页回空列表、大分类（1000 页）超尾页会重复回尾页内容，故必须用真实 pagecount 让 App 停在尾页。
const KEY = 'py_wukong';
const NAME = '悟空传媒';
// 域名可能随跳转门轮换, 改这里一处即可; 不要猜备用域名
const HOST = 'https://qcfit2u1.chuanqi74.sbs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// gate cookie 缓存 (模块常驻, 跨调用复用; 有效 24 小时)
let gateCookie = '';

const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'rank', type_name: '排行榜' },
  { type_id: 'rankweek', type_name: '周排行' },
  { type_id: 'rankmonth', type_name: '月排行' },
  { type_id: 'rankscore', type_name: '高分排行' },
  { type_id: '1', type_name: '国产' },
  { type_id: '6', type_name: '自拍' },
  { type_id: '8', type_name: '强奸' },
  { type_id: '9', type_name: '传媒' },
  { type_id: '12', type_name: '偷拍' },
  { type_id: '2', type_name: '网红' },
  { type_id: '3', type_name: '萝莉' },
  { type_id: '14', type_name: '吃瓜' },
  { type_id: '16', type_name: '人兽' },
  { type_id: '5', type_name: '探花' },
  { type_id: '4', type_name: '大秀' },
  { type_id: '17', type_name: '人妖' },
  { type_id: '20', type_name: '喷水' },
  { type_id: '22', type_name: '性虐' },
  { type_id: '24', type_name: '无码' },
  { type_id: '26', type_name: '欧美' },
  { type_id: '27', type_name: '动漫' },
  { type_id: '41', type_name: 'Cosplay' },
  { type_id: '18', type_name: 'OnlyFans' },
  { type_id: '10', type_name: '反差婊' },
  { type_id: '15', type_name: '大学生' },
  { type_id: '11', type_name: '网爆门' },
  { type_id: '13', type_name: '福利姬' },
  { type_id: '38', type_name: '瑜伽裤' },
  { type_id: '40', type_name: '多人群P' },
  { type_id: '23', type_name: 'AI换脸' },
  { type_id: '28', type_name: '三级片' },
  { type_id: '29', type_name: 'AV解说' },
  { type_id: '25', type_name: '中文字幕' },
  { type_id: '39', type_name: '兽耳系列' },
  { type_id: '37', type_name: '学生下海' },
  { type_id: '36', type_name: '淫荡儿媳' },
  { type_id: '35', type_name: '夫妻交换' },
  { type_id: '34', type_name: '野外车震' },
  { type_id: '33', type_name: '猛干嫂子' },
  { type_id: '32', type_name: '狂操小姨' },
  { type_id: '31', type_name: '禁忌母子' },
  { type_id: '30', type_name: '兄弟姐妹' },
  { type_id: '7', type_name: '家族乱伦' },
  { type_id: '50', type_name: '魔改AI短剧' },
  { type_id: 'tag239', type_name: '标签·骚' },
  { type_id: 'tag971', type_name: '标签·极品' },
  { type_id: 'tag14', type_name: '标签·内射' },
  { type_id: 'tag131', type_name: '标签·巨乳' },
  { type_id: 'tag233', type_name: '标签·高潮' },
  { type_id: 'tag990', type_name: '标签·爆操' },
  { type_id: 'tag162', type_name: '标签·诱惑' },
  { type_id: 'tag126', type_name: '标签·人妻' },
  { type_id: 'tag973', type_name: '标签·女神' },
  { type_id: 'tag217', type_name: '标签·流出' },
  { type_id: 'tag194', type_name: '标签·自慰' },
  { type_id: 'tag15', type_name: '标签·中出' },
  { type_id: 'tag165', type_name: '标签·调教' },
  { type_id: 'tag794', type_name: '标签·美少女' },
  { type_id: 'tag1015', type_name: '标签·乱伦' },
  { type_id: 'tag243', type_name: '标签·反差' },
  { type_id: 'tag136', type_name: '标签·黑丝' },
  { type_id: 'tag245', type_name: '标签·清纯' },
  { type_id: 'tag3', type_name: '标签·无码' },
  { type_id: 'tag996', type_name: '标签·母狗' },
  { type_id: 'tag976', type_name: '标签·网红' },
  { type_id: 'tag252', type_name: '标签·酒店' },
  { type_id: 'tag218', type_name: '标签·泄密' },
  { type_id: 'tag125', type_name: '标签·少妇' },
  { type_id: 'tag12', type_name: '标签·口交' },
  { type_id: 'tag987', type_name: '标签·无套' },
  { type_id: 'tag75', type_name: '标签·后入' },
  { type_id: 'tag1450', type_name: '标签·抽插' },
  { type_id: 'tag207', type_name: '标签·露脸' },
  { type_id: 'tag278', type_name: '标签·自拍' },
  { type_id: 'tag450', type_name: '标签·中出し' },
  { type_id: 'tag970', type_name: '标签·高颜值' },
  { type_id: 'tag396', type_name: '标签·OL' },
  { type_id: 'tag240', type_name: '标签·骚货' },
  { type_id: 'tag140', type_name: '标签·制服' },
  { type_id: 'tag118', type_name: '标签·探花' },
  { type_id: 'tag76', type_name: '标签·骑乘' },
  { type_id: 'tag273', type_name: '标签·字幕' },
  { type_id: 'tag948', type_name: '标签·中文' },
  { type_id: 'tag957', type_name: '标签·福利' },
  { type_id: 'tag226', type_name: '标签·白虎' },
  { type_id: 'tag119', type_name: '标签·约炮' },
  { type_id: 'tag489', type_name: '标签·偷拍' },
  { type_id: 'tag1212', type_name: '标签·情趣' },
  { type_id: 'tag2', type_name: '标签·中文字幕' },
  { type_id: 'tag968', type_name: '标签·私拍' },
  { type_id: 'tag964', type_name: '标签·曝光' },
  { type_id: 'tag160', type_name: '标签·偷情' },
  { type_id: 'tag7', type_name: '标签·破解' },
  { type_id: 'tag231', type_name: '标签·喷水' },
  { type_id: 'tag1455', type_name: '标签·狂操' },
  { type_id: 'tag163', type_name: '标签·勾引' },
  { type_id: 'tag129', type_name: '标签·御姐' },
  { type_id: 'tag90', type_name: '标签·直播' },
  { type_id: 'tag994', type_name: '标签·大奶' },
  { type_id: 'tag222', type_name: '标签·合集' },
  { type_id: 'tag71', type_name: '标签·深喉' },
  { type_id: 'tag19', type_name: '标签·3P' },
  { type_id: 'tag512', type_name: '标签·淫乱' },
  { type_id: 'tag228', type_name: '标签·粉嫩' },
  { type_id: 'tag980', type_name: '标签·抖音' },
  { type_id: 'tag135', type_name: '标签·长腿' },
  { type_id: 'tag1499', type_name: '标签·淫水' },
  { type_id: 'tag132', type_name: '标签·爆乳' },
  { type_id: 'tag282', type_name: '标签·素人' },
  { type_id: 'tag978', type_name: '标签·主播' },
  { type_id: 'tag998', type_name: '标签·尤物' },
  { type_id: 'tag124', type_name: '标签·学生妹' },
  { type_id: 'tag238', type_name: '标签·饥渴' },
  { type_id: 'tag244', type_name: '标签·反差婊' },
  { type_id: 'tag133', type_name: '标签·美乳' },
  { type_id: 'tag1003', type_name: '标签·大学生' },
  { type_id: 'tag8', type_name: '标签·高清' },
  { type_id: 'tag60', type_name: '标签·按摩' },
  { type_id: 'tag13', type_name: '标签·颜射' },
  { type_id: 'tag974', type_name: '标签·嫩妹' },
  { type_id: 'tag128', type_name: '标签·熟女' },
  { type_id: 'tag1501', type_name: '标签·精液' },
  { type_id: 'tag410', type_name: '标签·CA' },
  { type_id: 'tag446', type_name: '标签·丝袜' },
  { type_id: 'tag37', type_name: '标签·痴女' },
  { type_id: 'tag70', type_name: '标签·口爆' },
  { type_id: 'tag235', type_name: '标签·浪叫' },
  { type_id: 'tag237', type_name: '标签·主动' },
  { type_id: 'tag387', type_name: '标签·眼镜' },
  { type_id: 'tag610', type_name: '标签·系列' },
  { type_id: 'tag183', type_name: '标签·双飞' },
  { type_id: 'tag1814', type_name: '标签·角' },
];

function headers() {
  const h = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
  if (gateCookie) h['Cookie'] = gateCookie;
  return h;
}

function isGatePage(html) {
  return !!html && html.indexOf('xkEnter') !== -1 && /var token='[^']+'/.test(html);
}

function extractGateToken(html) {
  const m = html.match(/var token='([^']+)'/);
  return m ? m[1] : '';
}

async function rawGet(url) {
  try {
    const { data } = await $fetch.get(url, { headers: headers(), timeout: 20000 });
    return String(data || '');
  } catch (e) { /* fall through to fetch */ }
  try {
    if (typeof fetch === 'function') {
      const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.text();
    }
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * 过门取页: 先 GET; 若回 gate 页 (含 xkEnter + var token), 取 token 设 Cookie 再 GET 一次,
 * cookie 缓存到 gateCookie 供后续调用复用; 若某次调用又命中 gate 页 (cookie 过期), 重新取 token。
 */
async function getHtml(url) {
  let html = await rawGet(url);
  if (isGatePage(html)) {
    const tok = extractGateToken(html);
    if (tok) {
      gateCookie = 'xk_gate=' + tok;
      html = await rawGet(url);
    }
  }
  if (isGatePage(html)) {
    // cookie 可能已过期: 重新取一次 token 再试
    const tok = extractGateToken(html);
    if (tok) {
      gateCookie = 'xk_gate=' + tok;
      html = await rawGet(url);
    }
  }
  return isGatePage(html) ? '' : html;
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home' || cat === '') return HOST + '/';
  if (cat === 'rank' || cat === 'rankweek' || cat === 'rankmonth' || cat === 'rankscore') {
    return HOST + '/label/' + cat + '.html';
  }
  if (cat.indexOf('tag') === 0) {
    const tid = cat.slice(3);
    if (page <= 1) return HOST + '/tag/' + tid + '.html';
    return HOST + '/tag/' + tid + '-' + page + '.html';
  }
  if (page <= 1) return HOST + '/vod/' + cat + '.html';
  return HOST + '/vod/' + cat + '-' + page + '.html';
}

/**
 * 列表解析: 卡片结构 (首页/分类/标签/排行/搜索通用)
 * <div class="card">
 *   <a class="pic" href="/play/<id>.html" title="<标题>" style="background-image:url(<封面>)">
 *     <span class="badge-score">6.0</span><span class="badge">HD</span></a>
 *   <a class="title" href="/play/<id>.html" title="<标题>"><标题></a>
 *   <div class="sub"><span class="sub-hits">1.1K观看</span><span class="sub-up">6赞</span></div>
 * </div>
 */
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a\s+class="pic"\s+href="\/play\/(\d+)\.html"\s+title="([^"]+)"\s+style="background-image:url\(([^)]+)\)">([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const inner = m[4] || '';
    const score = (inner.match(/badge-score">([^<]+)</) || [])[1] || '';
    const badge = (inner.match(/badge">([^<]+)</) || [])[1] || '';
    // 备注: 分类徽标 + 评分, 如 "网爆门 6.0分"; 无徽标时只留评分
    let remarks = '';
    if (badge) remarks = badge;
    if (score) remarks = (remarks ? remarks + ' ' : '') + score + '分';
    out.push({
      vod_id: id,
      vod_name: decodeHtml(m[2]) || ('视频 ' + id),
      vod_pic: absUrl(m[3]),
      vod_remarks: remarks,
    });
  }
  return out;
}

/**
 * 分页器: <div class="pager"><span>共16000条，1/1000页</span>…<a href="…-1000.html">尾页</a></div>
 * 返回 { total, pagecount }；无分页器（首页/排行/搜索无结果）返回 null。
 * 注意：小分类超尾页回空列表（如人兽 34 页，35 页 0 条）；1000 页的大分类超尾页会
 * 重复回尾页内容（如国产 1001 页回 1000 页内容），故必须用真实 pagecount 让 App 停在尾页。
 */
function parsePager(html) {
  if (!html) return null;
  const m = html.match(/共(\d+)条，(\d+)\/(\d+)页/);
  if (m) {
    const total = parseInt(m[1], 10) || 0;
    const pc = parseInt(m[3], 10) || 0;
    if (pc > 0) return { total, pagecount: pc };
  }
  const pm = html.match(/<div class="pager">([\s\S]*?)<\/div>/i);
  if (pm) {
    let max = 0;
    const re = /-(\d+)\.html/g;
    let x;
    while ((x = re.exec(pm[1])) !== null) {
      const n = parseInt(x[1], 10) || 0;
      if (n > max) max = n;
    }
    if (max > 0) return { total: max * 16, pagecount: max };
  }
  return null;
}

function extractTitle(html, fallback) {
  let m = html.match(/<h1[^>]*>([^<]{2,300})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1].split(/[-|_｜]/)[0]);
  return fallback || '';
}

function extractCover(html, title) {
  // 详情页海报: <div class="poster"><img src="..." alt="<标题>">
  let m = html.match(/<div class="poster">[\s\S]*?<img[^>]*?src="([^"]+)"[^>]*?alt="([^"]*)"/i);
  if (m) return absUrl(m[1]);
  m = html.match(/<div class="poster">[\s\S]*?<img[^>]*?alt="([^"]*)"[^>]*?src="([^"]+)"/i);
  if (m) return absUrl(m[2]);
  const imgs = [];
  const re = /<img[^>]*?(?:data-src|src)="([^"]+)"[^>]*?alt="([^"]*)"/gi;
  while ((m = re.exec(html)) !== null) {
    imgs.push({ src: m[1], alt: decodeHtml(m[2]) });
  }
  if (title) {
    const hit = imgs.find(x => x.alt && x.alt === title);
    if (hit) return absUrl(hit.src);
  }
  if (imgs.length) return absUrl(imgs[0].src);
  return '';
}

/** 播放页 player_data JSON: var player_data={"url":"...m3u8","encrypt":0,"trysee":0,"points":0,"from":"fqm3u8",...} (结尾无分号, 直接 </script>) */
function extractPlayerData(html) {
  const m = html.match(/var\s+player_data\s*=\s*(\{[^{}]*\})/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

/** 解出直链: encrypt 0=明文, 1=unescape, 2=base64 (MacCMS 标准; 本站实测全为 0, 另两种只作兜底) */
function decodePlayUrl(pd) {
  if (!pd || !pd.url) return '';
  let url = String(pd.url).trim();
  const enc = Number(pd.encrypt) || 0;
  try {
    if (enc === 1) url = unescape(url);
    else if (enc === 2) url = Buffer.from(url, 'base64').toString('utf-8');
  } catch (e) { /* keep raw */ }
  return url;
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
  const id = String(body.id || 'home');
  // 首页最新与 4 个排行均单页、无分页器：pagecount 必须为 1。
  // 旧版 p1 回 pagecount 999，App 会按 999 页去翻，翻到空页报“无法加载更多”。
  const isSingle = (id === 'home' || id === '' || id === 'rank' || id === 'rankweek' || id === 'rankmonth' || id === 'rankscore');
  if (isSingle) {
    if (page > 1) {
      return { page, pagecount: 1, limit: 0, total: 0, list: [] };
    }
    const html = await getHtml(listUrl(id, page));
    const list = parseList(html);
    return { page, pagecount: 1, limit: list.length || 20, total: list.length, list };
  }
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  // 真实总页数取自分页器（共X条，Y/Z页）；取不到时兜底 999（保持可重试）
  const pg = parsePager(html);
  const pagecount = pg ? pg.pagecount : 999;
  const total = pg ? pg.total : 999 * 16;
  if (page > pagecount) {
    return { page, pagecount, limit: 0, total, list: [] };
  }
  return {
    page,
    pagecount,
    limit: list.length || 20,
    total,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const vid = String(raw || '').match(/play\/(\d+)/)?.[1]
    || String(raw || '').replace(/[^0-9]/g, '');
  if (!vid) return { list: [] };

  const html = await getHtml(HOST + '/play/' + vid + '.html');
  if (!html) return { list: [] };

  const name = extractTitle(html, vid);
  const pic = extractCover(html, name);
  const typeM = html.match(/类型：([^<]{1,30})</);
  const descM = html.match(/<div class="article-content">([\s\S]{0,2000}?)<\/div>/i);
  const tagsM = html.match(/<div class="vod-tags">([\s\S]*?)<\/div>/i);
  const tagList = [];
  if (tagsM) {
    const tre = />([^<>]{1,20})<\/a>/g;
    let tx;
    while ((tx = tre.exec(tagsM[1])) !== null) tagList.push(decodeHtml(tx[1]));
  }
  const desc = descM ? decodeHtml(descM[1]).replace(/\s+/g, ' ') : '';
  const content = (tagList.length ? '标签：' + tagList.join(' / ') + '\n' : '') + desc;

  // 本片播放线: <a class="line-play" href="/v-p/<id>-<线>-1.html">HD高清1线</a> (通常只有 1 条)
  const lines = [];
  const seenLine = new Set();
  const lre = /class="line-play"\s+href="\/v-p\/\d+-(\d+)-1\.html"[^>]*>([^<]+)</g;
  let lm;
  while ((lm = lre.exec(html)) !== null) {
    const key = lm[1];
    if (seenLine.has(key)) continue;
    seenLine.add(key);
    lines.push({ line: lm[1], label: decodeHtml(lm[2]) || ('线路' + lm[1]) });
  }
  if (!lines.length) lines.push({ line: '1', label: 'HD高清' });

  // 每条线现解直链 (空 url 的线跳过, 如 306427 的 1线为空、只有 2线有地址)
  const eps = [];
  const seenUrl = new Set();
  for (const ln of lines) {
    const playHtml = await getHtml(HOST + '/v-p/' + vid + '-' + ln.line + '-1.html');
    const pd = extractPlayerData(playHtml || '');
    const url = decodePlayUrl(pd);
    if (!url || !/^https?:\/\//i.test(url) || seenUrl.has(url)) continue;
    seenUrl.add(url);
    eps.push(ln.label + '$' + url);
  }
  if (!eps.length) return { list: [] };

  // 字幕：按每条播放地址 + vid 登记片名，后台逐条串行预热（不 await，不一拥而上）
  for (const ep of eps) { const u = ep.split('$').pop(); if (u) subCacheName(u, name); }
  subCacheName(vid, name);
  (async () => { for (const ep of eps) { try { await subSearchAll(ep.split('$').pop()); } catch (e) {} } })().catch(() => {});

  return {
    list: [{
      vod_id: vid,
      vod_name: name || vid,
      vod_pic: pic,
      vod_type: typeM ? decodeHtml(typeM[1]) : '',
      vod_remarks: tagList.join(' '),
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let url = String(body.id || '');
  if (url.includes('$')) url = url.split('$').pop().trim();
  // 字幕：detail 预热过则命中缓存/在途，一般不增加点播延迟；无命中不带 subs 键
  const subs = await subSearchAll(url).catch(() => []);
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function searchCat(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url;
  if (page <= 1) url = HOST + '/sou/-.html?wd=' + encodeURIComponent(wd);
  else url = HOST + '/sou/' + encodeURIComponent(wd) + '-' + page + '.html';
  const html = await getHtml(url);
  const list = parseList(html);
  const pg = parsePager(html);
  const pagecount = pg ? pg.pagecount : 999;
  const total = pg ? pg.total : 999 * 16;
  if (page > pagecount) {
    return { page, pagecount, limit: 0, total, list: [] };
  }
  return {
    page,
    pagecount,
    limit: list.length || 20,
    total,
    list,
  };
}

function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
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

// ---------------- 字幕聚合 (XPTV 版，照 avdb 新芯) ----------------
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

// ---------------- XPTV 适配层 ----------------
// 猫源 home/category/detail/play/search 原样保留；以下 5 个 XPTV 入口做薄适配。
async function getConfig() {
    const h = await home();
    const tabs = (h && Array.isArray(h.class) ? h.class : []).map((c) => ({ name: String(c.type_name || ''), ext: { id: String(c.type_id || '') } }));
    return jsonify({ ver: 1, title: '悟空传媒', site: 'https://qcfit2u1.chuanqi74.sbs', tabs: tabs.length ? tabs : [{ name: '全部', ext: { id: '' } }] });
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
    const name = String(ext.name || '');
    if (name) {
        try { const subs = await subSearch(name); if (subs && subs.length) result.subs = subs; } catch (e) {}
    }

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
