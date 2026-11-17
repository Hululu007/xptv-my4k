// Bitch Lives - XPTV csp 格式
// 转换自 lailai-rex 模块 NSFW-LIVE-rex-fixed.js（REX Widget 写法重写）；直播聚合站，API http://api.maiyoux.com:81/mf/<分类>.txt，
// 返回 zhubo 数组 {address,title,img}，address 即 FLV 直播流地址，直出可播；无搜索接口。
const API_BASE = 'http://api.maiyoux.com:81/mf/';
const UA = 'Mozilla/5.0 (Linux; Android 4.4.2; OPPO R11 Build/NMF26X) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36';

const appConfig = {
    ver: 1,
    title: 'Bitch Lives',
    site: API_BASE,
    tabs: [
        { name: "卡哇伊", ext: { id: "jsonkawayi" } },
        { name: "咪狐", ext: { id: "jsonmihu" } },
        { name: "花蝴蝶", ext: { id: "jsonhuahudie" } },
        { name: "蜜桃", ext: { id: "jsonmitao" } },
        { name: "番茄社区", ext: { id: "jsonfanjiashequ" } },
        { name: "LOVE", ext: { id: "jsonLOVE" } },
        { name: "小妲己", ext: { id: "jsonxiaodaji" } },
        { name: "77直播", ext: { id: "json77zhibo" } },
        { name: "依依", ext: { id: "jsonyiyi" } },
        { name: "日出", ext: { id: "jsonrichu" } },
        { name: "彩虹", ext: { id: "jsoncaihong" } },
        { name: "久久", ext: { id: "jsonjiujiu" } },
        { name: "亚米", ext: { id: "jsonyami" } },
        { name: "蝶恋", ext: { id: "jsondielian" } },
        { name: "夜妖姬", ext: { id: "jsonyeyaoji" } },
        { name: "套路", ext: { id: "jsontaolu" } },
        { name: "樱花", ext: { id: "jsonyinghua" } },
        { name: "享色", ext: { id: "jsonxiangse" } },
        { name: "红浪漫", ext: { id: "jsonhonglangman" } },
        { name: "金鱼", ext: { id: "jsonjinyu" } },
        { name: "桃花", ext: { id: "jsontaohua" } },
        { name: "花房", ext: { id: "jsonhuafang" } },
        { name: "小仙女", ext: { id: "jsonxiaoxiannv" } },
        { name: "视觉秀", ext: { id: "jsonshijuexiu" } },
        { name: "小天使", ext: { id: "jsonxiaotianshi" } },
        { name: "一直播", ext: { id: "jsonyizhibo" } },
        { name: "彩云", ext: { id: "jsoncaiyun" } },
        { name: "暗语", ext: { id: "jsonanyu" } },
        { name: "咪咪", ext: { id: "jsonmimi" } },
        { name: "娇媚", ext: { id: "jsonjiaomei" } },
        { name: "黄瓜", ext: { id: "jsonhuanggua" } },
        { name: "色趣", ext: { id: "jsonsequ" } },
        { name: "糯米", ext: { id: "jsonnuomi" } },
        { name: "小蜜蜂", ext: { id: "jsonxiaomifeng" } },
        { name: "小红帽", ext: { id: "jsonxiaohongmao" } },
        { name: "桃花运", ext: { id: "jsontaohuayun" } },
        { name: "苦瓜", ext: { id: "jsonkugua" } },
        { name: "爱爱你", ext: { id: "jsonaiaini" } },
        { name: "樱花雨i", ext: { id: "jsonyinghuayui" } },
        { name: "盘他", ext: { id: "jsonpanta" } },
        { name: "夜色", ext: { id: "jsonyese" } },
        { name: "蝴蝶", ext: { id: "jsonhudie" } },
        { name: "小天仙", ext: { id: "jsonxiaotianxian" } },
        { name: "杏趣", ext: { id: "jsonxingqu" } },
        { name: "小坏蛋", ext: { id: "jsonxiaohuaidan" } },
        { name: "飘雪", ext: { id: "jsonpiaoxue" } },
        { name: "樱桃", ext: { id: "jsonyingtao" } },
        { name: "奥斯卡", ext: { id: "jsonaosika" } },
        { name: "卡路里", ext: { id: "jsonkaluli" } },
        { name: "红高粱", ext: { id: "jsonhonggaoliang" } },
        { name: "付宝", ext: { id: "jsonfubao" } },
        { name: "小黄书", ext: { id: "jsonxiaohuangshu" } },
        { name: "二嫂", ext: { id: "jsonersao" } },
        { name: "花果山", ext: { id: "jsonhuaguoshan" } },
        { name: "云鹿", ext: { id: "jsonyunlu" } },
        { name: "菠萝", ext: { id: "jsonboluo" } },
        { name: "星宝贝", ext: { id: "jsonxingbaobei" } },
        { name: "夜艳", ext: { id: "jsonyeyan" } },
        { name: "七仙女s", ext: { id: "jsonqixiannus" } },
        { name: "夜来香", ext: { id: "jsonyelaixiang" } },
        { name: "爱零", ext: { id: "jsonailing" } },
        { name: "十八禁", ext: { id: "jsonshibajin" } },
        { name: "兰桂坊", ext: { id: "jsonlanguifang" } },
        { name: "Dancelife", ext: { id: "jsonDancelife" } },
        { name: "小萌猪", ext: { id: "jsonxiaomengzhu" } },
        { name: "蝴蝶飞", ext: { id: "jsonhudiefei" } },
        { name: "幽梦", ext: { id: "jsonyoumeng" } },
        { name: "丽柜厅", ext: { id: "jsonliguiting" } },
        { name: "蛟龙", ext: { id: "jsonjiaolong" } },
        { name: "颜如玉", ext: { id: "jsonyanruyu" } },
        { name: "橙秀", ext: { id: "jsonchengxiu" } },
        { name: "豹娱l", ext: { id: "jsonbaoyul" } },
        { name: "小花螺", ext: { id: "jsonxiaohualuo" } },
        { name: "皇后", ext: { id: "jsonhuanghou" } },
        { name: "心之恋", ext: { id: "jsonxinzhilian" } },
        { name: "欧美FEATURED", ext: { id: "jsonoumeiFEATURED" } },
        { name: "欧美FEMALE", ext: { id: "jsonoumeiFEMALE" } },
        { name: "欧美MALE", ext: { id: "jsonoumeiMALE" } },
        { name: "欧美COUPLE", ext: { id: "jsonoumeiCOUPLE" } },
        { name: "欧美TRANS", ext: { id: "jsonoumeiTRANS" } },
        { name: "台妹l", ext: { id: "jsontaimeil" } },
        { name: "爱恋", ext: { id: "jsonailian" } },
        { name: "903娱乐", ext: { id: "json903yule" } },
        { name: "九尾狐", ext: { id: "jsonjiuweihu" } },
        { name: "尤物岛", ext: { id: "jsonyouwudao" } },
        { name: "坦克", ext: { id: "jsontanke" } },
        { name: "好基友", ext: { id: "jsonhaojiyou" } },
        { name: "夜女郎", ext: { id: "jsonyenulang" } },
        { name: "娇喘", ext: { id: "jsonjiaochuan" } },
        { name: "芒果派", ext: { id: "jsonmangguopai" } },
        { name: "媚颜", ext: { id: "jsonmeiyan" } },
        { name: "风流", ext: { id: "jsonfengliu" } },
        { name: "夜律", ext: { id: "jsonyelu" } },
        { name: "玲珑", ext: { id: "jsonlinglong" } },
        { name: "浴火", ext: { id: "jsonyuhuo" } },
        { name: "翠鸟", ext: { id: "jsoncuiniao" } },
        { name: "幸运星", ext: { id: "jsonxingyunxing" } },
        { name: "她秀", ext: { id: "jsontaxiu" } },
        { name: "招财猫", ext: { id: "jsonzhaocaimao" } },
        { name: "双碟", ext: { id: "jsonshuangdie" } },
        { name: "糖果", ext: { id: "jsontangguo" } },
        { name: "么么哒", ext: { id: "jsonmemeda" } },
        { name: "小性感", ext: { id: "jsonxiaoxinggan" } },
        { name: "小喵宠", ext: { id: "jsonxiaomiaochong" } },
        { name: "兔女郎", ext: { id: "jsontunulang" } },
        { name: "睡美人", ext: { id: "jsonshuimeiren" } },
        { name: "金呗", ext: { id: "jsonjinbei" } },
        { name: "美夕", ext: { id: "jsonmeixi" } },
        { name: "小妖", ext: { id: "jsonxiaoyao" } },
        { name: "约直播", ext: { id: "jsonyuezhibo" } },
        { name: "花仙子", ext: { id: "jsonhuaxianzi" } },
        { name: "土豪", ext: { id: "jsontuhao" } },
        { name: "红妆", ext: { id: "jsonhongzhuang" } },
        { name: "妞妞", ext: { id: "jsonniuniu" } },
        { name: "艳后", ext: { id: "jsonyanhou" } },
        { name: "moon", ext: { id: "jsonmoon" } },
        { name: "蓝猫", ext: { id: "jsonlanmao" } },
        { name: "美人妆", ext: { id: "jsonmeirenzhuang" } },
        { name: "入巷", ext: { id: "jsonruxiang" } },
        { name: "持久男", ext: { id: "jsonchijiunan" } },
        { name: "倾心", ext: { id: "jsonqingxin" } },
        { name: "小精灵", ext: { id: "jsonxiaojingling" } },
        { name: "偶遇", ext: { id: "jsonouyu" } },
        { name: "灰灰", ext: { id: "jsonhuihui" } },
        { name: "猫头鹰", ext: { id: "jsonmaotouying" } },
        { name: "喜欢你", ext: { id: "jsonxihuanni" } },
        { name: "夜纯", ext: { id: "jsonyechun" } },
        { name: "杏播", ext: { id: "jsonxingbo" } },
        { name: "名流", ext: { id: "jsonmingliu" } },
        { name: "小辣椒", ext: { id: "jsonxiaolajiao" } },
        { name: "蚊香社", ext: { id: "jsonwenxiangshe" } },
        { name: "牵手", ext: { id: "jsonqianshou" } },
        { name: "情趣", ext: { id: "jsonqingqu" } }
    ],
};

