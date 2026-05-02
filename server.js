const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();

app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ========== 配置 ==========
const SECRET_KEY = process.env.SECRET_KEY || 'LOVESS-SECRET-KEY-2024';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER || "liushumei11110-boop";
const REPO_NAME = process.env.REPO_NAME || "lovess";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "khyzybnb666147";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "LOVESS-ADMIN-2024";

// ========== 防重放存储 ==========
const usedNonces = new Map();
const rateLimit = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [nonce, expires] of usedNonces.entries()) {
        if (expires < now) usedNonces.delete(nonce);
    }
}, 300000);

// ========== 工具函数 ==========
function getRealIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

function checkRateLimit(key, limit, windowMs) {
    const now = Date.now();
    const record = rateLimit.get(key) || [];
    const recent = record.filter(t => now - t < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    rateLimit.set(key, recent);
    return true;
}

// ========== 🔐 防重放中间件 ==========
async function antiReplay(req, res, next) {
    if (req.method !== 'POST') return next();
    
    const { nonce, timestamp, signature, ...data } = req.body;
    
    if (!nonce || !timestamp || !signature) {
        return res.status(400).json({ error: '缺少防重放参数' });
    }
    
    const now = Date.now();
    if (now - timestamp > 60000 || timestamp - now > 60000) {
        return res.status(403).json({ error: '请求已过期，请重试' });
    }
    
    if (usedNonces.has(nonce)) {
        return res.status(403).json({ error: '请求已被使用' });
    }
    
    const sortedKeys = Object.keys(data).sort();
    const signStr = sortedKeys.map(k => `${k}=${data[k]}`).join('&');
    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(signStr).digest('hex');
    
    if (signature !== expectedSignature) {
        return res.status(403).json({ error: '签名无效' });
    }
    
    usedNonces.set(nonce, now + 60000);
    req.validatedData = data;
    next();
}

// ========== 🔐 登录验证中间件 ==========
async function loginRequired(req, res, next) {
    const token = req.headers['x-auth-token'];
    if (!token) {
        return res.status(401).json({ error: '请先登录' });
    }
    
    const users = await readJSON('users.json') || {};
    let valid = false;
    let currentUser = null;
    let currentUserId = null;
    let currentIsMuted = false;
    
    for (const [name, user] of Object.entries(users)) {
        if (user.userId === token && !user.banned) {
            valid = true;
            currentUser = name;
            currentUserId = user.userId;
            currentIsMuted = user.isMuted || false;
            break;
        }
    }
    
    if (token === 'LOVESS') {
        valid = true;
        currentUser = 'OWNER-康皓月';
        currentUserId = 'LOVESS';
        currentIsMuted = false;
    }
    
    if (!valid) {
        return res.status(401).json({ error: '登录已失效，请重新登录' });
    }
    
    req.currentUser = currentUser;
    req.currentUserId = currentUserId;
    req.currentIsMuted = currentIsMuted;
    next();
}

// ========== 🔐 管理员验证中间件 ==========
function adminRequired(req, res, next) {
    const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
    if (!adminKey || adminKey !== ADMIN_SECRET) {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
}

// ========== GitHub 读写函数 ==========
async function readGitHubFile(file) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${file}`;
        const res = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (!res.ok) {
            if (file === 'whitelist.json') return 'A';
            return {};
        }
        const data = await res.json();
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        try {
            return JSON.parse(content);
        } catch(e) {
            return content;
        }
    } catch(e) { 
        if (file === 'whitelist.json') return 'A';
        return {}; 
    }
}

async function writeGitHubFile(file, content, msg) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${file}`;
        let sha = null;
        const getRes = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (getRes.ok) sha = (await getRes.json()).sha;
        const stringContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        const base64 = Buffer.from(stringContent, 'utf8').toString('base64');
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, content: base64, sha })
        });
        if (!res.ok) throw new Error(`GitHub API 返回 ${res.status}`);
        return true;
    } catch(e) { 
        console.error(`写入 GitHub ${file} 失败:`, e);
        throw e;
    }
}

async function readJSON(file) { return await readGitHubFile(file); }
async function writeJSON(file, content, msg) { return await writeGitHubFile(file, content, msg); }

// ========== 封禁数据 ==========
let bannedHardware = new Set();
let bannedIPs = new Set();
let bannedUsers = new Set();
let hardwareToUser = new Map();
let visitors = new Map();
let usedCards = new Set();

const VALID_CARDS = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069", "LOVESS-5688", "LOVESS-9459"];
const BEAUTY_CARDS = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069"];

