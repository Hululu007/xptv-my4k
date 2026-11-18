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

// Manko (https://manko.fun) -> CatPawOpen spider
// 站点：JAV 在线站（JavClick 系 App 壳），站内 API 在 healertanker.com，
//   备用 host alpharomeo.shop（window.ip2，Bt() 回退腿；VM 实测通）。
// API（2026-11-13 VM 实测通）：
//   列表/搜索：GET https://healertanker.com/swx/movie/search?page=N&size=24
//     &can_manko=true[&most_popular=true|&top_rated=true|&subtitle_link=true]
//     [&genre=<体裁名>|&country=<厂商名>|&keyword=<词>]，回包
//     {"data":"<xn 编码>","total":N}，data 为自定义 base91 变体编码（xn，
//     字母表见下，原样抄自 /dist/build.js，Buffer 解码）；home total
//     292800、popular 31613、Big Tits 体裁 5057、字幕 32571；
//     p1/p2 各 24 条无重叠。注意：category= 参数是死路（恒 total 0），
//     体裁过滤必须用 genre=、厂商过滤用 country=（/filter/:type/:name
//     的 ma() 构造法实测坐实）。
//   体裁表：GET /common/list-genre -> data 为明文数组 115 个；
//   厂商表：GET /common/country-list -> data 明文数组 1000 个（按站内
//     热度排序，卡片只取前 40，均逐个实测有量）。
//   随机：GET /swx/movie/random-list?page=N&size=24（同 xn 编码）。
//   详情：GET /swx/movie/detail/<_id> -> xn 解码后含 wasabi_url_1、
//     wasabi_embed_url、missav_video（surrit /720p/video.m3u8）、
//     upload18_player、mmtv_embed（10 部抽样：embed/missav/upload18
//     均为 10/10，mmtv 2/10）。
//   播放：站方 App 用 wasabi_embed_url（iframe 播放器，server1）为主线；
//     播放器 JS 取 https://<embed host>/stream?id=<code> -> {media:
//     {stream:<wasabi m3u8>, vtt}}；蜘蛛同款取 /stream 得直链 m3u8。
//     断点坐实（2026-11-13 VM 实测，4 部 + 抽样 3 部）：wasabi 播单
//     host（strongcalmforce 等）是 Cloudflare 前置、按 Referer 放行——
//     Referer=embed host origin（sadie-shop.site）时 master/变体/首分片
//     全 200，Referer=manko.fun 或无 Referer 时全 403。旧代码 play()
//     一律传 Referer: manko.fun，手机端同样会被 403——这就是“所有内容
//     都无法播放”的主因（不是 VM 出口问题）。修法：wasabi 腿的
//     /stream 取链与 m3u8 返回头一律用 embed host origin 作 Referer。
//     master 实测单变体 1280x720（7 部全是 BANDWIDTH=2816000，
//     RESOLUTION=1280x720），故只出单档 720p，不编 1080p。
//     MissAV 腿：surrit 全档位 VM 侧一律 CF 403（连数据里给定的 720p
//     也 403；jina 中转同样 403），VM 无法逐档核实，故只出两档：
//     自动（playlist.m3u8 主播单，与仓内 missav.js 同款构造，播放器
//     自选最高可用档）+ 数据档（详情原给的 /1080p|720p|480p|360p/
//     video.m3u8，逐部不同、标签按实测档位动态标，不写死 720p）；
//     1080/480/360 不硬编（存在性 VM 侧无法证实）。MissAV 腿不带 Referer 头
//     （与仓内 missav.js 一致：它裸返 m3u8 且用户真机确认可播）。
//     7MMTV 腿（mmtv_m3u8，最新 24 部里 6 部有）：播单本身 200、
//     分片须带 Referer: https://7mmtv.sx/ 才放行（manko.fun 必 404；
//     2026-11-13 实测：6af5278f 首分片 7mmtv Referer 下 200/386KB，
//     manko Referer 下 404）；部分条目分片已过期（SNOS-389 与
//     5ff450… 两条目播单 200 但分片 404，任一 Referer 皆然），
//     故 detail 里先验活（播单 200 + 首分片 200 才出线，验不出
//     则保留），play 返回头用 7mmtv.sx。
//     Upload18 腿：站方本身部分视频已无（upload18.org/play/index/
//     <番号> 302 到 /404.html，标题 Page not found；SNOS-389 正常
//     200），不是蜘蛛取错地址；detail 里先验活（5s 超时，验不出
//     则保留），死的直接不出线。
//   详情出线：Manko 720p（/stream 直链）+ MissAV 自动/数据档 +
//     7MMTV（验活才出）+ Upload18（验活才出，播放器页 parse:1 嗅探）。
// 分类呈现（用户 2026-11-13 01:59 定）：顶级分类 + 筛选卡片（123AV 款），
//   子分类不平铺：最新 / 无码流出 / 无码破解 / 巨乳 / 大屁股 / 屁股 /
//   中出 / 人妻 / 素人 / 最受欢迎 / 最高评分 / 有字幕 / 随机 /
//   体裁（卡片）/ 厂商（卡片）。8 个热门体裁顶级化（2026-11-13 实测
//   total：无码流出 192、无码破解 2746、巨乳 64092、大屁股 8587、
//   屁股 10314、中出 88822、人妻 28277、素人 54906）。
// 分类呈现（用户 2026-11-13 01:59 定）：顶级分类 + 筛选卡片（123AV 款），
//   子分类不平铺：最新 / 最受欢迎 / 最高评分 / 有字幕 / 随机 /
//   体裁（卡片）/ 厂商（卡片）。
// 字幕：JAV 站、标题带番号，接 sextb.js 字幕块（整块照抄，见文件尾）：
//   detail 里 subRegister 登记 + subWarm 预热（键为 manko:<_id>），
//   play 里 subSearchAll(同键) 并行、有命中才挂 subs。

