const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();

app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

function getRealIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',');
        return ips[0].trim();
    }
    const realIP = req.headers['x-real-ip'];
    if (realIP) return realIP;
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ==================== 指纹系统 ====================
let bannedFingerprints = new Set();      // 被封禁的指纹
let bannedIPs = new Set();
let bannedUsers = new Set();
let userFingerprints = new Map();        // 用户名 -> 指纹
let fingerprintOwners = new Map();       // 指纹 -> 用户名

function generateFingerprintId(fingerprint) {
    // 使用 SHA256 哈希指纹，确保一致性
    return crypto.createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
}

function loadBannedData() {
    try {
        const filePath = path.join(__dirname, 'banned.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            bannedIPs = new Set(data.bannedIPs || []);
            bannedUsers = new Set(data.bannedUsers || []);
            bannedFingerprints = new Set(data.bannedFingerprints || []);
            console.log(`加载封禁数据: ${bannedIPs.size} 个IP, ${bannedUsers.size} 个用户, ${bannedFingerprints.size} 个指纹`);
        }
    } catch(e) { console.error('加载封禁数据失败:', e); }
}

function saveBannedData() {
    try {
        const filePath = path.join(__dirname, 'banned.json');
        fs.writeFileSync(filePath, JSON.stringify({ 
            bannedIPs: [...bannedIPs], 
            bannedUsers: [...bannedUsers],
            bannedFingerprints: [...bannedFingerprints]
        }, null, 2));
        console.log(`保存封禁数据: ${bannedIPs.size} 个IP, ${bannedUsers.size} 个用户, ${bannedFingerprints.size} 个指纹`);
    } catch(e) { console.error('保存封禁数据失败:', e); }
}

// 指纹检测中间件
app.use((req, res, next) => {
    // 跳过某些路径
    if (req.path === '/api/debug/ip' || req.path === '/test' || req.path === '/api/fingerprint/register') {
        return next();
    }
    
    const ip = getRealIP(req);
    if (bannedIPs.has(ip)) {
        console.log(`拒绝访问: 被封禁 IP ${ip} 尝试访问 ${req.path}`);
        return res.status(404).send('404 Not Found');
    }
    
    next();
});

// 注册/验证指纹
app.post('/api/fingerprint/register', (req, res) => {
    const { fingerprint, username } = req.body;
    if (!fingerprint) {
        return res.json({ success: false, error: '无效的指纹数据' });
    }
    
    const fpId = generateFingerprintId(fingerprint);
    const ip = getRealIP(req);
    
    // 检查指纹是否被封禁
    if (bannedFingerprints.has(fpId)) {
        console.log(`指纹被封禁: ${fpId} 尝试访问`);
        return res.json({ 
            success: false, 
            banned: true,
            error: '您的设备已被封禁' 
        });
    }
    
    // 记录指纹与用户的关联（如果提供了用户名）
    if (username && username !== 'unknown') {
        userFingerprints.set(username, fpId);
        if (!fingerprintOwners.has(fpId)) {
            fingerprintOwners.set(fpId, username);
        }
    }
    
    res.json({ 
        success: true, 
        fingerprintId: fpId,
        isBanned: false
    });
});

// 获取当前用户的指纹状态（用于前端检测）
app.get('/api/fingerprint/status', (req, res) => {
    res.json({
        hasBannedFingerprints: bannedFingerprints.size,
        hasBannedIPs: bannedIPs.size,
        hasBannedUsers: bannedUsers.size
    });
});

// ==================== 防刷/限流 ====================
let ipRequestCount = new Map();
let userIPRecord = new Map();

function checkSpam(ip, username, fingerprintId = null) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 20;
    
    if (bannedIPs.has(ip)) {
        return { allowed: false, reason: '您的 IP 已被封禁' };
    }
    if (bannedUsers.has(username)) {
        return { allowed: false, reason: '您的账号已被封禁' };
    }
    if (fingerprintId && bannedFingerprints.has(fingerprintId)) {
        return { allowed: false, reason: '您的设备指纹已被封禁' };
    }
    
    if (!ipRequestCount.has(ip)) {
        ipRequestCount.set(ip, { count: 0, lastReset: now });
    }
    const record = ipRequestCount.get(ip);
    if (now - record.lastReset > windowMs) {
        record.count = 0;
        record.lastReset = now;
    }
    record.count++;
    
    if (record.count > maxRequests) {
        console.log(`刷屏检测: IP ${ip} 请求 ${record.count} 次`);
        return { allowed: false, reason: '操作太快，请稍后再试' };
    }
    
    return { allowed: true };
}

