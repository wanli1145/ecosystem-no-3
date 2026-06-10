#\!/bin/bash
cd "$(dirname "$0")"
echo "正在启动生态圈三号..."
echo ""
rm -rf node_modules package-lock.json
echo "正在安装依赖..."
npm install
echo ""
echo "正在配置 Electron..."
ELECTRON_ZIP=$(find ~/Library/Caches/electron -name "electron-*.zip" | head -1)
mkdir -p node_modules/electron/dist
ditto -xk "$ELECTRON_ZIP" node_modules/electron/dist/
printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
echo ""
echo "正在启动应用..."
npm run dev
