const express = require('express');
const db = require('../db');
const auth = require('./authMiddleware');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { triggerDebouncedBackup } = require('../utils/autoBackup');
const { detectDuplicates, isDuplicateCard } = require('../utils/urlNormalizer');
const { autoGenerateForCards } = require('./ai');
const router = express.Router();

const JWT_SECRET = config.server.jwtSecret;

function getUserFromToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return null;
  }
  
  try {
    const token = auth.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.id;
  } catch (error) {
    return null;
  }
}

// 获取所有卡片（按分类分组，用于首屏加载优化）
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  const userId = getUserFromToken(req);
  
  let query = `
    SELECT c.*, sm.parent_id as parent_menu_id
    FROM cards c
    LEFT JOIN sub_menus sm ON c.sub_menu_id = sm.id
  `;
  let params = [];
  
  if (userId) {
    query += ` WHERE c.user_id = ?`;
    params.push(userId);
  } else {
    query += ` WHERE c.user_id IS NULL`;
  }
  
  query += ` ORDER BY c.menu_id, c.sub_menu_id, c."order"`;
  
  db.all(query, params, (err, cards) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (cards.length === 0) {
      return res.json({ cards: [], cardsByCategory: {} });
    }
    
    const cardIds = cards.map(c => c.id);
    const placeholders = cardIds.map(() => '?').join(',');
    
    db.all(
      `SELECT ct.card_id, t.id, t.name, t.color 
       FROM card_tags ct 
       JOIN tags t ON ct.tag_id = t.id 
       WHERE ct.card_id IN (${placeholders})
       ORDER BY t."order", t.name`,
      cardIds,
      (err, tagRows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const tagsByCard = {};
        tagRows.forEach(tag => {
          if (!tagsByCard[tag.card_id]) {
            tagsByCard[tag.card_id] = [];
          }
          tagsByCard[tag.card_id].push({
            id: tag.id,
            name: tag.name,
            color: tag.color
          });
        });
        
        const cardsByCategory = {};
        cards.forEach(card => {
          const menuId = card.menu_id || card.parent_menu_id;
          const key = `${menuId}_${card.sub_menu_id || 'null'}`;
          if (!cardsByCategory[key]) {
            cardsByCategory[key] = [];
          }
          cardsByCategory[key].push({
            ...card,
            menu_id: menuId,
            tags: tagsByCard[card.id] || []
          });
        });
        
        res.json({ cardsByCategory });
      }
    );
  });
});

// 获取指定菜单的卡片（包含标签）
router.get('/:menuId', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  const { subMenuId } = req.query;
  const menuId = req.params.menuId;
  const userId = getUserFromToken(req);
  
  let query, params;
  
  if (subMenuId) {
    query = `
      SELECT c.*, sm.parent_id as parent_menu_id
      FROM cards c
      LEFT JOIN sub_menus sm ON c.sub_menu_id = sm.id
      WHERE c.sub_menu_id = ?
    `;
    params = [subMenuId];
  } else {
    query = `
      SELECT c.*, NULL as parent_menu_id
      FROM cards c
      WHERE c.menu_id = ? AND c.sub_menu_id IS NULL
    `;
    params = [menuId];
  }
  
  if (userId) {
    query += ' AND c.user_id = ?';
    params.push(userId);
  } else {
    query += ' AND c.user_id IS NULL';
  }
  
  if (subMenuId) {
    query += ' ORDER BY c."order"';
  } else {
    query += ' ORDER BY c."order"';
  }
  
  db.all(query, params, (err, cards) => {
    if (err) return res.status(500).json({error: err.message});
    
    if (cards.length === 0) {
      return res.json([]);
    }
    
    const cardIds = cards.map(c => c.id);
    const placeholders = cardIds.map(() => '?').join(',');
    
    db.all(
      `SELECT ct.card_id, t.id, t.name, t.color 
       FROM card_tags ct 
       JOIN tags t ON ct.tag_id = t.id 
       WHERE ct.card_id IN (${placeholders})
       ORDER BY t."order", t.name`,
      cardIds,
      (err, tagRows) => {
        if (err) return res.status(500).json({error: err.message});
        
        const tagsByCard = {};
        tagRows.forEach(tag => {
          if (!tagsByCard[tag.card_id]) {
            tagsByCard[tag.card_id] = [];
          }
          tagsByCard[tag.card_id].push({
            id: tag.id,
            name: tag.name,
            color: tag.color
          });
        });
        
        const result = cards.map(card => ({
          ...card,
          menu_id: card.menu_id || card.parent_menu_id || parseInt(menuId),
          tags: tagsByCard[card.id] || []
        }));
        
        res.json(result);
      }
    );
  });
});

