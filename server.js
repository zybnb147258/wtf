const express = require('express');
const app = express();

app.use(express.json());

// ==================== 后端 API ====================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER || "liushumei11110-boop";
const REPO_NAME = process.env.REPO_NAME || "wtf";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "khyzybnb666147";

async function readJSON(file) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${file}`;
        const res = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (!res.ok) return null;
        const data = await res.json();
        return JSON.parse(Buffer.from(data.content, 'base64').toString());
    } catch(e) { return null; }
}

async function writeJSON(file, content, msg) {
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
}

// API 路由
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
    const games = [
        { name: "luau", players: 6, placeId: "125462571840934", link: "https://www.roblox.com/games/125462571840934", description: "luau游戏", rating: 4.5 },
        { name: "APN AIRPORT", players: 8, placeId: "84312471277990", link: "https://www.roblox.com/games/84312471277990", description: "机场模拟游戏", rating: 4.5 },
        { name: "HBPLA|湖北警戒区", players: 47, placeId: "133580699283141", link: "https://www.roblox.com/games/133580699283141", description: "湖北警戒区", rating: 4.6 },
        { name: "月跑小镇", players: 230, placeId: "88063017898040", link: "https://www.roblox.com/games/88063017898040", description: "月跑小镇", rating: 4.7 },
        { name: "北京-Beijing", players: 5, placeId: "93175099699395", link: "https://www.roblox.com/games/93175099699395", description: "北京角色扮演", rating: 4.4 },
        { name: "展示类测试", players: 7, placeId: "88842067009491", link: "https://www.roblox.com/games/88842067009491", description: "展示类测试", rating: 4.2 },
        { name: "四川成都军事角色扮演", players: 34, placeId: "86201530478305", link: "https://www.roblox.com/games/86201530478305", description: "成都军事角色扮演", rating: 4.5 },
        { name: "【V1.0】天津市", players: 12, placeId: "134133232679432", link: "https://www.roblox.com/games/134133232679432", description: "天津角色扮演", rating: 4.6 },
        { name: "北京市角色扮演RP V3.0", players: 1, placeId: "131848347649145", link: "https://www.roblox.com/games/131848347649145", description: "北京RP", rating: 4.3 },
        { name: "四川省乐山市角色扮演", players: 1, placeId: "125322037757269", link: "https://www.roblox.com/games/125322037757269", description: "乐山角色扮演", rating: 4.2 },
        { name: "QG SOF训练基地", players: 1, placeId: "119790064224094", link: "https://www.roblox.com/games/119790064224094", description: "SOF训练基地", rating: 4.4 },
        { name: "私人备份", players: 1, placeId: "82603885483253", link: "https://www.roblox.com/games/82603885483253", description: "私人备份", rating: 4.0 },
        { name: "枣庄市V1.0测试版", players: 0, placeId: "92331511205671", link: "https://www.roblox.com/games/92331511205671", description: "枣庄市", rating: 4.1 },
        { name: "无标题体验BH", players: 1, placeId: "107187943659932", link: "https://www.roblox.com/games/107187943659932", description: "无标题体验BH", rating: 4.0 },
        { name: "车", players: 1, placeId: "113823868123067", link: "https://www.roblox.com/games/113823868123067", description: "车游戏", rating: 4.2 },
        { name: "东莞V1", players: 1, placeId: "116889626316417", link: "https://www.roblox.com/games/116889626316417", description: "东莞V1", rating: 4.1 },
        { name: "福鼎市RP", players: 1, placeId: "120842545621425", link: "https://www.roblox.com/games/120842545621425", description: "福鼎市RP", rating: 4.3 },
        { name: "绥化角色扮演", players: 1, placeId: "81262912666902", link: "https://www.roblox.com/games/81262912666902", description: "绥化RP", rating: 4.2 },
        { name: "温州市", players: 1, placeId: "89999256811858", link: "https://www.roblox.com/games/89999256811858", description: "温州市", rating: 4.3 },
        { name: "内测温州市V1.5", players: 1, placeId: "77973084343973", link: "https://www.roblox.com/games/77973084343973", description: "温州市内测", rating: 4.2 },
        { name: "唐山纪元", players: 0, placeId: "139594160698611", link: "https://www.roblox.com/games/139594160698611", description: "唐山纪元", rating: 4.0 },
        { name: "消防角色扮演", players: 1, placeId: "109737057240460", link: "https://www.roblox.com/games/109737057240460", description: "消防RP", rating: 4.2 },
        { name: "测试11", players: 1, placeId: "116381866489501", link: "https://www.roblox.com/games/116381866489501", description: "测试游戏", rating: 4.0 },
        { name: "SLR", players: 1, placeId: "84486469797722", link: "https://www.roblox.com/games/84486469797722", description: "SLR游戏", rating: 4.1 },
        { name: "长沙军区", players: 1, placeId: "73188189994103", link: "https://www.roblox.com/games/73188189994103", description: "长沙军区", rating: 4.3 },
        { name: "灵丘县未来版", players: 0, placeId: "140274020200112", link: "https://www.roblox.com/games/140274020200112", description: "灵丘县", rating: 4.0 },
        { name: "兰州角色扮演", players: 0, placeId: "85888971748319", link: "https://www.roblox.com/games/85888971748319", description: "兰州RP", rating: 4.1 },
        { name: "12未命名", players: 0, placeId: "89182202249261", link: "https://www.roblox.com/games/89182202249261", description: "未命名", rating: 4.0 },
        { name: "新乡营区8.0", players: 0, placeId: "112055606879665", link: "https://www.roblox.com/games/112055606879665", description: "新乡营区", rating: 4.2 },
        { name: "灵丘县", players: 0, placeId: "86899173881843", link: "https://www.roblox.com/games/86899173881843", description: "灵丘县", rating: 4.0 },
        { name: "库伦旗v2", players: 0, placeId: "79990663887618", link: "https://www.roblox.com/games/79990663887618", description: "库伦旗", rating: 4.0 },
        { name: "未命名游戏", players: 1, placeId: "86681437544964", link: "https://www.roblox.com/games/86681437544964", description: "未命名", rating: 4.0 },
        { name: "宁德军区v3.5", players: 1, placeId: "114422286130383", link: "https://www.roblox.com/games/114422286130383", description: "宁德军区", rating: 4.3 },
        { name: "莆田武警训练基地", players: 0, placeId: "102118579380038", link: "https://www.roblox.com/games/102118579380038", description: "莆田武警", rating: 4.2 },
        { name: "淮北军区", players: 0, placeId: "89550055911108", link: "https://www.roblox.com/games/89550055911108", description: "淮北军区", rating: 4.1 },
        { name: "九翼县", players: 0, placeId: "126240354644691", link: "https://www.roblox.com/games/126240354644691", description: "九翼县", rating: 4.0 },
        { name: "自己玩仅此而已", players: 0, placeId: "121555659739392", link: "https://www.roblox.com/games/121555659739392", description: "单人游戏", rating: 4.0 },
        { name: "消防警察", players: 1, placeId: "116166691457753", link: "https://www.roblox.com/games/116166691457753", description: "消防警察", rating: 4.2 },
        { name: "江门市V0.1", players: 0, placeId: "85136207317824", link: "https://www.roblox.com/games/85136207317824", description: "江门市", rating: 4.1 },
        { name: "宝顺县素材地图", players: 0, placeId: "76204639810098", link: "https://www.roblox.com/games/76204639810098", description: "宝顺县", rating: 4.0 },
        { name: "江门市新V1.5", players: 1, placeId: "118469261585464", link: "https://www.roblox.com/games/118469261585464", description: "江门市新", rating: 4.2 },
        { name: "南通市角色扮演", players: 0, placeId: "84545620226834", link: "https://www.roblox.com/games/84545620226834", description: "南通市", rating: 4.1 },
        { name: "测试地点林希", players: 1, placeId: "72546232959253", link: "https://www.roblox.com/games/72546232959253", description: "测试地点", rating: 4.0 },
        { name: "青海军区", players: 0, placeId: "83404642317800", link: "https://www.roblox.com/games/83404642317800", description: "青海军区", rating: 4.1 },
        { name: "TSG一周年庆典", players: 1, placeId: "87930553030195", link: "https://www.roblox.com/games/87930553030195", description: "TSG庆典", rating: 4.3 },
        { name: "AQ黄洲", players: 0, placeId: "87520697488660", link: "https://www.roblox.com/games/87520697488660", description: "AQ黄洲", rating: 4.0 },
        { name: "迎春季莆田武警", players: 0, placeId: "112032250597843", link: "https://www.roblox.com/games/112032250597843", description: "迎春季", rating: 4.1 },
        { name: "模拟器v0.7", players: 0, placeId: "129250718672096", link: "https://www.roblox.com/games/129250718672096", description: "模拟器", rating: 4.0 },
        { name: "湖北测试地图", players: 1, placeId: "139644178259589", link: "https://www.roblox.com/games/139644178259589", description: "湖北测试", rating: 4.2 }
    ];
    res.json(games);
});

app.post('/api/games/refresh', async (req, res) => {
    res.json({ success: true });
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
    const { username, password } = req.body;
    if (username === 'OWNER-康皓月' && password === OWNER_PASSWORD) {
        return res.json({ success: true, role: 'owner', userId: 'LOVESS', isBeauty: 'B' });
    }
    const users = await readJSON('users.json') || {};
    if (users[username] && users[username].password === password && !users[username].banned) {
        return res.json({ success: true, role: users[username].role || 'user', userId: users[username].userId, isBeauty: users[username].isBeauty || 'A' });
    }
    res.json({ success: false });
});

app.post('/api/register', async (req, res) => {
    const { username, password, cardKey } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) return res.json({ success: false, error: '用户已存在' });
    const beautyCards = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069"];
    const isBeauty = (cardKey && beautyCards.includes(cardKey.trim())) ? 'B' : 'A';
    users[username] = { password, role: 'user', banned: false, isMuted: false, userId: 'U' + Date.now(), isBeauty, avatar: '', createdAt: new Date().toISOString() };
    await writeJSON('users.json', users, '新用户注册');
    res.json({ success: true });
});

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
    if (users[username]) { users[username].banned = !users[username].banned; await writeJSON('users.json', users, '封禁/解封用户'); }
    res.json({ success: true });
});

app.post('/api/admin/toggleMute', async (req, res) => {
    const { username } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) { users[username].isMuted = !users[username].isMuted; await writeJSON('users.json', users, '禁言/解除禁言'); }
    res.json({ success: true });
});

app.post('/api/admin/setBeauty', async (req, res) => {
    const { username, type } = req.body;
    const users = await readJSON('users.json') || {};
    if (users[username]) { users[username].isBeauty = type; await writeJSON('users.json', users, '设置靓号'); }
    res.json({ success: true });
});

app.post('/api/admin/approveScript', async (req, res) => {
    const { id } = req.body;
    const scripts = await readJSON('scripts.json') || [];
    const idx = scripts.findIndex(s => s.id === id);
    if (idx !== -1) { scripts[idx].status = 'approved'; await writeJSON('scripts.json', scripts, '通过脚本'); }
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

app.get('/api/user/:username', async (req, res) => {
    const users = await readJSON('users.json') || {};
    const user = users[req.params.username];
    if (user) res.json({ userId: user.userId, role: user.role, isBeauty: user.isBeauty, createdAt: user.createdAt });
    else res.json(null);
});

// ==================== 前端 HTML（把你的完整 HTML 放在这里）====================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>LOVESS</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <style>
        :root {
            --primary: #8b5cf6; --primary-light: #a78bfa; --primary-dark: #7c3aed; --primary-glow: rgba(139, 92, 246, 0.2);
            --secondary: #6366f1; --accent: #d946ef; --success: #10b981; --warning: #f59e0b; --danger: #ef4444;
            --background: #0f0a23; --surface: #1a1439; --surface-alt: #241d52; --surface-hover: #2d2566;
            --text-primary: #f8fafc; --text-secondary: #cbd5e1; --text-muted: #94a3b8; --border: #3a3168;
            --radius: 12px; --radius-lg: 20px; --radius-xl: 28px; --shadow: 0 4px 6px -1px rgba(0,0,0,0.4);
            --shadow-purple: 0 0 20px rgba(139,92,246,0.4); --transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', 'Microsoft YaHei', 'PingFang SC', sans-serif; background: var(--background); color: var(--text-primary); line-height: 1.6; overflow-x: hidden; }
        .container { max-width: 1400px; margin: 0 auto; padding: 0 24px; }
        .animated-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; overflow: hidden; }
        .bg-circle { position: absolute; border-radius: 50%; background: radial-gradient(circle, var(--primary-glow) 0%, transparent 70%); filter: blur(40px); animation: float 20s infinite linear; }
        .bg-circle:nth-child(1) { width: 400px; height: 400px; top: 10%; left: 10%; }
        .bg-circle:nth-child(2) { width: 300px; height: 300px; top: 60%; right: 10%; animation-delay: 5s; }
        .bg-circle:nth-child(3) { width: 500px; height: 500px; bottom: 10%; left: 20%; animation-delay: 10s; }
        @keyframes float { 0%,100% { transform: translate(0,0) scale(1); } 25% { transform: translate(20px,20px) scale(1.1); } 50% { transform: translate(-10px,10px) scale(0.9); } 75% { transform: translate(10px,-20px) scale(1.05); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        .navbar { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; position: sticky; top: 0; z-index: 1000; background: rgba(26,20,57,0.95); backdrop-filter: blur(20px); border-bottom: 1px solid var(--border); }
        .logo { font-size: 1.8rem; font-weight: 800; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .menu-icon { font-size: 1.8rem; cursor: pointer; background: var(--surface); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius); border: 1px solid var(--border); transition: var(--transition); }
        .menu-icon:hover { background: var(--surface-hover); color: var(--primary); }
        .sidebar { position: fixed; top: 0; left: -280px; width: 280px; height: 100%; background: var(--surface); backdrop-filter: blur(30px); z-index: 2000; transition: left 0.3s; padding: 80px 20px 30px; border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
        .sidebar.open { left: 0; }
        .sidebar-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 1999; display: none; }
        .sidebar-overlay.active { display: block; }
        .sidebar-link { display: flex; align-items: center; gap: 14px; padding: 14px 20px; border-radius: var(--radius); color: var(--text-secondary); font-weight: 600; cursor: pointer; transition: var(--transition); }
        .sidebar-link i { width: 28px; }
        .sidebar-link:hover, .sidebar-link.active-side { background: var(--surface-hover); color: var(--primary); border-left: 3px solid var(--primary); }
        .sidebar-footer { margin-top: auto; padding-top: 20px; border-top: 1px solid var(--border); }
        .btn { background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; border: none; padding: 12px 24px; border-radius: var(--radius); font-weight: 600; cursor: pointer; transition: var(--transition); display: inline-flex; align-items: center; gap: 8px; }
        .btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-purple); }
        .btn-secondary { background: var(--surface); color: var(--text-secondary); border: 2px solid var(--border); }
        .btn-success { background: linear-gradient(135deg, var(--success), #059669); }
        .btn-danger { background: linear-gradient(135deg, var(--danger), #b91c1c); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .page-content { display: none; animation: fadeIn 0.4s ease; }
        .page-content.active-page { display: block; }
        .page-header { text-align: center; padding: 60px 0 30px; }
        .page-header h1 { font-size: 3rem; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .input-field { background: var(--surface-alt); border: 2px solid var(--border); padding: 12px 20px; border-radius: var(--radius); color: var(--text-primary); width: 100%; font-family: inherit; }
        .input-field:disabled { opacity: 0.5; cursor: not-allowed; }
        .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; padding: 12px 28px; border-radius: 40px; z-index: 3000; animation: slideUp 0.3s ease; display: flex; gap: 10px; align-items: center; z-index: 9999; }
        .login-modal, .register-modal { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(12px); z-index: 4000; align-items: center; justify-content: center; }
        .login-modal.active, .register-modal.active { display: flex; }
        .modal-container { background: var(--surface); padding: 40px; border-radius: var(--radius-xl); width: 450px; max-width: 90%; max-height: 90vh; overflow-y: auto; }
        .card { background: var(--surface); border-radius: var(--radius-xl); padding: 24px; border: 1px solid var(--border); margin: 20px 0; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; margin-bottom: 30px; }
        .stat-card { background: var(--surface); border-radius: var(--radius-lg); padding: 24px; text-align: center; border: 1px solid var(--border); transition: 0.2s; }
        .stat-number { font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .games-grid, .scripts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; margin-top: 20px; }
        .game-card, .script-card { background: var(--surface); border-radius: var(--radius-lg); padding: 20px; border: 1px solid var(--border); transition: 0.2s; }
        .game-card:hover, .script-card:hover { transform: translateY(-4px); border-color: var(--primary); box-shadow: var(--shadow-purple); }
        .chat-container { background: var(--surface); border-radius: var(--radius-xl); padding: 20px; }
        .chat-messages { height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
        .msg-bubble { background: var(--surface-alt); padding: 10px 16px; border-radius: 18px; max-width: 75%; align-self: flex-start; border-left: 3px solid var(--primary); cursor: pointer; transition: 0.2s; }
        .msg-bubble:hover { background: var(--surface-hover); transform: scale(1.01); }
        .msg-own { align-self: flex-end; background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; }
        .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
        .tab { padding: 8px 20px; background: var(--surface); border-radius: 30px; cursor: pointer; border: 1px solid var(--border); transition: 0.2s; }
        .tab.active { background: var(--primary); color: white; border-color: var(--primary); }
        .executor-panel { background: var(--surface); border-radius: var(--radius-xl); padding: 24px; }
        textarea.executor-code { width: 100%; background: #0a0620; border: 2px solid var(--border); border-radius: var(--radius); padding: 16px; color: #0f0; font-family: monospace; resize: vertical; }
        footer { text-align: center; padding: 40px 0; border-top: 1px solid var(--border); margin-top: 40px; color: var(--text-muted); }
        @keyframes slideUp { from { opacity:0; transform: translate(-50%,20px); } to { opacity:1; transform: translate(-50%,0); } }
        .loading-spinner { text-align: center; padding: 40px; color: var(--text-secondary); }
        .refresh-btn { margin-left: 16px; background: var(--surface-alt); border: 1px solid var(--border); padding: 8px 16px; border-radius: var(--radius); cursor: pointer; font-size: 0.9rem; }
        .game-player-count { font-size: 0.85rem; color: var(--text-muted); margin: 8px 0; }
        .admin-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 8px; }
        .ban-btn { padding: 4px 12px; font-size: 0.8rem; cursor: pointer; }
        .game-icon { width: 100%; height: 120px; object-fit: cover; border-radius: 12px; margin-bottom: 12px; background: var(--surface-alt); }
        .avatar-img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 12px; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center; background: var(--surface-alt); }
        .avatar-img:hover { transform: scale(1.1); border: 2px solid var(--primary); }
        .profile-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); backdrop-filter: blur(20px); z-index: 5000; align-items: center; justify-content: center; }
        .profile-modal.active { display: flex; }
        .profile-container { background: var(--surface); border-radius: var(--radius-xl); padding: 40px; width: 400px; max-width: 90%; text-align: center; }
        .profile-avatar { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin-bottom: 20px; border: 3px solid var(--primary); background: var(--surface-alt); display: flex; align-items: center; justify-content: center; font-size: 48px; }
        .close-profile { margin-top: 20px; }
        .review-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border); }
        .review-delete { background: var(--danger); border: none; color: white; padding: 4px 12px; border-radius: 8px; cursor: pointer; }
        
        .beauty-badge-b {
            position: relative;
            display: inline-flex;
            align-items: center;
            height: 32px;
            padding: 0 8px;
            border-radius: 16px;
            background: linear-gradient(135deg, #ff3366 0%, #ff0033 20%, #cc0000 50%, #990000 100%);
            box-shadow: 0 0 0 1px rgba(255, 0, 51, 0.3), 0 4px 20px rgba(255, 0, 51, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.3);
            overflow: hidden;
            transform: skewX(-5deg);
            transition: transform 0.2s ease;
            margin-left: 8px;
        }
        .beauty-badge-b:hover {
            transform: skewX(-5deg) scale(1.02);
            box-shadow: 0 0 0 1px rgba(255, 51, 102, 0.5), 0 6px 24px rgba(255, 0, 51, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        .beauty-text-b {
            color: #fff;
            font-size: 18px;
            font-weight: 900;
            font-style: italic;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5), 0 0 8px rgba(255, 255, 255, 0.4);
            letter-spacing: 1px;
            position: relative;
            z-index: 2;
            transform: skewX(5deg);
        }
        .beauty-text-b::before {
            content: attr(data-text);
            position: absolute;
            top: 0;
            left: 0;
            color: transparent;
            background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.8) 50%, transparent 100%);
            background-size: 200% 100%;
            background-clip: text;
            -webkit-background-clip: text;
            animation: text-shine 3s infinite linear;
            z-index: 3;
            pointer-events: none;
        }
        .number-box-b {
            position: relative;
            padding: 2px 8px;
            background: linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
            border-radius: 8px;
            margin: 0 4px;
            overflow: hidden;
            transform: skewX(5deg);
        }
        .number-box-b::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 60%;
            height: 100%;
            background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%);
            animation: number-shine 4s infinite linear;
            pointer-events: none;
        }
        .beauty-number-b {
            color: #fff;
            font-size: 16px;
            font-weight: 700;
            font-family: "Arial", "Helvetica Neue", sans-serif;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 0 4px rgba(255, 255, 255, 0.3);
            transform: skewX(5deg);
            letter-spacing: 0.5px;
        }
        .beauty-badge-b::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.08) 100%);
            border-radius: 16px;
            z-index: 1;
            pointer-events: none;
        }
        .beauty-badge-b::after {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 40%;
            height: 100%;
            background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.7) 20%, rgba(255, 255, 255, 0.9) 50%, rgba(255, 255, 255, 0.7) 80%, transparent 100%);
            animation: light-sweep 2.5s infinite ease-in-out;
            z-index: 1;
            pointer-events: none;
        }
        .stars-container-b {
            position: absolute;
            top: -10px;
            left: 0;
            width: 100%;
            height: 20px;
            overflow: visible;
            pointer-events: none;
            z-index: 3;
        }
        .star-b {
            position: absolute;
            color: #fff;
            font-size: 10px;
            opacity: 0;
            filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.9));
            animation: star-fly linear forwards;
            pointer-events: none;
        }
        .star-b:nth-child(1) { top: 0; left: 10%; animation-duration: 2.5s; animation-delay: 0s; }
        .star-b:nth-child(2) { top: 5px; left: 30%; animation-duration: 2.2s; animation-delay: 0.8s; }
        .star-b:nth-child(3) { top: 2px; left: 60%; animation-duration: 2.8s; animation-delay: 1.5s; }
        .star-b:nth-child(4) { top: 8px; left: 80%; animation-duration: 2.1s; animation-delay: 2.2s; }
        .dot-b {
            position: absolute;
            width: 4px;
            height: 4px;
            background: rgba(255, 255, 255, 0.4);
            border-radius: 50%;
            opacity: 0;
            animation: dot-fade 3s infinite ease-in-out;
            pointer-events: none;
        }
        .dot-b:nth-child(1) { top: 6px; left: 20px; animation-delay: 0.3s; }
        .dot-b:nth-child(2) { top: 22px; right: 25px; animation-delay: 1.2s; }
        .dot-b:nth-child(3) { bottom: 8px; left: 40px; animation-delay: 2.1s; }
        
        @keyframes light-sweep { 0% { left: -100%; opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { left: 300%; opacity: 0; } }
        @keyframes text-shine { 0% { background-position: -100% 0; opacity: 0.8; } 50% { opacity: 1; } 100% { background-position: 200% 0; opacity: 0.8; } }
        @keyframes number-shine { 0% { left: -100%; } 100% { left: 200%; } }
        @keyframes star-fly { 0% { transform: translateX(0) translateY(0) rotate(0deg); opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translateX(80px) translateY(-20px) rotate(15deg); opacity: 0; } }
        @keyframes dot-fade { 0%, 100% { opacity: 0; transform: scale(0.5); } 50% { opacity: 0.7; transform: scale(1); } }
        
        .beauty-badge-a {
            display: inline-flex;
            align-items: center;
            margin-left: 8px;
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: bold;
            color: #fff;
        }
        .server-status {
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 100;
            backdrop-filter: blur(10px);
            border-left: 3px solid #10b981;
        }
        .server-status.success { border-left-color: #10b981; }
        .server-status.error { border-left-color: #ef4444; }
        .server-status.warning { border-left-color: #f59e0b; }
        .global-mute-badge {
            background: #ef4444;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            margin-left: 12px;
        }
    </style>
</head>
<body>
<div class="animated-bg"><div class="bg-circle"></div><div class="bg-circle"></div><div class="bg-circle"></div></div>
<div id="serverStatus" class="server-status">连接服务器中...</div>
<div id="sidebarOverlay" class="sidebar-overlay"></div>
<div id="sidebar" class="sidebar">
    <div class="sidebar-link active-side" data-page="reviews"><i class="fas fa-star"></i> 评价</div>
    <div class="sidebar-link" data-page="features"><i class="fas fa-gem"></i> 功能</div>
    <div class="sidebar-link" data-page="games"><i class="fas fa-gamepad"></i> 游戏</div>
    <div class="sidebar-link" data-page="chat"><i class="fas fa-comments"></i> 聊天</div>
    <div class="sidebar-link" data-page="scripts"><i class="fas fa-code"></i> 脚本</div>
    <div class="sidebar-link" data-page="executor"><i class="fas fa-terminal"></i> 执行器</div>
    <div class="sidebar-link" data-page="whitelist"><i class="fas fa-list-check"></i> 白名单</div>
    <div class="sidebar-link" data-page="admin"><i class="fas fa-shield-alt"></i> 管理面板</div>
    <div class="sidebar-footer"><button id="sidebarUserBtn" class="btn btn-secondary" style="width:100%;">登录/注册</button></div>
</div>

<div class="container">
    <nav class="navbar"><div class="logo">LOVESS SERVERSIDE</div><div class="menu-icon" id="menuToggle"><i class="fas fa-bars"></i></div></nav>

    <div id="reviewsPage" class="page-content active-page">
        <div class="page-header"><h1>用户评价</h1></div>
        <div class="stats-grid" id="reviewStats">
            <div class="stat-card"><div class="stat-number" id="statGameCount">0</div><div>游戏总数</div></div>
            <div class="stat-card"><div class="stat-number" id="statTotalPlayers">0</div><div>总在线人数</div></div>
            <div class="stat-card"><div class="stat-number" id="statReviewCount">0</div><div>用户评价</div></div>
        </div>
        <div id="reviewsList" class="card">加载中...</div>
        <div class="card">
            <textarea id="newReviewContent" class="input-field" rows="3" placeholder="分享你的使用体验..."></textarea>
            <select id="newReviewRating" class="input-field" style="width:auto; margin-top:12px;"><option value="5">5星</option><option value="4">4星</option><option value="3">3星</option></select>
            <button id="submitReviewBtn" class="btn btn-success" style="margin-top:12px;">发布评价</button>
        </div>
    </div>
    
    <div id="featuresPage" class="page-content"><div class="page-header"><h1>核心功能</h1></div><div class="games-grid"><div class="game-card"><i class="fas fa-shield-alt" style="font-size:2rem;"></i><h3>99.99%</h3><p>实时检测ban与gameban</p></div><div class="game-card"><i class="fas fa-bolt"></i><h3>极速响应</h3><p>毫秒级命令处理</p></div><div class="game-card"><i class="fas fa-users"></i><h3>社区驱动</h3><p>68+活跃用户</p></div><div class="game-card"><i class="fas fa-code"></i><h3>API</h3><p>完整SDK支持</p></div></div></div>
    
    <div id="gamesPage" class="page-content">
        <div class="page-header"><h1>游戏库 <button id="refreshGamesBtn" class="refresh-btn"><i class="fas fa-sync-alt"></i> 同步游戏数据</button><span id="updateStatus" style="font-size:14px; margin-left:12px;"></span></h1></div>
        <div id="gamesContainer" class="games-grid"><div class="loading-spinner">加载游戏数据中...</div></div>
    </div>
    
    <div id="chatPage" class="page-content"><div class="page-header"><h1>社区聊天</h1></div><div class="chat-container"><div class="tabs" id="chatTabs"><button class="tab active" data-room="general">综合</button><button class="tab" data-room="support">支持</button><button class="tab" data-room="dev">开发</button></div><div id="chatMsgs" class="chat-messages"></div><div style="display:flex; gap:10px;"><input id="chatInput" class="input-field" placeholder="输入消息..."><button id="sendChatBtn" class="btn">发送</button></div></div></div></div>
    
    <div id="scriptsPage" class="page-content"><div class="page-header"><h1>脚本库</h1></div><div class="card"><h3>上传新脚本</h3><input id="scriptName" class="input-field" placeholder="脚本名称"><textarea id="scriptDesc" rows="2" class="input-field" placeholder="脚本描述"></textarea><input type="file" id="scriptImage" accept="image/*"><button id="uploadScriptBtn" class="btn btn-success" style="margin-top:12px;">提交审核</button><p style="font-size:0.7rem; margin-top:8px;">脚本需经管理员审核通过后才会公开显示</p></div><div id="scriptsContainer" class="scripts-grid"></div></div>
    
    <div id="executorPage" class="page-content"><div class="page-header"><h1>脚本执行器</h1></div><div class="executor-panel"><textarea id="executorCode" class="executor-code" rows="6" placeholder="-- 粘贴你的 Lua 脚本&#10;print('Hello World')"></textarea><div style="display:flex; gap:12px; margin-top:16px;"><button id="executeBtn" class="btn btn-success">执行</button><button id="clearExecutorBtn" class="btn btn-secondary">清空</button><button id="injectBtn" class="btn">注入</button></div><div id="executorLog" style="margin-top:20px; background:#0a0620; border-radius:12px; padding:12px; font-family:monospace; color:#0f0; max-height:150px; overflow-y:auto;">wait executor</div></div></div></div>
    
    <div id="whitelistPage" class="page-content"><div class="page-header"><h1>白名单管理</h1></div><div class="card"><h3>添加用户至白名单</h3><div style="display:flex; gap:12px; margin:16px 0;"><input id="whitelistName" class="input-field" placeholder="Roblox user"><button id="addWhitelistBtn" class="btn btn-success">添加</button></div><div id="whitelistUsers" style="display:flex; flex-wrap:wrap; gap:10px;"></div></div></div></div>
    
    <div id="adminPage" class="page-content">
        <div class="page-header">
            <h1>管理面板</h1>
            <div id="globalMuteStatus" style="margin-top: 10px;"></div>
            <button id="toggleGlobalMuteBtn" class="btn btn-danger" style="margin-top: 10px;">
                切换全局禁言
            </button>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
                开启后，所有用户将无法使用聊天、评价、脚本功能
            </p>
        </div>
        <div id="adminContent" class="card">仅限owner访问</div>
    </div>
    <footer>LOVESS</footer>
</div>

<div id="loginModal" class="login-modal"><div class="modal-container"><h2>登录</h2><input id="loginUsername" class="input-field" placeholder="用户名"><input id="loginPassword" type="password" class="input-field" placeholder="密码" style="margin-top:12px;"><div style="display:flex; gap:12px; margin-top:24px;"><button id="doLoginBtn" class="btn" style="flex:1;">登录</button><button id="toRegisterBtn" class="btn btn-secondary" style="flex:1;">去注册</button><button id="closeLoginBtn" class="btn btn-secondary">取消</button></div></div></div>

<div id="registerModal" class="register-modal"><div class="modal-container"><h2>注册新账号</h2><input id="regUsername" class="input-field" placeholder="用户名 (至少3位)"><input id="regPassword" type="password" class="input-field" placeholder="密码" style="margin-top:12px;"><input id="regCard" class="input-field" placeholder="卡密 (选填)" style="margin-top:12px;"><div style="margin-top:8px; font-size:0.75rem; color:var(--text-muted);">卡密需购买QQ群: 1095848365 </div><input type="file" id="regAvatar" accept="image/*" style="margin-top:12px; background:var(--surface-alt); color:var(--text-primary);"><div style="margin-top:8px; font-size:0.7rem; color:var(--text-muted);">可选：上传头像</div><div style="display:flex; gap:12px; margin-top:24px;"><button id="doRegisterBtn" class="btn btn-success" style="flex:1;">注册</button><button id="closeRegisterBtn" class="btn btn-secondary">取消</button></div></div></div>

<div id="profileModal" class="profile-modal"><div class="profile-container" id="profileContent"></div></div>

<script>
(function(){
    const GITHUB_USER = "liushumei11110-boop";
    const REPO_NAME = "lovess";
    const GITHUB_TOKEN = "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";
    
    const BEAUTY_CARDS = ["LOVESS-3827", "LOVESS-9156", "LOVESS-4732", "LOVESS-7481", "LOVESS-2069"];
    const OWNER_USERNAME = "OWNER-康皓月";
    const OWNER_PASSWORD = "khyzybnb666147";

    let currentUser = null, currentRole = null;
    let currentRoom = "general";
    let githubGames = [];
    let autoRefreshTimer = null;
    let currentUserData = null;

    // ==================== 全局禁言系统 ====================
    let globalMuteEnabled = false;

    async function initGlobalMute() {
        let whitelist = await readJSON("whitelist.json");
        
        if (!whitelist) {
            await writeJSON("whitelist.json", "A", "初始化白名单: A(正常)");
            whitelist = "A";
        }
        
        globalMuteEnabled = (whitelist === "B");
        
        if (globalMuteEnabled) {
            disableAllInputs();
            showToast("系统维护中，聊天、评价、脚本功能暂时关闭");
        } else {
            enableAllInputs();
        }
        
        return globalMuteEnabled;
    }

    function disableAllInputs() {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) { chatInput.disabled = true; chatInput.placeholder = '聊天功能已关闭'; chatInput.style.opacity = '0.5'; }
        const sendBtn = document.getElementById('sendChatBtn');
        if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; }
        
        const reviewInput = document.getElementById('newReviewContent');
        if (reviewInput) { reviewInput.disabled = true; reviewInput.placeholder = '评价功能已关闭'; reviewInput.style.opacity = '0.5'; }
        const submitBtn = document.getElementById('submitReviewBtn');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; }
        const reviewRating = document.getElementById('newReviewRating');
        if (reviewRating) { reviewRating.disabled = true; reviewRating.style.opacity = '0.5'; }
        
        const scriptName = document.getElementById('scriptName');
        if (scriptName) { scriptName.disabled = true; scriptName.placeholder = '脚本上传已关闭'; scriptName.style.opacity = '0.5'; }
        const scriptDesc = document.getElementById('scriptDesc');
        if (scriptDesc) { scriptDesc.disabled = true; scriptDesc.placeholder = '脚本上传已关闭'; scriptDesc.style.opacity = '0.5'; }
        const scriptImage = document.getElementById('scriptImage');
        if (scriptImage) { scriptImage.disabled = true; scriptImage.style.opacity = '0.5'; }
        const uploadBtn = document.getElementById('uploadScriptBtn');
        if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.style.opacity = '0.5'; }
    }

    function enableAllInputs() {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) { chatInput.disabled = false; chatInput.placeholder = '输入消息...'; chatInput.style.opacity = '1'; }
        const sendBtn = document.getElementById('sendChatBtn');
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
        
        const reviewInput = document.getElementById('newReviewContent');
        if (reviewInput) { reviewInput.disabled = false; reviewInput.placeholder = '分享你的使用体验...'; reviewInput.style.opacity = '1'; }
        const submitBtn = document.getElementById('submitReviewBtn');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
        const reviewRating = document.getElementById('newReviewRating');
        if (reviewRating) { reviewRating.disabled = false; reviewRating.style.opacity = '1'; }
        
        const scriptName = document.getElementById('scriptName');
        if (scriptName) { scriptName.disabled = false; scriptName.placeholder = '脚本名称'; scriptName.style.opacity = '1'; }
        const scriptDesc = document.getElementById('scriptDesc');
        if (scriptDesc) { scriptDesc.disabled = false; scriptDesc.placeholder = '脚本描述'; scriptDesc.style.opacity = '1'; }
        const scriptImage = document.getElementById('scriptImage');
        if (scriptImage) { scriptImage.disabled = false; scriptImage.style.opacity = '1'; }
        const uploadBtn = document.getElementById('uploadScriptBtn');
        if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.style.opacity = '1'; }
    }

    async function toggleGlobalMute() {
        if (currentRole !== 'owner') {
            showToast("只有管理员可以操作", true);
            return;
        }
        
        let current = await readJSON("whitelist.json");
        if (!current) current = "A";
        
        const newStatus = (current === "A") ? "B" : "A";
        await writeJSON("whitelist.json", newStatus, `管理员切换全局禁言: ${newStatus === "B" ? "开启" : "关闭"}`);
        
        if (newStatus === "B") {
            globalMuteEnabled = true;
            disableAllInputs();
            showToast("全局禁言已开启，所有用户无法使用聊天/评价/脚本");
        } else {
            globalMuteEnabled = false;
            enableAllInputs();
            showToast("全局禁言已关闭，所有功能恢复正常");
        }
        
        updateAdminMuteStatus();
    }

    async function updateAdminMuteStatus() {
        const statusDiv = document.getElementById('globalMuteStatus');
        if (!statusDiv) return;
        
        let current = await readJSON("whitelist.json");
        if (!current) current = "A";
        
        const isMuted = (current === "B");
        statusDiv.innerHTML = `
            <div class="card" style="display: inline-block; padding: 8px 20px;">
                当前状态: ${isMuted ? '<span style="background:#ef4444; padding:4px 12px; border-radius:20px;">全局禁言已开启</span>' : '<span style="background:#10b981; padding:4px 12px; border-radius:20px;">全局禁言已关闭</span>'}
            </div>
        `;
    }

    const LOCAL_GAMES = [
        { name: "luau", players: 6, placeId: "125462571840934", link: "https://www.roblox.com/games/125462571840934", description: "luau游戏", rating: 4.5 },
        { name: "APN AIRPORT", players: 8, placeId: "84312471277990", link: "https://www.roblox.com/games/84312471277990", description: "机场模拟游戏", rating: 4.5 },
        { name: "HBPLA|湖北警戒区", players: 47, placeId: "133580699283141", link: "https://www.roblox.com/games/133580699283141", description: "湖北警戒区", rating: 4.6 },
        { name: "月跑小镇", players: 230, placeId: "88063017898040", link: "https://www.roblox.com/games/88063017898040", description: "月跑小镇", rating: 4.7 },
        { name: "北京-Beijing", players: 5, placeId: "93175099699395", link: "https://www.roblox.com/games/93175099699395", description: "北京角色扮演", rating: 4.4 },
        { name: "展示类测试", players: 7, placeId: "88842067009491", link: "https://www.roblox.com/games/88842067009491", description: "展示类测试", rating: 4.2 },
        { name: "四川成都军事角色扮演", players: 34, placeId: "86201530478305", link: "https://www.roblox.com/games/86201530478305", description: "成都军事角色扮演", rating: 4.5 },
        { name: "【V1.0】天津市", players: 12, placeId: "134133232679432", link: "https://www.roblox.com/games/134133232679432", description: "天津角色扮演", rating: 4.6 },
        { name: "北京市角色扮演RP V3.0", players: 1, placeId: "131848347649145", link: "https://www.roblox.com/games/131848347649145", description: "北京RP", rating: 4.3 },
        { name: "四川省乐山市角色扮演", players: 1, placeId: "125322037757269", link: "https://www.roblox.com/games/125322037757269", description: "乐山角色扮演", rating: 4.2 },
        { name: "QG SOF训练基地", players: 1, placeId: "119790064224094", link: "https://www.roblox.com/games/119790064224094", description: "SOF训练基地", rating: 4.4 },
        { name: "私人备份", players: 1, placeId: "82603885483253", link: "https://www.roblox.com/games/82603885483253", description: "私人备份", rating: 4.0 },
        { name: "枣庄市V1.0测试版", players: 0, placeId: "92331511205671", link: "https://www.roblox.com/games/92331511205671", description: "枣庄市", rating: 4.1 },
        { name: "无标题体验BH", players: 1, placeId: "107187943659932", link: "https://www.roblox.com/games/107187943659932", description: "无标题体验BH", rating: 4.0 },
        { name: "车", players: 1, placeId: "113823868123067", link: "https://www.roblox.com/games/113823868123067", description: "车游戏", rating: 4.2 },
        { name: "东莞V1", players: 1, placeId: "116889626316417", link: "https://www.roblox.com/games/116889626316417", description: "东莞V1", rating: 4.1 },
        { name: "福鼎市RP", players: 1, placeId: "120842545621425", link: "https://www.roblox.com/games/120842545621425", description: "福鼎市RP", rating: 4.3 },
        { name: "绥化角色扮演", players: 1, placeId: "81262912666902", link: "https://www.roblox.com/games/81262912666902", description: "绥化RP", rating: 4.2 },
        { name: "温州市", players: 1, placeId: "89999256811858", link: "https://www.roblox.com/games/89999256811858", description: "温州市", rating: 4.3 },
        { name: "内测温州市V1.5", players: 1, placeId: "77973084343973", link: "https://www.roblox.com/games/77973084343973", description: "温州市内测", rating: 4.2 },
        { name: "唐山纪元", players: 0, placeId: "139594160698611", link: "https://www.roblox.com/games/139594160698611", description: "唐山纪元", rating: 4.0 },
        { name: "消防角色扮演", players: 1, placeId: "109737057240460", link: "https://www.roblox.com/games/109737057240460", description: "消防RP", rating: 4.2 },
        { name: "测试11", players: 1, placeId: "116381866489501", link: "https://www.roblox.com/games/116381866489501", description: "测试游戏", rating: 4.0 },
        { name: "SLR", players: 1, placeId: "84486469797722", link: "https://www.roblox.com/games/84486469797722", description: "SLR游戏", rating: 4.1 },
        { name: "长沙军区", players: 1, placeId: "73188189994103", link: "https://www.roblox.com/games/73188189994103", description: "长沙军区", rating: 4.3 },
        { name: "灵丘县未来版", players: 0, placeId: "140274020200112", link: "https://www.roblox.com/games/140274020200112", description: "灵丘县", rating: 4.0 },
        { name: "兰州角色扮演", players: 0, placeId: "85888971748319", link: "https://www.roblox.com/games/85888971748319", description: "兰州RP", rating: 4.1 },
        { name: "12未命名", players: 0, placeId: "89182202249261", link: "https://www.roblox.com/games/89182202249261", description: "未命名", rating: 4.0 },
        { name: "新乡营区8.0", players: 0, placeId: "112055606879665", link: "https://www.roblox.com/games/112055606879665", description: "新乡营区", rating: 4.2 },
        { name: "灵丘县", players: 0, placeId: "86899173881843", link: "https://www.roblox.com/games/86899173881843", description: "灵丘县", rating: 4.0 },
        { name: "库伦旗v2", players: 0, placeId: "79990663887618", link: "https://www.roblox.com/games/79990663887618", description: "库伦旗", rating: 4.0 },
        { name: "未命名游戏", players: 1, placeId: "86681437544964", link: "https://www.roblox.com/games/86681437544964", description: "未命名", rating: 4.0 },
        { name: "宁德军区v3.5", players: 1, placeId: "114422286130383", link: "https://www.roblox.com/games/114422286130383", description: "宁德军区", rating: 4.3 },
        { name: "莆田武警训练基地", players: 0, placeId: "102118579380038", link: "https://www.roblox.com/games/102118579380038", description: "莆田武警", rating: 4.2 },
        { name: "淮北军区", players: 0, placeId: "89550055911108", link: "https://www.roblox.com/games/89550055911108", description: "淮北军区", rating: 4.1 },
        { name: "九翼县", players: 0, placeId: "126240354644691", link: "https://www.roblox.com/games/126240354644691", description: "九翼县", rating: 4.0 },
        { name: "自己玩仅此而已", players: 0, placeId: "121555659739392", link: "https://www.roblox.com/games/121555659739392", description: "单人游戏", rating: 4.0 },
        { name: "消防警察", players: 1, placeId: "116166691457753", link: "https://www.roblox.com/games/116166691457753", description: "消防警察", rating: 4.2 },
        { name: "江门市V0.1", players: 0, placeId: "85136207317824", link: "https://www.roblox.com/games/85136207317824", description: "江门市", rating: 4.1 },
        { name: "宝顺县素材地图", players: 0, placeId: "76204639810098", link: "https://www.roblox.com/games/76204639810098", description: "宝顺县", rating: 4.0 },
        { name: "江门市新V1.5", players: 1, placeId: "118469261585464", link: "https://www.roblox.com/games/118469261585464", description: "江门市新", rating: 4.2 },
        { name: "南通市角色扮演", players: 0, placeId: "84545620226834", link: "https://www.roblox.com/games/84545620226834", description: "南通市", rating: 4.1 },
        { name: "测试地点林希", players: 1, placeId: "72546232959253", link: "https://www.roblox.com/games/72546232959253", description: "测试地点", rating: 4.0 },
        { name: "青海军区", players: 0, placeId: "83404642317800", link: "https://www.roblox.com/games/83404642317800", description: "青海军区", rating: 4.1 },
        { name: "TSG一周年庆典", players: 1, placeId: "87930553030195", link: "https://www.roblox.com/games/87930553030195", description: "TSG庆典", rating: 4.3 },
        { name: "AQ黄洲", players: 0, placeId: "87520697488660", link: "https://www.roblox.com/games/87520697488660", description: "AQ黄洲", rating: 4.0 },
        { name: "迎春季莆田武警", players: 0, placeId: "112032250597843", link: "https://www.roblox.com/games/112032250597843", description: "迎春季", rating: 4.1 },
        { name: "模拟器v0.7", players: 0, placeId: "129250718672096", link: "https://www.roblox.com/games/129250718672096", description: "模拟器", rating: 4.0 },
        { name: "湖北测试地图", players: 1, placeId: "139644178259589", link: "https://www.roblox.com/games/139644178259589", description: "湖北测试", rating: 4.2 }
    ];

    async function checkServerStatus() {
        const statusDiv = document.getElementById('serverStatus');
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch('https://api.github.com/repos/liushumei11110-boop/lovess/contents/users.json', {
                headers: { 'Authorization': `token ${GITHUB_TOKEN}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                statusDiv.innerHTML = '服务器连接成功状态码: 200';
                statusDiv.className = 'server-status success';
                setTimeout(() => { statusDiv.style.opacity = '0.5'; }, 3000);
            } else {
                statusDiv.innerHTML = `服务器响应异常状态码: ${response.status}`;
                statusDiv.className = 'server-status warning';
            }
        } catch(e) {
            statusDiv.innerHTML = '服务器连接失败使用本地缓存';
            statusDiv.className = 'server-status error';
        }
    }

    async function readJSON(file) {
        try {
            const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${file}`;
            const res = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
            if (!res.ok) return null;
            const data = await res.json();
            const binary = atob(data.content);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const decoder = new TextDecoder('utf-8');
            return JSON.parse(decoder.decode(bytes));
        } catch(e) { return null; }
    }

    async function writeJSON(file, content, msg) {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${file}`;
        let sha = null;
        try {
            const getRes = await fetch(url, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
            if (getRes.ok) sha = (await getRes.json()).sha;
        } catch(e) {}
        const jsonString = JSON.stringify(content, null, 2);
        const encoder = new TextEncoder();
        const data = encoder.encode(jsonString);
        let binary = '';
        for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
        const base64Content = btoa(binary);
        await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, content: base64Content, sha })
        });
    }

    async function initData() {
        let users = await readJSON("users.json");
        if (!users) users = {};
        if (!users[OWNER_USERNAME]) {
            users[OWNER_USERNAME] = { password: OWNER_PASSWORD, role: "owner", banned: false, isMuted: false, userId: "LOVESS", avatar: "", isBeauty: "B", createdAt: new Date().toISOString() };
            await writeJSON("users.json", users, "init owner");
        } else {
            users[OWNER_USERNAME].userId = "LOVESS";
            users[OWNER_USERNAME].isBeauty = "B";
            await writeJSON("users.json", users, "fix owner");
        }
        let scripts = await readJSON("scripts.json");
        if (!scripts) { scripts = []; await writeJSON("scripts.json", scripts, "init scripts"); }
        let chats = await readJSON("chats.json");
        if (!chats || chats.length === 0) {
            chats = [{ id: 1, user: "系统", text: "欢迎来到聊天室", time: new Date().toLocaleTimeString(), room: "general", userId: "SYSTEM", avatar: "", isBeauty: "A" }];
            await writeJSON("chats.json", chats, "init chats");
        }
        let reviews = await readJSON("reviews.json");
        if (!reviews) { reviews = []; await writeJSON("reviews.json", reviews, "init reviews"); }
        let whitelist = await readJSON("whitelist.json");
        if (!whitelist) { whitelist = ["NovaGuard"]; await writeJSON("whitelist.json", whitelist, "init whitelist"); }
    }

    function generateUserId() { return `A-${Math.floor(Math.random() * 90000) + 10000}`; }
    function getBeautyType(cardKey) { return (cardKey && BEAUTY_CARDS.includes(cardKey.trim())) ? "B" : "A"; }

    function getBeautyBadgeHtml(userId, isBeauty) {
        if (isBeauty === "B") {
            return `<div class="beauty-badge-b"><div class="stars-container-b"><div class="star-b">★</div><div class="star-b">✦</div><div class="star-b">✧</div><div class="star-b">✦</div></div><span class="beauty-text-b" data-text="靓">靓</span><div class="number-box-b"><span class="beauty-number-b">${escapeHtml(userId)}</span></div><div class="dot-b"></div><div class="dot-b"></div><div class="dot-b"></div></div>`;
        } else if (isBeauty === "A") {
            return `<span class="beauty-badge-a">靓号</span>`;
        }
        return "";
    }

    function showToast(msg, isError) {
        let t = document.createElement('div'); t.className = 'toast';
        t.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${msg}`;
        document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
    }

    async function register(username, password, cardKey, avatarBase64) {
        if (username.length < 3) { showToast("用户名至少3位", true); return false; }
        if (password.length < 3) { showToast("密码至少3位", true); return false; }
        let users = await readJSON("users.json");
        if (!users) users = {};
        if (users[username]) { showToast("用户名已存在", true); return false; }
        let userId = generateUserId();
        let isBeauty = getBeautyType(cardKey);
        users[username] = { password, role: "user", banned: false, isMuted: false, userId: userId, avatar: avatarBase64 || "", isBeauty: isBeauty, createdAt: new Date().toISOString() };
        await writeJSON("users.json", users, `注册新用户: ${username}`);
        showToast(`注册成功！ID: ${userId}`, false);
        return true;
    }

    async function login(username, password) {
        if (username === OWNER_USERNAME && password === OWNER_PASSWORD) {
            currentUser = OWNER_USERNAME; currentRole = "owner";
            currentUserData = { userId: "LOVESS", avatar: "", isBeauty: "B", isMuted: false };
            updateSidebarUI(); showToast(`欢迎回来，${OWNER_USERNAME} (ID: LOVESS)`, false);
            return true;
        }
        let users = await readJSON("users.json");
        if (!users || !users[username]) { showToast("用户名不存在", true); return false; }
        if (users[username].password !== password) { showToast("密码错误", true); return false; }
        if (users[username].banned) { showToast("账号已被封禁", true); return false; }
        currentUser = username; currentRole = users[username].role;
        currentUserData = { userId: users[username].userId, avatar: users[username].avatar || "", isBeauty: users[username].isBeauty || "A", isMuted: users[username].isMuted || false };
        updateSidebarUI(); showToast(`欢迎回来，${username} (ID: ${users[username].userId})`, false);
        return true;
    }

    function logout() { currentUser = null; currentRole = null; currentUserData = null; updateSidebarUI(); showToast("已登出", false); switchPage('reviews'); }
    function updateSidebarUI() {
        let btn = document.getElementById('sidebarUserBtn');
        if (btn) {
            if (currentUser) { btn.innerHTML = `<i class="fas fa-user"></i> ${currentUser} (登出)`; btn.onclick = () => logout(); }
            else { btn.innerHTML = "<i class='fas fa-sign-in-alt'></i> 登录/注册"; btn.onclick = () => document.getElementById('loginModal').classList.add('active'); }
        }
    }
    function checkAccess() { if (!currentUser) { showToast("请先登录账号", true); return false; } return true; }

    async function showUserProfile(username) {
        let users = await readJSON("users.json");
        if (!users || !users[username]) { showToast("用户不存在", true); return; }
        const user = users[username];
        const beautyBadge = getBeautyBadgeHtml(user.userId, user.isBeauty);
        document.getElementById('profileContent').innerHTML = `
            <div class="profile-avatar"><i class="fas fa-user fa-3x"></i></div>
            <h2>${escapeHtml(username)}</h2><p><strong>ID:</strong> ${user.userId}</p>${beautyBadge}
            <p><strong>角色:</strong> ${user.role || '用户'}</p><p><strong>注册时间:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
            <button class="btn btn-secondary close-profile" onclick="document.getElementById('profileModal').classList.remove('active')">关闭</button>
        `;
        document.getElementById('profileModal').classList.add('active');
    }

    async function fetchGamesFromGitHub() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/liushumei11110-boop/game-data/main/game.txt');
            if (!response.ok) throw new Error();
            const text = await response.text();
            const parts = text.split('|');
            const games = [];
            const seenGames = new Set();
            for (let part of parts) {
                if (!part.trim()) continue;
                let cleaned = part.trim().replace(/\d+$/, '');
                const jsonMatch = cleaned.match(/\{.*\}/);
                if (!jsonMatch) continue;
                try {
                    const gameData = JSON.parse(jsonMatch[0]);
                    let gameName = gameData.GameName || gameData.name;
                    if (!gameName || gameName === "Game " + gameData.PlaceId) gameName = gameData.ServerName;
                    let placeId = gameData.GameLink?.match(/games\/(\d+)/)?.[1] || gameData.PlaceId;
                    if (!placeId || !gameName) continue;
                    if (!seenGames.has(placeId)) {
                        seenGames.add(placeId);
                        games.push({
                            name: gameName, players: parseInt(gameData.PlayerCount || 0), placeId: placeId,
                            link: gameData.GameLink || `https://www.roblox.com/games/${placeId}`,
                            description: gameData.ServerName || gameName, rating: 4.5, icon: gameData.GameIcon || ""
                        });
                    }
                } catch(e) {}
            }
            if (games.length > 0) githubGames = games;
            return games;
        } catch(e) { return []; }
    }

    async function renderGames() {
        let container = document.getElementById('gamesContainer');
        if (!container) return;
        if (!checkAccess()) {
            container.innerHTML = `<div class="card"><p>需要登录才能访问游戏库</p><button class="btn btn-secondary" onclick="document.getElementById('loginModal').classList.add('active')">立即登录/注册</button></div>`;
            return;
        }
        let games = githubGames.length > 0 ? githubGames : LOCAL_GAMES;
        container.innerHTML = games.map(game => `<div class="game-card"><h3>${escapeHtml(game.name)}</h3><div class="game-player-count"><i class="fas fa-users"></i> 在线人数: ${game.players.toLocaleString()}</div><p>${escapeHtml(game.description)}</p><button class="btn btn-secondary" onclick="window.open('${game.link}','_blank')">开始游戏</button></div>`).join('');
        updateReviewStats();
    }

    function updateReviewStats() {
        const games = githubGames.length > 0 ? githubGames : LOCAL_GAMES;
        document.getElementById('statGameCount').innerText = games.length;
        document.getElementById('statTotalPlayers').innerText = games.reduce((s,g)=>s+(g.players||0),0).toLocaleString();
    }

    async function renderChats(room) {
        let chats = await readJSON("chats.json");
        if (!chats) chats = [];
        let msgs = chats.filter(c => c.room === room);
        let box = document.getElementById('chatMsgs');
        if (box) {
            if (msgs.length === 0) box.innerHTML = '<div class="msg-bubble">暂无消息</div>';
            else {
                box.innerHTML = msgs.map(m => {
                    const isOwn = m.user === currentUser;
                    const beautyBadge = getBeautyBadgeHtml(m.userId, m.isBeauty);
                    const avatarHtml = `<div class="avatar-img" onclick="showUserProfile('${escapeHtml(m.user)}')"><i class="fas fa-user"></i></div>`;
                    return `<div class="msg-bubble ${isOwn ? 'msg-own' : ''}" style="display:flex; align-items:flex-start;">${!isOwn ? avatarHtml : ''}<div style="flex:1;"><strong>${escapeHtml(m.user)}</strong>${beautyBadge}<span style="font-size:0.7rem; margin-left:8px;">${m.time}</span><br>${escapeHtml(m.text)}</div>${isOwn ? avatarHtml : ''}</div>`;
                }).join('');
            }
            box.scrollTop = box.scrollHeight;
        }
    }

    async function sendChat() {
        let inp = document.getElementById('chatInput');
        if (!inp.value.trim()) return;
        if (!currentUser) { showToast("请先登录", "error"); document.getElementById('loginModal').classList.add('active'); return; }
        let users = await readJSON("users.json");
        if (users && users[currentUser] && users[currentUser].isMuted) {
            showToast("你已被禁言，无法发送消息", "error");
            return;
        }
        let chats = await readJSON("chats.json");
        if (!chats) chats = [];
        chats.push({ id: Date.now(), user: currentUser, text: inp.value, time: new Date().toLocaleTimeString(), room: currentRoom, userId: currentUserData?.userId || "", avatar: currentUserData?.avatar || "", isBeauty: currentUserData?.isBeauty || "A" });
        await writeJSON("chats.json", chats, `新消息: ${currentUser}`);
        renderChats(currentRoom);
        inp.value = '';
    }

    async function renderScripts() {
        let scripts = await readJSON("scripts.json");
        if (!scripts) scripts = [];
        let approved = scripts.filter(s => s.status === "approved");
        document.getElementById('scriptsContainer').innerHTML = approved.length === 0 ? '<div class="card">暂无已审核脚本</div>' : approved.map(s => `<div class="script-card"><h4>${escapeHtml(s.name)}</h4><p>${escapeHtml(s.desc)}</p><small>作者: ${escapeHtml(s.author)}</small></div>`).join('');
    }

    async function uploadScript() {
        if (!currentUser) { showToast("请先登录", true); return; }
        let name = document.getElementById('scriptName').value.trim();
        let desc = document.getElementById('scriptDesc').value.trim();
        if (!name || !desc) { showToast("请填写脚本名称和描述", true); return; }
        let scripts = await readJSON("scripts.json");
        if (!scripts) scripts = [];
        scripts.push({ id: Date.now(), name, desc, author: currentUser, status: "pending", time: new Date().toISOString() });
        await writeJSON("scripts.json", scripts, `上传脚本: ${name}`);
        showToast("脚本已提交审核", false);
        document.getElementById('scriptName').value = '';
        document.getElementById('scriptDesc').value = '';
        renderScripts();
        if (currentRole === 'owner') renderAdminPanel();
    }

    async function renderReviews() {
        let reviews = await readJSON("reviews.json");
        if (!reviews) reviews = [];
        document.getElementById('reviewsList').innerHTML = reviews.length === 0 ? '<div class="card">暂无评价</div>' : reviews.map(r => `<div class="review-item"><div><strong>${escapeHtml(r.name)}</strong> ${'★'.repeat(r.rating)}<p>${escapeHtml(r.text)}</p></div>${currentRole === 'owner' ? `<button class="review-delete" onclick="window.deleteReview(${r.id})">删除</button>` : ''}</div>`).join('');
        document.getElementById('statReviewCount').innerText = reviews.length;
    }

    window.deleteReview = async (id) => {
        if (currentRole !== 'owner') return;
        let reviews = await readJSON("reviews.json");
        reviews = reviews.filter(r => r.id !== id);
        await writeJSON("reviews.json", reviews, `删除评价`);
        showToast("评价已删除", false);
        renderReviews();
    };

    async function submitReview() {
        if (!currentUser) { showToast("请先登录", true); return; }
        let content = document.getElementById('newReviewContent').value.trim();
        let rating = parseInt(document.getElementById('newReviewRating').value);
        if (!content) { showToast("请输入评价内容", true); return; }
        let reviews = await readJSON("reviews.json");
        if (!reviews) reviews = [];
        reviews.unshift({ id: Date.now(), name: currentUser, rating, text: content, userId: currentUserData?.userId || "", time: new Date().toISOString() });
        await writeJSON("reviews.json", reviews, `新评价: ${currentUser}`);
        showToast("评价发布成功", false);
        document.getElementById('newReviewContent').value = '';
        renderReviews();
    }

    async function renderAdminPanel() {
        if (currentRole !== 'owner') return;
        let users = await readJSON("users.json");
        let scripts = await readJSON("scripts.json");
        let pending = scripts.filter(s => s.status === "pending");
        let chats = await readJSON("chats.json");
        let whitelist = await readJSON("whitelist.json");
        let reviews = await readJSON("reviews.json");
        let container = document.getElementById('adminContent');
        container.innerHTML = `
            <h3>系统统计</h3>
            <p>总用户: ${Object.keys(users || {}).length} | 白名单: ${whitelist?.length || 0} | 脚本: ${scripts?.length || 0} | 待审核: ${pending.length} | 评价: ${reviews?.length || 0}</p>
            <h3 style="margin-top:20px;">用户管理</h3>
            <div id="userMgmt"></div>
            <h3 style="margin-top:20px;">评价管理</h3>
            <div id="reviewsMgmt"></div>
            <h3 style="margin-top:20px;">待审核脚本</h3>
            <div id="pendingScripts"></div>
            <h3 style="margin-top:20px;">最近聊天记录</h3>
            <div id="chatMgmt"></div>
        `;
        document.getElementById('userMgmt').innerHTML = Object.entries(users || {}).map(([name, info]) => `
            <div class="admin-row">
                <span><strong>${escapeHtml(name)}</strong> (${info.role}) ID: ${info.userId || '???'} ${info.isBeauty === 'B' ? '[靓号]' : ''} ${info.banned ? '[已封禁]' : ''} ${info.isMuted ? '[已禁言]' : ''}</span>
                <div>
                    <button class="btn-secondary ban-btn" onclick="toggleBanUser('${escapeHtml(name)}')">${info.banned ? '解封' : '封禁'}</button>
                    <button class="btn-secondary ban-btn" onclick="toggleMuteUser('${escapeHtml(name)}')">${info.isMuted ? '解除禁言' : '禁言'}</button>
                    <button class="btn-success ban-btn" onclick="setBeautyUser('${escapeHtml(name)}', 'A')">A靓号</button>
                    <button class="btn ban-btn" style="background:#ff3366;" onclick="setBeautyUser('${escapeHtml(name)}', 'B')">B靓号</button>
                </div>
            </div>
        `).join('');
        document.getElementById('reviewsMgmt').innerHTML = (reviews || []).map(r => `<div class="admin-row"><div><strong>${escapeHtml(r.name)}</strong> ${'★'.repeat(r.rating)}<br>${escapeHtml(r.text)}</div><button class="btn-danger ban-btn" onclick="deleteReview(${r.id})">删除</button></div>`).join('');
        document.getElementById('pendingScripts').innerHTML = pending.length === 0 ? '<div>暂无待审核脚本</div>' : pending.map(s => `<div class="admin-row"><div><strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.desc)}<br>作者: ${escapeHtml(s.author)}</div><div><button class="btn-success ban-btn" onclick="approveScript(${s.id})">通过</button><button class="btn-danger ban-btn" onclick="rejectScript(${s.id})">拒绝</button></div></div>`).join('');
        document.getElementById('chatMgmt').innerHTML = (chats || []).slice(-20).reverse().map(c => `<div class="admin-row"><span><strong>${escapeHtml(c.user)}</strong>: ${escapeHtml(c.text.substring(0, 50))}</span><button class="btn-danger ban-btn" onclick="deleteChatMsg(${c.id})">删除</button></div>`).join('');
    }

    window.toggleMuteUser = async (username) => {
        if (currentRole !== 'owner') { showToast("仅管理员可操作", true); return; }
        let users = await readJSON("users.json");
        if (users[username]) {
            users[username].isMuted = !users[username].isMuted;
            await writeJSON("users.json", users, `禁言用户: ${username}`);
            showToast(users[username].isMuted ? `已禁言 ${username}` : `已解除禁言 ${username}`, false);
            renderAdminPanel();
        }
    };

    window.toggleBanUser = async (username) => {
        if (currentRole !== 'owner') return;
        if (username === OWNER_USERNAME) { showToast("不能封禁管理员", true); return; }
        let users = await readJSON("users.json");
        if (users[username]) {
            users[username].banned = !users[username].banned;
            await writeJSON("users.json", users, `封禁用户: ${username}`);
            showToast(users[username].banned ? `已封禁 ${username}` : `已解封 ${username}`, false);
            renderAdminPanel();
        }
    };

    window.setBeautyUser = async (username, type) => {
        if (currentRole !== 'owner') return;
        let users = await readJSON("users.json");
        if (users[username]) { users[username].isBeauty = type; await writeJSON("users.json", users, `设置靓号: ${username}`); showToast(`${username} 已设为${type === 'B' ? 'B级靓号' : 'A级靓号'}`, false); renderAdminPanel(); }
    };

    window.approveScript = async (id) => {
        let scripts = await readJSON("scripts.json");
        let idx = scripts.findIndex(s => s.id === id);
        if (idx !== -1) { scripts[idx].status = "approved"; await writeJSON("scripts.json", scripts, `通过脚本`); showToast("脚本已通过", false); renderAdminPanel(); renderScripts(); }
    };

    window.rejectScript = async (id) => {
        let scripts = await readJSON("scripts.json");
        scripts = scripts.filter(s => s.id !== id);
        await writeJSON("scripts.json", scripts, `拒绝脚本`);
        showToast("已拒绝脚本", false);
        renderAdminPanel();
        renderScripts();
    };

    window.deleteChatMsg = async (id) => {
        let chats = await readJSON("chats.json");
        chats = chats.filter(c => c.id !== id);
        await writeJSON("chats.json", chats, `删除消息`);
        showToast("已删除消息", false);
        renderChats(currentRoom);
        if (currentRole === 'owner') renderAdminPanel();
    };

    async function renderWhitelist() {
        let whitelist = await readJSON("whitelist.json");
        if (!whitelist) whitelist = [];
        document.getElementById('whitelistUsers').innerHTML = whitelist.map(u => `<span class="tab">${escapeHtml(u)}</span>`).join('');
    }

    async function addToWhitelist() {
        if (currentRole !== 'owner') { showToast("仅管理员可操作", true); return; }
        let name = document.getElementById('whitelistName').value.trim();
        if (!name) { showToast("请输入用户名", true); return; }
        let whitelist = await readJSON("whitelist.json");
        if (!whitelist) whitelist = [];
        if (whitelist.includes(name)) { showToast("用户已在白名单", true); return; }
        whitelist.push(name);
        await writeJSON("whitelist.json", whitelist, `添加白名单: ${name}`);
        showToast(`${name} 已添加至白名单`, false);
        document.getElementById('whitelistName').value = '';
        renderWhitelist();
    }

    function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

    function startAutoRefresh() {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(async () => {
            if (document.getElementById('chatPage')?.classList.contains('active-page')) await renderChats(currentRoom);
            if (document.getElementById('reviewsPage')?.classList.contains('active-page')) await renderReviews();
            if (document.getElementById('scriptsPage')?.classList.contains('active-page')) await renderScripts();
            if (document.getElementById('whitelistPage')?.classList.contains('active-page')) await renderWhitelist();
            if (document.getElementById('adminPage')?.classList.contains('active-page') && currentRole === 'owner') await renderAdminPanel();
        }, 3000);
    }

    function switchPage(pageId) {
        if ((pageId === 'games' || pageId === 'whitelist' || pageId === 'executor') && !checkAccess()) pageId = 'reviews';
        if (pageId === 'admin' && currentRole !== 'owner') { showToast("只有管理员可以访问管理面板", true); pageId = 'reviews'; }
        document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active-page'));
        let target = document.getElementById(pageId + 'Page');
        if (target) target.classList.add('active-page');
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active-side'));
        let activeLink = Array.from(document.querySelectorAll('.sidebar-link')).find(l => l.dataset.page === pageId);
        if (activeLink) activeLink.classList.add('active-side');
        closeSidebar();
        if (pageId === 'reviews') { renderReviews(); updateReviewStats(); }
        if (pageId === 'games') renderGames();
        if (pageId === 'chat') { renderChats(currentRoom); setTimeout(() => document.getElementById('chatInput')?.focus(), 100); }
        if (pageId === 'scripts') renderScripts();
        if (pageId === 'whitelist') renderWhitelist();
        if (pageId === 'admin' && currentRole === 'owner') renderAdminPanel();
    }

    const sidebarEl = document.getElementById('sidebar'), overlay = document.getElementById('sidebarOverlay');
    document.getElementById('menuToggle').onclick = () => { sidebarEl.classList.add('open'); overlay.classList.add('active'); };
    function closeSidebar() { sidebarEl.classList.remove('open'); overlay.classList.remove('active'); }
    overlay.onclick = closeSidebar;
    document.querySelectorAll('.sidebar-link').forEach(link => { link.addEventListener('click', (e) => { let pg = e.currentTarget.dataset.page; if (pg) switchPage(pg); }); });

    window.showUserProfile = showUserProfile;
    window.deleteReview = deleteReview;
    window.toggleMuteUser = toggleMuteUser;
    window.toggleBanUser = toggleBanUser;
    window.setBeautyUser = setBeautyUser;
    window.approveScript = approveScript;
    window.rejectScript = rejectScript;
    window.deleteChatMsg = deleteChatMsg;

    document.getElementById('sendChatBtn')?.addEventListener('click', sendChat);
    document.getElementById('chatInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
    document.querySelectorAll('#chatTabs .tab').forEach(t => {
        t.addEventListener('click', () => {
            document.querySelectorAll('#chatTabs .tab').forEach(tt => tt.classList.remove('active'));
            t.classList.add('active');
            currentRoom = t.dataset.room;
            renderChats(currentRoom);
        });
    });
    document.getElementById('refreshGamesBtn')?.addEventListener('click', async () => { if (!checkAccess()) return; showToast("正在同步...", false); await fetchGamesFromGitHub(); await renderGames(); showToast("同步完成", false); });
    document.getElementById('uploadScriptBtn')?.addEventListener('click', uploadScript);
    document.getElementById('addWhitelistBtn')?.addEventListener('click', addToWhitelist);
    document.getElementById('submitReviewBtn')?.addEventListener('click', submitReview);
    document.getElementById('executeBtn')?.addEventListener('click', () => { let code = document.getElementById('executorCode').value; if(code.trim()){ document.getElementById('executorLog').innerHTML += `\n> 执行: ${code.substring(0,60)}...`; showToast("已执行", false); } else showToast("请输入代码", true); });
    document.getElementById('clearExecutorBtn')?.addEventListener('click', () => { document.getElementById('executorCode').value = ''; document.getElementById('executorLog').innerHTML = '控制台已清空'; });
    document.getElementById('injectBtn')?.addEventListener('click', () => { if(!checkAccess()) return; showToast("注入器已连接(演示)", false); });

    document.getElementById('doLoginBtn')?.addEventListener('click', async () => { let u = document.getElementById('loginUsername').value.trim(); let p = document.getElementById('loginPassword').value; if(await login(u,p)){ document.getElementById('loginModal').classList.remove('active'); switchPage('reviews'); startAutoRefresh(); } });
    document.getElementById('closeLoginBtn')?.addEventListener('click', () => document.getElementById('loginModal').classList.remove('active'));
    document.getElementById('toRegisterBtn')?.addEventListener('click', () => { document.getElementById('loginModal').classList.remove('active'); document.getElementById('registerModal').classList.add('active'); });
    document.getElementById('closeRegisterBtn')?.addEventListener('click', () => document.getElementById('registerModal').classList.remove('active'));
    document.getElementById('doRegisterBtn')?.addEventListener('click', async () => {
        let u = document.getElementById('regUsername').value.trim();
        let p = document.getElementById('regPassword').value.trim();
        let c = document.getElementById('regCard').value.trim();
        let avatarFile = document.getElementById('regAvatar').files[0];
        if (!u || !p) { showToast("请填写用户名和密码", true); return; }
        let avatarBase64 = "";
        if (avatarFile) { try { avatarBase64 = await new Promise((resolve, reject) => { let reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(avatarFile); }); } catch(e) { showToast("头像读取失败", true); return; } }
        if (await register(u, p, c, avatarBase64)) {
            document.getElementById('registerModal').classList.remove('active');
            if (await login(u, p)) { switchPage('reviews'); startAutoRefresh(); }
        }
    });

    document.getElementById('toggleGlobalMuteBtn')?.addEventListener('click', toggleGlobalMute);

    (async function() {
        await checkServerStatus();
        await initData();
        await renderReviews();
        await renderScripts();
        await renderWhitelist();
        updateSidebarUI();
        githubGames = LOCAL_GAMES;
        await renderGames();
        await renderChats('general');
        updateReviewStats();
        await initGlobalMute();
        await updateAdminMuteStatus();
        startAutoRefresh();
        setTimeout(() => { fetchGamesFromGitHub().then(() => renderGames()); }, 3000);
    })();
})();
</script>

