#!/bin/bash

# Electron + Rollup 完整修复脚本
# 在终端中运行: bash fix-electron.sh

set -e

echo "========================================="
echo "Electron + Rollup 完整修复脚本"
echo "========================================="

# 1. 清理 electron 相关文件
echo ""
echo "[1/6] 清理 electron..."
sudo rm -rf node_modules/electron
sudo rm -rf ~/Library/Caches/electron
sudo rm -rf ~/.cache/electron
echo "✓ 已清理 electron"

# 2. 清理 rollup 相关文件
echo ""
echo "[2/6] 清理 rollup..."
sudo rm -rf node_modules/@rollup/rollup-darwin-arm64
sudo rm -rf node_modules/@rollup/rollup-darwin-x64
sudo rm -rf node_modules/.cache
echo "✓ 已清理 rollup"

# 3. 重新安装所有依赖
echo ""
echo "[3/6] 重新安装依赖..."
sudo rm -rf node_modules package-lock.json
npm install
echo "✓ 依赖安装完成"

# 4. 验证 electron 安装
echo ""
echo "[4/6] 验证 electron..."
echo "Contents 目录:"
ls -la node_modules/electron/dist/Electron.app/Contents/
echo ""
echo "dist 目录大小:"
du -sh node_modules/electron/dist/
echo ""
echo "path.txt 内容:"
cat node_modules/electron/path.txt
echo ""

# 5. 验证 rollup
echo ""
echo "[5/6] 验证 rollup..."
ls -la node_modules/@rollup/rollup-darwin-arm64/ 2>/dev/null || echo "⚠️  rollup-darwin-arm64 不存在"
echo ""

# 6. 测试启动
echo ""
echo "[6/6] 测试启动..."
echo "正在启动 npm run dev（10秒后自动停止）..."
timeout 10 npm run dev || true

echo ""
echo "========================================="
echo "修复完成！"
echo "========================================="