// 批量更新卡片（用于拖拽排序和分类）- 必须放在/:id之前
router.patch('/batch-update', auth, (req, res) => {
  const { cards } = req.body;
  
  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: '无效的请求数据' });
  }
  
  // 使用Promise优化批量更新
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      let completed = 0;
      let hasError = false;
      
      if (cards.length === 0) {
        db.run('COMMIT');
        return res.json({ success: true, updated: 0 });
      }
      
      cards.forEach((card) => {
        const { id, order, menu_id, sub_menu_id } = card;
        
        db.run(
          'UPDATE cards SET "order"=?, menu_id=?, sub_menu_id=? WHERE id=?',
          [order, menu_id, sub_menu_id || null, id],
          function(err) {
            if (hasError) return; // 已经处理过错误
            
            if (err) {
              hasError = true;
              db.run('ROLLBACK', () => {
                res.status(500).json({ error: err.message });
              });
              return;
            }
            
            completed++;
            
            if (completed === cards.length) {
              db.run('COMMIT', (err) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }
                triggerDebouncedBackup(); // 触发自动备份和SSE广播
                res.json({ success: true, updated: completed });
              });
            }
          }
        );
      });
    });
  });
});

// 新增卡片（含标签）
router.post('/', auth, (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, desc, order, tagIds } = req.body;
  
  const userId = getUserFromToken(req);
  
  // 先检查是否重复（只检查当前用户的数据）
  let checkQuery = 'SELECT * FROM cards';
  let checkParams = [];
  
  if (userId) {
    checkQuery += ' WHERE user_id = ?';
    checkParams.push(userId);
  } else {
    checkQuery += ' WHERE user_id IS NULL';
  }
  
  db.all(checkQuery, checkParams, (err, existingCards) => {
    if (err) return res.status(500).json({error: err.message});
    
    const newCard = { title, url };
    const duplicate = existingCards.find(card => isDuplicateCard(newCard, card));
    
    if (duplicate) {
      return res.status(409).json({
        error: '卡片已存在',
        message: `该卡片与现有卡片“${duplicate.title}”重复`,
        duplicate: duplicate
      });
    }
    
    // 不重复，添加卡片
    db.run(
      'INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc, "order", user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
      [menu_id, sub_menu_id || null, title, url, logo_url, desc, order || 0, userId || null],
      function(err) {
        if (err) return res.status(500).json({error: err.message});
        
        const cardId = this.lastID;
        
        // 如果有标签，关联标签
        if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
          const values = tagIds.map(tagId => `(${cardId}, ${tagId})`).join(',');
          db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (err) => {
            if (err) return res.status(500).json({error: err.message});
            
            triggerDebouncedBackup();
            
            // 异步触发 AI 自动生成（不阻塞响应）
            setImmediate(() => autoGenerateForCards([cardId]));
            
            res.json({ id: cardId });
          });
        } else {
          triggerDebouncedBackup();
          
          // 异步触发 AI 自动生成（不阻塞响应）
          setImmediate(() => autoGenerateForCards([cardId]));
          
          res.json({ id: cardId });
        }
      }
    );
  });
});

// 更新卡片（含标签）
router.put('/:id', auth, (req, res) => {
  const { menu_id, sub_menu_id, title, url, logo_url, desc, order, tagIds } = req.body;
  const { id } = req.params;
  
  const userId = getUserFromToken(req);
  
  // 确保用户只能更新自己的卡片
  let updateQuery = 'UPDATE cards SET menu_id=?, sub_menu_id=?, title=?, url=?, logo_url=?, desc=?, "order"=? WHERE id=?';
  let updateParams = [menu_id, sub_menu_id || null, title, url, logo_url, desc, order || 0, id];
  
  if (userId) {
    updateQuery += ' AND user_id = ?';
    updateParams.push(userId);
  } else {
    updateQuery += ' AND user_id IS NULL';
  }
  
  db.run(updateQuery, updateParams, function(err) {
      if (err) return res.status(500).json({error: err.message});
      
      const changes = this.changes;
      
      // 如果没有更新任何行，说明卡片不存在
      if (changes === 0) {
        return res.status(404).json({error: '卡片不存在'});
      }
      
      // 删除旧的标签关联
      db.run('DELETE FROM card_tags WHERE card_id=?', [id], (err) => {
        if (err) return res.status(500).json({error: err.message});
        
        // 处理标签关联的函数
        const finishUpdate = () => {
          // 查询更新后的卡片数据返回给前端
          db.get('SELECT * FROM cards WHERE id=?', [id], (err, card) => {
            if (err) return res.status(500).json({error: err.message});
            if (!card) return res.status(404).json({error: '卡片不存在'});
            
            triggerDebouncedBackup(); // 触发自动备份和SSE广播
            res.json({ 
              success: true,
              changed: changes,
              card: card
            });
          });
        };
        
        // 如果有新标签，添加关联
        if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
          const values = tagIds.map(tagId => `(${id}, ${tagId})`).join(',');
          db.run(`INSERT INTO card_tags (card_id, tag_id) VALUES ${values}`, (err) => {
            if (err) return res.status(500).json({error: err.message});
            finishUpdate();
          });
        } else {
          finishUpdate();
        }
      });
    }
  );
});