const KEY = 'py_manko';
const NAME = 'Manko';
const API_HOSTS = ['https://healertanker.com', 'https://alpharomeo.shop'];
const SITE = 'https://manko.fun';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;

// 体裁卡片：/common/list-genre 明文表 115 个，逐个实测 p1 后保留 103 个
// （12 个 0 条已剔除，2026-11-13 复查 11 个仍 0 条，No underwear 仅 2 条
// 仍剔除：Chroma Key、Hairy、Hobby, Culture、Itching、
// Male Adventure、No underwear、Pampering、Psychological thriller、
// R-15、Suspense、Ultra-Huge Tit、Variety Show）。
const GENRE_CARDS = [
{ n: "69", v: "69" },
  { n: "3D", v: "3D" },
  { n: "3p, 4p", v: "3p, 4p" },
  { n: "4HR+", v: "4HR+" },
  { n: "4K", v: "4K" },
  { n: "Action", v: "Action" },
  { n: "Adult Movie", v: "Adult Movie" },
  { n: "Amateur", v: "Amateur" },
  { n: "Anus", v: "Anus" },
  { n: "BBW", v: "BBW" },
  { n: "Beautiful foot", v: "Beautiful foot" },
  { n: "Beautiful Girl Movie", v: "Beautiful Girl Movie" },
  { n: "Best, Omnibus", v: "Best, Omnibus" },
  { n: "Big cock", v: "Big cock" },
  { n: "Big Tits", v: "Big Tits" },
  { n: "Blow", v: "Blow" },
  { n: "Breast Milk", v: "Breast Milk" },
  { n: "Breasts", v: "Breasts" },
  { n: "Butt", v: "Butt" },
  { n: "Classic", v: "Classic" },
  { n: "Close Up", v: "Close Up" },
  { n: "Co-act", v: "Co-act" },
  { n: "Coprophagy", v: "Coprophagy" },
  { n: "Cowgirl", v: "Cowgirl" },
  { n: "Creampie", v: "Creampie" },
  { n: "Cum", v: "Cum" },
  { n: "Cunnilingus", v: "Cunnilingus" },
  { n: "dating", v: "dating" },
  { n: "Debut Production", v: "Debut Production" },
  { n: "Deep Throating", v: "Deep Throating" },
  { n: "Defecation", v: "Defecation" },
  { n: "Digital Mosaic", v: "Digital Mosaic" },
  { n: "Dirty Words", v: "Dirty Words" },
  { n: "Documentary", v: "Documentary" },
  { n: "Doggy style", v: "Doggy style" },
  { n: "Drama", v: "Drama" },
  { n: "Facesitting", v: "Facesitting" },
  { n: "Facials", v: "Facials" },
  { n: "Fan Appreciation", v: "Fan Appreciation" },
  { n: "FFM", v: "FFM" },
  { n: "Fighting Action", v: "Fighting Action" },
  { n: "Finger Fuck", v: "Finger Fuck" },
  { n: "Fisting", v: "Fisting" },
  { n: "Fit two holes", v: "Fit two holes" },
  { n: "Footjob", v: "Footjob" },
  { n: "For Women", v: "For Women" },
  { n: "Gravure", v: "Gravure" },
  { n: "Handjob", v: "Handjob" },
  { n: "HD DVD", v: "HD DVD" },
  { n: "Historical Play", v: "Historical Play" },
  { n: "Horror", v: "Horror" },
  { n: "How To", v: "How To" },
  { n: "Huge Butt", v: "Huge Butt" },
  { n: "Image Video", v: "Image Video" },
  { n: "Independents", v: "Independents" },
  { n: "Interview", v: "Interview" },
  { n: "Kiss", v: "Kiss" },
  { n: "Lolita", v: "Lolita" },
  { n: "Love", v: "Love" },
  { n: "Massage", v: "Massage" },
  { n: "Masturbation", v: "Masturbation" },
  { n: "Mature Woman", v: "Mature Woman" },
  { n: "Mini", v: "Mini" },
  { n: "MMF", v: "MMF" },
  { n: "MMFF", v: "MMFF" },
  { n: "Multiple Story", v: "Multiple Story" },
  { n: "Muscle", v: "Muscle" },
  { n: "No bra", v: "No bra" },
  { n: "Omnibus", v: "Omnibus" },
  { n: "Original Collaboration", v: "Original Collaboration" },
  { n: "Over 16 hours", v: "Over 16 hours" },
  { n: "Oversea Import", v: "Oversea Import" },
  { n: "Parody", v: "Parody" },
  { n: "Piss Drinking", v: "Piss Drinking" },
  { n: "POV", v: "POV" },
  { n: "Pregnant Woman", v: "Pregnant Woman" },
  { n: "Promiscuity", v: "Promiscuity" },
  { n: "Reprinted Edition", v: "Reprinted Edition" },
  { n: "Risky Mosaic", v: "Risky Mosaic" },
  { n: "Roll your eyes", v: "Roll your eyes" },
  { n: "Sensuality", v: "Sensuality" },
  { n: "SF", v: "SF" },
  { n: "Shave", v: "Shave" },
  { n: "Shaved", v: "Shaved" },
  { n: "Simulation", v: "Simulation" },
  { n: "Slender", v: "Slender" },
  { n: "Solowork", v: "Solowork" },
  { n: "Spanking", v: "Spanking" },
  { n: "Special Effects", v: "Special Effects" },
  { n: "Squirting", v: "Squirting" },
  { n: "Subjectivity", v: "Subjectivity" },
  { n: "Tall", v: "Tall" },
  { n: "Tits", v: "Tits" },
  { n: "Titty Fuck", v: "Titty Fuck" },
  { n: "Touch Typing", v: "Touch Typing" },
  { n: "Transsexual", v: "Transsexual" },
  { n: "Uncensored Crack", v: "Uncensored Crack" },
  { n: "Uncensored Leak", v: "Uncensored Leak" },
  { n: "Urination", v: "Urination" },
  { n: "US/EU Porn", v: "US/EU Porn" },
  { n: "User Submission", v: "User Submission" },
  { n: "VR", v: "VR" },
  { n: "Yoga·Fitness", v: "Yoga·Fitness" }
];

