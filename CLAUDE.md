# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 TypeScript TUI (终端用户界面) 工具，用于测试大语言模型 (LLM) 的最大上下文长度限制。支持 OpenAI 和 Anthropic API，提供二分查找和逐步测试两种测试方法。

## 常用命令

```bash
# 开发模式运行
npm run dev

# 构建生产版本
npm run build

# 运行生产版本
npm start

# 类型检查
npx tsc --noEmit
```

## 架构

### 核心模块

- **`src/index.tsx`** - 主入口，包含交互式配置流程（选择提供商、输入 endpoint/API key、配置测试参数）
- **`src/tester.ts`** - `ContextTester` 类，核心测试逻辑：
  - `runBinarySearch()` - 二分查找测试，O(log n) 复杂度
  - `runStepTest()` - 逐步测试，步长递增
  - 使用回调函数 `onProgress()` 报告测试进度
- **`src/token-counter.ts`** - `TokenCounter` 类，使用 tiktoken 进行精确计数，失败时回退到估算方法（中文 ~1.5 字符/token，英文 ~4 字符/token）
- **`src/types.ts`** - 类型定义和模型预设列表

### UI 组件 (React + Ink)

- **`src/components/TestRunner.tsx`** - 主测试界面容器，管理测试生命周期
- **`src/components/TestProgressUI.tsx`** - 进度显示组件（进度条、统计信息、响应时间）

### 数据流

1. 用户通过 Inquirer prompts 交互式输入配置
2. 配置传递给 `TestRunner` 组件
3. `TestRunner` 创建 `ContextTester` 实例并订阅进度回调
4. `ContextTester` 执行测试并触发进度更新
5. UI 响应式更新显示测试状态

## 关键类型

```typescript
interface Config {
  provider: 'openai' | 'anthropic';
  endpoint: string;
  apiKey: string;
  model: string;
  testMethod: 'binary' | 'step';
  minTokens: number;
  maxTokens: number;
  tolerance: number;
  step?: number;  // 仅 step 方法使用
}
```

## 注意事项

- 项目使用 ES Modules (`"type": "module"` in package.json)，import 语句需要 `.js` 扩展名
- tiktoken 是 WASM 模块，初始化可能失败，需要处理回退逻辑
- API 调用间有 500ms 延迟避免速率限制
- 测试会产生实际 API 费用