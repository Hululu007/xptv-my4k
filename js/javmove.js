// JavMove (https://javmove.com) -> CatPawOpen spider
// 探查 (2026-11-13, VM curl iPhone UA 全链实测):
//   顶级: 最新 (首页 / , 24 条/页, 翻页 /?page=N, p8 仍有 12 条新内容, 页数不止
//     导航栏显示的 7 页, 故用 999 形态)。新发布与即将上映在 v4 里被当成单页
//     (pagecount=1、p2 直接回空), 但 2026-11-14 实测站方是真翻页:
//     /release p1 12 条、p2 9 条 (共 2 页), /upcoming 每页 12 条、至少 8 页。
//     v5: 两分类都按 ?page=N 真翻页, pagecount 取站内 ?page= 链接最大值。
//   2026-11-13 用户反馈顶级分类太少: 站内导航只有 / /release /upcoming /genres
//     /makers, 无更多站方顶级栏; /genres 索引实录 361 个题材, 其中无 "无码流出"
//     标签 (grep leak 全站 0 命中), 最接近的是 JAV Uncensored
//     (genres/javuncensored/jav-uncensored)。故把用户点名的无码流出/巨乳/
//     大屁股 + 人气前列 5 个题材 (中出/人妻/熟女/单体作品/素人) 提为顶级分类,
//     各页 p1/p2 均 12 条、0 重叠 (curl 串行实测); 40 题材 + 20 制作商筛选卡片保留,
//     12 个曾报 0 的制作商串行复核全是 200/12 条 (并行尾段 stall 误报, 一个不删)。
//   子分类走顶级 + filters 筛选卡片 (123AV 形态): 题材 361 个、制作商 947 个,
//     全量既无法逐个验、App 里也没法翻, 只取 /genres 与 /makers 索引页顺序 (人气序)
//     前 40 题材 + 前 20 制作商; 题材页与制作商页翻页均为 ?page=N
//     (big-tits p1/p2 各 12 条、0 重叠)。卡片: article > a[href="/movie/<id>/<slug>"],
//     内含 img.movie-image (ie2.javmove.com/media) 与标题文本 (番号开头, 如 CAWB-006);
//     每卡有两个锚点 (图 + 标题), 解析须按 movie id 去重。
//   搜索: GET /search?q= , 翻页 &page=N (CAWB-006 首条即命中, 每页 12 条)。
//   详情: /movie/<id>/<slug>, 标题 <title> 去 " | JAVMove" 后缀; 无 og:image,
//     封面取首张截图 (.splide__slide img, ie2.javmove.com/media)。
//     播放: 详情页 <video id="video-player" data-id="<token>">, GET /watch?token=<token>
//     (无 Referer 也 200) 回纯文本直链 mp4 (如 https://bnsjnqwxlob.cfd/vs/....mp4),
//     Range 实测 206 video/mp4 (带/不带 Referer 均通)。格式区 .video-format
//     (本批两部详情均只 FullHD 一组); 每组内分 part, part 链接 ?type=<TYPE>&p=<N>,
//     各 part 各有自己的 data-id (p1/p2 已验不同 token)。详情按 格式·P<part> 出线,
//     play() 按 part 地址现取 data-id 再调 /watch, 不复用详情时 token。
//     注意播放器另有 MSE + /decryptor.wasm + /api/session-ticket 加密分支,
//     只在 /watch 不回直链 http(s) 地址时走, 本批 /watch 均回直链, 不走该分支。
//   2026-11-13 第二轮真机反馈 (R2, 全部三项在 VM 侧复现并坐实):
//   - 封面 1/12: 站方用 lazysizes, 每页只有第 1 张卡是 eager (img.movie-image
//     src=真地址), 第 2-12 张全是 lazyload: src=1×1 透明占位 data-URI,
//     真地址在 data-srcset 里 (上一轮 parseList 只取 src=, 故 11/12 条的
//     vod_pic 是 data:image/png;base64,... 占位, App 永远显示灰块; 上一轮
//     "VM 20/20" 只验了 pic 非空、没验是不是 data: URI, 结论作废)。
//     修法: pickImg() 优先 data-srcset/data-src/data-original/srcset,
//     拒收一切 data: URI, 只收 http(s) 真地址; 详情海报同理取首个
//     data-srcset (详情页共 13 个 data-srcset: 海报 1 + 相关卡 12, 首个即海报)。
//   - 筛选卡片重复两行: 每类下两张卡共用 key 'sub' (题材 + 制作商)。
//     av123 所谓"同款"是误读 —— av123 是每类只挂一张 'sub' 卡 (genres/
//     actresses/makers/series 各自一类一卡); 两张卡共用一个 key 时 extend
//     只能存一个值 (选制作商会冲掉题材, 反之亦然), App 按 key 解析时两行
//     显示同一组选项。修法: 两张卡改不同 key ('genre'/'maker'),
//     category() 同时认 genre/maker 与旧 sub (兼容旧版 App 已存的筛选态)。
//   - 播放全死: /watch 本身没坏 (带 Referer 63 字节直链, mp4 Range 带/不带
//     Referer 均 206, 直链 1.79GB 真 mp4), 死因是 play() 太慢: part 页
//     TTFB 12s + /watch 3s + 字幕并行搜索搅局, harness 实测 24-66s,
//     远超 App 侧点播等待, 且站方现更慢 (首页 522、题材页 21.5s、
//     /release 25s 超时)。修法三件套: (a) detail() 把当前 part (active
//     按钮) 的 data-id 嵌进该集播放 id, play() 快径单次 /watch 直取直链
//     (~3s, token 实测 8 分钟仍有效、约 20 分钟失效, 失效即回落); (b) 字幕改缓存只读 ——
//     play() 只挂 detail() 预热已入缓存的命中, 不再现搜、不再等 6s、
//     不再并发冲站方; (c) Worker 腿 javmove-fetch /resolve (整链代取 +
//     10 分钟缓存, 见 JAVMOVE_WORKER), token 失效时先走 Worker 再直连。
//     Worker 只做解析 (取页 + /watch), 不代理 mp4 字节 (直链本身通,
//     1.8GB 走免费 Worker 既无必要也扛不住)。
//   2026-11-13 第四轮真机反馈 (R4, 用户重导第三轮包后: 起播一切正常、
//   所有线路都能播, 但拖进度条就卡住不动; VM 侧坐实, 详见
//   diag-1113-r4-javmove/REPORT.md):
//   断点不在 Range 形态 (起播与 seek 的全部 Range 形态经 /stream 都回
//   正确字节, ffmpeg -ss 900/3000 直连 Worker 也通), 而在播放器
//   (FFmpeg/ijkplayer) 每个请求都带 `Connection: close`:
//   Cloudflare 边缘对 HTTP/1.1 + `Connection: close` 的大响应会随机
//   提前掐断 (VM 侧干净路径实测: 12.58MB 响应只回 7.14MB,
//   1MB 响应只回 0.97MB, 直连源站同样截断; 不带该头则每次足额;
//   带 `Connection: keep-alive` 则足额; 头里同时出现 close 即截断)。
//   起播只读 moov (3.5MB) 时未必撞上线, 拖进度条后新请求随机
//   死在几百 KB 处、凑不够续播数据, 画面即冻住; 连续播放同样会
//   在约 33 秒处被掐断 (ffmpeg 4/4 次复现, 本地代理 150 秒全通)。
//   修法 (v4, 最小改动, 解析链与 /stream 一个字不动): playFinish()
//   的 header 加 `'Connection': 'keep-alive'` —— FFmpeg 收到自定义
//   Connection 头会用它替代默认的 close (本地 hdrlog 实测: 只发
//   keep-alive 一行, 不重复), 边缘即足额回传; ffmpeg 经线上 Worker
//   v2 带此头连续解码 150 秒全通、-ss 900/3000 全通。
//   注意: 此头是否生效取决于 App 是否把 play 结果的 header 原样
//   交给播放器 (CatVod 惯例是原样交; 真机是最终验证)。
//   Worker v3 (同目录 javmove-fetch-worker-v3.js, 用户部署, 不进仓库)
//   为配套加固 (非本次断点所必需): 流取超时 20s→120s (慢网排空
//   12MB chunk 会撞 20s 中断)、chunk 12.58MB→8MB、显式 Range 钳制
//   到 chunk、响应补 keep-alive; 蜘蛛 v4 不依赖 Worker v3 (v2 即可),
//   但 v3 部署后抗慢网更稳, 部署门见 REPORT.md §七。
// 字幕: 接 sextb.js 定版字幕芯 (Layer A), 详情页地址为键登记片名、后台预热,
//   play() 只挂缓存命中 (无命中不现搜, 播放优先)。

