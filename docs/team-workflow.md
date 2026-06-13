# 生态圈三号协作规范

## 1. 项目说明

本项目采用 `Electron + Vite + React + TypeScript`，核心架构是 `MVU`：

- `WorldState` 保存世界状态
- `WorldEvent` 表示所有状态变化
- `reducer` 统一处理状态更新
- UI 只负责 `dispatch` 事件，不直接改状态

## 2. 仓库地址

```bash
https://github.com/wanli1145/ecosystem-no-3.git
```

## 3. 第一次上手

```bash
git clone https://github.com/wanli1145/ecosystem-no-3.git
cd ecosystem-no-3
npm install
npm run typecheck
npm run dev
```

说明：

- `git clone`：把项目下载到本地
- `cd ecosystem-no-3`：进入项目目录
- `npm install`：安装依赖
- `npm run typecheck`：检查 TypeScript 类型
- `npm run dev`：启动开发环境

## 4. 分支规则

所有人都不要直接改 `main`。

每个人只在自己的分支上开发：

```bash
git checkout -b feature/自己的任务名
```

示例：

- `feature/characters`
- `feature/interactions`
- `feature/weather-docs`

## 5. 提交与 PR

每次改完后：

```bash
npm run typecheck
git status
git add .
git commit -m "说明你做了什么"
git push -u origin feature/自己的任务名
```

然后去 GitHub 点：

- `Compare & pull request`
- 填写标题
- 填写改动说明
- 创建 PR

PR 说明建议包含：

- 改了什么
- 怎么验证
- 有没有碰核心文件

## 6. 不要修改的文件

默认不要动这些核心文件：

```text
src/main/**
src/shared/reducer.ts
src/shared/events.ts
src/shared/types.ts
src/main/llmClient.ts
package.json
electron.vite.config.ts
tsconfig.json
```

如果确实要改，先发给我确认。

## 7. 各自任务边界

### 成员 A：角色与素材

负责：

- 4 个角色的人设
- 角色标签
- 占位素材
- 角色展示视觉

允许主要修改：

```text
src/shared/config/characters.ts
assets/chars/**
src/renderer/App.tsx
src/renderer/styles/app.css
```

### 成员 B：主人交互 UI

负责：

- 主人模式按钮
- 角色操作菜单
- 对话气泡
- 投喂、摸摸、安排学习等交互

允许主要修改：

```text
src/renderer/components/**
src/renderer/App.tsx
src/renderer/styles/app.css
```

### 成员 C：天气 / 状态面板 / 文档

负责：

- 天气规则
- 事件日志面板
- WorldState 面板
- 测试文档
- 演示脚本

允许主要修改：

```text
src/shared/config/weatherRules.ts
src/renderer/components/**
docs/**
src/renderer/App.tsx
```

## 8. 代码协作原则

1. 所有状态变化都走 `dispatch(WorldEvent)`。
2. UI 不直接改 `WorldState`。
3. 不要乱加依赖。
4. 不要改主进程和 reducer。
5. 不要加入责备用户、冷落用户、制造内疚感的文案。
6. 如果发现要改架构，先停下来，发给负责人确认。

## 9. Windows 同学注意

如果在 Windows 上跑项目报错：

1. 先不要改代码
2. 先截图报错
3. 发给负责人确认

## 10. 最后一句

目标不是做复杂，而是先把能跑、能演示、能答辩的 MVP 做出来。（经典ai八股）

