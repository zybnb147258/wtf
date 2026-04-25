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
let bannedFingerprints = new Set();

const deviceGraph = new Map();
const userDevices = new Map();
const ipRequestCount = new Map();
const userChatLimit = new Map();

const BANNED_FILE = path.join(__dirname, 'banned.json');
const GRAPH_FILE = path.join(__dirname, 'device_graph.json');

function loadData() {
    try {
        if (fs.existsSync(BANNED_FILE)) {
            const data = JSON.parse(fs.readFileSync(BANNED_FILE, 'utf8'));
            bannedIPs = new Set(data.bannedIPs || []);
            bannedUsers = new Set(data.bannedUsers || []);
            bannedFingerprints = new Set(data.bannedFingerprints || []);
        }
        if (fs.existsSync(GRAPH_FILE)) {
            const data = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
            for (const [fp, info] of Object.entries(data.deviceGraph || {})) {
                deviceGraph.set(fp, {
                    accounts: new Set(info.accounts),
                    ips: new Set(info.ips),
                    lastSeen: info.lastSeen
                });
            }
            for (const [user, info] of Object.entries(data.userDevices || {})) {
                userDevices.set(user, {
                    fingerprints: new Set(info.fingerprints),
                    ips: new Set(info.ips),
                    registerCount: info.registerCount || 1
                });
            }
        }
        console.log(`加载封禁数据: ${bannedIPs.size} IP, ${bannedUsers.size} 用户, ${bannedFingerprints.size} 指纹`);
    } catch(e) { console.error('加载封禁数据失败:', e); }
}

function saveData() {
    try {
        const deviceGraphObj = {};
        for (const [fp, info] of deviceGraph) {
            deviceGraphObj[fp] = {
                accounts: [...info.accounts],
                ips: [...info.ips],
                lastSeen: info.lastSeen
            };
        }
        const userDevicesObj = {};
        for (const [user, info] of userDevices) {
            userDevicesObj[user] = {
                fingerprints: [...info.fingerprints],
                ips: [...info.ips],
                registerCount: info.registerCount
            };
        }
        fs.writeFileSync(BANNED_FILE, JSON.stringify({
            bannedIPs: [...bannedIPs],
            bannedUsers: [...bannedUsers],
            bannedFingerprints: [...bannedFingerprints]
        }, null, 2));
        fs.writeFileSync(GRAPH_FILE, JSON.stringify({
            deviceGraph: deviceGraphObj,
            userDevices: userDevicesObj
        }, null, 2));
    } catch(e) { console.error('保存封禁数据失败:', e); }
}

function analyzeAndBan(fingerprint, username, ip, action) {
    if (!fingerprint || fingerprint.length < 8) return { banned: false };
    if (!username || username === 'unknown') return { banned: false };
    
    if (!deviceGraph.has(fingerprint)) {
        deviceGraph.set(fingerprint, { accounts: new Set(), ips: new Set(), lastSeen: Date.now() });
    }
    const device = deviceGraph.get(fingerprint);
    device.accounts.add(username);
    device.ips.add(ip);
    device.lastSeen = Date.now();
    
    if (!userDevices.has(username)) {
        userDevices.set(username, { fingerprints: new Set(), ips: new Set(), registerCount: 0 });
    }
    const user = userDevices.get(username);
    user.fingerprints.add(fingerprint);
    user.ips.add(ip);
    
    let riskScore = 0;
    const reasons = [];
    
    if (device.accounts.size >= 3) {
        riskScore += 50;
        reasons.push(`设备关联 ${device.accounts.size} 个账号`);
    } else if (device.accounts.size >= 2) {
        riskScore += 25;
        reasons.push(`设备关联多个账号`);
    }
    
    if (user.fingerprints.size >= 3) {
        riskScore += 40;
        reasons.push(`账号使用 ${user.fingerprints.size} 个不同设备`);
    }
    
    if (user.ips.size >= 4) {
        riskScore += 30;
        reasons.push(`账号使用 ${user.ips.size} 个不同IP`);
    }
    
    if (riskScore >= 60) {
        console.log(`触发自动封禁！用户:${username} 风险:${riskScore} 原因:${reasons.join(', ')}`);
        bannedUsers.add(username);
        bannedFingerprints.add(fingerprint);
        for (const acc of device.accounts) bannedUsers.add(acc);
        for (const ipaddr of device.ips) bannedIPs.add(ipaddr);
        saveData();
        return { banned: true, reasons, riskScore };
    }
    
    saveData();
    return { banned: false, riskScore, reasons };
}

