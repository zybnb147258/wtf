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
    
    // 如果没有 nonce，跳过验证（兼容旧版）
    if (!nonce) {
        req.validatedData = data;
        return next();
    }
    
    if (!timestamp || !signature) {
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

// ========== 🔐 登录验证中间件（带日志） ==========
async function loginRequired(req, res, next) {
    const token = req.headers['x-auth-token'];
    console.log('=== loginRequired 调试 ===');
    console.log('请求路径:', req.path);
    console.log('收到的 token:', token);
    console.log('所有请求头:', JSON.stringify(req.headers, null, 2));
    
    if (!token) {
        console.log('❌ 没有 token，返回 401');
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
            console.log('✅ 找到用户:', name, 'userId:', user.userId);
            break;
        }
    }
    
    if (token === 'LOVESS') {
        valid = true;
        currentUser = 'OWNER-康皓月';
        currentUserId = 'LOVESS';
        currentIsMuted = false;
        console.log('✅ Owner 登录');
    }
    
    if (!valid) {
        console.log('❌ token 无效或用户已封禁');
        return res.status(401).json({ error: '登录已失效，请重新登录' });
    }
    
    console.log('✅ 验证通过，用户:', currentUser);
    req.currentUser = currentUser;
    req.currentUserId = currentUserId;
    req.currentIsMuted = currentIsMuted;
    next();
}

// ========== 👑 Owner 验证中间件（带日志） ==========
async function ownerRequired(req, res, next) {
    const token = req.headers['x-auth-token'];
    console.log('=== ownerRequired 调试 ===');
    console.log('请求路径:', req.path);
    console.log('收到的 token:', token);
    console.log('所有请求头:', JSON.stringify(req.headers, null, 2));
    
    if (!token) {
        console.log('❌ 没有 token');
        return res.status(401).json({ error: '请先登录' });
    }
    
    if (token !== 'LOVESS') {
        console.log('❌ token 不是 LOVESS，是:', token);
        return res.status(403).json({ error: '只有管理员可以访问' });
    }
    
    console.log('✅ Owner 验证通过');
    req.currentUser = 'OWNER-康皓月';
    req.currentUserId = 'LOVESS';
    req.currentIsMuted = false;
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
        if (!res.ok) throw new Error('GitHub API error');
        return true;
    } catch(e) { 
        console.error('write error:', e);
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
        { name: "APN AIRPORT", players: 8, link: "https://www.roblox.com/games/84312471277990", description: "APN AIRPORT游戏" }
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
    
    if (!checkRateLimit('register_' + ip, 3, 3600000)) {
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
        password: password,
        role: 'user',
        banned: false,
        isMuted: false,
        userId: userId,
        isBeauty: isBeauty,
        avatar: '',
        registerIP: ip,
        hardwareId: hardwareId,
        createdAt: new Date().toISOString(),
        usedCard: usedCard
    };
    await writeJSON('users.json', users, '新用户注册: ' + username);
    res.json({ success: true, isBeauty: isBeauty });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const ip = getRealIP(req);
    
    console.log('=== 登录请求 ===');
    console.log('用户名:', username);
    
    if (!checkRateLimit('login_' + ip, 5, 60000)) {
        return res.json({ success: false, error: '登录尝试过于频繁' });
    }
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: 'IP被封禁' });
    }
    if (bannedUsers.has(username)) {
        return res.json({ success: false, error: '账号已被封禁' });
    }
    
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        console.log('✅ Owner 登录成功');
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B', token: 'LOVESS' });
    }
    
    const users = await readJSON('users.json') || {};
    if (users[username] && users[username].password === password && !users[username].banned) {
        console.log('✅ 用户登录成功:', username);
        return res.json({ 
            success: true, 
            role: users[username].role || 'user', 
            userId: users[username].userId, 
            isBeauty: users[username].isBeauty || 'A',
            token: users[username].userId
        });
    }
    console.log('❌ 登录失败:', username);
    res.json({ success: false, error: '用户名或密码错误' });
});