<!-- ==================== 反调试保护（清空锁定模式） ==================== -->
<script>
(function() {
    'use strict';
    
    let isLocked = false;
    
    // 时间差检测（debugger 耗时）
    function detectTimeDeviation() {
        const start = performance.now();
        debugger;
        const duration = performance.now() - start;
        return duration > 100;
    }
    
    // 窗口尺寸差异检测（开发者工具停靠）
    function detectDimensionDiff() {
        const widthGap = window.outerWidth - window.innerWidth;
        const heightGap = window.outerHeight - window.innerHeight;
        return (widthGap > 160) || (heightGap > 120);
    }
    
    // 控制台方法篡改检测
    const nativeConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
    };
    
    function detectConsoleOverwrite() {
        return console.log !== nativeConsole.log ||
               console.error !== nativeConsole.error ||
               console.warn !== nativeConsole.warn ||
               console.info !== nativeConsole.info;
    }
    
    // 关键全局函数篡改检测
    const originalFetch = window.fetch;
    const originalSetInterval = window.setInterval;
    const originalSetTimeout = window.setTimeout;
    
    function detectGlobalTampering() {
        return window.fetch !== originalFetch ||
               window.setInterval !== originalSetInterval ||
               window.setTimeout !== originalSetTimeout;
    }
    
    // 综合检测
    function isDevToolsActive() {
        try {
            return detectTimeDeviation() ||
                   detectDimensionDiff() ||
                   detectConsoleOverwrite() ||
                   detectGlobalTampering();
        } catch(e) {
            return true;
        }
    }
    
    // 清空并锁定页面
    function executeLockdown() {
        if (isLocked) return;
        isLocked = true;
        
        // 清除所有定时器
        let maxTimerId = setTimeout(function() {}, 0);
        for (let i = 0; i <= maxTimerId; i++) {
            clearTimeout(i);
            clearInterval(i);
        }
        
        // 清空页面所有内容
        if (document.body) {
            while (document.body.firstChild) {
                document.body.removeChild(document.body.firstChild);
            }
            
            document.body.style.margin = '0';
            document.body.style.padding = '0';
            document.body.style.background = '#0f0a23';
            document.body.style.minHeight = '100vh';
            document.body.style.display = 'flex';
            document.body.style.alignItems = 'center';
            document.body.style.justifyContent = 'center';
            document.body.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        }
        
        // 创建锁定界面
        const lockCard = document.createElement('div');
        lockCard.style.textAlign = 'center';
        lockCard.style.padding = '40px 32px';
        lockCard.style.background = '#1a1439';
        lockCard.style.borderRadius = '32px';
        lockCard.style.border = '1px solid #3a3168';
        lockCard.style.maxWidth = '420px';
        lockCard.style.width = '90%';
        lockCard.style.margin = '20px';
        lockCard.style.boxShadow = '0 25px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.2)';
        lockCard.style.animation = 'fadeInLock 0.3s ease';
        
        lockCard.innerHTML = `
            <h1 style="background:linear-gradient(135deg,#ef4444,#f97316); -webkit-background-clip:text; background-clip:text; color:transparent; font-size:1.9rem; margin-bottom:24px; display:flex; align-items:center; justify-content:center; gap:12px;">
                <span>操你妈逼</span> 给你妈的头卸下来
            </h1>
            <div style="background:#241d52; border-radius:20px; padding:20px 16px; margin:20px 0 24px; border-left:3px solid #ef4444;">
                <p style="color:#ef4444; font-weight:bold; font-size:1.1rem; margin-bottom:8px;">操你妈了个逼</p>
                <p style="color:#cbd5e1; font-size:0.9rem;">老子给你妈的逼捅死</p>
            </div>
            <button id="lockReloadBtn" style="background:linear-gradient(135deg,#8b5cf6,#d946ef); border:none; padding:12px 28px; border-radius:40px; color:white; font-weight:600; font-size:1rem; cursor:pointer; transition:transform 0.2s,box-shadow 0.2s; box-shadow:0 4px 12px rgba(139,92,246,0.3);">
                滚回去
            </button>
            <p style="font-size:0.75rem; color:#5b528b; margin-top:28px; border-top:1px solid #2a235a; padding-top:18px;">
                你妈死了
            </p>
        `;
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInLock {
                from { opacity: 0; transform: scale(0.96); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(lockCard);
        
        // 绑定刷新按钮
        const reloadBtn = document.getElementById('lockReloadBtn');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', function(e) {
                e.preventDefault();
                location.reload();
            });
        }
        
        // 清空控制台
        if (typeof console !== 'undefined' && console.clear) {
            console.clear();
        }
        
        // 禁用所有事件
        const blockEvents = function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        window.addEventListener('click', blockEvents, true);
        window.addEventListener('keydown', blockEvents, true);
        window.addEventListener('contextmenu', blockEvents, true);
    }
    
    // 持续监控
    let monitorInterval = setInterval(function() {
        if (!isLocked && isDevToolsActive()) {
            clearInterval(monitorInterval);
            executeLockdown();
        }
    }, 500);
    
    // 监控被清除的保护
    let guardCount = 0;
    function safetyGuard() {
        if (isLocked) return;
        guardCount++;
        if (guardCount > 20) return;
        if (!monitorInterval || (typeof monitorInterval !== 'number' && !monitorInterval._isInterval)) {
            if (!isLocked) executeLockdown();
            return;
        }
        setTimeout(safetyGuard, 2000);
    }
    setTimeout(safetyGuard, 2000);
    
    // 禁用右键和快捷键
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        if (!isLocked) executeLockdown();
        return false;
    });
    
    document.addEventListener('keydown', function(e) {
        const key = e.key;
        const ctrl = e.ctrlKey;
        const shift = e.shiftKey;
        
        if (key === 'F12') {
            e.preventDefault();
            if (!isLocked) executeLockdown();
            return false;
        }
        if (ctrl && shift && (key === 'I' || key === 'J' || key === 'C')) {
            e.preventDefault();
            if (!isLocked) executeLockdown();
            return false;
        }
        if (ctrl && key === 'u') {
            e.preventDefault();
            if (!isLocked) executeLockdown();
            return false;
        }
        if (ctrl && key === 's') {
            e.preventDefault();
            if (!isLocked) executeLockdown();
            return false;
        }
    });
    
    // 初始快速检测
    setTimeout(function() {
        if (!isLocked && isDevToolsActive()) {
            executeLockdown();
        }
    }, 100);
})();
</script>
</body>
</html>
    `);
});

app.listen(3000, () => console.log('LOVESS 运行在 http://localhost:3000'));