function antiSpam(req, res, next) {
    const ip = getRealIP(req);
    const now = Date.now();
    const windowMs = 30 * 1000;
    const maxRequests = 5;
    
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
        return res.status(429).json({ error: '操作太频繁，请稍后再试' });
    }
    next();
}

function chatAntiSpam(req, res, next) {
    const username = req.body?.user;
    if (!username) return next();
    const now = Date.now();
    const lastMsg = userChatLimit.get(username) || 0;
    if (now - lastMsg < 3000) {
        return res.status(429).json({ error: '发言太快，请3秒后再试' });
    }
    userChatLimit.set(username, now);
    next();
}

app.use((req, res, next) => {
    const ip = getRealIP(req);
    const fingerprint = req.headers['x-device-fingerprint'] || req.body?.fingerprint;
    
    if (bannedIPs.has(ip)) {
        console.log(`拒绝访问: 被封禁 IP ${ip}`);
        return res.status(403).json({ error: 'IP已被封禁', banned: true });
    }
    if (fingerprint && bannedFingerprints.has(fingerprint)) {
        console.log(`拒绝访问: 被封禁指纹 ${fingerprint.substring(0,12)}...`);
        return res.status(403).json({ error: '设备已被封禁', banned: true });
    }
    next();
});

app.post('/api/fingerprint/check', (req, res) => {
    const { fingerprint } = req.body;
    res.json({ banned: fingerprint && bannedFingerprints.has(fingerprint) });
});

app.post('/api/fingerprint/record', (req, res) => {
    const { fingerprint, username, action } = req.body;
    const ip = getRealIP(req);
    if (username && username !== 'unknown' && fingerprint) {
        const result = analyzeAndBan(fingerprint, username, ip, action);
        if (result.banned) return res.json({ banned: true, reason: result.reasons.join(', ') });
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
        saveData();
        console.log(`封禁指纹: ${fingerprint.substring(0,12)}...`);
    }
    res.json({ success: true });
});

app.post('/api/fingerprint/unban', (req, res) => {
    const { fingerprint } = req.body;
    bannedFingerprints.delete(fingerprint);
    saveData();
    res.json({ success: true });
});

app.get('/api/admin/deviceGraph', (req, res) => {
    const graph = [];
    for (const [fp, info] of deviceGraph) {
        graph.push({
            fingerprint: fp,
            accounts: [...info.accounts],
            ips: [...info.ips],
            accountCount: info.accounts.size
        });
    }
    res.json(graph);
});

app.post('/api/admin/banDeviceChain', (req, res) => {
    const { fingerprint } = req.body;
    const device = deviceGraph.get(fingerprint);
    if (device) {
        for (const acc of device.accounts) bannedUsers.add(acc);
        for (const ip of device.ips) bannedIPs.add(ip);
        bannedFingerprints.add(fingerprint);
        saveData();
    }
    res.json({ success: true });
});

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

app.get('/api/debug/ip', (req, res) => {
    const realIP = getRealIP(req);
    res.json({ realIP: realIP, isBanned: bannedIPs.has(realIP) });
});

app.get('/test', (req, res) => res.json({ status: 'ok' }));

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
    saveData();
    console.log(`双重封禁: 用户 ${username}, IP ${ip}`);
    res.json({ success: true });
});