function loadUsedCards() {
    try {
        const filePath = path.join(__dirname, 'used_cards.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            usedCards = new Set(data);
        }
    } catch(e) {}
}

function saveUsedCards() {
    try {
        fs.writeFileSync(path.join(__dirname, 'used_cards.json'), JSON.stringify([...usedCards], null, 2));
    } catch(e) {}
}

function loadBannedData() {
    try {
        const filePath = path.join(__dirname, 'banned.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            bannedHardware = new Set(data.bannedHardware || []);
            bannedIPs = new Set(data.bannedIPs || []);
            bannedUsers = new Set(data.bannedUsers || []);
        }
    } catch(e) {}
}

function saveBannedData() {
    try {
        fs.writeFileSync(path.join(__dirname, 'banned.json'), JSON.stringify({
            bannedHardware: [...bannedHardware],
            bannedIPs: [...bannedIPs],
            bannedUsers: [...bannedUsers]
        }, null, 2));
    } catch(e) {}
}

function loadVisitorsData() {
    try {
        const filePath = path.join(__dirname, 'visitors.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            visitors.clear();
            for (const v of data) {
                visitors.set(v.ip, v);
            }
        }
    } catch(e) {}
}

function saveVisitorsData() {
    try {
        const filePath = path.join(__dirname, 'visitors.json');
        const data = [];
        for (const [ip, v] of visitors) {
            data.push(v);
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch(e) {}
}

// ========== IP 封禁中间件 ==========
app.use((req, res, next) => {
    const ip = getRealIP(req);
    const hardwareId = req.headers['x-hardware-id'];
    
    if (req.path.startsWith('/api/')) {
        if (bannedIPs.has(ip)) {
            return res.status(403).json({ error: 'IP已被封禁' });
        }
        if (hardwareId && bannedHardware.has(hardwareId)) {
            return res.status(403).json({ error: '设备已被封禁' });
        }
    }
    next();
});

// ========== 公开接口 ==========
app.get('/api/debug/ip', (req, res) => {
    res.json({ realIP: getRealIP(req) });
});

app.get('/api/reviews', async (req, res) => {
    const reviews = await readJSON('reviews.json') || [];
    res.json(reviews);
});

app.get('/api/games', async (req, res) => {
    res.json([
         { name: "luau", players: 6, link: "https://www.roblox.com/games/125462571840934", description: "luau游戏" },
  { name: "APN AIRPORT", players: 8, link: "https://www.roblox.com/games/84312471277990", description: "APN AIRPORT游戏" },
  { name: "Game 84312471277990", players: 1, link: "https://www.roblox.com/games/84312471277990", description: "Game 84312471277990游戏" },
  { name: "Game 139278387435422", players: 1, link: "https://www.roblox.com/games/139278387435422", description: "Game 139278387435422游戏" },
  { name: "未命名的体验", players: 0, link: "https://www.roblox.com/games/76253436603166", description: "未命名的体验游戏" },
  { name: "未命名的体验", players: 1, link: "https://www.roblox.com/games/76253436603166", description: "未命名的体验游戏" },
  { name: "Game 76253436603166", players: 1, link: "https://www.roblox.com/games/76253436603166", description: "Game 76253436603166游戏" },
  { name: "无标题体验", players: 1, link: "https://www.roblox.com/games/104982570853315", description: "无标题体验游戏" },
  { name: "无标题体验", players: 0, link: "https://www.roblox.com/games/104982570853315", description: "无标题体验游戏" },
  { name: "Game 104982570853315", players: 1, link: "https://www.roblox.com/games/104982570853315", description: "Game 104982570853315游戏" },
  { name: "Game 125322037757269", players: 1, link: "https://www.roblox.com/games/125322037757269", description: "Game 125322037757269游戏" },
  { name: "四川省乐山市角色扮演", players: 1, link: "https://www.roblox.com/games/125322037757269", description: "四川省乐山市角色扮演游戏" },
  { name: "QG SOF训练基地", players: 1, link: "https://www.roblox.com/games/119790064224094", description: "QG SOF训练基地游戏" },
  { name: "无标题体验BH", players: 0, link: "https://www.roblox.com/games/107187943659932", description: "无标题体验BH游戏" },
  { name: "无标题体验BH", players: 1, link: "https://www.roblox.com/games/107187943659932", description: "无标题体验BH游戏" },
  { name: "V1.0 天津市", players: 1, link: "https://www.roblox.com/games/134133232679432", description: "V1.0 天津市游戏" },
  { name: "Game 134133232679432", players: 4, link: "https://www.roblox.com/games/134133232679432", description: "Game 134133232679432游戏" },
  { name: "V1.0 天津市", players: 12, link: "https://www.roblox.com/games/134133232679432", description: "V1.0 天津市游戏" },
  { name: "私人备份", players: 1, link: "https://www.roblox.com/games/82603885483253", description: "私人备份游戏" },
  { name: "ZZRP 枣庄市V1.0测试版", players: 0, link: "https://www.roblox.com/games/92331511205671", description: "ZZRP 枣庄市V1.0测试版游戏" },
  { name: "HBPLA 湖北警戒区•世纪雄军V1", players: 47, link: "https://www.roblox.com/games/133580699283141", description: "HBPLA 湖北警戒区•世纪雄军V1游戏" },
  { name: "湖北测试地图", players: 1, link: "https://www.roblox.com/games/139644178259589", description: "湖北测试地图游戏" },
  { name: "未命名游戏", players: 14, link: "https://www.roblox.com/games/78808086690400", description: "未命名游戏游戏" },
  { name: "展示类测试", players: 7, link: "https://www.roblox.com/games/88842067009491", description: "展示类测试游戏" },
  { name: "CDJQ-PLA 四川成都军事角色扮演", players: 5, link: "https://www.roblox.com/games/86201530478305", description: "CDJQ-PLA 四川成都军事角色扮演游戏" },
  { name: "CDJQ-PLA 四川成都军事角色扮演", players: 34, link: "https://www.roblox.com/games/86201530478305", description: "CDJQ-PLA 四川成都军事角色扮演游戏" },
  { name: "CDJQ-PLA 四川省成都军事角色扮演", players: 0, link: "https://www.roblox.com/games/119930397304372", description: "CDJQ-PLA 四川省成都军事角色扮演游戏" },
  { name: "CDJQ-PLA 四川省成都军事角色扮演", players: 1, link: "https://www.roblox.com/games/119930397304372", description: "CDJQ-PLA 四川省成都军事角色扮演游戏" },
  { name: "月跑小镇-重回巅峰-施工中", players: 0, link: "https://www.roblox.com/games/88063017898040", description: "月跑小镇-重回巅峰-施工中游戏" },
  { name: "月跑小镇-重回巅峰-施工中", players: 230, link: "https://www.roblox.com/games/88063017898040", description: "月跑小镇-重回巅峰-施工中游戏" },
  { name: "CDJQ-PLA 四川省成都军事角色扮演", players: 1, link: "https://www.roblox.com/games/116796542625953", description: "CDJQ-PLA 四川省成都军事角色扮演游戏" },
  { name: "车", players: 1, link: "https://www.roblox.com/games/113823868123067", description: "车游戏" },
  { name: "东莞V1", players: 1, link: "https://www.roblox.com/games/116889626316417", description: "东莞V1游戏" },
  { name: "RBX·FD 福鼎市RP", players: 0, link: "https://www.roblox.com/games/120842545621425", description: "RBX·FD 福鼎市RP游戏" },
  { name: "RBX·FD 福鼎市RP", players: 1, link: "https://www.roblox.com/games/120842545621425", description: "RBX·FD 福鼎市RP游戏" },
  { name: "绥化角色扮演", players: 1, link: "https://www.roblox.com/games/81262912666902", description: "绥化角色扮演游戏" },
  { name: "温州市", players: 1, link: "https://www.roblox.com/games/89999256811858", description: "温州市游戏" },
  { name: "WEN ZHOU 温州市", players: 0, link: "https://www.roblox.com/games/126536077971825", description: "WEN ZHOU 温州市游戏" },
  { name: "内测 温州市V1.5", players: 0, link: "https://www.roblox.com/games/77973084343973", description: "内测 温州市V1.5游戏" },
  { name: "内测 温州市V1.5", players: 1, link: "https://www.roblox.com/games/77973084343973", description: "内测 温州市V1.5游戏" },
  { name: "未命名的体验", players: 0, link: "https://www.roblox.com/games/121459054718414", description: "未命名的体验游戏" },
  { name: "DRX 唐山纪元", players: 0, link: "https://www.roblox.com/games/139594160698611", description: "DRX 唐山纪元游戏" },
  { name: "福清军区新队伍 v3", players: 0, link: "https://www.roblox.com/games/89740547727693", description: "福清军区新队伍 v3游戏" },
  { name: "消防角色扮演", players: 0, link: "https://www.roblox.com/games/105864889912764", description: "消防角色扮演游戏" },
  { name: "吉林消防模拟器", players: 0, link: "https://www.roblox.com/games/95341414395643", description: "吉林消防模拟器游戏" },
  { name: "消防角色扮演", players: 1, link: "https://www.roblox.com/games/109737057240460", description: "消防角色扮演游戏" },
  { name: "测试11", players: 1, link: "https://www.roblox.com/games/116381866489501", description: "测试11游戏" },
  { name: "SLR", players: 1, link: "https://www.roblox.com/games/84486469797722", description: "SLR游戏" },
  { name: "SLR 沈阳", players: 0, link: "https://www.roblox.com/games/84486469797722", description: "SLR 沈阳游戏" },
  { name: "SLR 沈阳", players: 0, link: "https://www.roblox.com/games/82952757703920", description: "SLR 沈阳游戏" },
  { name: "废弃", players: 0, link: "https://www.roblox.com/games/84486469797722", description: "废弃游戏" },
  { name: "长沙军区未完成", players: 0, link: "https://www.roblox.com/games/73188189994103", description: "长沙军区未完成游戏" },
  { name: "喜迎V1 长沙军区", players: 1, link: "https://www.roblox.com/games/73188189994103", description: "喜迎V1 长沙军区游戏" },
  { name: "灵丘县未来版v1.0", players: 0, link: "https://www.roblox.com/games/140274020200112", description: "灵丘县未来版v1.0游戏" },
  { name: "兰州角色扮演", players: 0, link: "https://www.roblox.com/games/85888971748319", description: "兰州角色扮演游戏" },
  { name: "12未命名", players: 0, link: "https://www.roblox.com/games/89182202249261", description: "12未命名游戏" },
  { name: "北京-Beijing", players: 5, link: "https://www.roblox.com/games/93175099699395", description: "北京-Beijing游戏" },
  { name: "中国人民解放军新乡营区8.0", players: 0, link: "https://www.roblox.com/games/112055606879665", description: "中国人民解放军新乡营区8.0游戏" },
  { name: "北京市角色扮演RP V3.0", players: 1, link: "https://www.roblox.com/games/131848347649145", description: "北京市角色扮演RP V3.0游戏" },
  { name: "灵丘县", players: 0, link: "https://www.roblox.com/games/86899173881843", description: "灵丘县游戏" },
  { name: "库伦旗v2", players: 0, link: "https://www.roblox.com/games/79990663887618", description: "库伦旗v2游戏" },
  { name: "未命名游戏", players: 1, link: "https://www.roblox.com/games/86681437544964", description: "未命名游戏游戏" },
  { name: "灵丘县", players: 0, link: "https://www.roblox.com/games/93919623025904", description: "灵丘县游戏" },
  { name: "宁德军区v3.5", players: 1, link: "https://www.roblox.com/games/114422286130383", description: "宁德军区v3.5游戏" },
  { name: "Untitled Experience", players: 0, link: "https://www.roblox.com/games/126321008133967", description: "Untitled Experience游戏" },
  { name: "PT 莆田武警训练基地临时训练场", players: 0, link: "https://www.roblox.com/games/102118579380038", description: "PT 莆田武警训练基地临时训练场游戏" },
  { name: "淮北军区", players: 0, link: "https://www.roblox.com/games/89550055911108", description: "淮北军区游戏" },
  { name: "無標題體驗", players: 0, link: "https://www.roblox.com/games/130552796180689", description: "無標題體驗游戏" },
  { name: "九翼县月跑同人", players: 0, link: "https://www.roblox.com/games/126240354644691", description: "九翼县月跑同人游戏" },
  { name: "自己玩仅此而已", players: 0, link: "https://www.roblox.com/games/121555659739392", description: "自己玩仅此而已游戏" },
  { name: "消防警察", players: 1, link: "https://www.roblox.com/games/116166691457753", description: "消防警察游戏" },
  { name: "新地图 江门市 V0.1 BETA", players: 0, link: "https://www.roblox.com/games/85136207317824", description: "新地图 江门市 V0.1 BETA游戏" },
  { name: "宝顺县素材地图", players: 0, link: "https://www.roblox.com/games/76204639810098", description: "宝顺县素材地图游戏" },
  { name: "江门市新V1.5", players: 1, link: "https://www.roblox.com/games/118469261585464", description: "江门市新V1.5游戏" },
  { name: "江苏省南通市角色扮演", players: 0, link: "https://www.roblox.com/games/84545620226834", description: "江苏省南通市角色扮演游戏" },
  { name: "测试地点：林希", players: 1, link: "https://www.roblox.com/games/72546232959253", description: "测试地点：林希游戏" },
  { name: "青海军区角色扮演", players: 0, link: "https://www.roblox.com/games/83404642317800", description: "青海军区角色扮演游戏" },
  { name: "TSG一周年庆典", players: 1, link: "https://www.roblox.com/games/87930553030195", description: "TSG一周年庆典游戏" },
  { name: "AQ 黄-洲", players: 0, link: "https://www.roblox.com/games/87520697488660", description: "AQ 黄-洲游戏" },
  { name: "迎春季 莆田武警训练基地", players: 0, link: "https://www.roblox.com/games/112032250597843", description: "迎春季 莆田武警训练基地游戏" },
  { name: "PT 莆田武警训练基地临时训练场", players: 0, link: "https://www.roblox.com/games/102118579380038", description: "PT 莆田武警训练基地临时训练场游戏" },
  { name: "青海军区角色扮演", players: 0, link: "https://www.roblox.com/games/83404642317800", description: "青海军区角色扮演游戏" },
  { name: "青海军区角色扮演", players: 0, link: "https://www.roblox.com/games/83404642317800", description: "青海军区角色扮演游戏" },
  { name: "PT 莆田武警训练基地临时训练场", players: 0, link: "https://www.roblox.com/games/102118579380038", description: "PT 莆田武警训练基地临时训练场游戏" },
  { name: "迎春季 莆田武警训练基地", players: 0, link: "https://www.roblox.com/games/112032250597843", description: "迎春季 莆田武警训练基地游戏" },
  { name: "北京市角色扮演RP V3.0", players: 1, link: "https://www.roblox.com/games/131848347649145", description: "北京市角色扮演RP V3.0游戏" },
  { name: "PT 莆田武警训练基地临时训练场", players: 0, link: "https://www.roblox.com/games/102118579380038", description: "PT 莆田武警训练基地临时训练场游戏" },
  { name: "迎春季 莆田武警训练基地", players: 0, link: "https://www.roblox.com/games/112032250597843", description: "迎春季 莆田武警训练基地游戏" },
  { name: "迎春季 莆田武警训练基地", players: 0, link: "https://www.roblox.com/games/112032250597843", description: "迎春季 莆田武警训练基地游戏" },
  { name: "北京市角色扮演RP V3.0", players: 0, link: "https://www.roblox.com/games/131848347649145", description: "北京市角色扮演RP V3.0游戏" },
  { name: "BETA 北江市角色扮演", players: 0, link: "https://www.roblox.com/games/133100826497641", description: "BETA 北江市角色扮演游戏" },
  { name: "迎春季 莆田武警训练基地", players: 1, link: "https://www.roblox.com/games/112032250597843", description: "迎春季 莆田武警训练基地游戏" }
    ]);
});

app.get('/api/whitelist', async (req, res) => {
    const whitelist = await readJSON('whitelist.json');
    if (typeof whitelist === 'string') {
        res.json([]);
    } else {
        res.json(whitelist || []);
    }
});

app.get('/api/scripts', async (req, res) => {
    const scripts = await readJSON('scripts.json');
    res.json((scripts || []).filter(s => s.status === 'approved'));
});

app.get('/api/chats/:room', async (req, res) => {
    const chats = await readJSON('chats.json');
    res.json((chats || []).filter(c => c.room === req.params.room));
});

app.get('/api/admin/globalMuteStatus', async (req, res) => {
    try {
        const status = await readGitHubFile('whitelist.json');
        let isMuted = false;
        if (status === 'B') {
            isMuted = true;
        } else if (typeof status === 'object' && status !== null && status.globalMute === true) {
            isMuted = true;
        }
        res.json({ enabled: isMuted });
    } catch(e) {
        res.json({ enabled: false });
    }
});

app.get('/api/user/:username', async (req, res) => {
    const users = await readJSON('users.json') || {};
    const user = users[req.params.username];
    if (user) {
        res.json({ userId: user.userId, role: user.role, isBeauty: user.isBeauty, createdAt: user.createdAt });
    } else {
        res.json(null);
    }
});

// ========== 🔐 需要防重放的接口 ==========

app.post('/api/register', antiReplay, async (req, res) => {
    const { username, password, cardKey, hardwareId } = req.validatedData;
    const ip = getRealIP(req);
    
    if (!username || username.length < 2 || username.length > 20) {
        return res.json({ success: false, error: '用户名长度需为2-20字符' });
    }
    if (!password || password.length < 4) {
        return res.json({ success: false, error: '密码长度至少4位' });
    }
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: 'IP已被封禁' });
    }
    
    if (!checkRateLimit(`register_${ip}`, 3, 3600000)) {
        return res.json({ success: false, error: '注册过于频繁' });
    }
    
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        return res.json({ success: false, error: '用户名已存在' });
    }
    
    let isBeauty = 'A';
    let usedCard = null;
    if (cardKey && cardKey.trim()) {
        const trimmedCard = cardKey.trim().toUpperCase();
        if (!VALID_CARDS.includes(trimmedCard)) {
            return res.json({ success: false, error: '卡密无效' });
        }
        if (usedCards.has(trimmedCard)) {
            return res.json({ success: false, error: '卡密已被使用' });
        }
        if (BEAUTY_CARDS.includes(trimmedCard)) isBeauty = 'B';
        usedCards.add(trimmedCard);
        usedCard = trimmedCard;
        saveUsedCards();
    }
    
    const userId = 'U' + Date.now();
    users[username] = {
        password, role: 'user', banned: false, isMuted: false,
        userId, isBeauty, avatar: '', registerIP: ip, hardwareId,
        createdAt: new Date().toISOString(), usedCard
    };
    await writeJSON('users.json', users, `新用户注册: ${username}`);
    res.json({ success: true, isBeauty });
});

