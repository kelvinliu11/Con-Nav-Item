/**
 * Server-Sent Events 管理器
 * 用于向所有连接的客户端推送数据版本变更通知
 */

// 存储所有SSE连接
const clients = new Set();

/**
 * 添加SSE客户端连接
 */
function addClient(res) {
  clients.add(res);
  
  // 客户端断开时移除
  res.on('close', () => {
    clients.delete(res);
  });
}

/**
 * 向所有客户端广播数据版本变更
 */
function broadcastVersionChange(version) {
  const message = JSON.stringify({ type: 'version_change', version });
  const data = `data: ${message}\n\n`;
  
  clients.forEach(client => {
    try {
      client.write(data);
      // 确保数据立即发送，不被缓冲
      if (client.flush) client.flush();
    } catch (e) {
      // 写入失败，移除该客户端
      clients.delete(client);
    }
  });
}

/**
 * 获取当前连接数
 */
function getClientCount() {
  return clients.size;
}

module.exports = {
  addClient,
  broadcastVersionChange,
  getClientCount
};