function antiSpam(req, res, next) {
    const ip = getRealIP(req);
    const username = req.body?.username || req.query?.username || 'unknown';
    const fingerprintId = req.body?.fingerprintId || req.headers['x-fingerprint-id'];
    const result = checkSpam(ip, username, fingerprintId);
    if (!result.allowed) {
        return res.status(429).json({ error: result.reason });
    }
    next();
}

app.use('/api/review', antiSpam);
app.use('/api/chat', antiSpam);
app.use('/api/script', antiSpam);
app.use('/api/whitelist', antiSpam);

// ==================== GitHub 存储配置 ====================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER || "liushumei11110-boop";
const REPO_NAME = process.env.REPO_NAME || "lovess";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "khyzybnb666147";

async function readJSON(file) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${file}`;
        const res = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (!res.ok) return {};
        const data = await res.json();
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch(e) { return {}; }
}

async function writeJSON(file, content, msg) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${file}`;
        let sha = null;
        const getRes = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (getRes.ok) sha = (await getRes.json()).sha;
        const base64 = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
        await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, content: base64, sha })
        });
        return true;
    } catch(e) { return false; }
}

// ==================== 调试接口 ====================
app.get('/api/debug/ip', (req, res) => {
    const realIP = getRealIP(req);
    res.json({ 
        realIP: realIP,
        isBanned: bannedIPs.has(realIP)
    });
});

app.get('/test', (req, res) => res.json({ status: 'ok' }));

// ==================== 管理员 API ====================
app.get('/api/admin/ips', async (req, res) => {
    const list = [];
    for (const [ip, data] of ipRequestCount) {
        list.push({
            type: 'ip',
            name: ip,
            ip: ip,
            requests: data.count,
            lastSeen: new Date(data.lastReset).toLocaleString(),
            isBanned: bannedIPs.has(ip)
        });
    }
    for (const [username, data] of userIPRecord) {
        list.push({
            type: 'user',
            name: username,
            ip: data.ip,
            lastSeen: data.lastSeen ? new Date(data.lastSeen).toLocaleString() : null,
            isBanned: bannedIPs.has(data.ip)
        });
    }
    res.json(list);
});

app.get('/api/admin/banned', async (req, res) => {
    res.json({ 
        bannedIPs: [...bannedIPs], 
        bannedUsers: [...bannedUsers],
        bannedFingerprints: [...bannedFingerprints]
    });
});

// 获取所有记录的指纹
app.get('/api/admin/fingerprints', async (req, res) => {
    const fingerprints = [];
    for (const [fpId, username] of fingerprintOwners) {
        fingerprints.push({
            fingerprintId: fpId,
            owner: username,
            isBanned: bannedFingerprints.has(fpId)
        });
    }
    res.json(fingerprints);
});

// 封禁指纹
app.post('/api/admin/banFingerprint', async (req, res) => {
    const { fingerprintId, username } = req.body;
    if (fingerprintId) {
        bannedFingerprints.add(fingerprintId);
        saveBannedData();
        console.log(`封禁指纹: ${fingerprintId} (关联用户: ${username || '未知'})`);
        
        // 可选：同时封禁关联的用户
        if (username && !bannedUsers.has(username)) {
            bannedUsers.add(username);
            const users = await readJSON('users.json') || {};
            if (users[username]) {
                users[username].banned = true;
                await writeJSON('users.json', users, `因指纹封禁自动封禁用户: ${username}`);
            }
            saveBannedData();
        }
    }
    res.json({ success: true });
});

// 解封指纹
app.post('/api/admin/unbanFingerprint', async (req, res) => {
    const { fingerprintId } = req.body;
    if (fingerprintId) {
        bannedFingerprints.delete(fingerprintId);
        saveBannedData();
        console.log(`解封指纹: ${fingerprintId}`);
    }
    res.json({ success: true });
});

// 多重封禁：账号 + IP + 指纹
app.post('/api/admin/banUserAndIP', async (req, res) => {
    const { username, ip, fingerprintId } = req.body;
    const users = await readJSON('users.json') || {};
    
    if (users[username]) {
        users[username].banned = true;
        await writeJSON('users.json', users, `封禁用户: ${username}`);
    }
    bannedUsers.add(username);
    
    if (ip && ip !== 'unknown' && ip !== 'undefined') {
        bannedIPs.add(ip);
    }
    
    if (fingerprintId) {
        bannedFingerprints.add(fingerprintId);
    }
    
    saveBannedData();
    console.log(`多重封禁: 用户 ${username}, IP ${ip}, 指纹 ${fingerprintId || '无'}`);
    res.json({ success: true });
});

