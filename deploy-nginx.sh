#!/bin/bash

# 部署脚本 - 将 nginx 配置部署到服务器

set -e

echo "========================================="
echo "导航站 Nginx 部署脚本"
echo "========================================="

# 检查是否提供了域名
if [ -z "$1" ]; then
    echo "错误: 请提供域名"
    echo "用法: $0 <域名> [端口]"
    echo "示例: $0 nav.example.com 3000"
    exit 1
fi

DOMAIN=$1
PORT=${2:-3000}

echo ""
echo "配置信息:"
echo "  域名: $DOMAIN"
echo "  后端端口: $PORT"
echo ""

# 检查 nginx 是否安装
if ! command -v nginx &> /dev/null; then
    echo "错误: nginx 未安装"
    echo "请先安装 nginx: sudo apt install nginx"
    exit 1
fi

# 创建临时配置文件
TEMP_CONF="/tmp/nav-nginx.conf"
sed "s/your-domain.com/$DOMAIN/g" nginx.conf | sed "s/127.0.0.1:3000/127.0.0.1:$PORT/g" > $TEMP_CONF

echo "生成的 nginx 配置:"
cat $TEMP_CONF
echo ""

# 确认部署
read -p "是否部署此配置? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消部署"
    rm -f $TEMP_CONF
    exit 0
fi

# 备份现有配置
if [ -f "/etc/nginx/sites-available/$DOMAIN" ]; then
    echo "备份现有配置..."
    sudo cp "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-available/$DOMAIN.backup.$(date +%Y%m%d_%H%M%S)"
fi

# 部署配置
echo "部署 nginx 配置..."
sudo cp $TEMP_CONF "/etc/nginx/sites-available/$DOMAIN"

# 创建符号链接
if [ ! -L "/etc/nginx/sites-enabled/$DOMAIN" ]; then
    sudo ln -s "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
    echo "创建符号链接: /etc/nginx/sites-enabled/$DOMAIN"
fi

# 测试配置
echo "测试 nginx 配置..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✓ nginx 配置测试通过"
    
    # 重启 nginx
    echo "重启 nginx..."
    sudo systemctl restart nginx
    
    if [ $? -eq 0 ]; then
        echo "✓ nginx 重启成功"
        echo ""
        echo "========================================="
        echo "部署完成！"
        echo "========================================="
        echo "访问地址: http://$DOMAIN"
        echo ""
        echo "如果需要 HTTPS，请:"
        echo "1. 获取 SSL 证书 (使用 certbot)"
        echo "2. 取消 nginx.conf 中 HTTPS 配置的注释"
        echo "3. 重新运行此脚本"
    else
        echo "✗ nginx 重启失败"
        echo "请检查日志: sudo tail -f /var/log/nginx/error.log"
        exit 1
    fi
else
    echo "✗ nginx 配置测试失败"
    echo "请检查配置文件"
    exit 1
fi

# 清理临时文件
rm -f $TEMP_CONF

echo ""
echo "常用命令:"
echo "  查看日志: sudo tail -f /var/log/nginx/nav-error.log"
echo "  重启 nginx: sudo systemctl restart nginx"
echo "  重新加载: sudo systemctl reload nginx"
echo "  测试配置: sudo nginx -t"
