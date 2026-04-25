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
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

let bannedHardware = new Set();
let bannedIPs = new Set();
let bannedUsers = new Set();
let hardwareToUser = new Map();
let visitors = new Map();

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

function loadBannedData() {
    try {
        const filePath = path.join(__dirname, 'banned.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            bannedHardware = new Set(data.bannedHardware || []);
            bannedIPs = new Set(data.bannedIPs || []);
            bannedUsers = new Set(data.bannedUsers || []);
            console.log(`封禁数据: ${bannedHardware.size} 硬件, ${bannedIPs.size} IP, ${bannedUsers.size} 用户`);
        }
    } catch(e) { console.error(e); }
}

function saveBannedData() {
    try {
        fs.writeFileSync(path.join(__dirname, 'banned.json'), JSON.stringify({
            bannedHardware: [...bannedHardware],
            bannedIPs: [...bannedIPs],
            bannedUsers: [...bannedUsers]
        }, null, 2));
    } catch(e) { console.error(e); }
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
            console.log(`加载访客数据: ${visitors.size} 条记录`);
        }
    } catch(e) { console.error('加载访客数据失败:', e); }
}

function saveVisitorsData() {
    try {
        const filePath = path.join(__dirname, 'visitors.json');
        const data = [];
        for (const [ip, v] of visitors) {
            data.push(v);
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch(e) { console.error('保存访客数据失败:', e); }
}

app.use((req, res, next) => {
    const ip = getRealIP(req);
    const hardwareId = req.headers['x-hardware-id'];
    
    if (req.path.startsWith('/api/')) {
        return next();
    }
    
    if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$/)) {
        return next();
    }
    
    if (bannedIPs.has(ip)) {
        console.log(`404伪装: IP ${ip} 被封禁`);
        return res.status(404).type('text/plain').send('404 Not Found');
    }
    
    if (hardwareId && bannedHardware.has(hardwareId)) {
        console.log(`404伪装: 硬件 ${hardwareId.substring(0, 16)}... 被封禁`);
        return res.status(404).type('text/plain').send('404 Not Found');
    }
    
    next();
});