app.post('/api/chat', loginRequired, antiReplay, async (req, res) => {
    const { user, text, room, userId, isBeauty } = req.validatedData;
    
    console.log('=== 发送消息 ===');
    console.log('用户:', user);
    console.log('消息:', text);
    
    if (!text || text.length > 200 || text.length < 1) {
        return res.status(400).json({ error: '消息内容无效（1-200字符）' });
    }
    
    if (userId !== req.currentUserId) {
        console.log('❌ userId 不匹配:', userId, '!=', req.currentUserId);
        return res.status(403).json({ error: '不能冒充他人' });
    }
    
    if (req.currentIsMuted) {
        console.log('❌ 用户已被禁言');
        return res.status(403).json({ error: '你已被禁言' });
    }
    
    const globalMuteStatus = await readGitHubFile('whitelist.json');
    const isGlobalMuted = globalMuteStatus === 'B' || (globalMuteStatus && globalMuteStatus.globalMute === true);
    if (isGlobalMuted && req.currentUserId !== 'LOVESS') {
        console.log('❌ 全局禁言中');
        return res.status(403).json({ error: '全局禁言中' });
    }
    
    if (!checkRateLimit('chat_' + req.currentUserId, 10, 60000)) {
        console.log('❌ 频率限制');
        return res.status(429).json({ error: '发送消息过于频繁' });
    }
    
    const chats = await readJSON('chats.json') || [];
    chats.push({ 
        id: Date.now(), 
        user: user, 
        text: text.substring(0, 200), 
        time: new Date().toLocaleTimeString(), 
        room: room, 
        userId: userId, 
        isBeauty: isBeauty 
    });
    await writeJSON('chats.json', chats, '新消息');
    console.log('✅ 消息发送成功');
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
    
    if (!checkRateLimit('review_' + ip, 3, 3600000)) {
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
    
    if (!checkRateLimit('script_' + req.currentUserId, 3, 3600000)) {
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
    await writeJSON('scripts.json', scripts, '上传脚本: ' + name);
    res.json({ success: true });
});

app.post('/api/verify-card', antiReplay, async (req, res) => {
    const { cardCode } = req.validatedData;
    
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
    
    function generateHardwareId(fp) {
        const stableFeatures = {
            webgl: fp.webgl,
            cpuCores: fp.cpuCores,
            memory: fp.memory,
            screen: fp.screen,
            audio: fp.audio,
            fonts: fp.fonts,
            touchPoints: fp.touchPoints,
            platform: fp.platform,
            timezone: fp.timezone
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

// ========== 👑 管理接口 ==========

app.post('/api/admin/toggleGlobalMute', ownerRequired, antiReplay, async (req, res) => {
    console.log('=== 切换全局禁言 ===');
    try {
        let current = await readGitHubFile('whitelist.json');
        let newStatus = (current === 'B' || (current && current.globalMute === true)) ? 'A' : 'B';
        await writeGitHubFile('whitelist.json', newStatus, '切换全局禁言');
        console.log('新状态:', newStatus);
        res.json({ enabled: newStatus === 'B' });
    } catch(e) {
        console.error('切换失败:', e);
        res.status(500).json({ error: '操作失败' });
    }
});

app.post('/api/admin/toggleMute', ownerRequired, antiReplay, async (req, res) => {
    const { username } = req.validatedData;
    console.log('=== 切换用户禁言 ===', username);
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].isMuted = !users[username].isMuted;
        await writeJSON('users.json', users, '禁言/解禁: ' + username);
        console.log('新状态:', users[username].isMuted);
    }
    res.json({ success: true });
});

app.post('/api/admin/toggleBan', ownerRequired, antiReplay, async (req, res) => {
    const { username } = req.validatedData;
    console.log('=== 切换用户封禁 ===', username);
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = !users[username].banned;
        if (users[username].banned) bannedUsers.add(username);
        else bannedUsers.delete(username);
        await writeJSON('users.json', users, '封禁/解封: ' + username);
        saveBannedData();
        console.log('新状态:', users[username].banned);
    }
    res.json({ success: true });
});

app.post('/api/admin/approveScript', ownerRequired, antiReplay, async (req, res) => {
    const { id } = req.validatedData;
    console.log('=== 审核通过脚本 ===', id);
    const scripts = await readJSON('scripts.json') || [];
    const idx = scripts.findIndex(s => Number(s.id) === Number(id));
    if (idx !== -1) {
        scripts[idx].status = 'approved';
        await writeJSON('scripts.json', scripts, '审核通过脚本');
    }
    res.json({ success: true });
});

app.post('/api/admin/rejectScript', ownerRequired, antiReplay, async (req, res) => {
    const { id } = req.validatedData;
    console.log('=== 拒绝脚本 ===', id);
    let scripts = await readJSON('scripts.json') || [];
    scripts = scripts.filter(s => Number(s.id) !== Number(id));
    await writeJSON('scripts.json', scripts, '拒绝脚本');
    res.json({ success: true });
});

app.post('/api/admin/banHardware', ownerRequired, antiReplay, async (req, res) => {
    const { hardwareId } = req.validatedData;
    console.log('=== 封禁硬件 ===', hardwareId);
    if (hardwareId) bannedHardware.add(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/unbanHardware', ownerRequired, antiReplay, async (req, res) => {
    const { hardwareId } = req.validatedData;
    console.log('=== 解封硬件 ===', hardwareId);
    bannedHardware.delete(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banIP', ownerRequired, antiReplay, async (req, res) => {
    const { ip } = req.validatedData;
    console.log('=== 封禁 IP ===', ip);
    if (ip && ip !== 'unknown') bannedIPs.add(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/unbanIP', ownerRequired, antiReplay, async (req, res) => {
    const { ip } = req.validatedData;
    console.log('=== 解封 IP ===', ip);
    bannedIPs.delete(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banUserHardware', ownerRequired, antiReplay, async (req, res) => {
    const { username, hardwareId } = req.validatedData;
    console.log('=== 封禁用户+硬件 ===', username, hardwareId);
    bannedUsers.add(username);
    if (hardwareId) bannedHardware.add(hardwareId);
    saveBannedData();
    
    const users = await readJSON('users.json') || {};
    if (users[username]) users[username].banned = true;
    await writeJSON('users.json', users, '封禁用户');
    res.json({ success: true });
});

app.post('/api/review/delete', ownerRequired, antiReplay, async (req, res) => {
    const { id } = req.validatedData;
    console.log('=== 删除评价 ===', id);
    let reviews = await readJSON('reviews.json') || [];
    reviews = reviews.filter(r => r.id !== id);
    await writeJSON('reviews.json', reviews, '删除评价');
    res.json({ success: true });
});

app.post('/api/whitelist/add', ownerRequired, antiReplay, async (req, res) => {
    const { name } = req.validatedData;
    console.log('=== 添加白名单 ===', name);
    let whitelist = await readJSON('whitelist.json');
    if (typeof whitelist === 'string') whitelist = [];
    if (!Array.isArray(whitelist)) whitelist = [];
    if (!whitelist.includes(name)) whitelist.push(name);
    await writeJSON('whitelist.json', whitelist, '添加白名单');
    res.json({ success: true });
});

// ========== 管理面板 GET 接口 ==========

app.get('/api/admin/users', ownerRequired, async (req, res) => {
    console.log('=== 获取用户列表 ===');
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

app.get('/api/admin/pending', ownerRequired, async (req, res) => {
    console.log('=== 获取待审核脚本 ===');
    const scripts = await readJSON('scripts.json') || [];
    res.json(scripts.filter(s => s.status === 'pending'));
});

app.get('/api/admin/chats', ownerRequired, async (req, res) => {
    console.log('=== 获取聊天记录 ===');
    const chats = await readJSON('chats.json') || [];
    res.json(chats);
});

app.get('/api/admin/banned', ownerRequired, async (req, res) => {
    console.log('=== 获取封禁列表 ===');
    res.json({ bannedHardware: [...bannedHardware], bannedIPs: [...bannedIPs], bannedUsers: [...bannedUsers] });
});

app.get('/api/admin/visitors', ownerRequired, async (req, res) => {
    console.log('=== 获取访客记录 ===');
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
    console.log('LOVESS 后端已启动！');
    console.log('监听端口: ' + PORT);
    console.log('防重放密钥: ' + SECRET_KEY.substring(0, 10) + '...');
});