const KEY = 'py_javmove';
const NAME = 'JavMove';
const HOST = 'https://javmove.com';
// 整链代取 Worker (用户部署, 见同目录 javmove-fetch-worker-v1.js):
//   /resolve?mid=&slug=&type=&p= 取 part 页 -> data-id -> /watch 回直链 JSON,
//   10 分钟缓存。未部署/失败/超时时 play() 自动回落直连, 不阻塞播放。
//   部署名须与此一致 (https://javmove-fetch.li768435813.workers.dev),
//   改名部署时只改这一行。
const JAVMOVE_WORKER = 'https://javmove-fetch.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'release', type_name: '新发布' },
  { type_id: 'upcoming', type_name: '即将上映' },
  // 用户点名补的顶级题材 (2026-11-13, 各页 p1/p2 均 12 条、0 重叠, curl 串行实测)。
  // 站内无 "无码流出" 标签, 用 JAV Uncensored 页承接 (全站 grep leak 0 命中)。
  { type_id: 'g-uncensored', type_name: '无码流出' },
  { type_id: 'g-bigtits', type_name: '巨乳' },
  { type_id: 'g-hugebutt', type_name: '大屁股' },
  { type_id: 'g-creampie', type_name: '中出' },
  { type_id: 'g-married', type_name: '人妻' },
  { type_id: 'g-mature', type_name: '熟女' },
  { type_id: 'g-solowork', type_name: '单体作品' },
  { type_id: 'g-amateur', type_name: '素人' },
];

