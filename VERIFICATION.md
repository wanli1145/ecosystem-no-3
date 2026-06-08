# 主人交互 UI 功能验证清单

## 启动应用
```bash
cd /Users/2088533031qq.com/ecosystem-no-3
bash start.sh
```

## 功能验证

### ✅ 已实现的功能

#### 1. 主人模式切换 (OwnerModeBar)
- [ ] 点击"专注"按钮 → `owner.mode` 变为 `focus`
- [ ] 点击"休息"按钮 → `owner.mode` 变为 `rest`
- [ ] 点击"陪聊"按钮 → `owner.mode` 变为 `chat`
- [ ] 点击"勿扰"按钮 → `owner.mode` 变为 `dnd`

#### 2. 角色操作菜单 (CharacterActionMenu)
- [ ] 点击角色旁的"⋯"按钮 → 显示下拉菜单
- [ ] 点击"咖啡" → 事件日志出现 `OWNER_CARE` 记录
- [ ] 点击"零食" → 事件日志出现 `OWNER_CARE` 记录
- [ ] 点击"摸摸" → 事件日志出现 `OWNER_CARE` 记录
- [ ] 点击"安排学习" → 角色 action 变化，事件日志记录
- [ ] 点击"安排休息" → 角色 action 变化，事件日志记录
- [ ] 点击"安排聊天" → 角色 action 变化，事件日志记录

#### 3. 角色对话气泡 (DialogueBubble)
- [ ] 角色说话时显示对话气泡
- [ ] 对话内容清晰可读
- [ ] 无对话时不显示空气泡

#### 4. Mini Mode 适配
- [ ] 切换到 mini mode 后界面不拥挤
- [ ] CharacterActionMenu 在 mini mode 下隐藏
- [ ] DialogueBubble 在 mini mode 下隐藏
- [ ] 所有组件尺寸正确缩放

## 验收标准

- ✅ 点击主人模式按钮 → WorldState 面板中 `owner.mode` 变化
- ✅ 点击角色旁的 "⋯" → 显示操作菜单
- ✅ 点击咖啡/零食/摸摸 → 事件日志出现 `OWNER_CARE` 记录
- ✅ 点击安排学习/休息/聊天 → 角色 action 变化
- ✅ mini mode 下界面不拥挤

## 如果启动失败

运行修复脚本：
```bash
bash fix-owner-ui.sh
```

然后再次尝试启动：
```bash
bash start.sh
```
