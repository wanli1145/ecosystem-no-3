#!/bin/bash

# ==========================================
# 完整修复脚本 - 修复 rollup 架构问题
# 在终端中运行: bash fix-rollup-arm64.sh
# ==========================================

set -e

echo "========================================="
echo "修复 rollup arm64 架构问题"
echo "========================================="

cd /Users/2088533031qq.com/ecosystem-no-3

# 1. 清理
echo ""
echo "[1/3] 清理旧的 node_modules..."
rm -rf node_modules package-lock.json
echo "✓ 已清理"

# 2. 安装依赖（强制重新解析架构）
echo ""
echo "[2/3] 重新安装依赖..."
echo "  这可能需要几分钟时间..."

# 清理 npm 缓存以确保干净的安装
npm cache clean --force 2>/dev/null || true

# 安装依赖
ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ npm install

# 3. 验证 rollup 架构
echo ""
echo "[3/3] 验证安装..."
echo "检查 @rollup 模块："
ls -la node_modules/@rollup/

echo ""
if [ -d "node_modules/@rollup/rollup-darwin-arm64" ]; then
  echo "✓ rollup-darwin-arm64 已安装"
else
  echo "✗ rollup-darwin-arm64 未找到"
  echo "  尝试手动安装..."
  npm install @rollup/rollup-darwin-arm64 --no-optional
fi

# 4. 检查 electron
echo ""
echo "检查 electron："
if [ -f "node_modules/electron/path.txt" ]; then
  echo "✓ electron path.txt 存在"
  cat node_modules/electron/path.txt
  echo ""
else
  echo "✗ electron path.txt 不存在"
  echo "  从缓存解压..."
  ELECTRON_ZIP=$(find ~/Library/Caches/electron -name "electron-*.zip" 2>/dev/null | head -1)
  if [ -n "$ELECTRON_ZIP" ]; then
    mkdir -p node_modules/electron/dist
    ditto -xk "$ELECTRON_ZIP" node_modules/electron/dist/
    printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
    echo "✓ Electron 已解压"
  fi
fi

echo ""
echo "========================================="
echo "修复完成！"
echo ""
echo "现在可以启动应用："
echo "  npm run dev"
echo "========================================="