// 厂商卡片：/common/country-list 前 40（站内热度序，逐个实测有量后保留）。
const MAKER_CARDS = [
  { n: "S1 NO.1 STYLE", v: "S1 NO.1 STYLE" },
  { n: "MOODYZ", v: "MOODYZ" },
  { n: "IDEA POCKET", v: "IDEA POCKET" },
  { n: "マドンナ(Madonna)", v: "マドンナ(Madonna)" },
  { n: "PRESTIGE,プレステージ", v: "PRESTIGE,プレステージ" },
  { n: "SOD Create", v: "SOD Create" },
  { n: "センタービレッジ", v: "センタービレッジ" },
  { n: "クリスタル映像", v: "クリスタル映像" },
  { n: "FALENO", v: "FALENO" },
  { n: "ルビー", v: "ルビー" },
  { n: "桃太郎映像出版", v: "桃太郎映像出版" },
  { n: "シロウトTV", v: "シロウトTV" },
  { n: "アリスJAPAN", v: "アリスJAPAN" },
  { n: "STAR PARADISE", v: "STAR PARADISE" },
  { n: "Glory Quest", v: "Glory Quest" },
  { n: "タカラ映像", v: "タカラ映像" },
  { n: "Attackers", v: "Attackers" },
  { n: "h.m.p", v: "h.m.p" },
  { n: "ワンズファクトリー", v: "ワンズファクトリー" },
  { n: "パラダイステレビ", v: "パラダイステレビ" },
  { n: "GIGA", v: "GIGA" },
  { n: "ビッグモーカル", v: "ビッグモーカル" },
  { n: "ワープエンタテインメント", v: "ワープエンタテインメント" },
  { n: "なでしこ", v: "なでしこ" },
  { n: "アイエナジー", v: "アイエナジー" },
  { n: "VENUS", v: "VENUS" },
  { n: "ナチュラルハイ", v: "ナチュラルハイ" },
  { n: "ディープス", v: "ディープス" },
  { n: "映天", v: "映天" },
  { n: "Hunter", v: "Hunter" },
  { n: "ナンパTV", v: "ナンパTV" },
  { n: "TMA", v: "TMA" },
  { n: "NEXT GROUP", v: "NEXT GROUP" },
  { n: "オルスタックピクチャーズ", v: "オルスタックピクチャーズ" },
  { n: "ジャネス", v: "ジャネス" },
  { n: "S級素人", v: "S級素人" },
  { n: "プレステージプレミアム(PRESTIGE PREMIUM)", v: "プレステージプレミアム(PRESTIGE PREMIUM)" },
  { n: "マキシング", v: "マキシング" },
  { n: "マックスエー", v: "マックスエー" },
  { n: "セレブの友", v: "セレブの友" }
];

