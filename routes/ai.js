/**
 * AI 功能路由
 * 提供 AI 配置管理、批量生成任务等功能
 * 支持自适应并发处理策略
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const db = require('../db');
const { AI_PROVIDERS, callAI } = require('../utils/aiProvider');
const { encrypt, decrypt } = require('../utils/crypto');
const EventEmitter = require('events');

// ==================== 统一字段生成服务 ====================

/**
 * 核心生成函数：处理单个卡片的指定字段
 */
async function generateCardFields(config, card, types, existingTags, strategy = {}) {
  let updated = false;
  const isFillMode = strategy.mode !== 'overwrite';
  const resultData = { name: null, description: null, tags: null };

  // 1. 过滤出真正需要生成的字段
  const neededTypes = types.filter(type => {
    if (type === 'name') {
      return !(isFillMode && card.title && !card.title.includes('://') && !card.title.startsWith('www.'));
    }
    if (type === 'description') {
      return !(isFillMode && card.desc);
    }
    return true; // tags 总是可以补充
  });

  if (neededTypes.length === 0) return { updated: false, data: resultData };

  // 2. 尝试使用统一 Prompt 处理多字段（效率更高）
  if (neededTypes.length > 1) {
    try {
      const prompt = buildPromptWithStrategy(buildUnifiedPrompt(card, neededTypes, existingTags), strategy);
      const aiResponse = await callAI(config, prompt);
      const parsed = parseUnifiedResponse(aiResponse, neededTypes, existingTags);

      let innerUpdated = false;
      if (parsed.name && parsed.name !== card.title) {
        await db.updateCardName(card.id, parsed.name);
        resultData.name = parsed.name;
        card.title = parsed.name;
        innerUpdated = true;
      }
      if (parsed.description && parsed.description !== card.desc) {
        await db.updateCardDescription(card.id, parsed.description);
        resultData.description = parsed.description;
        card.desc = parsed.description;
        innerUpdated = true;
      }
      if (parsed.tags && parsed.tags.length > 0) {
        await db.updateCardTags(card.id, parsed.tags);
        resultData.tags = parsed.tags;
        innerUpdated = true;
      }
      if (innerUpdated) return { updated: true, data: resultData };
    } catch (e) {
      console.warn(`Unified prompt failed for card ${card.id}, falling back to individual calls:`, e.message);
    }
  }

  // 3. 逐个字段处理（降级逻辑或单字段请求）
  for (const type of neededTypes) {
    try {
      let prompt, aiResponse, cleaned;
      if (type === 'name') {
        prompt = buildPromptWithStrategy(buildNamePrompt(card), strategy);
        aiResponse = await callAI(config, prompt);
        cleaned = cleanName(aiResponse);
        if (cleaned && cleaned !== card.title) {
          await db.updateCardName(card.id, cleaned);
          resultData.name = cleaned;
          card.title = cleaned;
          updated = true;
        }
      } else if (type === 'description') {
        prompt = buildPromptWithStrategy(buildDescriptionPrompt(card), strategy);
        aiResponse = await callAI(config, prompt);
        cleaned = cleanDescription(aiResponse);
        if (cleaned && cleaned !== card.desc) {
          await db.updateCardDescription(card.id, cleaned);
          resultData.description = cleaned;
          card.desc = cleaned;
          updated = true;
        }
      } else if (type === 'tags') {
        prompt = buildPromptWithStrategy(buildTagsPrompt(card, existingTags), strategy);
        aiResponse = await callAI(config, prompt);
        const { tags, newTags } = parseTagsResponse(aiResponse, existingTags);
        const allTags = [...tags, ...newTags];
        if (allTags.length > 0) {
          await db.updateCardTags(card.id, allTags);
          resultData.tags = allTags;
          updated = true;
        }
      }
    } catch (e) {
      console.error(`Field ${type} generation failed for card ${card.id}:`, e.message);
      if (neededTypes.length === 1) throw e;
    }
  }

  return { updated, data: resultData };
}

// ==================== 自适应并发批量任务管理器 ====================
class BatchTaskManager extends EventEmitter {
  constructor() {
    super();
    this.task = null;
    this.abortController = null;
    this.minConcurrency = 1;
    this.maxConcurrency = 5;
    this.initialConcurrency = 3;
  }

  getStatus() {
    if (!this.task) return { running: false };
    return {
      running: this.task.running,
      types: this.task.types,
      current: this.task.current,
      total: this.task.total,
      successCount: this.task.successCount,
      failCount: this.task.failCount,
      currentCard: this.task.currentCard,
      startTime: this.task.startTime,
      concurrency: this.task.concurrency,
      isRateLimited: this.task.isRateLimited,
      errors: this.task.errors.slice(-200) // 保持最后200条错误
    };
  }

