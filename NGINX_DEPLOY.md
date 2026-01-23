# Nginx 部署指南

本指南介绍如何使用 nginx 部署导航站应用。

## 前置要求

- 已安装 Node.js (v16+)
- 已安装 nginx
- 服务器已配置域名解析
- Node.js 应用已启动（端口 3000）

## 快速部署

### 1. 使用部署脚本（推荐）

```bash
# 给脚本添加执行权限
chmod +x deploy-nginx.sh

# 部署（替换为你的域名）
./deploy-nginx.sh your-domain.com

# 如果使用其他端口
./deploy-nginx.sh your-domain.com 3000
```

### 2. 手动部署

```bash
# 1. 修改 nginx.conf 中的域名
sed -i 's/your-domain.com/your-actual-domain.com/g' nginx.conf

# 2. 复制配置到 nginx
sudo cp nginx.conf /etc/nginx/sites-available/nav

# 3. 创建符号链接
sudo ln -s /etc/nginx/sites-available/nav /etc/nginx/sites-enabled/nav

# 4. 测试配置
sudo nginx -t

# 5. 重启 nginx
sudo systemctl restart nginx
```

## 使用 PM2 管理 Node.js 应用（推荐）

### 安装 PM2

```bash
npm install -g pm2
```

### 启动应用

```bash
# 使用 PM2 启动
pm2 start ecosystem.config.json

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 停止应用
pm2 stop nav-app

# 重启应用
pm2 restart nav-app

# 设置开机自启
pm2 startup
pm2 save
```

## HTTPS 配置（使用 Let's Encrypt）

### 安装 certbot

```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

### 获取证书

```bash
# 自动配置 HTTPS
sudo certbot --nginx -d your-domain.com

# 或手动获取证书
sudo certbot certonly --nginx -d your-domain.com
```

### 更新 nginx.conf

取消 `nginx.conf` 中 HTTPS 配置部分的注释，并修改证书路径：

```nginx
ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
```

### 重启 nginx

```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 配置说明

### nginx.conf 主要配置项

| 配置项 | 说明 | 默认值 |
|---------|------|---------|
| `server_name` | 域名 | your-domain.com |
| `proxy_pass` | 后端地址 | http://127.0.0.1:3000 |
| `client_max_body_size` | 最大请求体大小 | 10M |
| 静态资源缓存 | js/css/图片等 | 7 天 |

### 路由说明

- `/` - 主应用（SPA）
- `/api/*` - API 接口
- `/sw.js` - Service Worker（PWA）
- `/manifest.json` - PWA Manifest

## 常用命令

### Nginx

```bash
# 测试配置
sudo nginx -t

# 重启
sudo systemctl restart nginx

# 重新加载（不中断服务）
sudo systemctl reload nginx

# 查看状态
sudo systemctl status nginx

# 查看错误日志
sudo tail -f /var/log/nginx/nav-error.log

# 查看访问日志
sudo tail -f /var/log/nginx/nav-access.log
```

### Node.js 应用

```bash
# 使用 nohup 启动（当前方式）
nohup node app.js & > cni.log

# 使用 PM2 启动（推荐）
pm2 start ecosystem.config.json

# 停止应用
pkill -f "node app.js"
# 或
pm2 stop nav-app
```

## 故障排查

### 1. 502 Bad Gateway

检查 Node.js 应用是否运行：

```bash
# 检查端口
netstat -tlnp | grep 3000

# 检查进程
ps aux | grep "node app.js"

# 重启应用
pm2 restart nav-app
```

### 2. 404 Not Found

检查 nginx 配置和路由：

```bash
# 检查配置
sudo nginx -t

# 检查符号链接
ls -la /etc/nginx/sites-enabled/
```

### 3. 静态资源 404

检查静态文件目录权限：

```bash
# 检查 public 目录
ls -la public/

# 修改权限
chmod -R 755 public/
```

### 4. HTTPS 证书问题

检查证书有效期：

```bash
sudo certbot certificates

# 续期
sudo certbot renew

# 自动续期（已配置 cron）
sudo certbot renew --dry-run
```

## 性能优化

### 启用 Gzip 压缩

在 `nginx.conf` 的 `http` 块中添加：

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;
```

### 启用缓存

静态资源已配置 7 天缓存，可根据需要调整：

```nginx
expires 30d;  # 改为 30 天
```

## 监控

### PM2 监控

```bash
# 实时监控
pm2 monit

# Web 监控
pm2 web
```

### Nginx 日志

```bash
# 实时查看错误日志
sudo tail -f /var/log/nginx/nav-error.log

# 查看访问统计
sudo awk '{print $1}' /var/log/nginx/nav-access.log | sort | uniq -c | sort -nr | head -10
```

## 安全建议

1. **使用 HTTPS**：始终使用 SSL/TLS 加密
2. **限制访问**：使用防火墙限制端口访问
3. **定期更新**：保持 nginx 和 Node.js 更新
4. **监控日志**：定期检查异常访问
5. **备份配置**：定期备份 nginx 和应用配置

## 相关文件

- `nginx.conf` - Nginx 配置文件
- `deploy-nginx.sh` - 自动部署脚本
- `ecosystem.config.json` - PM2 配置文件
- `app.js` - Node.js 应用入口
- `cni.log` - 应用日志文件

## 支持

如遇问题，请检查：

1. Nginx 错误日志：`/var/log/nginx/nav-error.log`
2. 应用日志：`./cni.log` 或 `pm2 logs`
3. 系统日志：`journalctl -xe`