// 顶级题材 type_id -> 站内题材页 (与 GENRES 前 40 里的同一地址, 非平铺新增)
const GENRE_TOP = {
  'g-uncensored': 'genres/javuncensored/jav-uncensored',
  'g-bigtits': 'genres/BJiygps/big-tits',
  'g-hugebutt': 'genres/BmfzJNE/huge-butt',
  'g-creampie': 'genres/GVWkCw/creampie',
  'g-married': 'genres/BcEqYww/married-woman',
  'g-mature': 'genres/DFiQTPU/mature-woman',
  'g-solowork': 'genres/QxHGjE/solowork',
  'g-amateur': 'genres/BHCJmMg/amateur',
};

// 题材前 40 (/genres 索引页人气序, 2026-11-13 实录; 全站 361 个, 只取前 40)
const GENRES = [
  { n: 'Solowork', v: 'genres/QxHGjE/solowork' },
  { n: 'Creampie', v: 'genres/GVWkCw/creampie' },
  { n: 'Big Tits', v: 'genres/BJiygps/big-tits' },
  { n: 'Married Woman', v: 'genres/BcEqYww/married-woman' },
  { n: 'Mature Woman', v: 'genres/DFiQTPU/mature-woman' },
  { n: 'Beautiful Girl', v: 'genres/Ljbfjc/beautiful-girl' },
  { n: '4HR+', v: 'genres/ogWFog/4hr' },
  { n: 'Slut', v: 'genres/BMPngcQ/slut' },
  { n: 'Amateur', v: 'genres/BHCJmMg/amateur' },
  { n: 'Blow', v: 'genres/CHihjPU/blow' },
  { n: '3P, 4P', v: 'genres/BxHaNJc/3p-4p' },
  { n: 'Cuckold', v: 'genres/DSqPmNM/cuckold' },
  { n: 'Digital Mosaic', v: 'genres/IdoowAI/digital-mosaic' },
  { n: 'Slender', v: 'genres/CaENosY/slender' },
  { n: 'Squirting', v: 'genres/HShdVAg/squirting' },
  { n: 'School Girls', v: 'genres/CMwMXEY/school-girls' },
  { n: 'Nasty, Hardcore', v: 'genres/HVOSKBU/nasty-hardcore' },
  { n: 'Drama', v: 'genres/GUieHFE/drama' },
  { n: 'JAV Uncensored', v: 'genres/javuncensored/jav-uncensored' },
  { n: 'Incest', v: 'genres/ttzyfU/incest' },
  { n: 'Titty Fuck', v: 'genres/EYjtJGI/titty-fuck' },
  { n: 'Breasts', v: 'genres/FhKPzbk/breasts' },
  { n: 'Planning', v: 'genres/BelfNeY/planning' },
  { n: 'Cowgirl', v: 'genres/BrtnXsw/cowgirl' },
  { n: 'POV', v: 'genres/BZXvyLU/pov' },
  { n: 'Documentary', v: 'genres/waovUA/documentary' },
  { n: 'Huge Butt', v: 'genres/BmfzJNE/huge-butt' },
  { n: 'Facials', v: 'genres/HyKxxsQ/facials' },
  { n: 'Abuse', v: 'genres/EGOOyiw/abuse' },
  { n: 'Affair', v: 'genres/BWrHCvk/affair' },
  { n: 'Best, Omnibus', v: 'genres/glzpZM/best-omnibus' },
  { n: 'Older Sister', v: 'genres/BUKLrxc/older-sister' },
  { n: 'Voyeur', v: 'genres/jSorDs/voyeur' },
  { n: 'Humiliation', v: 'genres/DVXHZsY/humiliation' },
  { n: 'Other Fetish', v: 'genres/DlLttTU/other-fetish' },
  { n: 'Debut Production', v: 'genres/IgVddgQ/debut-production' },
  { n: 'Nampa', v: 'genres/BEVUiDU/nampa' },
  { n: 'OL', v: 'genres/BBofqrM/ol' },
  { n: 'Deep Throating', v: 'genres/BualDEg/deep-throating' },
  { n: 'Masturbation', v: 'genres/zHowlU/masturbation' },
];

