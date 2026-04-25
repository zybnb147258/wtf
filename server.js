const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.set('trust proxy', true);
app.use(express.json());
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

let bannedIPs = new Set();
let bannedUsers = new Set();
let bannedFingerprints = new Set();  // 新增：指纹封禁

function loadBannedData() {
    try {
        const filePath = path.join(__dirname, 'banned.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            bannedIPs = new Set(data.bannedIPs || []);
            bannedUsers = new Set(data.bannedUsers || []);
            bannedFingerprints = new Set(data.bannedFingerprints || []);
            console.log(`加载封禁数据: ${bannedIPs.size} IP, ${bannedUsers.size} 用户, ${bannedFingerprints.size} 指纹`);
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
        console.log(`保存封禁数据: ${bannedIPs.size} IP, ${bannedUsers.size} 用户, ${bannedFingerprints.size} 指纹`);
    } catch(e) { console.error('保存封禁数据失败:', e); }
}

// IP + 指纹 封禁中间件
app.use((req, res, next) => {
    const ip = getRealIP(req);
    const fingerprint = req.headers['x-device-fingerprint'] || req.body?.fingerprint;
    
    if (req.path === '/api/debug/ip' || req.path === '/test') {
        return next();
    }
    if (bannedIPs.has(ip)) {
        console.log(`拒绝访问: 被封禁 IP ${ip}`);
        return res.status(404).send('404 Not Found');
    }
    if (fingerprint && bannedFingerprints.has(fingerprint)) {
        console.log(`拒绝访问: 被封禁指纹 ${fingerprint}`);
        return res.status(403).json({ error: '设备已被封禁', banned: true });
    }
    next();
});

let ipRequestCount = new Map();
let userIPRecord = new Map();
let userFingerprintRecord = new Map();  // 新增：记录用户使用的指纹

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

// ==================== 新增：指纹API ====================
app.post('/api/fingerprint/check', (req, res) => {
    const { fingerprint } = req.body;
    res.json({ banned: fingerprint && bannedFingerprints.has(fingerprint) });
});

app.post('/api/fingerprint/record', (req, res) => {
    const { fingerprint, username, action } = req.body;
    const ip = getRealIP(req);
    if (username && username !== 'unknown' && fingerprint) {
        // 记录用户使用的指纹
        if (!userFingerprintRecord.has(username)) {
            userFingerprintRecord.set(username, { fingerprints: new Set(), ips: new Set() });
        }
        const record = userFingerprintRecord.get(username);
        record.fingerprints.add(fingerprint);
        record.ips.add(ip);
        
        // 行为分析：一个账号使用多个不同指纹 → 可疑
        if (record.fingerprints.size >= 3 && !bannedUsers.has(username)) {
            console.log(`⚠️ 行为检测: 用户 ${username} 使用了 ${record.fingerprints.size} 个不同设备指纹`);
            // 自动封禁（可选，先注释，让管理员决定）
            // bannedUsers.add(username);
            // bannedFingerprints.add(fingerprint);
            // saveBannedData();
        }
    }
    res.json({ success: true });
});

app.get('/api/fingerprint/list', (req, res) => {
    const list = [];
    for (const fp of bannedFingerprints) {
        list.push({ fingerprint: fp, reason: '违规行为' });
    }
    res.json(list);
});

app.post('/api/fingerprint/ban', (req, res) => {
    const { fingerprint, reason } = req.body;
    if (fingerprint) {
        bannedFingerprints.add(fingerprint);
        saveBannedData();
        console.log(`封禁指纹: ${fingerprint.substring(0,12)}... 原因: ${reason || '管理员封禁'}`);
    }
    res.json({ success: true });
});

app.post('/api/fingerprint/unban', (req, res) => {
    const { fingerprint } = req.body;
    if (fingerprint && bannedFingerprints.has(fingerprint)) {
        bannedFingerprints.delete(fingerprint);
        saveBannedData();
        console.log(`解封指纹: ${fingerprint.substring(0,12)}...`);
    }
    res.json({ success: true });
});

// 新增：封禁用户+指纹（连坐）
app.post('/api/admin/banUserAndFingerprint', async (req, res) => {
    const { username, fingerprint } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = true;
        await writeJSON('users.json', users, `封禁用户: ${username} + 指纹`);
    }
    bannedUsers.add(username);
    if (fingerprint && fingerprint !== 'unknown' && fingerprint !== 'undefined') {
        bannedFingerprints.add(fingerprint);
    }
    saveBannedData();
    console.log(`双重封禁: 用户 ${username}, 指纹 ${fingerprint?.substring(0,12)}...`);
    res.json({ success: true });
});

// 新增：管理员获取指纹封禁列表
app.get('/api/admin/fingerprints', (req, res) => {
    const list = [];
    for (const fp of bannedFingerprints) {
        list.push({ fingerprint: fp, reason: '违规行为' });
    }
    res.json(list);
});

// 新增：获取用户设备记录
app.get('/api/admin/userDevices', (req, res) => {
    const list = [];
    for (const [username, record] of userFingerprintRecord) {
        list.push({
            username,
            fingerprintCount: record.fingerprints.size,
            fingerprints: [...record.fingerprints].map(f => f.substring(0,12) + '...'),
            ips: [...record.ips]
        });
    }
    res.json(list);
});

// ==================== 原有API（添加指纹记录）====================
app.get('/api/debug/ip', (req, res) => {
    const realIP = getRealIP(req);
    res.json({ 
        realIP: realIP,
        isBanned: bannedIPs.has(realIP)
    });
});