app.post('/api/admin/banIP', async (req, res) => {
    const { ip } = req.body;
    if (ip && ip !== 'unknown' && ip !== 'undefined') {
        bannedIPs.add(ip);
        saveData();
        console.log(`封禁 IP: ${ip}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/unbanIP', async (req, res) => {
    const { ip } = req.body;
    bannedIPs.delete(ip);
    saveData();
    console.log(`解封 IP: ${ip}`);
    res.json({ success: true });
});

app.get('/api/reviews', async (req, res) => {
    const reviews = await readJSON('reviews.json');
    res.json(reviews || []);
});

app.post('/api/review', antiSpam, async (req, res) => {
    const { name, rating, text, fingerprint } = req.body;
    const reviews = await readJSON('reviews.json') || [];
    reviews.unshift({ id: Date.now(), name, rating, text, time: new Date().toISOString() });
    await writeJSON('reviews.json', reviews, '新评价');
    if (fingerprint && name) analyzeAndBan(fingerprint, name, getRealIP(req), 'review');
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

app.post('/api/chat', chatAntiSpam, antiSpam, async (req, res) => {
    const { user, text, room, userId, isBeauty, fingerprint } = req.body;
    if (bannedUsers.has(user)) return res.status(403).json({ error: '账号已被封禁' });
    const chats = await readJSON('chats.json') || [];
    chats.push({ id: Date.now(), user, text, time: new Date().toLocaleTimeString(), room, userId, isBeauty, fingerprint: fingerprint?.substring(0, 8) });
    await writeJSON('chats.json', chats.slice(-500), '新消息');
    if (fingerprint && user) analyzeAndBan(fingerprint, user, getRealIP(req), 'chat');
    res.json({ success: true });
});

app.get('/api/scripts', async (req, res) => {
    const scripts = await readJSON('scripts.json');
    res.json((scripts || []).filter(s => s.status === 'approved'));
});

app.post('/api/script/upload', antiSpam, async (req, res) => {
    const { name, desc, author, fingerprint } = req.body;
    const scripts = await readJSON('scripts.json') || [];
    scripts.push({ id: Date.now(), name, desc, author, status: 'pending', time: new Date().toISOString() });
    await writeJSON('scripts.json', scripts, '上传脚本');
    if (fingerprint && author) analyzeAndBan(fingerprint, author, getRealIP(req), 'upload');
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
    const { username, password, fingerprint } = req.body;
    const ip = getRealIP(req);
    console.log(`登录尝试: ${username} 来自 IP: ${ip} 指纹: ${fingerprint?.substring(0,12)}...`);
    
    if (bannedUsers.has(username)) {
        return res.json({ success: false, error: '账号已被封禁' });
    }
    if (fingerprint && bannedFingerprints.has(fingerprint)) {
        return res.json({ success: false, error: '设备已被封禁' });
    }
    
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        analyzeAndBan(fingerprint, username, ip, 'login');
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B' });
    }
    
    const users = await readJSON('users.json');
    if (users && users[username] && users[username].password === password && !users[username].banned) {
        analyzeAndBan(fingerprint, username, ip, 'login');
        return res.json({ success: true, role: users[username].role || 'user', userId: users[username].userId, isBeauty: users[username].isBeauty || 'A' });
    }
    
    res.json({ success: false, error: '用户名或密码错误' });
});

app.post('/api/register', async (req, res) => {
    const { username, password, cardKey, fingerprint } = req.body;
    const ip = getRealIP(req);
    console.log(`注册尝试: ${username} 来自 IP: ${ip} 指纹: ${fingerprint?.substring(0,12)}...`);
    
    if (bannedFingerprints.has(fingerprint)) {
        return res.json({ success: false, error: '设备已被封禁' });
    }
    
    const users = await readJSON('users.json') || {};
    
    let ipAccountCount = 0;
    for (const [name, info] of Object.entries(users)) {
        if (info.registerIP === ip) ipAccountCount++;
    }
    if (ipAccountCount >= 2) {
        return res.json({ success: false, error: '每个IP只能注册2个账号' });
    }
    
    let fpAccountCount = 0;
    for (const [name, info] of Object.entries(users)) {
        if (info.registerFingerprint === fingerprint) fpAccountCount++;
    }
    if (fpAccountCount >= 2) {
        return res.json({ success: false, error: '每个设备只能注册2个账号' });
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
    analyzeAndBan(fingerprint, username, ip, 'register');
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
        saveData();
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

app.post('/api/admin/banUserAndFingerprint', async (req, res) => {
    const { username, fingerprint } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = true;
        await writeJSON('users.json', users, '封禁用户+指纹');
    }
    bannedUsers.add(username);
    if (fingerprint) bannedFingerprints.add(fingerprint);
    saveData();
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

loadData();
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`LOVESS 后端已启动！`);
    console.log(`监听端口: ${PORT}`);
    console.log(`封禁数据: ${bannedIPs.size} IP, ${bannedUsers.size} 用户, ${bannedFingerprints.size} 指纹`);
});
