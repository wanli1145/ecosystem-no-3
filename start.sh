#!/bin/bash

# ==========================================
# 快速启动脚本
# 在终端中运行: bash start.sh
# ==========================================

set -e

echo "========================================="
echo "启动生态圈三号"
echo "========================================="

cd /Users/2088533031qq.com/ecosystem-no-3

# 验证关键文件
echo ""
echo "[1/3] 验证配置..."
if [ ! -f "node_modules/electron/path.txt" ]; then
  echo "❌ Electron 未安装，请先运行: bash fix-owner-ui.sh"
  exit 1
fi

if [ ! -d "node_modules/@rollup/rollup-darwin-arm64" ]; then
  echo "❌ Rollup 未安装，请先运行: bash fix-owner-ui.sh"
  exit 1
fi

echo "✓ 配置正确"

# 清理旧的构建产物
echo ""
echo "[2/3] 清理旧文件..."
rm -rf out/
echo "✓ 已清理"

# 启动开发服务器
echo ""
echo "[3/3] 启动应用..."
echo ""
echo "正在启动，请稍候..."
npm run dev