app.post('/api/login', async (req, res) => {
    const { username, password, hardwareId } = req.body;
    const ip = getRealIP(req);
    
    if (!checkRateLimit(`login_${ip}`, 5, 60000)) {
        return res.json({ success: false, error: '登录尝试过于频繁' });
    }
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: 'IP被封禁' });
    }
    if (bannedUsers.has(username)) {
        return res.json({ success: false, error: '账号已被封禁' });
    }
    
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B', token: 'LOVESS' });
    }
    
    const users = await readJSON('users.json') || {};
    if (users[username] && users[username].password === password && !users[username].banned) {
        return res.json({ 
            success: true, 
            role: users[username].role || 'user', 
            userId: users[username].userId, 
            isBeauty: users[username].isBeauty || 'A',
            token: users[username].userId
        });
    }
    res.json({ success: false, error: '用户名或密码错误' });
});

app.post('/api/chat', loginRequired, antiReplay, async (req, res) => {
    const { user, text, room, userId, isBeauty } = req.validatedData;
    
    if (!text || text.length > 200 || text.length < 1) {
        return res.status(400).json({ error: '消息内容无效（1-200字符）' });
    }
    
    if (userId !== req.currentUserId) {
        return res.status(403).json({ error: '不能冒充他人' });
    }
    
    if (req.currentIsMuted) {
        return res.status(403).json({ error: '你已被禁言' });
    }
    
    const globalMuteStatus = await readGitHubFile('whitelist.json');
    const isGlobalMuted = globalMuteStatus === 'B' || globalMuteStatus?.globalMute === true;
    if (isGlobalMuted && req.currentUserId !== 'LOVESS') {
        return res.status(403).json({ error: '全局禁言中' });
    }
    
    if (!checkRateLimit(`chat_${req.currentUserId}`, 10, 60000)) {
        return res.status(429).json({ error: '发送消息过于频繁' });
    }
    
    const chats = await readJSON('chats.json') || [];
    chats.push({ 
        id: Date.now(), 
        user, 
        text: text.substring(0, 200), 
        time: new Date().toLocaleTimeString(), 
        room, 
        userId, 
        isBeauty 
    });
    await writeJSON('chats.json', chats, '新消息');
    res.json({ success: true });
});

