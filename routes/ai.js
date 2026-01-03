/**
 * AI 功能路由
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const db = require('../db');
const { AI_PROVIDERS, callAI } = require('../utils/aiProvider');
const { encrypt, decrypt } = require('../utils/crypto');

// 获取 AI 提供商列表
router.get('/providers', (req, res) => {
  const providers = Object.entries(AI_PROVIDERS).map(([key, value]) => ({
    id: key,
    name: value.name,
    defaultModel: value.defaultModel,
    needsApiKey: value.needsApiKey,
    needsBaseUrl: value.needsBaseUrl
  }));
  res.json({ success: true, providers });
});

// 获取 AI 配置（不含敏感信息）
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const config = await db.getAIConfig();
    // 不返回完整的 API Key，只返回是否已配置
    res.json({
      success: true,
      config: {
        provider: config.provider || 'deepseek',
        hasApiKey: !!config.apiKey,
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        requestDelay: config.requestDelay || 1500
      }
    });
  } catch (error) {
    console.error('获取 AI 配置失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存 AI 配置
router.post('/config', authMiddleware, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model, requestDelay } = req.body;
    
    if (!provider || !AI_PROVIDERS[provider]) {
      return res.status(400).json({ success: false, message: '无效的 AI 提供商' });
    }
    
    const providerConfig = AI_PROVIDERS[provider];
    
    // 验证必填项
    if (providerConfig.needsApiKey && !apiKey) {
      // 检查是否已有保存的 API Key
      const existingConfig = await db.getAIConfig();
      if (!existingConfig.apiKey) {
        return res.status(400).json({ success: false, message: 'API Key 不能为空' });
      }
    }
    
    if (providerConfig.needsBaseUrl && !baseUrl) {
      return res.status(400).json({ success: false, message: 'Base URL 不能为空' });
    }
    
    // 加密 API Key
    let encryptedApiKey = null;
    if (apiKey) {
      const encrypted = encrypt(apiKey);
      encryptedApiKey = JSON.stringify(encrypted);
    }
    
    await db.saveAIConfig({
      provider,
      apiKey: encryptedApiKey,
      baseUrl: baseUrl || '',
      model: model || '',
      requestDelay: requestDelay || 1500
    });
    
    res.json({ success: true, message: 'AI 配置保存成功' });
  } catch (error) {
    console.error('保存 AI 配置失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 测试 AI 连接
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const config = await getDecryptedAIConfig();
    
    console.log('AI 测试 - 配置:', { 
      provider: config.provider, 
      hasApiKey: !!config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model
    });
    
    if (!config.provider) {
      return res.status(400).json({ success: false, message: '请先配置 AI 服务' });
    }
    
    // 检查必要的配置
    const { AI_PROVIDERS } = require('../utils/aiProvider');
    const providerConfig = AI_PROVIDERS[config.provider];
    
    if (!providerConfig) {
      return res.status(400).json({ success: false, message: `不支持的提供商: ${config.provider}` });
    }
    
    if (providerConfig.needsApiKey && !config.apiKey) {
      return res.status(400).json({ success: false, message: '请先配置 API Key' });
    }
    
    if (providerConfig.needsBaseUrl && !config.baseUrl) {
      return res.status(400).json({ success: false, message: '请先配置 Base URL' });
    }
    
    const messages = [
      { role: 'system', content: '你是一个助手。' },
      { role: 'user', content: '请回复"连接成功"四个字。' }
    ];
    
    const result = await callAI(config, messages);
    
    res.json({ 
      success: true, 
      message: '连接测试成功',
      response: result ? result.substring(0, 100) : '(空响应)'
    });
  } catch (error) {
    console.error('AI 连接测试失败:', error);
    res.status(500).json({ success: false, message: `连接失败: ${error.message}` });
  }
});

// 生成描述/标签
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { type, card, existingTags } = req.body;
    
    if (!type || !card || !card.url) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    const config = await getDecryptedAIConfig();
    
    if (!config.provider) {
      return res.status(400).json({ success: false, message: '请先配置 AI 服务' });
    }
    
    let result = {};
    
    if (type === 'description' || type === 'both') {
      const descPrompt = buildDescriptionPrompt(card);
      const description = await callAI(config, descPrompt);
      result.description = cleanDescription(description);
    }
    
    if (type === 'tags' || type === 'both') {
      const tagsPrompt = buildTagsPrompt(card, existingTags || []);
      const tagsResponse = await callAI(config, tagsPrompt);
      result.tags = parseTagsResponse(tagsResponse, existingTags || []);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('AI 生成失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取缺少描述/标签的卡片
router.get('/empty-cards', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query; // 'description' | 'tags' | 'both'
    const cards = await db.getCardsNeedingAI(type || 'both');
    res.json({ success: true, cards, total: cards.length });
  } catch (error) {
    console.error('获取待处理卡片失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 批量生成
router.post('/batch-generate', authMiddleware, async (req, res) => {
  try {
    const { type, cardIds } = req.body;
    
    if (!type || !cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    const config = await getDecryptedAIConfig();
    
    if (!config.provider) {
      return res.status(400).json({ success: false, message: '请先配置 AI 服务' });
    }
    
    // 获取卡片信息
    const cards = await db.getCardsByIds(cardIds);
    const existingTags = type === 'tags' || type === 'both' 
      ? await db.getAllTagNames() 
      : [];
    
    res.json({ 
      success: true, 
      cards: cards,
      existingTags,
      requestDelay: config.requestDelay || 1500
    });
  } catch (error) {
    console.error('批量生成准备失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新卡片描述
router.post('/update-description', authMiddleware, async (req, res) => {
  try {
    const { cardId, description } = req.body;
    
    if (!cardId || typeof description !== 'string') {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    await db.updateCardDescription(cardId, description);
    res.json({ success: true, message: '描述更新成功' });
  } catch (error) {
    console.error('更新描述失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新卡片标签
router.post('/update-tags', authMiddleware, async (req, res) => {
  try {
    const { cardId, tags } = req.body;
    
    if (!cardId || !Array.isArray(tags)) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    await db.updateCardTags(cardId, tags);
    res.json({ success: true, message: '标签更新成功' });
  } catch (error) {
    console.error('更新标签失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 辅助函数 ====================

async function getDecryptedAIConfig() {
  const config = await db.getAIConfig();
  
  if (config.apiKey) {
    try {
      const encrypted = JSON.parse(config.apiKey);
      config.apiKey = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
    } catch (e) {
      // 可能是未加密的旧数据
      console.warn('API Key 解密失败，可能是未加密的旧数据');
    }
  }
  
  return config;
}

function buildDescriptionPrompt(card) {
  // 从 URL 提取域名，帮助 AI 更好理解网站
  let domain = '';
  try {
    domain = new URL(card.url).hostname.replace('www.', '');
  } catch (e) {
    domain = card.url;
  }
  
  return [
    {
      role: 'system',
      content: `你是一个专业的网站分析专家，精通各类互联网产品和服务。你的任务是为导航站生成简洁精准的网站描述。

输出规则：
- 直接输出描述文本，不要任何前缀、引号、标点符号包裹
- 字数控制在 10-25 个中文字符
- 使用专业但易懂的语言
- 突出网站的核心功能或独特价值`
    },
    {
      role: 'user',
      content: `请为这个网站生成描述：

网站名称：${card.name || '未知'}
网站域名：${domain}
完整地址：${card.url}

参考示例：
- GitHub → 全球最大的代码托管和协作平台
- 百度 → 中文搜索引擎，提供网页、图片、视频搜索
- Notion → 集笔记、文档、项目管理于一体的协作工具
- DeepSeek → 国产大语言模型，支持对话和代码生成

请直接输出描述内容：`
    }
  ];
}

function buildTagsPrompt(card, existingTags) {
  const tagsStr = existingTags.length > 0 
    ? existingTags.slice(0, 30).join('、')  // 限制标签数量避免 token 过长
    : '暂无预设标签';
  
  // 从 URL 提取域名
  let domain = '';
  try {
    domain = new URL(card.url).hostname.replace('www.', '');
  } catch (e) {
    domain = card.url;
  }
  
  return [
    {
      role: 'system',
      content: `你是一个网站分类专家，擅长为导航站的网站分配合适的标签。

任务：根据网站信息，推荐 2-4 个最相关的标签。

规则：
1. 优先使用现有标签库中的标签（完全匹配）
2. 只有当现有标签都不合适时，才建议新标签
3. 新标签要简短（2-4个汉字），通用性强
4. 必须严格按 JSON 格式输出

输出格式（严格遵守）：
{"tags": ["现有标签1", "现有标签2"], "newTags": ["新标签"]}`
    },
    {
      role: 'user',
      content: `请为这个网站推荐标签：

网站名称：${card.name || '未知'}
网站域名：${domain}
网站描述：${card.description || '暂无描述'}

现有标签库：
${tagsStr}

分类参考：
- 工具类网站 → 工具、效率工具、在线工具
- AI 相关 → AI工具、人工智能、机器学习
- 开发相关 → 开发工具、编程、代码托管
- 设计相关 → 设计工具、UI设计、图片处理
- 云服务 → 云服务、服务器、云存储
- 社交媒体 → 社交媒体、社区、论坛

请输出 JSON：`
    }
  ];
}

function cleanDescription(text) {
  if (!text) return '';
  
  let cleaned = text
    // 移除 markdown 代码块
    .replace(/```[\s\S]*?```/g, '')
    // 移除首尾引号
    .replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '')
    // 移除常见前缀
    .replace(/^(描述[：:]\s*|简介[：:]\s*|网站描述[：:]\s*|Description[：:]\s*)/i, '')
    // 移除换行符
    .replace(/[\r\n]+/g, ' ')
    // 移除多余空格
    .replace(/\s+/g, ' ')
    .trim();
  
  // 如果结果以句号结尾，移除它（保持简洁）
  cleaned = cleaned.replace(/[。.]+$/, '');
  
  // 限制长度
  if (cleaned.length > 80) {
    cleaned = cleaned.substring(0, 80) + '...';
  }
  
  return cleaned;
}

function parseTagsResponse(text, existingTags) {
  if (!text) return { tags: [], newTags: [] };
  
  try {
    // 移除 markdown 代码块标记
    let cleanText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    
    // 尝试提取 JSON
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // 验证并清理标签
      const tags = Array.isArray(parsed.tags) 
        ? parsed.tags.filter(t => typeof t === 'string' && t.length > 0 && t.length <= 15)
        : [];
      const newTags = Array.isArray(parsed.newTags) 
        ? parsed.newTags.filter(t => typeof t === 'string' && t.length > 0 && t.length <= 10)
        : [];
      
      return { tags, newTags };
    }
  } catch (e) {
    console.warn('标签 JSON 解析失败:', e.message);
  }
  
  // 降级处理：尝试从文本中提取标签
  try {
    // 匹配引号内的内容
    const tagMatches = text.match(/["'「」『』""'']([^"'「」『』""'']+)["'「」『』""'']/g);
    if (tagMatches && tagMatches.length > 0) {
      const tags = tagMatches
        .map(t => t.replace(/["'「」『』""'']/g, '').trim())
        .filter(t => t.length > 0 && t.length <= 15);
      
      // 区分现有标签和新标签
      const existingSet = new Set(existingTags.map(t => t.toLowerCase()));
      const matchedTags = tags.filter(t => existingSet.has(t.toLowerCase()));
      const newTagsList = tags.filter(t => !existingSet.has(t.toLowerCase()));
      
      return { 
        tags: matchedTags.length > 0 ? matchedTags : tags.slice(0, 3), 
        newTags: newTagsList.slice(0, 2) 
      };
    }
  } catch (e) {
    console.warn('标签降级解析失败:', e.message);
  }
  
  return { tags: [], newTags: [] };
}

module.exports = router;