  isRunning() { return this.task && this.task.running; }
  emitUpdate() { this.emit('update', this.getStatus()); }

  async start(config, cards, types, strategy = {}) {
    if (this.isRunning()) throw new Error('已有任务在运行中');

    this.abortController = new AbortController();
    this.task = {
      running: true,
      types: Array.isArray(types) ? types : [types],
      strategy,
      current: 0,
      total: cards.length,
      successCount: 0,
      failCount: 0,
      currentCard: '启动中...',
      startTime: Date.now(),
      errors: [],
      concurrency: this.initialConcurrency,
      isRateLimited: false,
      consecutiveSuccesses: 0,
      rateLimitCount: 0
    };

    this.emitUpdate();
    this.runTask(config, cards).catch(err => {
      console.error('Batch task error:', err);
      if (this.task) {
        this.task.running = false;
        this.task.errors.push({ cardId: 0, cardTitle: '系统', error: err.message || '任务异常中断', time: Date.now() });
        this.emitUpdate();
      }
    });

    return { total: cards.length };
  }

  stop() {
    if (this.abortController) this.abortController.abort();
    if (this.task) {
      this.task.running = false;
      this.task.currentCard = '已停止';
      this.emitUpdate();
    }
    return { stopped: true };
  }

  async runTask(config, cards) {
    const { notifyDataChange } = require('../utils/autoBackup');
    const types = this.task?.types || ['name'];
    const strategy = this.task?.strategy || {};
    
    try {
      const existingTags = types.includes('tags') ? await db.getAllTagNames() : [];
      const rawConfig = await db.getAIConfig();
      const baseDelay = Math.max(500, parseInt(rawConfig.requestDelay) || 1500);

      let index = 0;
      while (index < cards.length) {
        if (this.abortController?.signal.aborted || !this.task?.running) break;

        const currentConcurrency = this.task.concurrency;
        const batch = cards.slice(index, index + currentConcurrency);
        
        this.task.currentCard = batch.map(c => c.title || extractDomain(c.url)).join(', ');
        this.emitUpdate();

        const results = await Promise.allSettled(
          batch.map(card => this.processCardWithRetry(config, card, types, existingTags, strategy))
        );

        let batchSuccess = 0, batchFail = 0, hasRateLimit = false;

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const card = batch[i];
          if (this.task) this.task.current++;

          if (result.status === 'fulfilled') {
            if (result.value.success) {
              batchSuccess++;
              if (this.task) this.task.successCount++;
            } else {
              batchFail++;
              if (this.task) {
                this.task.failCount++;
                if (result.value.rateLimited) hasRateLimit = true;
                this.task.errors.push({
                  cardId: card.id,
                  cardTitle: card.title || extractDomain(card.url),
                  error: result.value.error || '未生成任何内容',
                  time: Date.now()
                });
              }
            }
          } else {
            batchFail++;
            if (this.task) {
              this.task.failCount++;
              this.task.errors.push({
                cardId: card.id,
                cardTitle: card.title || extractDomain(card.url),
                error: result.reason?.message || '处理中断',
                time: Date.now()
              });
            }
          }
        }

        if (batchSuccess > 0) notifyDataChange();
        this.adjustConcurrency(batchSuccess, batchFail, hasRateLimit);
        this.emitUpdate();
        index += batch.length;

        if (index < cards.length && this.task?.running) {
          const delay = this.calculateDelay(baseDelay, hasRateLimit);
          await this.sleep(delay);
        }
      }
    } catch (err) {
      console.error('runTask loop error:', err);
    } finally {
      if (this.task) {
        this.task.running = false;
        this.task.currentCard = '';
        this.task.current = this.task.total;
        this.emitUpdate();
        notifyDataChange();
      }
    }
  }

  adjustConcurrency(success, fail, rateLimited) {
    if (!this.task) return;
    if (rateLimited) {
      this.task.rateLimitCount++;
      this.task.consecutiveSuccesses = 0;
      this.task.isRateLimited = true;
      this.task.concurrency = Math.max(this.minConcurrency, Math.floor(this.task.concurrency / 2));
    } else if (success > 0 && fail === 0) {
      this.task.consecutiveSuccesses++;
      this.task.isRateLimited = false;
      if (this.task.consecutiveSuccesses >= 3 && this.task.concurrency < this.maxConcurrency) {
        this.task.concurrency++;
        this.task.consecutiveSuccesses = 0;
      }
    } else {
      this.task.consecutiveSuccesses = 0;
    }
  }

  calculateDelay(base, rateLimited) {
    if (rateLimited) return Math.min(base * Math.pow(2, Math.min(this.task.rateLimitCount, 4)), 30000);
    return this.task.concurrency === 1 ? base : Math.max(300, base / 2);
  }

  async processCardWithRetry(config, card, types, existingTags, strategy, retry = 0) {
    try {
      const { updated, data } = await generateCardFields(config, card, types, existingTags, strategy);
      if (!updated && !Object.values(data).some(v => v !== null)) {
         return { success: false, error: '所有字段已存在，无需更新' };
      }
      return { success: true };
    } catch (e) {
      const isRate = this.isRateLimitError(e);
      if (isRate && retry < 2) {
        await this.sleep(Math.pow(2, retry + 1) * 1000);
        return this.processCardWithRetry(config, card, types, existingTags, strategy, retry + 1);
      }
      return { success: false, rateLimited: isRate, error: e.message };
    }
  }

  isRateLimitError(e) {
    const msg = (e?.message || '').toLowerCase();
    return e?.status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('请求过于频繁');
  }

  sleep(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); });
    });
  }
}