app.post('/api/review', antiReplay, async (req, res) => {
    const { name, rating, text } = req.validatedData;
    const ip = getRealIP(req);
    
    if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: '评价内容不能为空' });
    }
    if (text.length > 500) {
        return res.status(400).json({ error: '评价内容过长（最多500字）' });
    }
    
    const validRating = parseInt(rating);
    if (validRating && (validRating < 1 || validRating > 5)) {
        return res.status(400).json({ error: '评分必须在1-5之间' });
    }
    
    if (!checkRateLimit(`review_${ip}`, 3, 3600000)) {
        return res.status(429).json({ error: '操作过于频繁' });
    }
    
    const reviews = await readJSON('reviews.json') || [];
    reviews.unshift({ 
        id: Date.now(), 
        name: name || '匿名', 
        rating: validRating || 3, 
        text: text.substring(0, 500),
        ip: ip,
        timestamp: new Date().toISOString()
    });
    await writeJSON('reviews.json', reviews, '新评价');
    res.json({ success: true });
});

app.post('/api/script/upload', loginRequired, antiReplay, async (req, res) => {
    const { name, desc, author } = req.validatedData;
    
    if (!name || name.length < 2 || name.length > 50) {
        return res.status(400).json({ error: '脚本名称无效（2-50字符）' });
    }
    if (!desc || desc.length > 200) {
        return res.status(400).json({ error: '脚本描述无效' });
    }
    
    if (!checkRateLimit(`script_${req.currentUserId}`, 3, 3600000)) {
        return res.status(429).json({ error: '上传过于频繁' });
    }
    
    const scripts = await readJSON('scripts.json') || [];
    scripts.push({ 
        id: Date.now(), 
        name: name.substring(0, 50), 
        desc: desc.substring(0, 200), 
        author: author || req.currentUser, 
        status: 'pending', 
        time: new Date().toISOString(),
        userId: req.currentUserId
    });
    await writeJSON('scripts.json', scripts, `上传脚本: ${name}`);
    res.json({ success: true });
});

