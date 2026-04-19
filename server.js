const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.set('trust proxy', true);
app.use(express.json());
app.use(express.static('public'));

// ==================== CORS 跨域配置（只加了这一段）====================
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});
// ==================== CORS 结束 ====================

// ==================== 获取真实 IP ====================
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

// ==================== 封禁数据 ====================
let bannedIPs = new Set();
let bannedUsers = new Set();
let bannedFingerprints = new Set();

function loadBannedData() {
    try {
        const filePath = path.join(__dirname, 'banned.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            bannedIPs = new Set(data.bannedIPs || []);
            bannedUsers = new Set(data.bannedUsers || []);
            bannedFingerprints = new Set(data.bannedFingerprints || []);
            console.log(`加载封禁数据: ${bannedIPs.size} 个IP, ${bannedUsers.size} 个用户, ${bannedFingerprints.size} 个设备指纹`);
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
        console.log(`保存封禁数据: ${bannedIPs.size} 个IP, ${bannedUsers.size} 个用户, ${bannedFingerprints.size} 个设备指纹`);
    } catch(e) { console.error('保存封禁数据失败:', e); }
}

// ==================== IP 封禁中间件 ====================
app.use((req, res, next) => {
    const ip = getRealIP(req);
    if (req.path === '/api/debug/ip' || req.path === '/test' || req.path === '/unban-me') {
        return next();
    }
    if (bannedIPs.has(ip)) {
        console.log(`拒绝访问: 被封禁 IP ${ip}`);
        return res.status(404).send('404 Not Found');
    }
    next();
});

// ==================== 刷屏检测 ====================
let ipRequestCount = new Map();
let userIPRecord = new Map();

function checkSpam(ip, username) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 20;
    
    if (bannedIPs.has(ip)) {
        return { allowed: false, reason: '您的 IP 已被封禁' };
    }
    if (bannedUsers.has(username)) {
        return { allowed: false, reason: '您的账号已被封禁' };
    }
    if (username && bannedFingerprints.has(username)) {
        return { allowed: false, reason: '您的设备已被封禁' };
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
    const result = checkSpam(ip, username);
    if (!result.allowed) {
        return res.status(429).json({ error: result.reason });
    }
    next();
}

app.use('/api/review', antiSpam);
app.use('/api/chat', antiSpam);
app.use('/api/script', antiSpam);
app.use('/api/whitelist', antiSpam);

// ==================== 配置 ====================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER || "liushumei11110-boop";
const REPO_NAME = process.env.REPO_NAME || "lovess";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "khyzybnb666147";

const VALID_CARDS = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069"];

// ==================== 辅助函数 ====================
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
app.get('/test', (req, res) => res.json({ status: 'ok' }));

app.get('/api/debug/ip', (req, res) => {
    const realIP = getRealIP(req);
    res.json({ realIP: realIP, isBanned: bannedIPs.has(realIP) });
});

app.get('/unban-me', (req, res) => {
    const myIP = '106.8.21.205';
    if (bannedIPs.has(myIP)) {
        bannedIPs.delete(myIP);
        saveBannedData();
        res.send(`已解封 IP: ${myIP}`);
    } else {
        res.send(`IP ${myIP} 不在封禁列表中`);
    }
});

// ==================== 管理员封禁 API ====================
app.get('/api/admin/ips', async (req, res) => {
    const list = [];
    for (const [ip, data] of ipRequestCount) {
        list.push({ type: 'ip', name: ip, ip: ip, requests: data.count, lastSeen: new Date(data.lastReset).toLocaleString(), isBanned: bannedIPs.has(ip) });
    }
    for (const [username, data] of userIPRecord) {
        list.push({ type: 'user', name: username, ip: data.ip, lastSeen: data.lastSeen ? new Date(data.lastSeen).toLocaleString() : null });
    }
    res.json(list);
});

app.get('/api/admin/banned', async (req, res) => {
    res.json({ bannedIPs: [...bannedIPs], bannedUsers: [...bannedUsers], bannedFingerprints: [...bannedFingerprints] });
});

app.post('/api/admin/banUserAndIP', async (req, res) => {
    const { username, ip, fingerprint } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = true;
        await writeJSON('users.json', users, `封禁用户: ${username}`);
    }
    bannedUsers.add(username);
    if (ip && ip !== 'unknown' && ip !== 'undefined') bannedIPs.add(ip);
    if (fingerprint && fingerprint !== 'unknown' && fingerprint !== 'undefined' && fingerprint.length > 10) bannedFingerprints.add(fingerprint);
    saveBannedData();
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
    }
    res.json({ success: true });
});

app.post('/api/admin/unbanIP', async (req, res) => {
    const { ip } = req.body;
    bannedIPs.delete(ip);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banFingerprint', async (req, res) => {
    const { fingerprint } = req.body;
    if (fingerprint && fingerprint !== 'unknown' && fingerprint !== 'undefined' && fingerprint.length > 10) {
        bannedFingerprints.add(fingerprint);
        saveBannedData();
    }
    res.json({ success: true });
});

app.post('/api/admin/unbanFingerprint', async (req, res) => {
    const { fingerprint } = req.body;
    bannedFingerprints.delete(fingerprint);
    saveBannedData();
    res.json({ success: true });
});