function t(v) {
  return String(v == null ? '' : v).trim();
}

// 顶级化的热门体裁（用户 2026-11-13 点名：顶级分类太少，多加无码流出 /
// 大屁股 / 巨乳一类；total 见文件头注释，均为站内实测有量）。
const TOP_GENRES = [
  { id: 'g_uncleak', name: '无码流出', genre: 'Uncensored Leak' },
  { id: 'g_unccrack', name: '无码破解', genre: 'Uncensored Crack' },
  { id: 'g_bigtits', name: '巨乳', genre: 'Big Tits' },
  { id: 'g_hugebutt', name: '大屁股', genre: 'Huge Butt' },
  { id: 'g_butt', name: '屁股', genre: 'Butt' },
  { id: 'g_creampie', name: '中出', genre: 'Creampie' },
  { id: 'g_mature', name: '人妻', genre: 'Mature Woman' },
  { id: 'g_amateur', name: '素人', genre: 'Amateur' },
];
const TOP_GENRE_MAP = {};
for (const g of TOP_GENRES) TOP_GENRE_MAP[g.id] = g.genre;

// xn 解码（原样抄自 manko.fun /dist/build.js 的 xn 函数；
// vn 即 Buffer；字母表 91 字符的 base91 变体）。
function xn(e) {
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
  const t0 = '' + (e || '');
  const n = t0.length;
  const r = [];
  let a = 0, i = 0, o = -1;
  for (let s = 0; s < n; s++) {
    const l = ALPH.indexOf(t0[s]);
    if (l === -1) continue;
    if (o < 0) o = l;
    else {
      a |= (o += 91 * l) << i;
      i += (8191 & o) > 88 ? 13 : 14;
      do { r.push(255 & a); a >>= 8; i -= 8; } while (i > 7);
      o = -1;
    }
  }
  if (o > -1) r.push(255 & (a | (o << i)));
  return Buffer.from(r).toString('utf-8');
}

