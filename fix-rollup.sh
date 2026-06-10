#!/bin/bash

# 快速修复 rollup 问题
# 在终端中运行: bash fix-rollup.sh

echo "正在修复 rollup..."

# 清理并重装
sudo rm -rf node_modules package-lock.json
npm install

echo "✓ 完成"
echo ""
echo "测试启动:"
npm run dev