app.post('/api/verify-card', antiReplay, async (req, res) => {
    const { cardCode, hardwareId, username } = req.validatedData;
    const ip = getRealIP(req);
    
    if (!cardCode || typeof cardCode !== 'string') {
        return res.status(400).json({ success: false, message: '请提供有效的卡密' });
    }
    
    const trimmedCard = cardCode.trim().toUpperCase();
    
    if (!VALID_CARDS.includes(trimmedCard)) {
        return res.status(401).json({ success: false, message: '卡密无效' });
    }
    
    if (usedCards.has(trimmedCard)) {
        return res.status(401).json({ success: false, message: '卡密已被使用' });
    }
    
    usedCards.add(trimmedCard);
    saveUsedCards();
    
    const cardLevel = BEAUTY_CARDS.includes(trimmedCard) ? 'B' : 'A';
    
    res.json({ 
        success: true, 
        message: '卡密验证成功',
        level: cardLevel
    });
});

app.post('/api/fingerprint/register', async (req, res) => {
    const { fingerprint, username } = req.body;
    const ip = getRealIP(req);
    
    if (!fingerprint) {
        return res.json({ success: false, error: '无法获取设备指纹' });
    }
    
    function generateHardwareId(fingerprint) {
        const stableFeatures = {
            webgl: fingerprint.webgl,
            cpuCores: fingerprint.cpuCores,
            memory: fingerprint.memory,
            screen: fingerprint.screen,
            audio: fingerprint.audio,
            fonts: fingerprint.fonts,
            touchPoints: fingerprint.touchPoints,
            platform: fingerprint.platform,
            timezone: fingerprint.timezone
        };
        const str = JSON.stringify(stableFeatures);
        return crypto.createHash('sha256').update(str).digest('hex');
    }
    
    const hardwareId = generateHardwareId(fingerprint);
    const isLoggedIn = username && username !== 'unknown' && username !== 'null' && username !== 'undefined';
    
    if (bannedHardware.has(hardwareId)) {
        return res.json({ success: false, banned: true, error: '此设备已被封禁' });
    }
    
    if (!visitors.has(ip)) {
        visitors.set(ip, {
            ip: ip,
            hardwareId: hardwareId,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            visitCount: 1,
            webgl: fingerprint.webgl || 'unknown',
            username: isLoggedIn ? username : null
        });
        saveVisitorsData();
    } else {
        const existing = visitors.get(ip);
        existing.visitCount++;
        existing.lastSeen = new Date().toISOString();
        existing.hardwareId = hardwareId;
        if (isLoggedIn) existing.username = username;
        saveVisitorsData();
    }
    
    if (isLoggedIn) {
        if (hardwareToUser.has(hardwareId)) {
            const oldUser = hardwareToUser.get(hardwareId);
            if (oldUser !== username) {
                bannedHardware.add(hardwareId);
                bannedUsers.add(oldUser);
                bannedUsers.add(username);
                saveBannedData();
                return res.json({ success: false, banned: true, error: '检测到多个账号使用同一设备，已封禁' });
            }
        } else {
            hardwareToUser.set(hardwareId, username);
        }
    }
    
    res.json({ success: true, hardwareId: hardwareId });
});