// 制作商前 20 (/makers 索引页人气序, 2026-11-13 实录; 全站 947 个, 只取前 20)
const MAKERS = [
  { n: 'Prestige', v: 'maker/DNvUFlk/prestige' },
  { n: 'K.M.Produce', v: 'maker/BKBprXE/k-m-produce' },
  { n: 'SOD Create', v: 'maker/BsMlzCg/sod-create' },
  { n: 'MOODYZ', v: 'maker/CFUmAoI/moodyz' },
  { n: 'Madonna', v: 'maker/BUdRNZs/madonna' },
  { n: 'S1 NO.1 STYLE', v: 'maker/BMieoew/s1-no-1-style' },
  { n: 'Attackers', v: 'maker/BcXxOyY/attackers' },
  { n: 'IDEA POCKET', v: 'maker/CkydMyo/idea-pocket' },
  { n: 'Hunter', v: 'maker/BXKOZGQ/hunter' },
  { n: 'Glory Quest', v: 'maker/JzpYHfE/glory-quest' },
  { n: 'Center Village', v: 'maker/FPHToDU/center-village' },
  { n: 'Venus', v: 'maker/DVpmCKw/venus' },
  { n: 'Takara Eizou', v: 'maker/JRfNqRc/takara-eizou' },
  { n: 'Serebu No Tomo', v: 'maker/HiomwhM/serebu-no-tomo' },
  { n: 'Planet Plus', v: 'maker/DLOfVHk/planet-plus' },
  { n: 'Honnaka', v: 'maker/BmzFtSw/honnaka' },
  { n: 'Fitch', v: 'maker/ELucNvk/fitch' },
  { n: 'Das !', v: 'maker/HauUhiY/das' },
  { n: 'Deeps', v: 'maker/KSKweZU/deeps' },
  { n: 'BIGMORKAL', v: 'maker/GSUAIJU/bigmorkal' },
];

