# AI 协作开发指南

## 项目概述

生态圈三号是一个基于 MVU 架构的 Electron 桌面应用。本文档说明使用 AI 辅助开发时的协作规则，确保团队协作高效且代码质量可控。

---

## 核心架构原则

### MVU 架构

项目采用 Model-View-Update（MVU）架构：

- **Model**（`src/shared/types.ts`）：定义数据结构和类型
- **View**（`src/renderer/`）：React 组件，负责 UI 展示
- **Update**（`src/shared/reducer.ts`）：纯函数，处理状态更新

### 数据流

```
User Action -> dispatch(WorldEvent) -> reducer() -> new WorldState -> View re-render
```

所有状态变化必须通过 `dispatch` 触发 `WorldEvent`，由 `reducer` 处理并返回新的 `WorldState`。

---

## 协作红线

### 绝对禁止修改的文件

1. **`src/main/**`** - Electron 主进程代码
   - 包含窗口管理、IPC 通信、系统交互
   - 修改可能导致应用崩溃或安全问题

2. **`src/shared/reducer.ts`** - 核心状态更新逻辑
   - 包含所有状态变化的纯函数
   - 修改可能破坏状态一致性

3. **`src/shared/events.ts`** - 事件类型定义
   - 定义所有 WorldEvent 的类型
   - 修改需要同步更新 reducer

4. **`package.json`** - 项目配置
   - 不允许添加新依赖
   - 不允许修改构建配置

### 禁止的实践

- ❌ 接入真实天气 API（保持模拟数据）
- ❌ 使用 localStorage 或文件读写（保持无状态）
- ❌ 直接修改 state 对象（必须通过 reducer）
- ❌ 在组件中直接调用 API（必须通过 dispatch）
- ❌ 添加责备、催促、内疚诱导类文案

---

## 允许修改的范围

### 可修改的文件

1. **`src/renderer/App.tsx`**
   - 可以小改 WorldState / EventLog 展示
   - 可以调整布局和交互逻辑

2. **`src/renderer/styles/app.css`**
   - 可以修改日志和状态面板样式
   - 可以调整响应式布局

3. **新建文件（需团队审批）**
   - `src/shared/config/*.ts` - 配置文件
   - `src/renderer/components/*.tsx` - UI 组件
   - `docs/*.md` - 文档

### 新建文件规范

1. **配置文件**（如 `weatherRules.ts`）
   - 使用 TypeScript 类型定义
   - 导出常量或工具函数
   - 不引入外部依赖

2. **UI 组件**（如 `EventLogPanel.tsx`）
   - 使用函数组件和 Hooks
   - 明确 Props 类型定义
   - 保持组件单一职责

3. **文档文件**（如 `test-cases.md`）
   - 使用 Markdown 格式
   - 包含清晰的标题和结构
   - 提供可执行的示例

---

## 状态管理规范

### 添加新的状态字段

1. 在 `src/shared/types.ts` 中定义类型
2. 在 `src/shared/reducer.ts` 的 `initialWorldState` 中添加初始值
3. 更新相关组件以展示新字段

### 添加新的事件类型

1. 在 `src/shared/events.ts` 中添加新的事件类型
2. 在 `src/shared/reducer.ts` 的 `reducer` 函数中添加处理逻辑
3. 确保返回新的 state 对象（不要直接修改）

### 示例：添加新的天气类型

```typescript
// 1. 在 types.ts 中（如果需要）
export type WeatherKind = "sunny" | "rainy" | "cloudy" | "hot" | "cold" | "windy";

// 2. 在 events.ts 中（无需修改，WeatherKind 自动更新）

// 3. 在 reducer.ts 的 applyWeather 中添加处理
function applyWeather(character: CharacterState, kind: WeatherKind): CharacterState {
  const moodByWeather: Record<WeatherKind, CharacterState["mood"]> = {
    // ... 已有规则
    windy: "focused"  // 新增
  };
  // ...
}

// 4. 在 weatherRules.ts 中添加规则
export const weatherRules: Record<WeatherKind, WeatherRule> = {
  // ... 已有规则
  windy: {
    kind: "windy",
    label: "大风",
    moodHint: "清爽、有活力",
    actionBias: "energetic",
    sampleEvents: ["今天风很大，适合放风筝。"]
  }
};
```