async function apiRaw(path) {
  for (const host of API_HOSTS) {
    try {
      const r = await $fetch.get(host + path, {
        headers: { 'User-Agent': UA, 'Referer': SITE + '/', 'Accept': 'application/json,*/*' },
        timeout: 20000,
        });
      const data = r && r.data;
      const txt = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
      if (txt) {
        try { return JSON.parse(txt); } catch (e) { /* 非 JSON（如拦截页），换备用 host */ }
      }
    } catch (e) { /* 换备用 host */ }
  }
  return null;
}

// search 系接口：解 data、带 total；失败回 null。
async function apiSearch(path) {
  const j = await apiRaw(path);
  if (!j || typeof j.data !== 'string') return null;
  let arr = [];
  try { arr = JSON.parse(xn(j.data)); } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;
  return { items: arr, total: Number(j.total) || 0 };
}

async function apiDetail(id) {
  const j = await apiRaw('/swx/movie/detail/' + encodeURIComponent(id));
  if (!j || typeof j.data !== 'string') return null;
  try {
    const d = JSON.parse(xn(j.data));
    return d && typeof d === 'object' ? d : null;
  } catch (e) { return null; }
}

function itemToVod(it) {
  if (!it || !it._id) return null;
  const title = t(it.title) || t((it.title_display_name || [])[0] && it.title_display_name[0].title) || it._id;
  const remarks = [t(it.share_date), it.rating ? ('\u2605' + it.rating) : ''].filter(Boolean).join(' ');
  return {
    vod_id: String(it._id),
    vod_name: title,
    vod_pic: t(it.thumbnail_image) || t(it.wide_thumbnail) || '',
    vod_remarks: remarks,
  };
}

function searchUrl(page, extra) {
  return '/swx/movie/search?page=' + page + '&size=' + PAGE_SIZE + '&can_manko=true' + (extra || '');
}

async function init() {
  return {};
}

