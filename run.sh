#!/bin/bash
# 复制这一行到你的终端运行：

cd /Users/2088533031qq.com/ecosystem-no-3 && rm -rf node_modules package-lock.json && npm install && ELECTRON_ZIP=$(find ~/Library/Caches/electron -name "electron-*.zip" | head -1) && mkdir -p node_modules/electron/dist && ditto -xk "$ELECTRON_ZIP" node_modules/electron/dist/ && printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt && npm run dev
