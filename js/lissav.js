
// LissAV https://lissav.vip —— MissAV 系 JAV 站，只做 asian 区（语言入口即用户点的 JP/CN 两项：ja / zh-CN）
// domestic 区走 /video/vid/ 另一套，播放未验，本蜘蛛不做
// 列表：固定榜单 + 两个 tag + 题材（100 个 genre 作筛选卡片）；翻页走 /page/N（站方忽略 ?page=）
// 2026-11-04 修：站方网络不稳定（VM 实测偶发 http 000 空回），getHtml 改为多 host 轮询 + 重试：lissav.vip → lissav.net（实测首页可出 48 条）；lissav.cc/.pro 只是 301 跳回 .vip，不作 fallback
// 2026-11-04 round2 提速：VM 实测 vip 13 次里 4 次死（30s 挂起/中途截断），.net 13/13 全通且最慢 2.7s；旧版 vip 优先顺序执行时，一次 vip 挂起就要等满 20s 超时才轮到 .net，单次列表/详情经常 20s+，两腿都挂时理论最坏 80s。
// 本轮改为双 host 并行竞速（先回有效数据者胜）+ 单次超时 20s → 8s + 仍保留 2 轮：健康时约 2s（哪边快用哪边，设备侧网络哪边快不可预知，竞速自适应），vip 挂起时 .net 约 2s 胜出不再等 20s，
// 最坏 2 轮 × 8s + 0.6s ≈ 16.6s（原 80s）；尝试总次数不变（4 次），可靠性不降反升（fetchStream 由 2 次增至 4 次）。竞速不用 Promise.any（老 JS 引擎未必支持），手写 firstValid。
// 2026-11-04 round3：竞速在设备上导致列表直接失败，已回退顺序执行 + 单次 12s（见 getHtml/fetchStream）。
// 2026-11-04 增：顶级分类新增 巨乳/大屁股/好屁股/美乳/巨乳偏好/屁股偏好（均为 /videos/genre/ 路径，VM 实测各 12 条，翻页 /page/N 同规律）
// 详情：/asian/{lang}/video/cid/<番号>；播放走站方自家播放器接口 /asian/{lang}/api/video/stream?video_uid=<uid>
// 播单：接口 playlist 两条（高清主源 + 480p），分集列出供手动选；480p 线 VM 实测 200 可播，主源 VM 侧 403（设备侧可能不同）
// 字幕：条目自带番号（cid 即番号），按条目接聚合芯（迅雷 > 迅雷看看 > SubtitleCat）
const HOST = 'https://lissav.vip';
const HOSTS = ['https://lissav.vip', 'https://lissav.net'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const LANGS = [{ n: '中文', v: 'zh-CN' }, { n: '日文', v: 'ja' }, { n: '英文', v: 'en' }, { n: '繁中', v: 'zh-HK' }];
const FIXED = [
  { id: 'new', name: '最新发布', path: '/videos/new-releases' },
  { id: 'recent', name: '最近更新', path: '/videos/recent' },
  { id: 'hot_today', name: '今日热门', path: '/videos/hot/today' },
  { id: 'hot_week', name: '本周热门', path: '/videos/hot/week' },
  { id: 'hot_month', name: '本月热门', path: '/videos/hot/month' },
  { id: 'tag_cn', name: '中文字幕', path: '/videos/tag/%E4%B8%AD%E6%96%87%E5%AD%97%E5%B9%95' },
  { id: 'tag_leak', name: '无码流出', path: '/videos/tag/%E6%97%A0%E7%A0%81%E6%B5%81%E5%87%BA' },
  { id: 'genre_juru', name: '巨乳', path: '/videos/genre/%E5%B7%A8%E4%B9%B3' },
  { id: 'genre_dpg', name: '大屁股', path: '/videos/genre/%E5%A4%A7%E5%B1%81%E8%82%A1' },
  { id: 'genre_hpg', name: '好屁股', path: '/videos/genre/%E5%A5%BD%E5%B1%81%E8%82%A1' },
  { id: 'genre_meiru', name: '美乳', path: '/videos/genre/%E7%BE%8E%E4%B9%B3' },
  { id: 'genre_juru_pref', name: '巨乳偏好', path: '/videos/genre/%E5%B7%A8%E4%B9%B3%E5%81%8F%E5%A5%BD' },
  { id: 'genre_pg_pref', name: '屁股偏好', path: '/videos/genre/%E5%B1%81%E8%82%A1%E5%81%8F%E5%A5%BD' },
];
const GENRES = [{"v": "%E9%AB%98%E6%B8%85", "n": "高清"}, {"v": "%E5%8D%95%E4%BD%93%E4%BD%9C%E5%93%81", "n": "单体作品"}, {"v": "%E7%8B%AC%E5%AE%B6", "n": "独家"}, {"v": "%E4%B8%AD%E5%87%BA", "n": "中出"}, {"v": "%E5%B7%A8%E4%B9%B3", "n": "巨乳"}, {"v": "%E4%BA%BA%E5%A6%BB", "n": "人妻"}, {"v": "%E6%97%A0%E7%A0%81%E6%B5%81%E5%87%BA", "n": "无码流出"}, {"v": "%E7%B4%A0%E4%BA%BA", "n": "素人"}, {"v": "%E7%86%9F%E5%A5%B3", "n": "熟女"}, {"v": "%E7%BE%8E%E5%B0%91%E5%A5%B3", "n": "美少女"}, {"v": "%E5%8F%A3%E4%BA%A4", "n": "口交"}, {"v": "%E8%96%84%E6%A0%BC", "n": "薄格"}, {"v": "%E8%87%AA%E6%8B%8D", "n": "自拍"}, {"v": "%E7%97%B4%E5%A5%B3", "n": "痴女"}, {"v": "%E5%A4%9A%E4%BA%BA%E8%BF%90%E5%8A%A8", "n": "多人运动"}, {"v": "%E9%AA%91%E4%B9%98", "n": "骑乘"}, {"v": "%E8%8B%97%E6%9D%A1", "n": "苗条"}, {"v": "%E6%BD%AE%E5%90%B9", "n": "潮吹"}, {"v": "4K", "n": "4K"}, {"v": "NTR", "n": "NTR"}, {"v": "%E7%BE%8E%E4%B9%B3", "n": "美乳"}, {"v": "%E4%B9%B3%E4%BA%A4", "n": "乳交"}, {"v": "%E4%B8%AD%E6%96%87%E5%AD%97%E5%B9%95", "n": "中文字幕"}, {"v": "%E5%A5%B3%E9%AB%98%E4%B8%AD%E7%94%9F", "n": "女高中生"}, {"v": "4%E5%B0%8F%E6%97%B6%E4%BB%A5%E4%B8%8A", "n": "4小时以上"}, {"v": "%E9%A2%9C%E5%B0%84", "n": "颜射"}, {"v": "%E6%B7%AB%E4%B9%B1", "n": "淫乱"}, {"v": "%E4%BC%81%E5%88%92", "n": "企划"}, {"v": "%E4%B8%9A%E9%A6%80", "n": "业馀"}, {"v": "%E5%89%A7%E6%83%85", "n": "剧情"}, {"v": "%E6%89%8B%E6%B7%AB", "n": "手淫"}, {"v": "%E9%A5%BC", "n": "饼"}, {"v": "%E4%B9%B1%E4%BC%A6", "n": "乱伦"}, {"v": "%E6%90%AD%E8%AE%AA", "n": "搭讪"}, {"v": "%E5%A6%84%E6%83%B3", "n": "妄想"}, {"v": "%E5%90%88%E9%9B%86", "n": "合集"}, {"v": "%E6%81%8B%E7%89%A9%E7%99%96", "n": "恋物癖"}, {"v": "%E5%A7%90%E5%A7%90", "n": "姐姐"}, {"v": "%E7%BA%AA%E5%BD%95%E7%89%87", "n": "纪录片"}, {"v": "%E4%BB%85%E9%80%81%E8%B4%A7", "n": "仅送货"}, {"v": "%E5%81%B7%E6%8B%8D", "n": "偷拍"}, {"v": "%E8%88%94%E9%98%B4", "n": "舔阴"}, {"v": "%E5%88%B6%E6%9C%8D", "n": "制服"}, {"v": "%E7%BE%9E%E8%BE%B1", "n": "羞辱"}, {"v": "%E8%A7%92%E8%89%B2%E6%89%AE%E6%BC%94", "n": "角色扮演"}, {"v": "%E5%89%83%E6%AF%9B", "n": "剃毛"}, {"v": "OL", "n": "OL"}, {"v": "%E4%B8%8D%E4%BC%A6", "n": "不伦"}, {"v": "%E5%A5%B3%E5%A4%A7%E5%AD%A6%E7%94%9F", "n": "女大学生"}, {"v": "%E8%87%AA%E6%85%B0", "n": "自慰"}, {"v": "%E8%BE%A3%E5%A6%B9", "n": "辣妹"}, {"v": "%E5%A4%A7%E5%B1%81%E8%82%A1", "n": "大屁股"}, {"v": "%E5%B0%8F%E5%8F%AA%E9%A9%AC", "n": "小只马"}, {"v": "%E6%8C%89%E6%91%A9%E6%A3%92", "n": "按摩棒"}, {"v": "%E6%8B%98%E6%9D%9F", "n": "拘束"}, {"v": "%E5%85%A8%E9%AB%98%E6%B8%85%20%28FHD%29", "n": "全高清 (FHD)"}, {"v": "%E7%BE%9E%E8%80%BB", "n": "羞耻"}, {"v": "%E5%A5%BD%E5%B1%81%E8%82%A1", "n": "好屁股"}, {"v": "%E5%87%BA%E9%81%93%E4%BD%9C", "n": "出道作"}, {"v": "%E7%BE%8E%E4%B8%BD%E7%9A%84%E8%83%B8%E9%83%A8", "n": "美丽的胸部"}, {"v": "S1%20NO.1%20STYLE", "n": "S1 NO.1 STYLE"}, {"v": "Madonna", "n": "Madonna"}, {"v": "%E6%8E%A5%E5%90%BB", "n": "接吻"}, {"v": "%E5%BC%BA%E5%88%B6%E5%8F%A3%E4%BA%A4", "n": "强制口交"}, {"v": "%E5%B1%81%E8%82%A1%E5%81%8F%E5%A5%BD", "n": "屁股偏好"}, {"v": "%E7%8E%A9%E5%85%B7", "n": "玩具"}, {"v": "%E4%B9%B1%E4%BA%A4", "n": "乱交"}, {"v": "%E5%A5%B3%E5%90%8C%E6%80%A7%E6%81%8B", "n": "女同性恋"}, {"v": "%E6%9C%AA%E7%BB%8F%E5%AE%A1%E6%9F%A5", "n": "未经审查"}, {"v": "%E6%B7%AB%E8%AF%AD", "n": "淫语"}, {"v": "%E5%A5%87%E9%97%BB%E8%B6%A3%E4%BA%8B", "n": "奇闻趣事"}, {"v": "%E8%82%9B%E9%97%A8", "n": "肛门"}, {"v": "%E9%A3%8E%E4%BF%97%E5%A8%98", "n": "风俗娘"}, {"v": "%E6%B3%B3%E8%A3%85", "n": "泳装"}, {"v": "----", "n": "----"}, {"v": "%E5%B7%B2%E5%A9%9A%E5%A5%B3%E4%BA%BA", "n": "已婚女人"}, {"v": "%E4%B8%BB%E8%A7%82%E8%A7%86%E8%A7%92", "n": "主观视角"}, {"v": "69", "n": "69"}, {"v": "%E4%B8%9D%E8%A2%9C", "n": "丝袜"}, {"v": "%E6%8D%86%E7%BB%91", "n": "捆绑"}, {"v": "%E5%90%B9", "n": "吹"}, {"v": "%E6%8C%89%E6%91%A9", "n": "按摩"}, {"v": "%E6%8C%89%E6%91%A9%E6%B2%B9", "n": "按摩油"}, {"v": "%E6%8C%87%E6%8F%92", "n": "指插"}, {"v": "%E5%90%84%E7%A7%8D%E8%81%8C%E4%B8%9A", "n": "各种职业"}, {"v": "%E6%A0%A1%E6%9C%8D", "n": "校服"}, {"v": "%E5%8E%9F%E6%9D%A5%E7%9A%84", "n": "原来的"}, {"v": "%E8%B4%AB%E4%B9%B3", "n": "贫乳"}, {"v": "%E8%B6%85%E8%96%84%E6%A0%BC", "n": "超薄格"}, {"v": "%E6%AF%8D%E4%BA%B2", "n": "母亲"}, {"v": "%E6%9E%81%E9%99%90%E9%AB%98%E6%BD%AE", "n": "极限高潮"}, {"v": "%E5%A7%90%E5%A6%B9", "n": "姐妹"}, {"v": "%E5%A5%B3%E6%95%99%E5%B8%88", "n": "女教师"}, {"v": "%E5%90%9E%E7%B2%BE", "n": "吞精"}, {"v": "%E5%B7%A8%E4%B9%B3%E5%81%8F%E5%A5%BD", "n": "巨乳偏好"}, {"v": "HHH%E3%82%B0%E3%83%AB%E3%83%BC%E3%83%97", "n": "HHHグループ"}, {"v": "%E5%B9%B4%E7%B3%95", "n": "年糕"}, {"v": "SM", "n": "SM"}, {"v": "%E3%83%86%E3%82%A3%E3%83%83%E3%82%B7%E3%83%A5", "n": "ティッシュ"}, {"v": "%E9%87%8E%E5%A4%96%E9%9C%B2%E5%87%BA", "n": "野外露出"}];

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

async function fetchHtmlOnce(url, referer, timeoutMs) {
  try {
    const r = await $fetch.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: timeoutMs || 12000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 2026-11-04 round3 回退：round2 的并行竞速在设备上导致列表直接失败（App 内 req 并发问题；
// fix6 的顺序执行在设备上是好的）；改回顺序执行（vip → net），单次超时 12s（比 fix6 的 20s 还是快，
// 尝试次数不变：每轮 2 host × 2 轮 = 4 次，最坏约 49s，原 80s）。
// 列表/详情抓取：站方偶发网络层失败（VM 实测 http 000）与 vip 挂起（VM 实测 13 次里 4 次 30s 死）；
// 顺序 host 轮询，两轮之间停 600ms；全部失败才回空。
async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  let cands = [url];
  for (const h of HOSTS) {
    if (url.startsWith(h + '/')) {
      const rest = url.slice(h.length);
      cands = HOSTS.map((hh) => hh + rest);
      break;
    }
  }
  for (let round = 0; round < 2; round++) {
    for (const u of cands) {
      const m = u.match(/^(https?:\/\/[^/]+)/);
      const referer = (m ? m[1] : HOST) + '/';
      const d = await fetchHtmlOnce(u, referer, 12000);
      if (d) return d;
    }
      }
  return '';
}

// 字幕芯取数原语（与 py_mogu 一致）：统一回 {status, body}
async function reqRaw(url, headers, timeoutMs) {
  try {
    const r = await $fetch.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
    const body = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
    return { status: r.status || 0, body, headers: r.headers || {}, err: null };
  } catch (e) {
    return { status: 0, body: '', headers: {}, err: e };
  }
}

// ---------------- 字幕聚合 (与 32 个带芯猫源同一套 Layer A，2026-11-02 定版) ----------------
// 槽位：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 键序逐个查、首中即停；命中后严过滤（须含番号或片名全文，无回退）；
// 合并序 = 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；
// 全局上限 10、单槽软上限 8；总预算 6s、失败全静默；无结果时 play 不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 除 1000），无时长不显示、不编造；
// 去重键 = 语言 + 小写名（去扩展名）+ 秒（无时长记 nodur），同名同时长才算重复。























function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<a class="streamit-video-card__media-link" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const href = m[1];
    const inner = m[2];
    const cm = href.match(/\/video\/cid\/([A-Za-z0-9_-]+)/);
    if (!cm) continue;
    const cid = cm[1];
    if (cid.includes('__') || seen.has(href)) continue;
    seen.add(href);
    const imgM = inner.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    const altM = inner.match(/alt="([^"]*)"/i);
    const pic = imgM ? imgM[1] : '';
    const title = altM ? cleanLabel(altM[1]) : cid;
    items.push({ vod_id: href, vod_name: title || cid, vod_pic: pic, vod_remarks: '' });
  }
  return items;
}