async function home() {
  const classes = [{ type_id: 'new', type_name: '最新' }];
  for (const g of TOP_GENRES) classes.push({ type_id: g.id, type_name: g.name });
  classes.push(
    { type_id: 'popular', type_name: '最受欢迎' },
    { type_id: 'top_rated', type_name: '最高评分' },
    { type_id: 'subtitle', type_name: '有字幕' },
    { type_id: 'random', type_name: '随机' },
    { type_id: 'genres', type_name: '体裁' },
    { type_id: 'makers', type_name: '厂商' },
  );
  return {
    class: classes,
    filters: {
      genres: [{ key: 'sub', name: '体裁', value: GENRE_CARDS }],
      makers: [{ key: 'sub', name: '厂商', value: MAKER_CARDS }],
    },
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'new');
  const extend = body.filters || body.extend || {};
  const sub = String(extend.sub || '');
  let path = '';
  if (id === 'new') path = searchUrl(page, '');
  else if (TOP_GENRE_MAP[id]) path = searchUrl(page, '&genre=' + encodeURIComponent(TOP_GENRE_MAP[id]));
  else if (id === 'popular') path = searchUrl(page, '&most_popular=true');
  else if (id === 'top_rated') path = searchUrl(page, '&top_rated=true');
  else if (id === 'subtitle') path = searchUrl(page, '&subtitle_link=true');
  else if (id === 'random') path = '/swx/movie/random-list?page=' + page + '&size=' + PAGE_SIZE;
  else if (id === 'genres') path = searchUrl(page, '&genre=' + encodeURIComponent(sub || GENRE_CARDS[0].v));
  else if (id === 'makers') path = searchUrl(page, '&country=' + encodeURIComponent(sub || MAKER_CARDS[0].v));
  else return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const res = await apiSearch(path);
  if (!res) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const list = res.items.map(itemToVod).filter(Boolean);
  const pagecount = res.total > 0
    ? Math.max(1, Math.ceil(res.total / PAGE_SIZE))
    : (list.length < PAGE_SIZE ? page : page + 1);
  return { page, pagecount, limit: list.length || PAGE_SIZE, total: res.total, list };
}

function titleOf(d, fallback) {
  const names = Array.isArray(d.title_display_name) ? d.title_display_name : [];
  const en = names.filter((x) => x && x.language === 'en')[0];
  const any = names[0];
  return t(d.title) || t(en && en.title) || t(any && any.title) || fallback || '';
}

function overviewOf(d) {
  const arr = Array.isArray(d.discription) ? d.discription : [];
  const zh = arr.filter((x) => x && x.language === 'zh')[0];
  const en = arr.filter((x) => x && x.language === 'en')[0];
  return t(zh && zh.overview) || t(en && en.overview) || t(arr[0] && arr[0].overview);
}

// embed 播放器 /stream 取直链：wasabi_embed_url 形如
// https://<host>/e/<code>?poster=... -> GET https://<host>/stream?id=<code>
// 关键：/stream 与后续 m3u8 都按 Referer 放行，Referer 必须是 embed host
// origin（实测：sadie-shop.site 作 Referer 时 200，manko.fun/无 Referer
// 时 CF 403）；/stream 本身对 manko.fun Referer 也通，但统一用 embed
// origin 最贴近站方播放器行为。
async function resolveWasabiStream(embedUrl) {
  if (!embedUrl) return { stream: '', embedOrigin: '' };
  const m = String(embedUrl).match(/^(https?:\/\/[^\/]+)\/e\/([A-Za-z0-9]+)/);
  if (!m) return { stream: '', embedOrigin: '' };
  const embedOrigin = m[1];
  const streamApi = m[1] + '/stream?id=' + m[2];
  try {
    const r = await $fetch.get(streamApi, {
      headers: { 'User-Agent': UA, 'Referer': embedOrigin + '/' },
      timeout: 15000,
      });
    const data = r && r.data;
    const txt = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    if (!txt) return { stream: '', embedOrigin };
    const j = JSON.parse(txt);
    return { stream: t(j && j.media && j.media.stream), embedOrigin };
  } catch (e) {
    return { stream: '', embedOrigin };
  }
}

// 7MMTV 播单验活：播单 200 且含 #EXTM3U、首分片 200 才算活；
// 其余情况（超时/异常/播单非 200/无清单标记）一律按活处理，
// 不因本站抖动藏线。分片须带 Referer: https://7mmtv.sx/。
async function mmtvAlive(m3u8Url) {
  try {
    const r = await $fetch.get(m3u8Url, {
      headers: { 'User-Agent': UA, 'Referer': 'https://7mmtv.sx/' },
      timeout: 5000,
      });
    const txt = typeof r.data === 'string' ? r.data : '';
    if (r.status !== 200 || txt.indexOf('#EXTM3U') < 0) return true;
    const seg = txt.split('\n').map((s) => s.trim()).find((s) => /^https?:/.test(s) && !/\.m3u8/i.test(s));
    if (!seg) return true;
    const sr = await $fetch.get(seg, {
      headers: { 'User-Agent': UA, 'Referer': 'https://7mmtv.sx/' },
      timeout: 5000,
      });
    return sr.status === 200;
  } catch (e) {
    return true;
  }
}

