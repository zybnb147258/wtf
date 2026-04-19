const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// ==================== 从环境变量读取配置 ====================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER || "liushumei11110-boop";
const REPO_NAME = process.env.REPO_NAME || "lovess";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "khyzybnb666147";

// 测试路由：用来验证服务器是否运行
app.get('/test', (req, res) => {
    res.json({ message: 'Server is running!' });
});

async function readJSON(file) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${file}`;
        const res = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (!res.ok) return null;
        const data = await res.json();
        return JSON.parse(Buffer.from(data.content, 'base64').toString());
    } catch(e) { 
        console.log(`读取 ${file} 失败:`, e.message);
        return null; 
    }
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
        console.log(`写入 ${file} 成功`);
        return true;
    } catch(e) {
        console.log(`写入 ${file} 失败:`, e.message);
        return false;
    }
}

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

// ==================== 用户 API ====================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN] 尝试: ${username}`);
    
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        console.log(`[LOGIN] 管理员登录成功: ${username}`);
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B' });
    }
    
    const users = await readJSON('users.json');
    if (users && users[username] && users[username].password === password && !users[username].banned) {
        console.log(`[LOGIN] 用户登录成功: ${username}`);
        return res.json({ success: true, role: users[username].role || 'user', userId: users[username].userId, isBeauty: users[username].isBeauty || 'A' });
    }
    
    console.log(`[LOGIN] 失败: ${username}`);
    res.json({ success: false });
});

app.post('/api/register', async (req, res) => {
    const { username, password, cardKey } = req.body;
    console.log(`[REGISTER] 尝试: ${username}`);
    
    const users = await readJSON('users.json') || {};
    if (users[username]) {
        return res.json({ success: false, error: '用户已存在' });
    }
    
    const beautyCards = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069"];
    const isBeauty = (cardKey && beautyCards.includes(cardKey.trim())) ? 'B' : 'A';
    const userId = 'U' + Date.now();
    
    users[username] = { 
        password, role: 'user', banned: false, isMuted: false, 
        userId, isBeauty, avatar: '', createdAt: new Date().toISOString() 
    };
    
    const success = await writeJSON('users.json', users, `新用户注册: ${username}`);
    if (success) {
        console.log(`[REGISTER] 成功: ${username}`);
        res.json({ success: true, userId: userId });
    } else {
        console.log(`[REGISTER] 失败: ${username}`);
        res.json({ success: false, error: '写入失败' });
    }
});

app.get('/api/user/:username', async (req, res) => {
    const users = await readJSON('users.json') || {};
    const user = users[req.params.username];
    res.json(user ? { userId: user.userId, role: user.role, isBeauty: user.isBeauty, createdAt: user.createdAt } : null);
});

// ==================== 管理员 API ====================
app.get('/api/admin/users', async (req, res) => {
    const users = await readJSON('users.json') || {};
    res.json(Object.entries(users).map(([n, u]) => ({ name: n, role: u.role, banned: u.banned, isMuted: u.isMuted || false })));
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

// ==================== 启动服务器 (关键修复点) ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ LOVESS 后端已启动！`);
    console.log(`✅ 监听端口: ${PORT}`);
    console.log(`✅ GitHub 目标: ${GITHUB_USER}/${REPO_NAME}`);
});