---

## 代码审查清单

### 新增代码检查

- [ ] 是否遵循 TypeScript 类型定义？
- [ ] 是否通过 `dispatch` 触发状态变化？
- [ ] 是否避免直接修改 state 对象？
- [ ] 是否添加了必要的注释？
- [ ] 是否保持了代码风格一致？

### 文件修改检查

- [ ] 是否修改了禁止修改的文件？
- [ ] 是否引入了新的外部依赖？
- [ ] 是否破坏了现有的类型定义？
- [ ] 是否影响了其他组件的功能？

### 文档检查

- [ ] 是否提供了清晰的使用说明？
- [ ] 是否包含示例代码？
- [ ] 是否说明了注意事项？

---

## Git 工作流

### 分支命名

- `feature/xxx` - 新功能开发
- `fix/xxx` - 问题修复
- `docs/xxx` - 文档更新
- `refactor/xxx` - 代码重构

### 提交信息格式

```
<类型>(<范围>): <描述>

<详细说明（可选）>

<关联的 Issue（可选）>
```

**类型**：
- `feat`: 新功能
- `fix`: 问题修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例**：
```
feat(components): 添加 EventLogPanel 组件

- 新建 EventLogPanel 组件展示事件日志
- 支持事件类型标签和时间戳显示
- 添加空状态提示

Closes #123
```

---

## AI 辅助开发最佳实践

### 1. 明确需求

在使用 AI 之前，先明确：
- 要实现什么功能？
- 在哪个文件中实现？
- 有什么约束条件？

### 2. 提供上下文

告诉 AI：
- 项目的 MVU 架构
- 现有的类型定义
- 相关的代码片段

### 3. 审查 AI 生成的代码

- 检查是否遵循协作红线
- 验证类型定义是否正确
- 确保没有引入新的依赖
- 测试功能是否正常工作

### 4. 迭代优化

- 如果 AI 生成的代码不符合预期，提供具体的反馈
- 逐步引导 AI 生成符合项目规范的代码
- 保持耐心，AI 需要学习项目的约定

---

## 常见问题

### Q: 可以添加新的 npm 包吗？

**A: 不可以。** 项目禁止添加新的依赖。如果需要新的功能，优先考虑：
- 使用现有的依赖实现
- 询问团队是否有替代方案
- 在文档中记录需求，等待后续版本

### Q: 可以修改 reducer 吗？

**A: 不可以。** reducer 是核心状态管理逻辑，修改可能导致：
- 状态不一致
- 组件渲染错误
- 难以调试的问题

如果需要添加新的状态变化，应该：
- 在 events.ts 中添加新的事件类型
- 在 reducer 中添加对应的处理逻辑（但不要修改现有逻辑）
- 确保返回新的 state 对象

### Q: 可以接入真实的 API 吗？

**A: 不可以。** 项目设计为模拟数据，不接入真实 API。这样做的好处：
- 便于开发和测试
- 不依赖外部服务
- 避免网络问题

如果需要展示 API 集成，可以：
- 使用模拟数据
- 在文档中说明未来如何接入

### Q: AI 生成的代码如何测试？

**A:** 按照以下步骤测试：
1. 运行 `npm run typecheck` 检查类型错误
2. 运行 `npm run dev` 启动应用
3. 手动测试功能是否正常
4. 检查事件日志是否正确记录
5. 验证 WorldState 面板是否实时更新

---

## 联系方式

如有问题或建议，请联系项目负责人或在团队群组中讨论。

**重要提醒**：协作红线是为了保证代码质量和项目稳定性，请务必遵守。