const taskManager = new BatchTaskManager();

// ==================== 辅助函数 ====================

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

async function getDecryptedAIConfig() {
  const config = await db.getAIConfig();
  if (config.apiKey) {
    try {
      const encrypted = JSON.parse(config.apiKey);
      config.apiKey = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
    } catch {}
  }
  return config;
}

function validateAIConfig(config) {
  if (!config.provider) return { valid: false, message: '请先配置 AI 服务' };
  const prov = AI_PROVIDERS[config.provider];
  if (!prov) return { valid: false, message: `不支持的提供商: ${config.provider}` };
  if (prov.needsApiKey && !config.apiKey) return { valid: false, message: '请配置 API Key' };
  if (prov.needsBaseUrl && !config.baseUrl) return { valid: false, message: '请配置 Base URL' };
  return { valid: true };
}

// ==================== Prompt 构建 & 解析 ====================

function buildUnifiedPrompt(card, types, existingTags) {
  const rules = [];
  if (types.includes('name')) rules.push('- name: 官方品牌名，不含后缀');
  if (types.includes('description')) rules.push('- description: 10-25字功能描述');
  if (types.includes('tags')) rules.push('- tags: 2-4个标签数组');
  
  return [
    { role: 'system', content: `严格按 JSON 格式返回：\n${rules.join('\n')}` },
    { role: 'user', content: `地址：${card.url}\n现有标签：${existingTags.slice(0, 20).join('、')}` }
  ];
}

function parseUnifiedResponse(text, types) {
  const res = { name: '', description: '', tags: [] };
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      if (types.includes('name')) res.name = cleanName(p.name);
      if (types.includes('description')) res.description = cleanDescription(p.description);
      if (types.includes('tags') && Array.isArray(p.tags)) res.tags = p.tags.slice(0, 5);
    }
  } catch {}
  return res;
}

function buildNamePrompt(card) {
  return [{ role: 'system', content: '仅返回网站名称，简洁，无标点' }, { role: 'user', content: `URL: ${card.url}` }];
}

function buildDescriptionPrompt(card) {
  return [{ role: 'system', content: '仅返回10-25字描述' }, { role: 'user', content: `网站: ${card.title || card.url}` }];
}

function buildTagsPrompt(card, existingTags) {
  return [{ role: 'system', content: '返回JSON: {"tags":["标签"]}' }, { role: 'user', content: `网站: ${card.title}\n库: ${existingTags.slice(0, 20).join(',')}` }];
}

function cleanName(t) { return (t || '').replace(/(官网|首页|官方网站)$/g, '').trim().substring(0, 20); }
function cleanDescription(t) { return (t || '').trim().replace(/[。.]+$/, '').substring(0, 80); }

function parseTagsResponse(text, existingTags) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      return { tags: (p.tags || []).filter(t => existingTags.includes(t)), newTags: (p.tags || []).filter(t => !existingTags.includes(t)) };
    }
  } catch {}
  return { tags: [], newTags: [] };
}

// ==================== API 路由 ====================

router.get('/config', authMiddleware, async (req, res) => {
  try {
    const c = await db.getAIConfig();
    res.json({ success: true, config: { 
      provider: c.provider || 'deepseek', 
      hasApiKey: !!c.apiKey, 
      baseUrl: c.baseUrl || '', 
      model: c.model || '', 
      autoGenerate: c.autoGenerate === 'true',
      lastTestedOk: c.lastTestedOk === 'true'
    }});
  } catch { res.status(500).json({ success: false }); }
});