async function getJson(url) {
    try {
        const r = await $fetch.get(url, { headers: { 'User-Agent': UA, 'Content-Type': 'application/octet-stream' } });
        const data = r ? r.data : null;
        if (typeof data === 'string') {
            const s = data.trim();
            if (!s) return null;
            try { return JSON.parse(s); } catch (e) { return null; }
        }
        return data;
    } catch (e) {
        return null;
    }
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const cat = String(ext.id || 'jsonkawayi');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const data = await getJson(API_BASE + encodeURIComponent(cat) + '.txt');
    const arr = (data && Array.isArray(data.zhubo)) ? data.zhubo : [];
    const list = arr.filter((it) => it && it.address && it.title).map((it) => ({
        vod_id: String(it.address),
        vod_name: String(it.title).trim(),
        vod_pic: it.img || '',
        vod_remarks: '直播',
        ext: { id: String(it.address), name: String(it.title).trim() },
    }));
    // 站方接口一次返回全量，无翻页；本地按 20 条一页切分
    const PAGE = 20;
    const start = (page - 1) * PAGE;
    return jsonify({ list: list.slice(start, start + PAGE) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const url = String(ext.id || '');
    const tracks = [];
    if (url) tracks.push({ name: '直播', pan: '', ext: { url, name: String(ext.name || '') } });
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA }] });
}

async function search(ext) {
    return jsonify({ list: [] });
}
