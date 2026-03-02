# 模型上下文长度测试工具 (TUI 版本)

🚀 一个现代化的终端交互式工具，用于测试大语言模型的最大上下文长度限制。

## ✨ 特性

- 🎨 **美观的 TUI 界面** - 基于 Ink (React for CLI) 的现代化终端 UI
- 🔧 **交互式配置** - 分步引导配置，无需手动编辑配置文件
- 🔌 **多提供商支持** - 支持 OpenAI 和 Anthropic API
- 🎯 **智能测试算法** - 二分查找快速定位，逐步测试详细分析
- 📊 **实时进度显示** - 进度条、统计信息、响应时间一目了然
- 🔐 **安全输入** - API Key 使用密码模式输入，保护隐私
- ⚡ **精确 Token 计数** - 使用 tiktoken 进行准确的 token 统计

## 📦 安装

```bash
# 克隆或进入项目目录
cd ts-tui

# 安装依赖
npm install

# 运行开发版本
npm run dev

# 或构建生产版本
npm run build
npm start
```

## 🎮 使用方法

### 启动工具

```bash
npm run dev
```

### 交互式配置流程

#### 步骤 1: 选择 API 提供商

```
🚀 模型上下文长度测试工具

步骤 1/4: 选择 API 提供商

? 请选择 API 提供商
  OpenAI - GPT-4, GPT-3.5 等
  Anthropic - Claude 3 系列
```

#### 步骤 2: 配置 Endpoint

```
步骤 2/4: 配置 API Endpoint

默认: https://api.openai.com/v1

? API Endpoint (留空使用默认)
```

💡 **提示**: 支持自定义 endpoint，可用于测试兼容 OpenAI API 的服务（如 LocalAI、Ollama 等）

#### 步骤 3: 输入 API Key

```
步骤 3/4: 输入 API Key

? API Key ********************************
```

🔒 安全：API Key 会被隐藏显示

#### 步骤 4: 配置测试参数

```
步骤 4/4: 配置测试参数

? 选择模型
  GPT-4 (8K) - 标准 GPT-4 模型
  GPT-4 Turbo (128K) - 长上下文版本
  GPT-4o (128K) - 最新多模态模型
  GPT-3.5 Turbo (16K) - 经济实惠

? 选择测试方法
  二分查找 (推荐)
  逐步测试

该模型的官方最大上下文: 128,000 tokens

? 最小 Token 数 (1000)
? 最大 Token 数 (128000)
? 查找精度 (1000)
```

#### 确认配置

```
配置确认

提供商:    OPENAI
Endpoint:  https://api.openai.com/v1
模型:      gpt-4-turbo
测试方法:  二分查找
Token范围: 1,000 - 128,000
查找精度:  ±1,000 tokens

? 确认开始测试？
  ✓ 开始测试
  ↻ 重新配置
  ✗ 退出
```

### 测试过程展示

```
╭──────────────────────────────────────╮
│ 测试配置                              │
│                                       │
│ 提供商:      OPENAI                   │
│ 模型:        gpt-4-turbo              │
│ 测试方法:    二分查找                  │
│ Token 范围:  1,000 - 128,000          │
╰──────────────────────────────────────╯

 测试进度
 ⠋ 测试 64,500 tokens...

[████████████████████░░░░░░░░░░░░░░░░░░░░] 40.0%

╭──────────────────────────────────────╮
│ 测试统计                              │
│                                       │
│ 当前 Tokens:    64,500                │
│ 测试进度:       4 / 10                │
│ 已用时间:       0:45                  │
│ 响应时间:       3.21s                 │
╰──────────────────────────────────────╯

上次测试: ✓ 成功 - 32,000 tokens
```

## 🧪 测试方法对比

### 二分查找 (推荐)

**优势**:
- ⚡ 快速：只需 8-12 次测试即可定位
- 💰 节省成本：最少 API 调用
- 🎯 高效：对数时间复杂度 O(log n)

**适用场景**:
- 快速了解模型限制
- 成本敏感场景
- 首次测试某模型

### 逐步测试

**优势**:
- 📊 详细：能看到不同长度下的性能
- 📈 全面：了解响应时间变化趋势
- 🎨 直观：完整的测试曲线

**适用场景**:
- 性能分析研究
- 模型行为观察
- 需要详细数据

## ⚙️ 高级配置

### 命令行参数

除了交互式配置，你也可以直接通过命令行传递参数，无需每次手动输入：

```bash
# 查看帮助
npm run dev -- --help
```

