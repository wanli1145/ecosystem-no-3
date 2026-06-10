# 🔧 启动应用的完整指南

## 当前问题

沙箱环境限制了网络访问，导致无法自动修复 rollup arm64 依赖。

## ✅ 你只需要做一件事

在你的**终端**中运行：

```bash
cd /Users/2088533031qq.com/ecosystem-no-3
bash fix-rollup-arm64.sh
```

这个脚本会自动：
1. ✅ 清理旧的 node_modules
2. ✅ 重新安装所有依赖（使用 package-lock.json）
3. ✅ 确保 rollup-darwin-arm64 正确安装
4. ✅ 解压 electron 二进制文件
5. ✅ 验证所有配置

## 启动应用

修复完成后，运行：

```bash
npm run dev
```

## 📋 验证清单

启动后，测试以下功能：

### 主人模式切换
- [ ] 点击"专注" → `owner.mode` 变为 `focus`
- [ ] 点击"休息" → `owner.mode` 变为 `rest`
- [ ] 点击"陪聊" → `owner.mode` 变为 `chat`
- [ ] 点击"勿扰" → `owner.mode` 变为 `dnd`

### 角色操作菜单
- [ ] 点击角色旁的"⋯" → 显示下拉菜单
- [ ] 点击"咖啡"/"零食"/"摸摸" → 事件日志记录
- [ ] 点击"安排学习"/"休息"/"聊天" → 角色 action 变化

### 对话气泡
- [ ] 角色说话时显示对话气泡
- [ ] 无对话时不显示空气泡

### Mini Mode
- [ ] 点击"缩小观察窗" → 界面紧凑但不拥挤
- [ ] CharacterActionMenu 在 mini mode 下隐藏

## 📁 项目文件说明

- **App.tsx** - 主应用组件，已添加三个新组件
- **OwnerModeBar.tsx** - 主人模式按钮组件
- **CharacterActionMenu.tsx** - 角色操作菜单组件
- **DialogueBubble.tsx** - 对话气泡组件
- **app.css** - 所有样式（包含 mini mode 适配）
- **fix-rollup-arm64.sh** - 修复脚本（在终端运行）
- **QUICKSTART.md** - 快速启动指南
- **VERIFICATION.md** - 功能验证清单

## 如果仍有问题

1. 查看修复脚本输出，确认所有步骤都成功
2. 检查 `node_modules/@rollup/rollup-darwin-arm64` 是否存在
3. 检查 `node_modules/electron/path.txt` 是否存在
4. 运行 `npm run typecheck` 验证代码正确性

---

**重要**：请在你的终端中运行上述命令，不要在 Claude 沙箱中运行。