// 两张筛选卡必须用不同 key (R2: 共用 'sub' 时两行显示同一组选项, 且
// extend 只能存一个值、互冲。av123 每类只挂一张卡, 不是两张共用 key)
const FILTERS = {};
for (const c of CLASSES) {
  FILTERS[c.type_id] = [
    { key: 'genre', name: '题材', value: GENRES },
    { key: 'maker', name: '制作商', value: MAKERS },
  ];
}

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

// 封面取法 (R2 坐实): 站方用 lazysizes, 只有每页第 1 张卡是 eager
// (src=真地址), 其余全是 src=1×1 透明占位 data-URI、真地址在
// data-srcset 里。只取 src= 会让 11/12 条封面永远是占位灰块。
// 顺序: data-srcset > data-src/data-original > srcset > src,
// 一律只收 http(s), data: URI 与相对地址一律拒收。
function attrVal(tag, name) {
  const m = String(tag || '').match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'))
    || String(tag || '').match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? m[1] : '';
}
function pickImg(tag) {
  if (!tag) return '';
  const s = String(tag);
  const fromSet = attrVal(s, 'data-srcset') || attrVal(s, 'srcset');
  if (fromSet) {
    const u = fromSet.split(/[\s,]+/).filter(Boolean)[0] || '';
    if (/^https?:\/\//i.test(u)) return u;
  }
  for (const n of ['data-src', 'data-original']) {
    const u = attrVal(s, n);
    if (/^https?:\/\//i.test(u)) return u;
  }
  const src = attrVal(s, 'src');
  if (/^https?:\/\//i.test(src)) return src;
  return '';
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

// 列表解析: <a href="/movie/<id>/<slug>"> 卡片 (每卡图、标题两个锚点, 按 id 去重)
function parseList(html) {
  const out = [];
  const byId = new Map();
  if (!html) return out;
  const re = /<a[^>]*href="(\/movie\/([A-Za-z0-9]+)\/([^"]*))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    const mid = m[2];
    const slug = m[3];
    const body = m[4] || '';
    if (!mid || !slug) continue;
    // 只收卡片锚点: 含 img 或标题文本 (排除导航/相关区空锚);
    // 封面走 pickImg() (data-srcset 优先, 占位 data-URI 拒收)
    const imTag = body.match(/<img[^>]*>/i);
    const pic = pickImg(imTag ? imTag[0] : '');
    const text = cleanText(body);
    if (!imTag && !text) continue;
    let item = byId.get(mid);
    if (!item) {
      item = { vod_id: HOST + path, vod_name: '', vod_pic: '', vod_remarks: '' };
      byId.set(mid, item);
      out.push(item);
    }
    if (pic && !item.vod_pic) item.vod_pic = pic;
    if (text && (!item.vod_name || text.length > item.vod_name.length)) item.vod_name = text;
  }
  for (const item of out) {
    if (!item.vod_name) continue;
    const cm = item.vod_name.match(/^([A-Za-z]{2,10}-\d{2,8})/);
    if (cm) item.vod_remarks = cm[1].toUpperCase();
  }
  return out.filter((x) => x.vod_name);
}

function parsePagecount(html) {
  if (!html) return 1;
  const nums = [...html.matchAll(/[?&]page=(\d+)/g)].map((x) => parseInt(x[1], 10)).filter((n) => n > 0 && n < 100000);
  return nums.length ? Math.max(...nums) : 1;
}