app.get('/test', (req, res) => res.json({ status: 'ok' }));

// 管理员 API
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
    res.json({ bannedIPs: [...bannedIPs], bannedUsers: [...bannedUsers], bannedFingerprints: [...bannedFingerprints] });
});

app.post('/api/admin/banUserAndIP', async (req, res) => {
    const { username, ip } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = true;
        await writeJSON('users.json', users, `封禁用户: ${username}`);
    }
    bannedUsers.add(username);
    if (ip && ip !== 'unknown' && ip !== 'undefined') {
        bannedIPs.add(ip);
    }
    saveBannedData();
    console.log(`双重封禁: 用户 ${username}, IP ${ip}`);
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
    console.log(`解封 IP: ${ip}`);
    res.json({ success: true });
});

// 业务 API
app.get('/api/reviews', async (req, res) => {
    const reviews = await readJSON('reviews.json');
    res.json(reviews || []);
});

app.post('/api/review', async (req, res) => {
    const { name, rating, text, fingerprint } = req.body;
    const reviews = await readJSON('reviews.json') || [];
    reviews.unshift({ id: Date.now(), name, rating, text, time: new Date().toISOString() });
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
    const { user, text, room, userId, isBeauty, fingerprint } = req.body;
    const chats = await readJSON('chats.json') || [];
    chats.push({ id: Date.now(), user, text, time: new Date().toLocaleTimeString(), room, userId, isBeauty, fingerprint: fingerprint?.substring(0,8) });
    await writeJSON('chats.json', chats.slice(-500), '新消息');
    res.json({ success: true });
});

app.get('/api/scripts', async (req, res) => {
    const scripts = await readJSON('scripts.json');
    res.json((scripts || []).filter(s => s.status === 'approved'));
});

app.post('/api/script/upload', async (req, res) => {
    const { name, desc, author, fingerprint } = req.body;
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

// 登录（添加指纹记录）
app.post('/api/login', async (req, res) => {
    const { username, password, fingerprint } = req.body;
    const ip = getRealIP(req);
    console.log(`登录尝试: ${username} 来自 IP: ${ip} 指纹: ${fingerprint?.substring(0,12)}...`);
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: '您的 IP 已被封禁' });
    }
    if (bannedUsers.has(username)) {
        return res.json({ success: false, error: '账号已被封禁' });
    }
    if (fingerprint && bannedFingerprints.has(fingerprint)) {
        return res.json({ success: false, error: '设备已被封禁' });
    }
    
    // 记录指纹关联
    if (fingerprint && fingerprint !== 'unknown') {
        if (!userFingerprintRecord.has(username)) {
            userFingerprintRecord.set(username, { fingerprints: new Set(), ips: new Set() });
        }
        userFingerprintRecord.get(username).fingerprints.add(fingerprint);
        userFingerprintRecord.get(username).ips.add(ip);
    }
    
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        userIPRecord.set(username, { ip, lastSeen: Date.now() });
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B' });
    }
    
    const users = await readJSON('users.json');
    if (users && users[username] && users[username].password === password && !users[username].banned) {
        userIPRecord.set(username, { ip, lastSeen: Date.now() });
        return res.json({ success: true, role: users[username].role || 'user', userId: users[username].userId, isBeauty: users[username].isBeauty || 'A' });
    }
    
    res.json({ success: false, error: '用户名或密码错误' });
});

// 注册（添加指纹限制）
app.post('/api/register', async (req, res) => {
    const { username, password, cardKey, fingerprint } = req.body;
    const ip = getRealIP(req);
    console.log(`注册尝试: ${username} 来自 IP: ${ip} 指纹: ${fingerprint?.substring(0,12)}...`);
    
    if (bannedIPs.has(ip)) {
        return res.json({ success: false, error: '您的 IP 已被封禁' });
    }
    if (fingerprint && bannedFingerprints.has(fingerprint)) {
        return res.json({ success: false, error: '设备已被封禁' });
    }
    
    const users = await readJSON('users.json') || {};
    
    let count = 0;
    for (const [name, info] of Object.entries(users)) {
        if (info.registerIP === ip) count++;
    }
    if (count >= 2) {
        return res.json({ success: false, error: '每个 IP 只能注册 2 个账号' });
    }
    
    // 新增：每个指纹最多注册2个账号
    let fpCount = 0;
    if (fingerprint) {
        for (const [name, info] of Object.entries(users)) {
            if (info.registerFingerprint === fingerprint) fpCount++;
        }
        if (fpCount >= 2) {
            return res.json({ success: false, error: '每个设备只能注册 2 个账号' });
        }
    }
    
    if (users[username]) return res.json({ success: false, error: '用户名已存在' });
    
    const beautyCards = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069"];
    const isBeauty = (cardKey && beautyCards.includes(cardKey.trim())) ? 'B' : 'A';
    const userId = 'U' + Date.now();
    
    users[username] = { 
        password, role: 'user', banned: false, isMuted: false, 
        userId, isBeauty, avatar: '', 
        registerIP: ip,
        registerFingerprint: fingerprint,
        createdAt: new Date().toISOString() 
    };
    await writeJSON('users.json', users, '新用户注册');
    userIPRecord.set(username, { ip, lastSeen: Date.now() });
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
            isBeauty: info.isBeauty || 'A'
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
    console.log(`封禁数据: ${bannedIPs.size} IP, ${bannedUsers.size} 用户, ${bannedFingerprints.size} 指纹`);
});