app.post('/api/admin/unbanUser', async (req, res) => {
    const { username } = req.body;
    bannedUsers.delete(username);
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = false;
        await writeJSON('users.json', users, `解封用户: ${username}`);
    }
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banIP', async (req, res) => {
    const { ip } = req.body;
    if (ip && ip !== 'unknown' && ip !== 'undefined') {
        bannedIPs.add(ip);
        saveBannedData();
        console.log(`封禁 IP: ${ip}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/unbanIP', async (req, res) => {
    const { ip } = req.body;
    bannedIPs.delete(ip);
    saveBannedData();
    res.json({ success: true });
});

// ==================== 业务 API ====================
app.get('/api/reviews', async (req, res) => {
    const reviews = await readJSON('reviews.json');
    res.json(reviews || []);
});

app.post('/api/review', async (req, res) => {
    const { name, rating, text, fingerprintId } = req.body;
    if (bannedFingerprints.has(fingerprintId)) {
        return res.status(403).json({ error: '设备已被封禁' });
    }
    const reviews = await readJSON('reviews.json') || [];
    reviews.unshift({ id: Date.now(), name, rating, text });
    await writeJSON('reviews.json', reviews, '新评价');
    res.json({ success: true });
});

app.post('/api/review/delete', async (req, res) => {
    const { id } = req.body;
    let reviews = await readJSON('reviews.json') || [];
    reviews = reviews.filter(r => r.id !== id);
    await writeJSON('reviews.json', reviews, '删除评价');
    res.json({ success: true });
});

app.get('/api/games', async (req, res) => {
    const games = [
        { name: "luau", players: 6, link: "https://www.roblox.com/games/125462571840934", description: "luau游戏" },
        { name: "月跑小镇", players: 230, link: "https://www.roblox.com/games/88063017898040", description: "月跑小镇" },
        { name: "HBPLA|湖北警戒区", players: 47, link: "https://www.roblox.com/games/133580699283141", description: "湖北警戒区" }
    ];
    res.json(games);
});

app.get('/api/chats/:room', async (req, res) => {
    const chats = await readJSON('chats.json');
    res.json((chats || []).filter(c => c.room === req.params.room));
});

app.post('/api/chat', async (req, res) => {
    const { user, text, room, userId, isBeauty, fingerprintId } = req.body;
    if (bannedFingerprints.has(fingerprintId)) {
        return res.status(403).json({ error: '设备已被封禁' });
    }
    const chats = await readJSON('chats.json') || [];
    chats.push({ id: Date.now(), user, text, time: new Date().toLocaleTimeString(), room, userId, isBeauty });
    await writeJSON('chats.json', chats, '新消息');
    res.json({ success: true });
});

app.get('/api/scripts', async (req, res) => {
    const scripts = await readJSON('scripts.json');
    res.json((scripts || []).filter(s => s.status === 'approved'));
});

app.post('/api/script/upload', async (req, res) => {
    const { name, desc, author, fingerprintId } = req.body;
    if (bannedFingerprints.has(fingerprintId)) {
        return res.status(403).json({ error: '设备已被封禁' });
    }
    const scripts = await readJSON('scripts.json') || [];
    scripts.push({ id: Date.now(), name, desc, author, status: 'pending', time: new Date().toISOString() });
    await writeJSON('scripts.json', scripts, '上传脚本');
    res.json({ success: true });
});

app.get('/api/whitelist', async (req, res) => {
    const whitelist = await readJSON('whitelist.json');
    res.json(whitelist || []);
});

app.post('/api/whitelist/add', async (req, res) => {
    const { name } = req.body;
    let whitelist = await readJSON('whitelist.json') || [];
    if (!whitelist.includes(name)) whitelist.push(name);
    await writeJSON('whitelist.json', whitelist, '添加白名单');
    res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
    const { username, password, fingerprintId } = req.body;
    const ip = getRealIP(req);
    console.log(`登录尝试: ${username} 来自 IP: ${ip}, 指纹: ${fingerprintId || '无'}`);
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: '您的 IP 已被封禁' });
    }
    if (bannedUsers.has(username)) {
        return res.json({ success: false, error: '账号已被封禁' });
    }
    if (fingerprintId && bannedFingerprints.has(fingerprintId)) {
        return res.json({ success: false, error: '您的设备已被封禁' });
    }
    
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        userIPRecord.set(username, { ip, lastSeen: Date.now() });
        // 记录指纹关联
        if (fingerprintId) {
            userFingerprints.set(username, fingerprintId);
            fingerprintOwners.set(fingerprintId, username);
        }
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B' });
    }
    
    const users = await readJSON('users.json');
    if (users && users[username] && users[username].password === password && !users[username].banned) {
        userIPRecord.set(username, { ip, lastSeen: Date.now() });
        if (fingerprintId) {
            userFingerprints.set(username, fingerprintId);
            fingerprintOwners.set(fingerprintId, username);
        }
        return res.json({ success: true, role: users[username].role || 'user', userId: users[username].userId, isBeauty: users[username].isBeauty || 'A' });
    }
    
    res.json({ success: false, error: '用户名或密码错误' });
});

app.post('/api/register', async (req, res) => {
    const { username, password, cardKey, fingerprintId } = req.body;
    const ip = getRealIP(req);
    console.log(`注册尝试: ${username} 来自 IP: ${ip}, 指纹: ${fingerprintId || '无'}`);
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: '您的 IP 已被封禁' });
    }
    if (fingerprintId && bannedFingerprints.has(fingerprintId)) {
        return res.json({ success: false, error: '您的设备已被封禁' });
    }
    
    const users = await readJSON('users.json') || {};
    
    let count = 0;
    for (const [name, info] of Object.entries(users)) {
        if (info.registerIP === ip) count++;
    }
    
    if (count >= 2) {
        return res.json({ success: false, error: '每个 IP 只能注册 2 个账号' });
    }
    
    if (users[username]) return res.json({ success: false, error: '用户名已存在' });
    
    const beautyCards = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069"];
    const isBeauty = (cardKey && beautyCards.includes(cardKey.trim())) ? 'B' : 'A';
    const userId = 'U' + Date.now();
    
    users[username] = { 
        password, role: 'user', banned: false, isMuted: false, 
        userId, isBeauty, avatar: '', 
        registerIP: ip,
        fingerprintId: fingerprintId || null,
        createdAt: new Date().toISOString() 
    };
    await writeJSON('users.json', users, '新用户注册');
    userIPRecord.set(username, { ip, lastSeen: Date.now() });
    if (fingerprintId) {
        userFingerprints.set(username, fingerprintId);
        fingerprintOwners.set(fingerprintId, username);
    }
    res.json({ success: true });
});

app.get('/api/user/:username', async (req, res) => {
    const users = await readJSON('users.json') || {};
    const user = users[req.params.username];
    if (user) {
        res.json({ userId: user.userId, role: user.role, isBeauty: user.isBeauty, createdAt: user.createdAt, registerIP: user.registerIP });
    } else {
        res.json(null);
    }
});

app.get('/api/admin/users', async (req, res) => {
    const users = await readJSON('users.json') || {};
    const list = [];
    for (const [name, info] of Object.entries(users)) {
        list.push({
            name: name,
            role: info.role,
            banned: info.banned || false,
            isMuted: info.isMuted || false,
            registerIP: info.registerIP || 'unknown',
            isBeauty: info.isBeauty || 'A',
            fingerprintId: info.fingerprintId || null
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

app.post('/api/admin/toggleBan', async (req, res) => {
    const { username } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) { 
        users[username].banned = !users[username].banned; 
        await writeJSON('users.json', users, '封禁/解封用户'); 
        if (users[username].banned) bannedUsers.add(username);
        else bannedUsers.delete(username);
        saveBannedData();
    }
    res.json({ success: true });
});

app.post('/api/admin/toggleMute', async (req, res) => {
    const { username } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) { 
        users[username].isMuted = !users[username].isMuted; 
        await writeJSON('users.json', users, '禁言/解除禁言'); 
    }
    res.json({ success: true });
});

app.post('/api/admin/setBeauty', async (req, res) => {
    const { username, type } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) { 
        users[username].isBeauty = type; 
        await writeJSON('users.json', users, '设置靓号'); 
    }
    res.json({ success: true });
});

app.post('/api/admin/approveScript', async (req, res) => {
    const { id } = req.body;
    const scripts = await readJSON('scripts.json') || [];
    const idx = scripts.findIndex(s => s.id === id);
    if (idx !== -1) { 
        scripts[idx].status = 'approved'; 
        await writeJSON('scripts.json', scripts, '通过脚本'); 
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

app.post('/api/admin/deleteChat', async (req, res) => {
    const { id } = req.body;
    let chats = await readJSON('chats.json') || [];
    chats = chats.filter(c => c.id !== id);
    await writeJSON('chats.json', chats, '删除消息');
    res.json({ success: true });
});

app.get('/api/admin/globalMuteStatus', async (req, res) => {
    const whitelist = await readJSON('whitelist.json');
    res.json({ enabled: whitelist === 'B' });
});

app.post('/api/admin/toggleGlobalMute', async (req, res) => {
    let current = await readJSON('whitelist.json');
    if (!current) current = 'A';
    const newStatus = current === 'A' ? 'B' : 'A';
    await writeJSON('whitelist.json', newStatus, '切换全局禁言');
    res.json({ enabled: newStatus === 'B' });
});

loadBannedData();
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`LOVESS 后端已启动！`);
    console.log(`监听端口: ${PORT}`);
    console.log(`封禁数据: ${bannedIPs.size} 个IP, ${bannedUsers.size} 个用户, ${bannedFingerprints.size} 个指纹`);
});