#### 参数说明

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--provider` | `-p` | API 提供商 (openai \| anthropic) | 交互式选择 |
| `--endpoint` | `-e` | API 端点 | 官方默认 |
| `--api-key` | `-k` | API 密钥 | 交互式输入 |
| `--model` | `-m` | 模型名称 | 交互式选择 |
| `--method` | `-t` | 测试方法 (binary \| step) | 交互式选择 |
| `--min-tokens` | - | 最小 token 数 | 1000 |
| `--max-tokens` | - | 最大 token 数 | 128000 |
| `--tolerance` | - | 查找精度 (仅 binary 模式) | 1000 |
| `--step` | - | 测试步长 (仅 step 模式) | 5000 |
| `--help` | `-h` | 显示帮助信息 | - |

#### 使用示例

```bash
# OpenAI 二分查找测试
npm run dev -- -p openai -k YOUR_API_KEY -m gpt-4o -t binary --max-tokens 128000

# Anthropic 逐步测试
npm run dev -- -p anthropic -k YOUR_API_KEY -m claude-3-5-sonnet-20241022 -t step --max-tokens 200000 --step 10000

# 使用第三方兼容服务 (如 Ollama)
npm run dev -- -p openai -k ollama -m llama3 -t binary -e http://localhost:11434/v1 --max-tokens 32768

# 仅传递必需参数，其他使用默认值
npm run dev -- -p openai -k YOUR_API_KEY -m gpt-4-turbo

# 交互式模式 (无参数)
npm run dev
```

💡 **提示**: 传入所有必需参数 (`-p`, `-k`, `-m`, `-t`) 时会跳过交互式配置流程，但仍会显示配置确认提示。

### 自定义 Endpoint

支持 OpenAI 兼容的 API 服务：

```bash
# LocalAI
? API Endpoint http://localhost:8080/v1

# Ollama
? API Endpoint http://localhost:11434/v1

# 其他兼容服务
? API Endpoint https://your-service.com/v1
```

### 调整测试参数

```typescript
// 二分查找参数
最小 Token 数: 1000      // 开始测试的大小
最大 Token 数: 128000    // 上限阈值
查找精度: 1000           // 允许的误差范围

// 逐步测试参数
测试步长: 5000           // 每次增加的 token 数
```

## 📊 示例输出

### 测试完成

```
✓ 测试完成！上下文限制: 127,500 tokens

测试统计:
  - 总测试次数: 10
  - 成功次数: 7
  - 失败次数: 3
  - 总耗时: 2:34
  - 平均响应时间: 3.2s
```

## 🔧 技术栈

- **TypeScript** - 类型安全
- **Ink** - React for CLI
- **Inquirer** - 交互式命令行
- **Chalk** - 终端颜色
- **tiktoken** - Token 计数
- **OpenAI SDK** - OpenAI API 客户端
- **Anthropic SDK** - Anthropic API 客户端

## 📁 项目结构

```
ts-tui/
├── src/
│   ├── index.ts              # 主入口
│   ├── types.ts              # 类型定义
│   ├── tester.ts             # 核心测试逻辑
│   ├── token-counter.ts      # Token 计数器
│   └── components/
│       ├── TestProgress.tsx  # 进度显示组件
│       └── TestRunner.tsx    # 测试运行器组件
├── package.json
├── tsconfig.json
└── README.md
```

## 🤝 支持的模型

### OpenAI
- GPT-4 (8K)
- GPT-4 Turbo (128K)
- GPT-4o (128K)
- GPT-3.5 Turbo (16K)

### Anthropic
- Claude 3.5 Sonnet (200K)
- Claude 3 Opus (200K)
- Claude 3 Sonnet (200K)
- Claude 3 Haiku (200K)

## ⚠️ 注意事项

1. **API 成本**: 测试会产生实际的 API 调用费用
2. **速率限制**: 注意各提供商的速率限制
3. **网络稳定**: 确保网络连接稳定
4. **Token 精度**: 中文 token 计数使用估算方法

## 🐛 故障排除

### 问题: tiktoken 初始化失败

```bash
# 重新安装依赖
rm -rf node_modules
npm install
```

### 问题: API 调用失败

检查:
- API Key 是否正确
- Endpoint 是否可访问
- 网络连接是否正常
- 账户余额是否充足

### 问题: 测试卡住

- 按 `Ctrl+C` 终止当前测试
- 检查 API 响应是否超时
- 查看错误日志

## 📝 开发

```bash
# 开发模式（自动重载）
npm run dev

# 构建
npm run build

# 类型检查
npx tsc --noEmit
```

## 📄 许可证

MIT

## 🙏 致谢

- [Ink](https://github.com/vadimdemedes/ink) - React for CLI
- [tiktoken](https://github.com/openai/tiktoken) - OpenAI Tokenizer
- [Inquirer](https://github.com/SBoudrias/Inquirer.js) - Interactive CLI