// ========== 🔐 管理接口 ==========

app.post('/api/admin/toggleGlobalMute', adminRequired, antiReplay, async (req, res) => {
    try {
        let current = await readGitHubFile('whitelist.json');
        let newStatus = (current === 'B' || current?.globalMute === true) ? 'A' : 'B';
        await writeGitHubFile('whitelist.json', newStatus, `切换全局禁言: ${newStatus === 'B' ? '开启' : '关闭'}`);
        res.json({ enabled: newStatus === 'B' });
    } catch(e) {
        res.status(500).json({ error: '操作失败' });
    }
});

app.post('/api/admin/toggleMute', adminRequired, antiReplay, async (req, res) => {
    const { username } = req.validatedData;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].isMuted = !users[username].isMuted;
        await writeJSON('users.json', users, `禁言/解禁: ${username}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/toggleBan', adminRequired, antiReplay, async (req, res) => {
    const { username } = req.validatedData;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = !users[username].banned;
        await writeJSON('users.json', users, `封禁/解封: ${username}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/approveScript', adminRequired, antiReplay, async (req, res) => {
    const { id } = req.validatedData;
    const scripts = await readJSON('scripts.json') || [];
    const idx = scripts.findIndex(s => s.id === id);
    if (idx !== -1) {
        scripts[idx].status = 'approved';
        await writeJSON('scripts.json', scripts, `审核通过脚本: ${scripts[idx].name}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/rejectScript', adminRequired, antiReplay, async (req, res) => {
    const { id } = req.validatedData;
    let scripts = await readJSON('scripts.json') || [];
    scripts = scripts.filter(s => s.id !== id);
    await writeJSON('scripts.json', scripts, '拒绝脚本');
    res.json({ success: true });
});

app.post('/api/admin/banHardware', adminRequired, antiReplay, (req, res) => {
    const { hardwareId } = req.validatedData;
    if (hardwareId) bannedHardware.add(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/unbanHardware', adminRequired, antiReplay, (req, res) => {
    const { hardwareId } = req.validatedData;
    bannedHardware.delete(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banIP', adminRequired, antiReplay, (req, res) => {
    const { ip } = req.validatedData;
    if (ip && ip !== 'unknown') bannedIPs.add(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/unbanIP', adminRequired, antiReplay, (req, res) => {
    const { ip } = req.validatedData;
    bannedIPs.delete(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banUserHardware', adminRequired, antiReplay, async (req, res) => {
    const { username, hardwareId } = req.validatedData;
    bannedUsers.add(username);
    if (hardwareId) bannedHardware.add(hardwareId);
    saveBannedData();
    
    const users = await readJSON('users.json') || {};
    if (users[username]) users[username].banned = true;
    await writeJSON('users.json', users, '封禁用户');
    res.json({ success: true });
});

app.post('/api/review/delete', adminRequired, antiReplay, async (req, res) => {
    const { id } = req.validatedData;
    let reviews = await readJSON('reviews.json') || [];
    reviews = reviews.filter(r => r.id !== id);
    await writeJSON('reviews.json', reviews, '删除评价');
    res.json({ success: true });
});

app.post('/api/whitelist/add', adminRequired, antiReplay, async (req, res) => {
    let whitelist = await readJSON('whitelist.json');
    if (typeof whitelist === 'string') whitelist = [];
    if (!Array.isArray(whitelist)) whitelist = [];
    const { name } = req.validatedData;
    if (!whitelist.includes(name)) whitelist.push(name);
    await writeJSON('whitelist.json', whitelist, '添加白名单');
    res.json({ success: true });
});

// ========== 管理面板 GET 接口 ==========
app.get('/api/admin/users', adminRequired, async (req, res) => {
    const users = await readJSON('users.json') || {};
    const list = [];
    for (const [name, info] of Object.entries(users)) {
        list.push({
            name: name,
            role: info.role || 'user',
            banned: info.banned || false,
            isMuted: info.isMuted || false,
            hardwareId: info.hardwareId || null,
            registerIP: info.registerIP,
            isBeauty: info.isBeauty || 'A',
            usedCard: info.usedCard || null
        });
    }
    res.json(list);
});

app.get('/api/admin/pending', adminRequired, async (req, res) => {
    const scripts = await readJSON('scripts.json') || [];
    res.json(scripts.filter(s => s.status === 'pending'));
});

app.get('/api/admin/chats', adminRequired, async (req, res) => {
    const chats = await readJSON('chats.json') || [];
    res.json(chats);
});

app.get('/api/admin/banned', adminRequired, (req, res) => {
    res.json({ bannedHardware: [...bannedHardware], bannedIPs: [...bannedIPs], bannedUsers: [...bannedUsers] });
});

app.get('/api/admin/visitors', adminRequired, (req, res) => {
    const list = [];
    for (const [ip, v] of visitors) {
        list.push(v);
    }
    res.json(list);
});

// ========== 启动服务器 ==========
loadUsedCards();
loadBannedData();
loadVisitorsData();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`LOVESS 后端已启动！`);
    console.log(`监听端口: ${PORT}`);
    console.log(`防重放密钥: ${SECRET_KEY.substring(0, 10)}...`);
    console.log(`管理员密钥: ${ADMIN_SECRET}`);
});
