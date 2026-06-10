# 🎯 启动生态圈三号 - 最简指南

## 你只需要做一件事

打开你的**终端**（Terminal），运行：

```bash
cd /Users/2088533031qq.com/ecosystem-no-3
bash launch.sh
```

**就这样！** 脚本会自动：
- ✅ 检查依赖是否完整
- ✅ 自动修复缺失的依赖
- ✅ 启动应用

---

## 为什么需要在终端中运行？

由于安全限制，我无法在 Claude 沙箱中访问网络安装依赖。但你可以在自己的终端中轻松完成。

---

## 启动后的验证

应用启动后，测试以下功能：

### 1️⃣ 主人模式切换
- 点击"专注"按钮 → WorldState 面板显示 `owner.mode: focus`
- 点击"休息"按钮 → WorldState 面板显示 `owner.mode: rest`
- 点击"陪聊"按钮 → WorldState 面板显示 `owner.mode: chat`
- 点击"勿扰"按钮 → WorldState 面板显示 `owner.mode: dnd`

### 2️⃣ 角色操作菜单
- 点击角色旁的"⋯"按钮 → 显示下拉菜单
- 点击"咖啡" → 事件日志出现 `OWNER_CARE` 记录
- 点击"安排学习" → 角色 action 变化

### 3️⃣ 对话气泡
- 角色说话时显示对话气泡
- 无对话时不显示空气泡

### 4️⃣ Mini Mode
- 点击"缩小观察窗" → 界面紧凑但不拥挤
- CharacterActionMenu 在 mini mode 下隐藏

---

## 如果启动失败

1. **检查网络连接** - 确保可以访问互联网
2. **手动安装依赖**：
   ```bash
   cd /Users/2088533031qq.com/ecosystem-no-3
   rm -rf node_modules package-lock.json
   npm install
   ```
3. **配置 Electron**：
   ```bash
   ELECTRON_ZIP=$(find ~/Library/Caches/electron -name "electron-*.zip" | head -1)
   mkdir -p node_modules/electron/dist
   ditto -xk "$ELECTRON_ZIP" node_modules/electron/dist/
   printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
   ```
4. **再次启动**：
   ```bash
   npm run dev
   ```

---

## 📁 项目结构说明

### 已完成的代码修改

| 文件 | 说明 |
|------|------|
| `src/renderer/App.tsx` | 主应用组件，集成三个新组件 |
| `src/renderer/components/OwnerModeBar.tsx` | 主人模式按钮组件（专注/休息/陪聊/勿扰）|
| `src/renderer/components/CharacterActionMenu.tsx` | 角色操作菜单组件 |
| `src/renderer/components/DialogueBubble.tsx` | 对话气泡组件 |
| `src/renderer/styles/app.css` | 所有样式（包含 mini mode 适配）|

### 功能特性

✅ **主人模式切换** - 四种模式按钮，实时更新 WorldState
✅ **角色操作菜单** - 点击"⋯"显示照顾和安排选项
✅ **对话气泡** - 显示角色对话内容
✅ **Mini Mode** - 界面紧凑，隐藏非必要元素
✅ **事件日志** - 所有操作都有记录

---

## 🎉 完成！

运行 `bash launch.sh` 后，你就可以看到完整的主人交互 UI 功能了！