router.post('/config', authMiddleware, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model, autoGenerate } = req.body;
    let encKey = undefined;
    if (apiKey && apiKey !== '••••••') encKey = JSON.stringify(encrypt(apiKey));
    await db.saveAIConfig({ provider, apiKey: encKey, baseUrl, model, autoGenerate: autoGenerate ? 'true' : 'false', lastTestedOk: 'false' });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

router.post('/test', authMiddleware, async (req, res) => {
  try {
    const config = await getDecryptedAIConfig();
    const val = validateAIConfig(config);
    if (!val.valid) return res.status(400).json({ success: false, message: val.message });
    const aiRes = await callAI(config, [{ role: 'user', content: 'Respond with OK' }]);
    const ok = !!aiRes;
    await db.saveAIConfig({ lastTestedOk: ok ? 'true' : 'false' });
    res.json({ success: ok, message: ok ? '连接成功' : 'AI 未响应' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [n, d, t, all] = await Promise.all([db.getCardsNeedingAI('name'), db.getCardsNeedingAI('description'), db.getCardsNeedingAI('tags'), db.getAllCards()]);
    res.json({ success: true, stats: { emptyName: n.length, emptyDesc: d.length, emptyTags: t.length, total: all.length } });
  } catch { res.status(500).json({ success: false }); }
});

router.post('/filter-cards', authMiddleware, async (req, res) => {
  try {
    const cards = await db.filterCardsForAI(req.body);
    res.json({ success: true, cards, total: cards.length });
  } catch { res.status(500).json({ success: false }); }
});

router.post('/preview', authMiddleware, async (req, res) => {
  try {
    const { cardIds, types, strategy } = req.body;
    const config = await getDecryptedAIConfig();
    const cards = await db.getCardsByIds(cardIds);
    const previews = [];
    const tags = await db.getAllTagNames();
    for (const card of cards) {
      const p = { cardId: card.id, title: card.title, url: card.url, fields: {} };
      const { data } = await generateCardFields(config, { ...card }, types, tags, strategy);
      if (types.includes('name')) p.fields.name = { original: card.title, generated: data.name };
      if (types.includes('description')) p.fields.description = { original: card.desc, generated: data.description };
      if (types.includes('tags')) p.fields.tags = { original: [], generated: data.tags || [] };
      previews.push(p);
    }
    res.json({ success: true, previews });
  } catch { res.status(500).json({ success: false }); }
});

router.get('/batch-task/status', authMiddleware, (req, res) => res.json({ success: true, ...taskManager.getStatus() }));

router.get('/batch-task/stream', authMiddleware, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(taskManager.getStatus())}\n\n`);
  const onUp = (s) => { res.write(`data: ${JSON.stringify(s)}\n\n`); if (res.flush) res.flush(); };
  taskManager.on('update', onUp);
  req.on('close', () => taskManager.removeListener('update', onUp));
});

router.post('/batch-task/start', authMiddleware, async (req, res) => {
  try {
    const { type, mode, cardIds, types, strategy } = req.body;
    const config = await getDecryptedAIConfig();
    let cards, taskTypes, taskStrategy = strategy || {};
    if (cardIds?.length) {
      cards = await db.getCardsByIds(cardIds);
      taskTypes = types || ['name', 'description', 'tags'];
    } else {
      taskTypes = type === 'all' ? ['name', 'description', 'tags'] : [type];
      cards = mode === 'all' ? await db.getAllCards() : await db.getCardsNeedingAI(type === 'all' ? 'both' : type);
      taskStrategy.mode = mode === 'all' ? 'overwrite' : 'fill';
    }
    if (!cards?.length) return res.json({ success: true, total: 0 });
    const r = await taskManager.start(config, cards, taskTypes, taskStrategy);
    res.json({ success: true, total: r.total });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/batch-task/stop', authMiddleware, (req, res) => { taskManager.stop(); res.json({ success: true }); });

function buildPromptWithStrategy(base, strat = {}) {
  if (strat.style && strat.style !== 'default') base[0].content += `\n风格：${strat.style}`;
  if (strat.customPrompt) base[0].content += `\n要求：${strat.customPrompt}`;
  return base;
}

async function autoGenerateForCards(cardIds) {
  try {
    const c = await db.getAIConfig();
    if (c.autoGenerate !== 'true') return;
    const dec = await getDecryptedAIConfig();
    const tags = await db.getAllTagNames();
    for (const id of cardIds) {
      const cards = await db.getCardsByIds([id]);
      if (cards.length) await generateCardFields(dec, cards[0], ['name', 'description', 'tags'], tags, { mode: 'fill' });
    }
  } catch {}
}

module.exports = router;
module.exports.autoGenerateForCards = autoGenerateForCards;