async function home() {
  const classes = FIXED.map((f) => ({ type_id: f.id, type_name: f.name }));
  classes.push({ type_id: 'genre', type_name: '题材分类' });
  const filters = {};
  const langGroup = { key: 'lang', name: '语言', value: LANGS.map((l) => ({ n: l.n, v: l.v })) };
  for (const c of classes) {
    const groups = [langGroup];
    if (c.type_id === 'genre') groups.push({ key: 'sub', name: '题材', value: GENRES.map((g) => ({ n: g.n, v: g.v })) });
    filters[c.type_id] = groups;
  }
  let list = [];
  try { list = parseCards(await getHtml('/asian/zh-CN')).slice(0, 20); } catch (e) { list = []; }
  return { class: classes, filters, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  const lang = LANGS.some((l) => l.v === extend.lang) ? extend.lang : 'zh-CN';
  let base = '';
  const f = FIXED.find((x) => x.id === zoneId);
  if (f) base = f.path;
  else if (zoneId === 'genre') {
    const sub = String(extend.sub || '');
    base = '/videos/genre/' + (sub || GENRES[0].v);
  } else base = '/videos/new-releases';
  const path = '/asian/' + lang + base + (page > 1 ? '/page/' + page : '');
  const html = await getHtml(path);
  const list = parseCards(html);
  const next = html.includes('/page/' + (page + 1) + '"');
  return { page, pagecount: next ? page + 1 : page, list };
}

async function catSearch(reqIn) {
  // LissAV 站内搜索接口未证实，不编搜索地址
  return { list: [] };
}

async function fetchStreamOnce(host, lang, uid) {
  try {
    const r = await reqRaw(host + '/asian/' + lang + '/api/video/stream?video_uid=' + encodeURIComponent(uid),
      { 'User-Agent': UA, 'Referer': host + '/asian/' + lang + '/', 'Accept': 'application/json' }, 12000);
    if (r.status !== 200 || !r.body) return [];
    const j = JSON.parse(r.body);
    if (!j || !Array.isArray(j.playlist)) return [];
    const pl = j.playlist.filter((e) => e && e.url);
    return pl.length ? pl : [];
  } catch (e) { return []; }
}

// round3：顺序执行（vip → net）+ 2 轮，共 4 次尝试、单次 12s（round2 竞速在设备上失效，见 getHtml 处说明）
async function fetchStream(lang, uid) {
  if (!uid) return [];
  for (let round = 0; round < 2; round++) {
    for (const h of HOSTS) {
      const pl = await fetchStreamOnce(h, lang, uid);
      if (pl.length) return pl;
    }
      }
  return [];
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const lang = (rawId.match(/\/asian\/([^/]+)\//) || [])[1] || 'zh-CN';
  const html = await getHtml(rawId);
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = '';
  if (tM) mainTitle = cleanLabel(tM[1]).replace(/^LissAV\s*\|\s*/i, '').trim();
  const cid = (rawId.match(/\/video\/cid\/([^/]+)/) || [])[1] || '';
  if (!mainTitle) mainTitle = cid || 'LissAV 视频';
    let posterPic = '';
  const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogM) posterPic = ogM[1].trim();
  const uidM = html.match(/var videoUid\s*=\s*"([^"]+)"/);
  const uid = uidM ? uidM[1] : '';
  let playUrl = '';
  if (uid) {
    const pl = await fetchStream(lang, uid);
    if (pl.length) {
      const eps = pl.map((e, i) => {
        let nm = '';
        if (i === 0) nm = '高清';
        else {
          const rm = String(e.url).match(/\/(\d+)x(\d+)\//);
          const pm = String(e.url).match(/\/(\d+)p\//);
          nm = rm ? rm[2] + 'p' : (pm ? pm[1] + 'p' : ('线路' + (i + 1)));
        }
        return nm + '$' + durl + '@@' + e.url;
      });
      playUrl = eps.join('#');
    }
  }
  if (!playUrl && uid) playUrl = '正片$' + durl + '@@UID:' + uid;
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: cid,
      vod_content: 'LissAV',
      vod_play_from: 'LissAV',
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
  if (target.startsWith('UID:')) {
    const uid = target.slice(4);
    const lang = (durl.match(/\/asian\/([^/]+)\//) || [])[1] || 'zh-CN';
    const pl = await fetchStream(lang, uid);
    if (pl.length) target = pl[0].url;
    else return { parse: 0, url: '' };
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
    const tabs = (FIXED.map(f => ({ id: f.id, name: f.name })).concat([{ id: 'genre', name: '题材分类' }])).map((c) => ({ name: c.name, ext: { id: c.id } }));
    return jsonify({ ver: 1, title: 'LissAV', site: HOST, tabs });
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
    const playUrl = __s(d && d.vod_play_url);
    if (playUrl) {
    const segs = playUrl.split('$$$');
    for (const seg of segs) {
        const eps = String(seg || '').split('#').filter(Boolean);
        for (const ep of eps) {
            const di = ep.indexOf('$');
            const nm = di > 0 ? ep.slice(0, di) : '正片';
            tracks.push({ name: nm, pan: '', ext: { url: '', id: ep, name: nm } });
        }
    }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = __s(ext.id || '');
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