// Upload18 播放器页验活：站方本身部分视频已下架（302 到 /404.html，
// 标题 Page not found）；活页标题是番号。5s 超时，验不出（超时/异常/
// 非 200 非 404）一律按活处理，不因本站抖动藏线。
async function u18Alive(playerUrl) {
  try {
    const r = await $fetch.get(playerUrl, {
      headers: { 'User-Agent': UA, 'Referer': SITE + '/' },
      timeout: 5000,
      });
    const txt = typeof r.data === 'string' ? r.data : '';
    if (txt.indexOf('<title>Page not found</title>') >= 0) return false;
    if (r.status === 200 && txt) return true;
    return true; // 非 404 的异常状态不断言死，保留线
  } catch (e) {
    return true;
  }
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let id = t(raw);
  if (id.indexOf('manko:') === 0) id = id.slice(6);
  if (!id) return { list: [] };
  const d = await apiDetail(id);
  if (!d) return { list: [] };
  const name = titleOf(d, id);
  const pic = t(d.cover_image) || '';
  const from = [];
  const urls = [];
  // 分组 1：Manko 720p（/stream 直链；master 实测单变体 1280x720，
  // 无 embed 时退 wasabi_url_1 直链，同用 embed host Referer）。
  if (d.wasabi_embed_url || d.wasabi_url_1) {
    from.push(NAME);
    urls.push('720p$manko:' + id + ':wasabi');
  }
  // 分组 2：MissAV 自动 + 数据档。档位取自详情数据原给的地址
  // （/1080p/、/720p/ 等逐部不同，写死 720p 会标错——MUDR-405
  // 数据里就是 1080p）；自动是同 uuid 的 playlist.m3u8 主播单
  // （仓内 missav.js 同款构造），播放器自选最高可用档；
  // 其他档不硬编（VM 侧 surrit 全档位皆 CF 403，逐档存在性无法证实）。
  if (d.missav_video) {
    from.push('MissAV');
    const mv = t(d.missav_video);
    const resM = mv.match(/\/(1080p|720p|480p|360p)\/video\.m3u8$/i);
    const resLabel = resM ? resM[1] : '720p';
    const auto = resM ? mv.replace(/\/\d+p\/video\.m3u8$/i, '/playlist.m3u8') : '';
    urls.push((auto ? '自动$manko:' + id + ':missav-auto' : '') + (auto ? '#' : '') + resLabel + '$manko:' + id + ':missav');
  }
  // 分组 3：7MMTV（mmtv_m3u8 直链；分片须带 7mmtv.sx Referer，
  // 部分条目分片已过期，先验活，死的直接不出线，验不出则保留）。
  if (d.mmtv_m3u8) {
    if (await mmtvAlive(t(d.mmtv_m3u8))) {
      from.push('7MMTV');
      urls.push('播放$manko:' + id + ':mmtv');
    }
  }
  // 分组 4：Upload18（播放器页，parse:1 嗅探线；站方已下架的先验活，
  // 死的直接不出线，验不出则保留）。
  if (Array.isArray(d.upload18_player) && d.upload18_player[0]) {
    if (await u18Alive(t(d.upload18_player[0]))) {
      from.push('Upload18');
      urls.push('播放$manko:' + id + ':u18');
    }
  }
  const vod = {
    vod_id: 'manko:' + id,
    vod_name: name || id,
    vod_pic: pic,
    vod_content: overviewOf(d),
    vod_remarks: d.video_duration ? (Math.floor(Number(d.video_duration) || 0) + '分钟') : '',
    vod_play_from: from.join('$$$'),
    vod_play_url: urls.join('$$$'),
  };
  // 字幕：标题带番号才登记+预热（键 manko:<_id>，与 play 同键）。
    return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const m = id.match(/^manko:([^:]+):(wasabi|missav|missav-auto|mmtv|u18)$/);
  if (!m) {
    // 裸 m3u8 直链直接返。
    if (/\.m3u8(\?|$)/i.test(id)) {
      return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': SITE + '/' } };
    }
    return { parse: 0, url: '' };
  }
  const vid = m[1];
  const leg = m[2];
      const d = await apiDetail(vid);
  if (!d) return { parse: 0, url: '' };
  if (leg === 'wasabi') {
    // Referer 必须是 embed host origin（见文件头：manko.fun 必 403）。
    const res = await resolveWasabiStream(d.wasabi_embed_url);
    let stream = res.stream;
    if (!stream) stream = t(d.wasabi_url_1);
    if (!stream) return { parse: 0, url: '' };
    const ref = res.embedOrigin ? res.embedOrigin + '/' : SITE + '/';
    return { parse: 0, url: stream, header: { 'User-Agent': UA, 'Referer': ref } };
  }
  if (leg === 'missav' || leg === 'missav-auto') {
    // 不带 Referer 头（与仓内 missav.js 一致：裸返 m3u8，真机可播）。
    const mv = t(d.missav_video);
    if (!mv) return { parse: 0, url: '' };
    let u = mv;
    if (leg === 'missav-auto') {
      if (!/\/\d+p\/video\.m3u8$/i.test(mv)) return { parse: 0, url: '' };
      u = mv.replace(/\/\d+p\/video\.m3u8$/i, '/playlist.m3u8');
    }
    return { parse: 0, url: u };
  }
  if (leg === 'mmtv') {
    const u = t(d.mmtv_m3u8);
    if (!u) return { parse: 0, url: '' };
    // 分片只认 Referer: https://7mmtv.sx/（见文件头）。
    return { parse: 0, url: u, header: { 'User-Agent': UA, 'Referer': 'https://7mmtv.sx/' } };
  }
  // u18：Upload18 播放器页，交播放器嗅探。
  const u = Array.isArray(d.upload18_player) ? t(d.upload18_player[0]) : '';
  if (!u) return { parse: 0, url: '' };
  return { parse: 1, url: u, header: { 'User-Agent': UA, 'Referer': SITE + '/' } };
}

