#!/bin/bash

# ==========================================
# 🚀 一键启动脚本（最终版）
# 在终端中运行: bash launch.sh
# ==========================================

set -e

echo "========================================="
echo "🚀 启动生态圈三号"
echo "========================================="

cd /Users/2088533031qq.com/ecosystem-no-3

# 检查是否需要修复
if [ ! -d "node_modules/@rollup/rollup-darwin-arm64" ] || [ ! -f "node_modules/electron/path.txt" ]; then
  echo ""
  echo "⚠️  检测到依赖不完整，正在修复..."
  echo ""

  # 清理
  rm -rf node_modules package-lock.json

  # 重新安装
  echo "正在安装依赖（可能需要几分钟）..."
  npm install

  # 配置 electron
  if [ ! -f "node_modules/electron/path.txt" ]; then
    ELECTRON_ZIP=$(find ~/Library/Caches/electron -name "electron-*.zip" 2>/dev/null | head -1)
    if [ -n "$ELECTRON_ZIP" ]; then
      mkdir -p node_modules/electron/dist
      ditto -xk "$ELECTRON_ZIP" node_modules/electron/dist/
      printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
      echo "✓ Electron 已配置"
    fi
  fi

  echo "✓ 依赖修复完成"
fi

# 验证
echo ""
echo "[验证] 检查关键依赖..."
if [ -d "node_modules/@rollup/rollup-darwin-arm64" ] && [ -f "node_modules/electron/path.txt" ]; then
  echo "✓ 所有依赖就绪"
else
  echo "❌ 依赖修复失败"
  echo "请手动运行: npm install"
  exit 1
fi

# 启动
echo ""
echo "[启动] 正在启动应用..."
echo "========================================="
npm run dev