app.post('/api/fingerprint/register', (req, res) => {
    const { fingerprint, username } = req.body;
    const ip = getRealIP(req);
    
    if (!fingerprint) {
        return res.json({ success: false, error: '无法获取设备指纹' });
    }
    
    const hardwareId = generateHardwareId(fingerprint);
    const isLoggedIn = username && username !== 'unknown' && username !== 'null' && username !== 'undefined';
    const displayUser = isLoggedIn ? username : '未登录';
    
    console.log(`指纹注册: ${hardwareId.substring(0, 16)}... IP: ${ip} 用户: ${displayUser}`);
    
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
        console.log(`新访客记录: IP ${ip}, 硬件 ${hardwareId.substring(0, 16)}...`);
        saveVisitorsData();
    } else {
        const existing = visitors.get(ip);
        existing.visitCount++;
        existing.lastSeen = new Date().toISOString();
        existing.hardwareId = hardwareId;
        if (isLoggedIn) existing.username = username;
        console.log(`更新访客: IP ${ip}, 访问次数 ${existing.visitCount}`);
        saveVisitorsData();
    }
    
    if (bannedHardware.has(hardwareId)) {
        return res.json({ success: false, banned: true, error: '此设备已被封禁' });
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

app.get('/api/admin/banned', (req, res) => {
    res.json({ bannedHardware: [...bannedHardware], bannedIPs: [...bannedIPs], bannedUsers: [...bannedUsers] });
});

app.get('/api/admin/visitors', (req, res) => {
    const list = [];
    for (const [ip, v] of visitors) {
        list.push(v);
    }
    res.json(list);
});

app.post('/api/admin/banHardware', (req, res) => {
    const { hardwareId } = req.body;
    if (hardwareId) {
        bannedHardware.add(hardwareId);
        saveBannedData();
        console.log(`封禁硬件: ${hardwareId}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/unbanHardware', (req, res) => {
    const { hardwareId } = req.body;
    bannedHardware.delete(hardwareId);
    saveBannedData();
    res.json({ success: true });
});

app.post('/api/admin/banIP', (req, res) => {
    const { ip } = req.body;
    if (ip && ip !== 'unknown') {
        bannedIPs.add(ip);
        saveBannedData();
        console.log(`封禁 IP: ${ip}`);
    }
    res.json({ success: true });
});

app.post('/api/admin/unbanIP', (req, res) => {
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

app.post('/api/admin/toggleBan', async (req, res) => {
    const { username } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        users[username].banned = !users[username].banned;
        if (users[username].banned) bannedUsers.add(username);
        else bannedUsers.delete(username);
        await writeJSON('users.json', users, '封禁/解封用户');
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
            registerIP: info.registerIP
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

// ==================== 全局禁言 API（直接读写 GitHub whitelist.json） ====================
app.get('/api/admin/globalMuteStatus', async (req, res) => {
    try {
        const status = await readGitHubFile('whitelist.json');
        let isMuted = false;
        if (status === 'B') {
            isMuted = true;
        } else if (typeof status === 'object' && status !== null && status.globalMute === true) {
            isMuted = true;
        }
        console.log(`[GitHub] 全局禁言状态查询: ${isMuted ? '开启(B)' : '关闭(A)'}`);
        res.json({ enabled: isMuted });
    } catch(e) {
        console.error('读取全局禁言状态失败:', e);
        res.json({ enabled: false });
    }
});

app.post('/api/admin/toggleGlobalMute', async (req, res) => {
    try {
        let current = await readGitHubFile('whitelist.json');
        let newStatus;
        
        if (current === 'A' || current === undefined || current === null) {
            newStatus = 'B';
        } else if (current === 'B') {
            newStatus = 'A';
        } else if (typeof current === 'object') {
            newStatus = current.globalMute === true ? 'A' : 'B';
        } else {
            newStatus = 'A';
        }
        
        await writeGitHubFile('whitelist.json', newStatus, `切换全局禁言: ${newStatus === 'B' ? '开启' : '关闭'}`);
        console.log(`[GitHub] 全局禁言已切换: ${newStatus === 'B' ? '开启(B)' : '关闭(A)'}`);
        res.json({ enabled: newStatus === 'B' });
    } catch(e) {
        console.error('切换全局禁言失败:', e);
        res.status(500).json({ error: '操作失败: ' + e.message });
    }
});

// ==================== GitHub 读写函数 ====================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER || "liushumei11110-boop";
const REPO_NAME = process.env.REPO_NAME || "lovess";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "khyzybnb666147";

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
        if (!res.ok) {
            throw new Error(`GitHub API 返回 ${res.status}`);
        }
        return true;
    } catch(e) { 
        console.error(`写入 GitHub ${file} 失败:`, e);
        throw e;
    }
}

async function readJSON(file) {
    return await readGitHubFile(file);
}

async function writeJSON(file, content, msg) {
    return await writeGitHubFile(file, content, msg);
}

// ==================== 业务 API ====================
app.get('/api/debug/ip', (req, res) => {
    res.json({ realIP: getRealIP(req) });
});

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

app.get('/api/games', async (req, res) => {
    res.json([
        { name: "luau", players: 6, link: "https://www.roblox.com/games/125462571840934", description: "luau游戏" },
        { name: "月跑小镇", players: 230, link: "https://www.roblox.com/games/88063017898040", description: "月跑小镇" },
        { name: "HBPLA|湖北警戒区", players: 47, link: "https://www.roblox.com/games/133580699283141", description: "湖北警戒区" }
    ]);
});

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

app.get('/api/whitelist', async (req, res) => {
    const whitelist = await readJSON('whitelist.json');
    if (typeof whitelist === 'string') {
        res.json([]);
    } else {
        res.json(whitelist || []);
    }
});

app.post('/api/whitelist/add', async (req, res) => {
    let whitelist = await readJSON('whitelist.json');
    if (typeof whitelist === 'string') {
        whitelist = [];
    }
    if (!Array.isArray(whitelist)) whitelist = [];
    const { name } = req.body;
    if (!whitelist.includes(name)) whitelist.push(name);
    await writeJSON('whitelist.json', whitelist, '添加白名单');
    res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
    const { username, password, hardwareId } = req.body;
    const ip = getRealIP(req);
    
    console.log(`登录尝试: ${username} 来自 IP: ${ip}`);
    
    if (bannedIPs.has(ip)) return res.json({ success: false, error: 'IP已被封禁' });
    if (bannedUsers.has(username)) return res.json({ success: false, error: '账号已被封禁' });
    if (hardwareId && bannedHardware.has(hardwareId)) return res.json({ success: false, error: '此设备已被封禁' });
    
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B' });
    }
    
    const users = await readJSON('users.json');
    if (users && users[username] && users[username].password === password && !users[username].banned) {
        return res.json({ success: true, role: users[username].role || 'user', userId: users[username].userId, isBeauty: users[username].isBeauty || 'A' });
    }
    
    res.json({ success: false, error: '用户名或密码错误' });
});

app.post('/api/register', async (req, res) => {
    const { username, password, cardKey, hardwareId } = req.body;
    const ip = getRealIP(req);
    
    console.log(`注册尝试: ${username} 来自 IP: ${ip}`);
    
    if (bannedIPs.has(ip)) return res.json({ success: false, error: 'IP已被封禁' });
    if (hardwareId && bannedHardware.has(hardwareId)) return res.json({ success: false, error: '此设备已被封禁' });
    
    const users = await readJSON('users.json') || {};
    if (users[username]) return res.json({ success: false, error: '用户名已存在' });
    
    const beautyCards = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069"];
    const isBeauty = (cardKey && beautyCards.includes(cardKey.trim())) ? 'B' : 'A';
    const userId = 'U' + Date.now();
    
    users[username] = {
        password, role: 'user', banned: false, isMuted: false,
        userId, isBeauty, avatar: '', registerIP: ip, hardwareId,
        createdAt: new Date().toISOString()
    };
    await writeJSON('users.json', users, '新用户注册');
    res.json({ success: true });
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

loadBannedData();
loadVisitorsData();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`LOVESS 后端已启动！`);
    console.log(`监听端口: ${PORT}`);
    console.log(`已封禁 ${bannedHardware.size} 个硬件, ${bannedIPs.size} 个IP, ${bannedUsers.size} 个用户`);
    console.log(`访客记录: ${visitors.size} 条`);
});
