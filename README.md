# ContextProbe

🚀 一个现代化的终端交互式工具，用于精确探测大语言模型的最大上下文长度限制。

## ✨ 特性

- 🎨 **美观的 TUI 界面** - 基于 Ink (React for CLI) 的现代化终端 UI
- 🔧 **交互式配置** - 分步引导配置，无需手动编辑配置文件
- 🔌 **多提供商支持** - 支持 OpenAI 和 Anthropic API
- 🎯 **智能测试算法** - 指数探测 + 二分查找，快速精确定位上下文限制
- 📊 **实时进度显示** - 进度条、统计信息、响应时间一目了然
- 🔐 **安全输入** - API Key 使用密码模式输入，保护隐私
- ⚡ **精确 Token 计数** - 使用 tiktoken 进行准确的 token 统计
- 📝 **详细日志** - 支持 `--verbose` 模式记录完整 HTTP 请求日志

## 📦 安装

```bash
# 克隆项目
git clone https://github.com/guhailin/ContextProbe.git
cd ContextProbe

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
🚀 ContextProbe - 模型上下文长度测试工具

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

该模型的官方最大上下文: 128,000 tokens

? 最小 Token 数 (10000)
? 最大 Token 数 (1000000)
? 查找精度 (1000)
? 开启详细日志记录到文件 (y/N)
```

#### 确认配置

```
配置确认

提供商:    OPENAI
Endpoint:  https://api.openai.com/v1
模型:      gpt-4-turbo
测试方法:  指数探测 + 二分查找
Token范围: 10,000 - 1,000,000
查找精度:  ±1,000 tokens
详细日志:  否

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
│ 测试方法:    指数探测 + 二分查找       │
│ Token 范围:  10,000 - 1,000,000       │
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

## 🧪 测试算法

### 指数探测 + 二分查找

ContextProbe 使用优化的两步算法来快速精确定位上下文限制：

**第一步：指数探测**
- 从 `minTokens` 开始，按指数增长（×2）快速探测
- 例如：10K → 20K → 40K → 80K → 160K → ...
- 一旦发现失败的 token 数，确定搜索区间

**第二步：二分查找**
- 在探测确定的区间内进行二分查找
- 逐步缩小范围，直到达到指定精度（`tolerance`）

**优势**:
- ⚡ 快速：避免从 0 开始逐个测试
- 💰 节省成本：相比纯二分查找，指数探测更快定位失败区间
- 🎯 高效：结合两种算法的优点

## ⚙️ 高级配置

### 命令行参数

除了交互式配置，你也可以直接通过命令行传递参数：

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
| `--min-tokens` | - | 最小 token 数 | 10000 |
| `--max-tokens` | - | 最大 token 数 | 1000000 |
| `--tolerance` | - | 查找精度 | 1000 |
| `--verbose` | `-v` | 开启详细 HTTP 日志 | false |
| `--help` | `-h` | 显示帮助信息 | - |

#### 使用示例

```bash
# OpenAI 测试
npm run dev -- -p openai -k YOUR_API_KEY -m gpt-4o

# Anthropic 测试
npm run dev -- -p anthropic -k YOUR_API_KEY -m claude-3-5-sonnet-20241022

# 使用第三方兼容服务 (如 Ollama)
npm run dev -- -p openai -k ollama -m llama3 -e http://localhost:11434/v1 --max-tokens 32768

# 开启详细日志
npm run dev -- -p openai -k YOUR_API_KEY -m gpt-4-turbo --verbose

# 仅传递必需参数，其他使用默认值
npm run dev -- -p openai -k YOUR_API_KEY -m gpt-4-turbo

# 交互式模式 (无参数)
npm run dev
```

💡 **提示**: 传入所有必需参数 (`-p`, `-k`, `-m`) 时会跳过交互式配置流程，但仍会显示配置确认提示。

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
// 测试参数
最小 Token 数: 10000     // 开始测试的大小
最大 Token 数: 1000000   // 初始探索上限（指数探测会自动扩展）
查找精度: 1000           // 允许的误差范围
```

### 详细日志模式

使用 `--verbose` 参数开启详细日志记录：

- 完整 HTTP 请求和响应详情
- 自动保存到 `logs/` 目录下的时间戳文件
- 有助于调试 API 问题

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
ContextProbe/
├── src/
│   ├── index.tsx              # 主入口
│   ├── types.ts               # 类型定义
│   ├── tester.ts              # 核心测试逻辑
│   ├── token-counter.ts       # Token 计数器
│   └── components/
│       ├── TestRunner.tsx     # 测试运行器组件
│       ├── TestProgressUI.tsx # 进度显示组件
│       └── TestReport.tsx     # 测试报告组件
├── logs/                      # 日志文件目录
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

1. **API 成本**: 测试会产生实际的 API 调用费用，建议使用指数探测减少调用次数
2. **速率限制**: 注意各提供商的速率限制
3. **网络稳定**: 确保网络连接稳定
4. **Token 精度**: 中文 token 计数使用估算方法（失败时回退到 ~1.5 字符/token）

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
- 使用 `--verbose` 查看详细日志

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
