#!/bin/bash

# ==========================================
# Electron + Rollup 完整修复脚本（最终版）
# 在终端中运行: bash fix-complete.sh
# ==========================================

echo "========================================="
echo "Electron + Rollup 完整修复脚本"
echo "========================================="

PROJECT_DIR="/Users/2088533031qq.com/ecosystem-no-3"
ELECTRON_VERSION="35.7.5"
ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/"

cd "$PROJECT_DIR"

# 1. 清理所有相关文件
echo ""
echo "[1/7] 清理旧文件..."
rm -rf node_modules package-lock.json
rm -rf ~/.cache/electron
echo "✓ 已清理"

# 2. 安装依赖（包括 electron）
echo ""
echo "[2/7] 安装依赖..."
ELECTRON_MIRROR=$ELECTRON_MIRROR npm install
echo "✓ 依赖安装完成"

# 3. 安装 electron 二进制文件
echo ""
echo "[3/7] 安装 electron 二进制文件..."

# electron 的 postinstall 可能不会正确提取，所以我们手动处理
ELECTRON_ZIP=$(find ~/Library/Caches/electron -name "electron-*.zip" 2>/dev/null | head -1)

if [ -n "$ELECTRON_ZIP" ]; then
  echo "  找到缓存: $ELECTRON_ZIP"

  # 确保 dist 目录存在
  mkdir -p node_modules/electron/dist

  echo "  正在解压 electron..."
  ditto -xk "$ELECTRON_ZIP" node_modules/electron/dist/

  # 创建 path.txt 文件
  echo "Electron.app/Contents/MacOS/Electron" > node_modules/electron/path.txt

  echo "✓ Electron 二进制文件安装完成"
else
  echo "  缓存中没有 zip 文件，尝试重新安装..."
  ELECTRON_MIRROR=$ELECTRON_MIRROR npm install electron --force --foreground-scripts
  echo "✓ 重新安装完成"
fi

# 4. 验证 electron
echo ""
echo "[4/7] 验证 electron..."
echo "Contents 目录:"
ls -la node_modules/electron/dist/Electron.app/Contents/
echo ""
echo "dist 目录大小:"
du -sh node_modules/electron/dist/
echo ""

# 5. 检查 rollup
echo ""
echo "[5/7] 检查 rollup..."
if [ -f "node_modules/@rollup/rollup-darwin-arm64/package.json" ]; then
  echo "✓ rollup-darwin-arm64 已安装"
elif [ -f "node_modules/@rollup/rollup-darwin-x64/package.json" ]; then
  echo "⚠️  rollup-darwin-x64 已安装（需要 arm64 版本）"
  echo "  这可能导致启动失败，需要删除 node_modules 并重新安装"
  echo "  运行: rm -rf node_modules && ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ npm install"
else
  echo "⚠️  rollup native 模块缺失"
  echo "  运行: rm -rf node_modules && ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ npm install"
fi

# 6. 测试启动
echo ""
echo "[6/7] 测试启动..."
echo "正在启动 npm run dev（10秒后自动停止）..."
timeout 10 npm run dev || true

# 7. 总结
echo ""
echo "[7/7] 完成"
echo "========================================="
echo "修复完成！"
echo ""
echo "如果 Electron 窗口正常显示，修复成功！"
echo "如果仍有问题，请运行: npm run dev"
echo "========================================="
