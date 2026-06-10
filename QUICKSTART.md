# 快速启动指南

## 问题诊断

当前问题是 rollup 安装了 x64 版本，但你的系统是 Apple Silicon (arm64)。

## 解决方案

### 步骤 1: 运行修复脚本

在你的终端中执行：

```bash
cd /Users/2088533031qq.com/ecosystem-no-3
bash fix-rollup-arm64.sh
```

这个脚本会：
1. 清理旧的 node_modules
2. 重新安装所有依赖（确保正确的架构）
3. 验证 rollup-darwin-arm64 已安装
4. 验证 electron 已正确配置

### 步骤 2: 启动应用

修复完成后，运行：

```bash
npm run dev
```

## 验证安装

修复成功后，你应该看到：
- `node_modules/@rollup/rollup-darwin-arm64` 目录存在
- `node_modules/electron/path.txt` 文件存在且内容正确
- 应用正常启动

## 如果仍有问题

1. 确保你有网络连接
2. 尝试清除 npm 缓存：`npm cache clean --force`
3. 重新运行修复脚本
4. 查看 npm 日志：`cat ~/.npm/_logs/*.log`

## 主人交互 UI 功能

应用启动后，你可以测试以下功能：
- 主人模式切换（专注/休息/陪聊/勿扰）
- 角色操作菜单（点击"⋯"按钮）
- 角色对话气泡
- Mini mode 适配

详细验证清单请查看 `VERIFICATION.md`