async function catSearch(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const res = await apiSearch(searchUrl(page, '&keyword=' + encodeURIComponent(wd)));
  if (!res) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const list = res.items.map(itemToVod).filter(Boolean);
  const pagecount = res.total > 0
    ? Math.max(1, Math.ceil(res.total / PAGE_SIZE))
    : (list.length < PAGE_SIZE ? page : page + 1);
  return { page, pagecount, limit: list.length || PAGE_SIZE, total: res.total, list };
}

// ---------------- 字幕聚合 ----------------
// 整块照抄 catverify-1101/nodejs/src/spider/video/sextb.js
// （SUB_UA 起至 subWarm 止，2026-11-02 Layer A 定版；尾码优先 subLangOf、
// snake_case fingerprint_score、时长显示、名字+时长去重、全局上限 10、
// 单槽软上限 8、总预算 6 秒）。


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
    const tabs = ([{ id: 'new', name: '最新' }].concat(TOP_GENRES.map(g => ({ id: g.id, name: g.name }))).concat([{ id: 'popular', name: '最受欢迎' }, { id: 'top_rated', name: '最高评分' }, { id: 'subtitle', name: '有字幕' }, { id: 'random', name: '随机' }, { id: 'genres', name: '体裁' }, { id: 'makers', name: '厂商' }])).map((c) => ({ name: c.name, ext: { id: c.id } }));
    return jsonify({ ver: 1, title: 'Manko', site: SITE, tabs });
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
