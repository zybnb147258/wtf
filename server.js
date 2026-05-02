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

// ========== 频率限制存储 ==========
const rateLimit = new Map();

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

// ========== 登录验证中间件 ==========
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
        { name: "Game 139278387435422", players: 1, link: "https://www.roblox.com/games/139278387435422", description: "Game 139278387435422游戏" }
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

// ========== POST 接口 ==========

app.post('/api/register', async (req, res) => {
    const { username, password, cardKey, hardwareId } = req.body;
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

app.post('/api/chat', loginRequired, async (req, res) => {
    const { user, text, room, userId, isBeauty } = req.body;
    
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

app.post('/api/review', async (req, res) => {
    const { name, rating, text } = req.body;
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

app.post('/api/script/upload', loginRequired, async (req, res) => {
    const { name, desc, author } = req.body;
    
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

app.post('/api/verify-card', async (req, res) => {
    const { cardCode, hardwareId, username } = req.body;
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

// ========== 管理接口（已移除 adminRequired，任何人可访问） ==========

app.post('/api/admin/toggleGlobalMute', async (req, res) => {
    try {
        let current = await readGitHubFile('whitelist.json');
        let newStatus = (current === 'B' || current?.globalMute === true) ? 'A' : 'B';
        await writeGitHubFile('whitelist.json', newStatus, `切换全局禁言: ${newStatus === 'B' ? '开启' : '关闭'}`);
        res.json({ enabled: newStatus === 'B' });
    } catch(e) {
        res.status(500).json({ error: '操作失败' });
    }
});

app.post('/api/admin/toggleMute', async (req, res) => {
    const { username } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].isMuted = !users[username].isMuted;
        await writeJSON('users.json', users, `禁言/解禁: ${username}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/toggleBan', async (req, res) => {
    const { username } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = !users[username].banned;
        await writeJSON('users.json', users, `封禁/解封: ${username}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/approveScript', async (req, res) => {
    const { id } = req.body;
    const scripts = await readJSON('scripts.json') || [];
    const idx = scripts.findIndex(s => s.id === id);
    if (idx !== -1) {
        scripts[idx].status = 'approved';
        await writeJSON('scripts.json', scripts, `审核通过脚本: ${scripts[idx].name}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/rejectScript', async (req, res) => {
    const { id } = req.body;
    let scripts = await readJSON('scripts.json') || [];
    scripts = scripts.filter(s => s.id !== id);
    await writeJSON('scripts.json', scripts, '拒绝脚本');
    res.json({ success: true });
});

app.post('/api/admin/banHardware', async (req, res) => {
    const { hardwareId } = req.body;
    if (hardwareId) bannedHardware.add(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/unbanHardware', async (req, res) => {
    const { hardwareId } = req.body;
    bannedHardware.delete(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banIP', async (req, res) => {
    const { ip } = req.body;
    if (ip && ip !== 'unknown') bannedIPs.add(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/unbanIP', async (req, res) => {
    const { ip } = req.body;
    bannedIPs.delete(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banUserHardware', async (req, res) => {
    const { username, hardwareId } = req.body;
    bannedUsers.add(username);
    if (hardwareId) bannedHardware.add(hardwareId);
    saveBannedData();
    
    const users = await readJSON('users.json') || {};
    if (users[username]) users[username].banned = true;
    await writeJSON('users.json', users, '封禁用户');
    res.json({ success: true });
});

app.post('/api/review/delete', async (req, res) => {
    const { id } = req.body;
    let reviews = await readJSON('reviews.json') || [];
    reviews = reviews.filter(r => r.id !== id);
    await writeJSON('reviews.json', reviews, '删除评价');
    res.json({ success: true });
});

app.post('/api/whitelist/add', async (req, res) => {
    let whitelist = await readJSON('whitelist.json');
    if (typeof whitelist === 'string') whitelist = [];
    if (!Array.isArray(whitelist)) whitelist = [];
    const { name } = req.body;
    if (!whitelist.includes(name)) whitelist.push(name);
    await writeJSON('whitelist.json', whitelist, '添加白名单');
    res.json({ success: true });
});

// ========== 管理面板 GET 接口（已移除 adminRequired） ==========
app.get('/api/admin/users', async (req, res) => {
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

app.get('/api/admin/pending', async (req, res) => {
    const scripts = await readJSON('scripts.json') || [];
    res.json(scripts.filter(s => s.status === 'pending'));
});

app.get('/api/admin/chats', async (req, res) => {
    const chats = await readJSON('chats.json') || [];
    res.json(chats);
});

app.get('/api/admin/banned', async (req, res) => {
    res.json({ bannedHardware: [...bannedHardware], bannedIPs: [...bannedIPs], bannedUsers: [...bannedUsers] });
});

app.get('/api/admin/visitors', async (req, res) => {
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
});        await writeJSON('scripts.json', scripts, `审核通过脚本: ${scripts[idx].name}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/rejectScript', adminRequired, async (req, res) => {
    const { id } = req.body;
    let scripts = await readJSON('scripts.json') || [];
    scripts = scripts.filter(s => s.id !== id);
    await writeJSON('scripts.json', scripts, '拒绝脚本');
    res.json({ success: true });
});

app.post('/api/admin/banHardware', adminRequired, (req, res) => {
    const { hardwareId } = req.body;
    if (hardwareId) bannedHardware.add(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/unbanHardware', adminRequired, (req, res) => {
    const { hardwareId } = req.body;
    bannedHardware.delete(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banIP', adminRequired, (req, res) => {
    const { ip } = req.body;
    if (ip && ip !== 'unknown') bannedIPs.add(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/unbanIP', adminRequired, (req, res) => {
    const { ip } = req.body;
    bannedIPs.delete(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banUserHardware', adminRequired, async (req, res) => {
    const { username, hardwareId } = req.body;
    bannedUsers.add(username);
    if (hardwareId) bannedHardware.add(hardwareId);
    saveBannedData();
    
    const users = await readJSON('users.json') || {};
    if (users[username]) users[username].banned = true;
    await writeJSON('users.json', users, '封禁用户');
    res.json({ success: true });
});

app.post('/api/review/delete', adminRequired, async (req, res) => {
    const { id } = req.body;
    let reviews = await readJSON('reviews.json') || [];
    reviews = reviews.filter(r => r.id !== id);
    await writeJSON('reviews.json', reviews, '删除评价');
    res.json({ success: true });
});

app.post('/api/whitelist/add', adminRequired, async (req, res) => {
    let whitelist = await readJSON('whitelist.json');
    if (typeof whitelist === 'string') whitelist = [];
    if (!Array.isArray(whitelist)) whitelist = [];
    const { name } = req.body;
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
    console.log(`管理员密钥: ${ADMIN_SECRET}`);
});