async function home() {
  // 站方现慢 (题材页 21.5s、首页曾 522), 单次 25s 不重试
  const html = await getHtml(HOST + '/', null, 25000);
  return { class: CLASSES, filters: FILTERS, list: parseList(html).slice(0, 30) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = t(body.tid || body.id) || 'latest';
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  // R2: 两张卡分 key (genre/maker); 旧 'sub' 仅作兼容 (旧版 App 已存筛选态)
  const sub = t(extend.genre || extend.maker || extend.sub || '');
  let url;
  if (sub && (sub.startsWith('genres/') || sub.startsWith('maker/'))) {
    url = HOST + '/' + sub;
    if (page > 1) url += '?page=' + page;
  } else if (GENRE_TOP[tid]) {
    // 顶级题材: 直接走题材页, 翻页 ?page=N (p1/p2 各 12 条、0 重叠已验)
    url = HOST + '/' + GENRE_TOP[tid];
    if (page > 1) url += '?page=' + page;
  } else if (tid === 'release') {
    // v5: /release 真翻页 (p1 12 条, p2 9 条, 共 2 页), 不再单页
    url = HOST + '/release';
    if (page > 1) url += '?page=' + page;
  } else if (tid === 'upcoming') {
    // v5: /upcoming 真翻页 (每页 12 条, 至少 8 页), 不再单页
    url = HOST + '/upcoming';
    if (page > 1) url += '?page=' + page;
  } else {
    url = page <= 1 ? HOST + '/' : HOST + '/?page=' + page;
  }
  const html = await getHtml(url, null, 25000);
  const list = parseList(html);
  const pc = Math.max(parsePagecount(html), page);
  return {
    page,
    pagecount: pc,
    limit: list.length || 24,
    total: list.length,
    list,
  };
}

async function catSearch(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/search?q=' + encodeURIComponent(wd);
  if (page > 1) url += '&page=' + page;
  const html = await getHtml(url, null, 25000);
  const list = parseList(html);
  const pc = Math.max(parsePagecount(html), page);
  return {
    page,
    pagecount: pc,
    limit: list.length || 12,
    total: list.length,
    list,
  };
}

function movieOf(durl) {
  const m = String(durl || '').match(/\/movie\/([A-Za-z0-9]+)\/([^/?#]+)/i);
  return m ? { id: m[1], slug: m[2] } : { id: '', slug: '' };
}

// 详情页格式区: <h3 class="video-format-header">FullHD</h3> + 其后 part 按钮
// (href="#" 为当前 part, 否则 ?type=<TYPE>&p=<N>); 每组每 part 出一线。
// token: 详情页 <video data-id> 只属于当前 part —— 页内唯一带
// video-source-active 类的按钮就是它, 只有那一行嵌 token (其他 part
// 各有自己的 token, 嵌错会播错片); 无按钮时默认单 part 也嵌 token。
function parseFormats(html, mv, token) {
  const lines = [];
  if (!html) return lines;
  const tok = token ? ':' + token : '';
  const heads = [...html.matchAll(/video-format-header[^>]*>\s*([^<]+?)\s*<\/h3>/g)];
  for (let i = 0; i < heads.length; i++) {
    const fmt = t(heads[i][1]);
    if (!fmt) continue;
    const type = fmt.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const segStart = heads[i].index + heads[i][0].length;
    const segEnd = (i + 1 < heads.length) ? heads[i + 1].index : Math.min(html.length, segStart + 4000);
    const seg = html.slice(segStart, segEnd);
    // 组内规范 type 取自兄弟链接的 ?type= (站方实值, 如 FULLHD_UPDATED);
    // '#' 按钮 (当前 part) 无 href 参数时用它, 不再用标题剥出来的臆测值
    // (旧版 "FullHD (Fixed)" 剥出 FULLHDFIXED, 站方从未用过该值; 实测站方
    // 忽略未知 type 回默认 part, 与 FULLHD_UPDATED 回同一 mp4, 但仍以实值为准)。
    const typeInSeg = seg.match(/[?&]type=([A-Za-z0-9_-]+)/i);
    const canonType = typeInSeg ? typeInSeg[1].toUpperCase() : type;
    const bre = /<a[^>]*video-source-btn[^>]*>([^<]*)<\/a>/g;
    let bm;
    let hasBtn = false;
    while ((bm = bre.exec(seg)) !== null) {
      hasBtn = true;
      const tag = bm[0] || '';
      const href = attrVal(tag, 'href');
      const part = t(bm[1]) || '1';
      const isActive = /video-source-active/.test(tag);
      let ptype = canonType;
      let pnum = part;
      const qm = href.match(/[?&]type=([^&]+)&p=(\d+)/i);
      if (qm) { ptype = qm[1].toUpperCase(); pnum = qm[2]; }
      lines.push(fmt + '·P' + pnum + '$move:' + mv.id + ':' + mv.slug + ':' + ptype + ':' + pnum + (isActive ? tok : ''));
    }
    if (!hasBtn) lines.push(fmt + '·P1$move:' + mv.id + ':' + mv.slug + ':' + canonType + ':1' + tok);
  }
  return lines;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let durl = t(raw);
  if (!durl) return { list: [] };
  if (!/^https?:\/\//i.test(durl)) durl = HOST + durl;
  const mv = movieOf(durl);
  const html = await getHtml(durl, null, 25000);
  if (!html) return { list: [] };

  let name = '';
  const tm = html.match(/<title>([^<]*)<\/title>/i);
  if (tm) name = cleanText(tm[1]).replace(/\s*\|\s*JAVMove\s*$/i, '').trim();
  // 海报: 首个 data-srcset (详情页 13 个 data-srcset 里第 1 个即海报,
  // 其余 12 个是相关卡); 退路为首张截图 (splide, 真 src)。
  let pic = '';
  const pm = html.match(/data-srcset\s*=\s*"([^"]+)"/i);
  if (pm) {
    const u = pm[1].split(/[\s,]+/).filter(Boolean)[0] || '';
    if (/^https?:\/\//i.test(u)) pic = u;
  }
  if (!pic) {
    const sm = html.match(/<li class="splide__slide">[\s\S]{0,600}?<img[^>]*>/i);
    if (sm) pic = pickImg(sm[0]);
  }
  // 当前 part 的 data-id (页内唯一, 归属 active 按钮的 part)
  const dm0 = html.match(/data-id="([^"]+)"/);
  const token = dm0 ? dm0[1] : '';

  let lines = parseFormats(html, mv, token);
  // v5: 无格式区且无 data-id token 时不给播放线路。即将上映的片在站方详情页里
  // 根本没有片源 (2026-11-14 抽 4 部: 0 格式区、0 data-id、0 mp4/m3u8/预告;
  // MIMK-294 发行日 2026-11-15, 还没上映)。旧版兜底给一条无 token 的"正片",
  // play() 三腿全败回空 url, 手机端无限转圈。无线路即详情页无播放按钮,
  // 上映后站方放出片源即自动有线路, 不用再改蜘蛛。
  if (!lines.length && token) lines = ['正片$move:' + mv.id + ':' + mv.slug + '::1:' + token];

  const vod = {
    vod_id: durl,
    vod_name: name || mv.slug,
    vod_pic: pic,
    vod_play_from: NAME,
    vod_play_url: lines.join('#'),
  };
    return { list: [vod] };
}

// /watch 直取 (必须带 Referer, 任意值都行; 不带则 200 但正文仅 "re")。
// 成功回 http(s) 直链, 否则回 ''。
async function watchByToken(token, referer) {
  try {
    const txt = await getHtml(HOST + '/watch?token=' + encodeURIComponent(token), { 'Referer': referer }, 10000);
    const url = t(txt);
    return /^https?:\/\//i.test(url) ? url : '';
  } catch (e) {
    return '';
  }
}

// Worker 整链代取: /resolve 在 Worker 内做 part 页 -> data-id -> /watch,
// 回 {ok, url} JSON (10 分钟缓存)。未部署/失败/超时回 '', 不阻塞直连回落。
async function watchByWorker(mid, slug, type, part) {
  if (!JAVMOVE_WORKER) return '';
  try {
    const u = JAVMOVE_WORKER + '/resolve?mid=' + encodeURIComponent(mid)
      + '&slug=' + encodeURIComponent(slug)
      + '&type=' + encodeURIComponent(type || '')
      + '&p=' + encodeURIComponent(part || '1');
    const r = await $fetch.get(u, { timeout: 8000 });
    const j = JSON.parse(typeof r.data === 'string' ? r.data : '');
    if (j && j.ok && /^https?:\/\//i.test(j.url || '')) return j.url;
    return '';
  } catch (e) {
    return '';
  }
}

// play 收尾: 只挂 detail() 预热已入缓存的字幕命中 (R2: 不再现搜、不再等
// 6s、不再并发冲站方; 无缓存命中即无字幕返回, 播放优先)。
// R3: 最终直链包进 Worker /stream 再回 (源站对无 Range / 无尾端 Range
// 只回前 3 MiB, moov 3.4-4.2MB 永远拿不全, FFmpeg 直连复现打不开;
// /stream 把请求翻译成明确尾端 Range 再流回, 显式 Range 原样透传)。
// Worker 未部署 (JAVMOVE_WORKER 为空) 时回直链 (旧行为, 仅作退路)。
function streamUrl(url) {
  if (!JAVMOVE_WORKER || !/^https?:\/\/[^/]+\.cfd\/vs\//i.test(url || '')) return url;
  return JAVMOVE_WORKER + '/stream?u=' + encodeURIComponent(url);
}
function playFinish(url, durl) {
  const res = {
    parse: 0,
    url: streamUrl(url),
    // R4: 必须带 Connection: keep-alive (见文件头 R4 注释)。
    // FFmpeg/ijkplayer 默认每请求发 `Connection: close`, Cloudflare
    // 边缘对 HTTP/1.1 + close 的大响应随机提前掐断 (起播约 33 秒处断,
    // seek 新请求常死在几百 KB 处致拖进度条冻住); 自定义 Connection
    // 头会替代 FFmpeg 的默认值 (只发 keep-alive 一行), 边缘即足额
    // 回传, ffmpeg 经线上 Worker v2 带此头 150 秒连续解码已验全通。
    header: { 'User-Agent': UA, 'Referer': HOST + '/', 'Connection': 'keep-alive' },
  };
    return res;
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  // 播放 id: move:<mid>:<slug>:<type>:<part>[:<token>]
  // token 仅在 detail() 时当前 (active) part 的那一行里有。
  // 注意 token 字符集不止 [A-Za-z0-9_-] (实测有 "~VWGLFyn"、"~4O6kjvJ"),
  // 不用正则收尾、用 split 取第 6 段及之后全部 (token 内即使含 ':' 也不炸)。
  const parts = id.split(':');
  if (parts.length < 5 || parts[0] !== 'move') return { parse: 0, url: '' };
  const mid = parts[1] || '';
  const slug = parts[2] || '';
  const type = parts[3] || '';
  const part = parts[4] || '';
  const token = parts.length > 5 ? parts.slice(5).join(':') : '';
  if (!mid || !slug || !/^\d+$/.test(part)) return { parse: 0, url: '' };
  const durl = HOST + '/movie/' + mid + '/' + slug;
  const partUrl = type ? durl + '?type=' + type + '&p=' + part : durl;
  // (1) 快径: detail 时嵌的 token, 单次 /watch 直取直链 (~3s)。
  //     token 每次加载轮换、但同一 token 至少数分钟有效; 失效即回落。
  if (token) {
    const u = await watchByToken(token, durl);
    if (u) return playFinish(u, durl);
  }
  // (2) Worker 整链代取 (已部署时)。
  const wu = await watchByWorker(mid, slug, type, part);
  if (wu) return playFinish(wu, durl);
  // (3) 直连: 按 part 地址现取 data-id (各 part token 不同), 再调 /watch。
  const html = await getHtml(partUrl, null, 15000);
  if (!html) return { parse: 0, url: '' };
  const dm = html.match(/data-id="([^"]+)"/);
  if (!dm) return { parse: 0, url: '' };
  const url = await watchByToken(dm[1], partUrl);
  if (!url) return { parse: 0, url: '' };
  return playFinish(url, durl);
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

// (play 侧字幕挂载已改为 playFinish() 的缓存只读, 不再现搜。)

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
    return jsonify({ ver: 1, title: 'JavMove', site: HOST, tabs });
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