router.delete('/:id', auth, (req, res) => {
  const cardId = req.params.id;
  const userId = getUserFromToken(req);
  
  // 使用事务确保数据一致性
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // 先删除关联的标签
      db.run('DELETE FROM card_tags WHERE card_id=?', [cardId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: '删除标签关联失败: ' + err.message });
        }
        
        // 再删除卡片（确保用户只能删除自己的卡片）
        let deleteQuery = 'DELETE FROM cards WHERE id=?';
        let deleteParams = [cardId];
        
        if (userId) {
          deleteQuery += ' AND user_id = ?';
          deleteParams.push(userId);
        } else {
          deleteQuery += ' AND user_id IS NULL';
        }
        
        db.run(deleteQuery, deleteParams, function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: '删除卡片失败: ' + err.message });
          }
          
          const deletedCount = this.changes;
          
          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ error: '提交事务失败: ' + err.message });
            }
            
            triggerDebouncedBackup(); // 触发自动备份和SSE广播
            res.json({ 
              success: true,
              deleted: deletedCount
            });
          });
        });
      });
    });
  });
});

// 检测重复卡片
router.get('/detect-duplicates/all', auth, (req, res) => {
  db.all('SELECT * FROM cards ORDER BY id', [], (err, cards) => {
    if (err) return res.status(500).json({error: err.message});
    
    const duplicateGroups = detectDuplicates(cards);
    
    res.json({
      total: cards.length,
      duplicateGroups: duplicateGroups,
      duplicateCount: duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0)
    });
  });
});

// 记录卡片点击（用于频率排序）
router.post('/:id/click', (req, res) => {
  const cardId = req.params.id;
  const userId = getUserFromToken(req);
  
  let updateQuery = 'UPDATE cards SET click_count = COALESCE(click_count, 0) + 1 WHERE id = ?';
  let updateParams = [cardId];
  
  if (userId) {
    updateQuery += ' AND user_id = ?';
    updateParams.push(userId);
  } else {
    updateQuery += ' AND user_id IS NULL';
  }
  
  db.run(updateQuery, updateParams, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: '卡片不存在' });
      res.json({ success: true });
    }
  );
});

// 批量删除重复卡片
router.post('/remove-duplicates', auth, (req, res) => {
  const { cardIds } = req.body;
  
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return res.status(400).json({ error: '无效的请求数据' });
  }
  
  const placeholders = cardIds.map(() => '?').join(',');
  
  // 使用事务确保数据一致性
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // 先删除关联的标签（防止外键约束问题）
      db.run(`DELETE FROM card_tags WHERE card_id IN (${placeholders})`, cardIds, (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: '删除标签关联失败: ' + err.message });
        }
        
        // 再删除卡片
        db.run(`DELETE FROM cards WHERE id IN (${placeholders})`, cardIds, function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: '删除卡片失败: ' + err.message });
          }
          
          const deletedCount = this.changes;
          
          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ error: '提交事务失败: ' + err.message });
            }
            
            triggerDebouncedBackup();
            res.json({ 
              success: true,
              deleted: deletedCount,
              message: `成功删除 ${deletedCount} 张卡片`
            });
          });
        });
      });
    });
  });
});

router.get('/user-settings/sort', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['user_sort_type'], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ sortType: row?.value || 'default' });
  });
});

router.post('/user-settings/sort', (req, res) => {
  const { sortType } = req.body;
  if (!sortType) {
    return res.status(400).json({ error: '排序类型不能为空' });
  }
  
  db.run(
    'REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    ['user_sort_type', sortType],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
