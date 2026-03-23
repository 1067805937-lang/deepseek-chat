// 使用 Vercel KV 存储（推荐）或内存存储
// 这里使用内存存储，Vercel 部署后数据会重置，生产环境建议使用数据库

// 存储所有记录
let visitors = [];
let conversations = [];

export default async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 记录访问
  if (req.method === 'POST' && req.url === '/api/record/visit') {
    const { ip, userAgent, device, timestamp } = req.body;
    
    const visitor = {
      id: Date.now(),
      ip,
      userAgent,
      device,
      timestamp,
      visitTime: new Date().toISOString()
    };
    
    visitors.push(visitor);
    
    // 只保留最近1000条记录
    if (visitors.length > 1000) {
      visitors = visitors.slice(-1000);
    }
    
    return res.status(200).json({ success: true, id: visitor.id });
  }
  
  // 记录聊天
  if (req.method === 'POST' && req.url === '/api/record/chat') {
    const { visitorId, message, response, timestamp } = req.body;
    
    const chat = {
      id: Date.now(),
      visitorId,
      message,
      response,
      timestamp,
      chatTime: new Date().toISOString()
    };
    
    conversations.push(chat);
    
    // 只保留最近5000条记录
    if (conversations.length > 5000) {
      conversations = conversations.slice(-5000);
    }
    
    return res.status(200).json({ success: true });
  }
  
  // 获取所有记录（需要密码验证）
  if (req.method === 'GET' && req.url === '/api/record/data') {
    const { password } = req.query;
    
    // 设置你的管理密码
    const ADMIN_PASSWORD = 'admin123'; // 修改成你自己的密码
    
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    return res.status(200).json({
      visitors,
      conversations,
      stats: {
        totalVisitors: visitors.length,
        totalConversations: conversations.length,
        lastUpdate: new Date().toISOString()
      }
    });
  }
  
  // 清空记录
  if (req.method === 'POST' && req.url === '/api/record/clear') {
    const { password } = req.body;
    const ADMIN_PASSWORD = 'admin123';
    
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    visitors = [];
    conversations = [];
    
    return res.status(200).json({ success: true });
  }
  
  res.status(404).json({ error: 'Not found' });
}