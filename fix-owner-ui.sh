#!/bin/bash

# ==========================================
# 修复主人交互 UI 问题
# 在终端中运行: bash fix-owner-ui.sh
# ==========================================

set -e

echo "========================================="
echo "修复主人交互 UI 问题"
echo "========================================="

cd /Users/2088533031qq.com/ecosystem-no-3

# 1. 清理 node_modules
echo ""
echo "[1/4] 清理旧文件..."
rm -rf node_modules package-lock.json
echo "✓ 已清理"

# 2. 安装依赖
echo ""
echo "[2/4] 安装依赖..."
ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ npm install
echo "✓ 依赖安装完成"

# 3. 安装 electron 二进制文件
echo ""
echo "[3/4] 安装 electron 二进制文件..."

# 查找缓存中的 zip 文件
ELECTRON_ZIP=$(find ~/Library/Caches/electron -name "electron-*.zip" 2>/dev/null | head -1)

if [ -n "$ELECTRON_ZIP" ]; then
  echo "  找到缓存: $ELECTRON_ZIP"

  # 确保 dist 目录存在
  mkdir -p node_modules/electron/dist

  echo "  正在解压 electron..."
  ditto -xk "$ELECTRON_ZIP" node_modules/electron/dist/

  # 创建 path.txt 文件（不带换行符）
  printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt

  echo "✓ Electron 二进制文件安装完成"
else
  echo "  缓存中没有 zip 文件，重新安装 electron..."
  npm install electron --force --foreground-scripts
fi

# 4. 验证安装
echo ""
echo "[4/4] 验证安装..."
echo "electron path.txt:"
cat node_modules/electron/path.txt
echo ""

echo "electron dist 目录大小:"
du -sh node_modules/electron/dist/
echo ""

echo "rollup 模块:"
ls -la node_modules/@rollup/ 2>&1 || echo "  (需要检查)"
echo ""

echo "========================================="
echo "修复完成！"
echo ""
echo "请运行: npm run dev"
echo "========================================="