// ==================== 登录 API ====================
app.post('/api/login', async (req, res) => {
    const { username, password, fingerprint } = req.body;
    const ip = getRealIP(req);
    console.log(`登录尝试: ${username} 来自 IP: ${ip}, 指纹: ${fingerprint}`);
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: '您的 IP 已被封禁' });
    }
    if (bannedUsers.has(username)) {
        return res.json({ success: false, error: '账号已被封禁' });
    }
    if (fingerprint && bannedFingerprints.has(fingerprint)) {
        return res.json({ success: false, error: '您的设备已被封禁' });
    }
    
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        userIPRecord.set(username, { ip, lastSeen: Date.now(), fingerprint });
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B', hasValidCard: true });
    }
    
    const users = await readJSON('users.json');
    if (users && users[username] && users[username].password === password && !users[username].banned) {
        userIPRecord.set(username, { ip, lastSeen: Date.now(), fingerprint });
        const hasValidCard = users[username].hasValidCard || false;
        return res.json({ success: true, role: users[username].role || 'user', userId: users[username].userId, isBeauty: users[username].isBeauty || 'A', hasValidCard: hasValidCard });
    }
    
    res.json({ success: false, error: '用户名或密码错误' });
});

// ==================== 注册 API ====================
app.post('/api/register', async (req, res) => {
    const { username, password, cardKey, fingerprint } = req.body;
    const ip = getRealIP(req);
    console.log(`注册尝试: ${username} 来自 IP: ${ip}, 指纹: ${fingerprint}`);
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: '您的 IP 已被封禁' });
    }
    if (fingerprint && bannedFingerprints.has(fingerprint)) {
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
    
    const isValidCard = cardKey && VALID_CARDS.includes(cardKey);
    const isBeauty = isValidCard ? 'B' : 'A';
    const userId = 'U' + Date.now();
    
    users[username] = {
        password, role: 'user', banned: false, isMuted: false,
        userId, isBeauty, avatar: '',
        registerIP: ip,
        fingerprint: fingerprint || '',
        hasValidCard: isValidCard,
        createdAt: new Date().toISOString()
    };
    await writeJSON('users.json', users, `新用户注册: ${username}`);
    userIPRecord.set(username, { ip, lastSeen: Date.now(), fingerprint });
    res.json({ success: true });
});

app.get('/api/user/:username', async (req, res) => {
    const users = await readJSON('users.json') || {};
    const user = users[req.params.username];
    if (user) {
        res.json({ userId: user.userId, role: user.role, isBeauty: user.isBeauty, createdAt: user.createdAt, registerIP: user.registerIP, fingerprint: user.fingerprint, hasValidCard: user.hasValidCard || false });
    } else {
        res.json(null);
    }
});

// ==================== 评价 API ====================
app.get('/api/reviews', async (req, res) => {
    const reviews = await readJSON('reviews.json');
    res.json(reviews || []);
});

app.post('/api/review', async (req, res) => {
    const { name, rating, text } = req.body;
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

// ==================== 游戏 API ====================
app.get('/api/games', async (req, res) => {
    const games = [
        { name: "luau", players: 6, link: "https://www.roblox.com/games/125462571840934", description: "luau游戏" },
        { name: "月跑小镇", players: 230, link: "https://www.roblox.com/games/88063017898040", description: "月跑小镇" },
        { name: "HBPLA|湖北警戒区", players: 47, link: "https://www.roblox.com/games/133580699283141", description: "湖北警戒区" }
    ];
    res.json(games);
});

// ==================== 聊天 API ====================
app.get('/api/chats/:room', async (req, res) => {
    const chats = await readJSON('chats.json');
    res.json((chats || []).filter(c => c.room === req.params.room));
});

app.post('/api/chat', async (req, res) => {
    const { user, text, room, userId, isBeauty } = req.body;
    const chats = await readJSON('chats.json') || [];
    chats.push({ id: Date.now(), user, text, time: new Date().toLocaleTimeString(), room, userId, isBeauty });
    await writeJSON('chats.json', chats, '新消息');
    res.json({ success: true });
});

// ==================== 脚本 API ====================
app.get('/api/scripts', async (req, res) => {
    const scripts = await readJSON('scripts.json');
    res.json((scripts || []).filter(s => s.status === 'approved'));
});

app.post('/api/script/upload', async (req, res) => {
    const { name, desc, author } = req.body;
    const scripts = await readJSON('scripts.json') || [];
    scripts.push({ id: Date.now(), name, desc, author, status: 'pending', time: new Date().toISOString() });
    await writeJSON('scripts.json', scripts, '上传脚本');
    res.json({ success: true });
});

// ==================== 白名单 API ====================
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

// ==================== 管理员 API ====================
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
            fingerprint: info.fingerprint || 'unknown',
            isBeauty: info.isBeauty || 'A',
            hasValidCard: info.hasValidCard || false
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

// ==================== 启动服务器 ====================
loadBannedData();
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ LOVESS 后端已启动！三重封禁已开启，卡密验证已开启`);
    console.log(`✅ 监听端口: ${PORT}`);
    console.log(`✅ 封禁数据: ${bannedIPs.size} 个IP, ${bannedUsers.size} 个用户, ${bannedFingerprints.size} 个设备指纹`);
});
