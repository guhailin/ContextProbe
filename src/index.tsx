// 强制清屏 - 在任何代码执行前清除终端历史输出
process.stdout.write('\x1Bc');
process.stdout.write('\x1B[2J\x1B[3J\x1B[H');

/**
 * 主入口文件
 * 交互式配置 + 测试流程
 * 支持命令行参数: --provider, --endpoint, --api-key, --model, --min-tokens, --max-tokens, --tolerance
 *
 * 默认配置:
 * - minTokens: 10000 (起始探测值)
 * - maxTokens: 1000000 (初始探索上限)
 * - tolerance: 1000 (精度)
 */

import React from 'react';
import { render } from 'ink';
import { select, input, password, number } from '@inquirer/prompts';
import chalk from 'chalk';
import type { Config, Provider } from './types.js';
import { OPENAI_MODELS, ANTHROPIC_MODELS } from './types.js';
import { TestRunner } from './components/TestRunner.js';

/**
 * 解析命令行参数
 */
function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const config: Partial<Config> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--provider':
      case '-p':
        if (nextArg && (nextArg === 'openai' || nextArg === 'anthropic')) {
          config.provider = nextArg;
          i++;
        }
        break;
      case '--endpoint':
      case '-e':
        if (nextArg) {
          config.endpoint = nextArg;
          i++;
        }
        break;
      case '--api-key':
      case '-k':
        if (nextArg) {
          config.apiKey = nextArg;
          i++;
        }
        break;
      case '--model':
      case '-m':
        if (nextArg) {
          config.model = nextArg;
          i++;
        }
        break;
      case '--min-tokens':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.minTokens = Number(nextArg);
          i++;
        }
        break;
      case '--max-tokens':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.maxTokens = Number(nextArg);
          i++;
        }
        break;
      case '--tolerance':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.tolerance = Number(nextArg);
          i++;
        }
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
${chalk.cyan.bold('🚀 模型上下文长度测试工具')}

${chalk.yellow('用法:')}
  npm run dev -- [选项]

${chalk.yellow('选项:')}
  -p, --provider     API 提供商 (openai | anthropic)
  -e, --endpoint    API 端点 (默认: 官方默认)
  -k, --api-key     API 密钥
  -m, --model       模型名称
  --min-tokens      最小 token 数 (默认: 10000，可选)
  --max-tokens      最大 token 数 (默认: 1000000，可选)
  --tolerance       查找精度 (默认: 1000，可选)
  -v, --verbose     输出详细日志到文件 (logs/verbose-{timestamp}.log)
  -h, --help        显示帮助信息

${chalk.gray('注意: 程序会自动探索模型的实际上下文上限')}

${chalk.yellow('示例:')}
  # 使用 OpenAI 测试 (自动探索上限)
  npm run dev -- -p openai -k YOUR_API_KEY -m gpt-4o

  # 使用 Anthropic 测试 (自动探索上限)
  npm run dev -- -p anthropic -k YOUR_API_KEY -m claude-3-5-sonnet-20241022

  # 完全交互模式 (无参数)
  npm run dev
`);
}

/**
 * 检查是否提供了所有必需参数
 */
function hasRequiredArgs(config: Partial<Config>): boolean {
  return !!(config.provider && config.apiKey && config.model);
}

/**
 * 步骤 1: 选择 API 提供商
 */
async function selectProvider(): Promise<Provider> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
  console.log(chalk.gray('步骤 1/3: 选择 API 提供商\n'));
  console.log(chalk.gray('说明: 选择要测试的 API 服务商\n'));
  console.log(chalk.gray('  - OpenAI: 支持 GPT-4、GPT-3.5 等模型及兼容接口\n'));
  console.log(chalk.gray('  - Anthropic: 支持 Claude 3 系列模型\n'));

  const provider = await select({
    message: '请选择 API 提供商',
    choices: [
      {
        name: `${chalk.green('OpenAI')} - GPT-4, GPT-3.5 等`,
        value: 'openai',
        description: '支持 OpenAI 及其兼容接口'
      },
      {
        name: `${chalk.blue('Anthropic')} - Claude 3 系列`,
        value: 'anthropic',
        description: '支持 Anthropic API'
      }
    ]
  });

  return provider as Provider;
}

/**
 * 步骤 2: 输入 Endpoint
 */
async function inputEndpoint(provider: Provider): Promise<string> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
  console.log(chalk.gray('步骤 2/3: 配置 API Endpoint\n'));
  console.log(chalk.gray('说明: API 服务的访问地址\n'));
  console.log(chalk.gray('  - 官方服务: 直接回车使用默认地址\n'));
  console.log(chalk.gray('  - 第三方服务: 输入自定义地址 (如 LocalAI、Ollama 等)\n'));

  const defaultEndpoint = provider === 'openai'
    ? 'https://api.openai.com/v1'
    : 'https://api.anthropic.com';

  console.log(chalk.gray(`默认: ${defaultEndpoint}\n`));

  const endpoint = await input({
    message: 'API Endpoint (留空使用默认)',
    default: defaultEndpoint
  });

  return endpoint;
}

/**
 * 步骤 3: 输入 API Key
 */
async function inputApiKey(): Promise<string> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
  console.log(chalk.gray('步骤 3/3: 输入 API Key\n'));
  console.log(chalk.gray('说明: API 访问密钥，用于身份验证\n'));
  console.log(chalk.gray('  - 从 API 服务商控制台获取\n'));
  console.log(chalk.gray('  - 输入时会被隐藏显示为 * 号\n'));

  const apiKey = await password({
    message: 'API Key',
    mask: '*'
  });

  return apiKey;
}

/**
 * 步骤 4: 选择模型 (简化版，自动探索上限)
 */
async function selectModel(provider: Provider, endpoint: string): Promise<string> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
  console.log(chalk.gray('选择模型\n'));
  console.log(chalk.yellow('💡 程序将自动探索模型的实际上下文上限\n'));

  // 检测是否为官方 endpoint
  const defaultEndpoint = provider === 'openai'
    ? 'https://api.openai.com/v1'
    : 'https://api.anthropic.com';

  const isOfficialEndpoint = endpoint === defaultEndpoint;

  let model: string;

  if (isOfficialEndpoint) {
    // 使用预设模型列表
    const models = provider === 'openai' ? OPENAI_MODELS : ANTHROPIC_MODELS;

    model = await select({
      message: '选择模型',
      choices: models.map(m => ({
        name: `${chalk.yellow(m.name)} - ${chalk.gray(m.description)}`,
        value: m.value,
        description: `官方标称上下文: ${m.maxContext.toLocaleString()} tokens`
      }))
    }) as string;

    const selectedModel = models.find(m => m.value === model)!;
    console.log(chalk.gray(`\n官方标称上下文: ${selectedModel.maxContext.toLocaleString()} tokens`));
    console.log(chalk.gray('程序将自动探索实际可用上限\n'));
  } else {
    // 第三方服务：手动输入模型信息
    console.log(chalk.yellow('⚠️  检测到第三方 API 服务\n'));
    console.log(chalk.gray('需要手动输入模型名称\n'));

    model = await input({
      message: '模型名称',
      default: 'custom-model',
      validate: (value) => {
        if (!value.trim()) {
          return '模型名称不能为空';
        }
        return true;
      }
    });

    console.log(chalk.gray(`\n模型: ${model}`));
    console.log(chalk.gray('程序将自动探索实际可用上限\n'));
  }

  return model;
}

/**
 * 确认配置
 */
async function confirmConfig(config: Config): Promise<boolean> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
  console.log(chalk.gray('配置确认\n'));

  console.log(chalk.white('提供商:    ') + chalk.yellow(config.provider.toUpperCase()));
  console.log(chalk.white('Endpoint:  ') + chalk.green(config.endpoint));
  console.log(chalk.white('模型:      ') + chalk.cyan(config.model));
  console.log(chalk.white('起始值:    ') + chalk.gray(`${config.minTokens.toLocaleString()} tokens`));
  console.log(chalk.white('查找精度:  ') + chalk.gray(`±${config.tolerance.toLocaleString()} tokens`));
  console.log(chalk.yellow('\n💡 程序将自动探索模型的实际上下文上限'));

  console.log();

  const confirm = await select({
    message: '确认开始测试？',
    choices: [
      { name: chalk.green('✓ 开始测试'), value: 'yes' },
      { name: chalk.yellow('↻ 重新配置'), value: 'reconfigure' },
      { name: chalk.red('✗ 退出'), value: 'exit' }
    ]
  });

  return confirm === 'yes';
}

/**
 * 主函数
 */
async function main() {
  // 清屏，清除之前的日志
  console.clear();

  try {
    // 解析命令行参数
    const cliConfig = parseArgs();

    let config: Config;

    // 如果提供了所有必需参数，使用命令行配置
    if (hasRequiredArgs(cliConfig)) {
      const provider = cliConfig.provider!;
      const defaultEndpoint = provider === 'openai'
        ? 'https://api.openai.com/v1'
        : 'https://api.anthropic.com';

      config = {
        provider,
        endpoint: cliConfig.endpoint || defaultEndpoint,
        apiKey: cliConfig.apiKey!,
        model: cliConfig.model!,
        testMethod: 'exponential',
        minTokens: cliConfig.minTokens || 10000,
        maxTokens: cliConfig.maxTokens || 1000000,
        tolerance: cliConfig.tolerance || 1000,
        verbose: cliConfig.verbose
      };

      // 显示配置信息
      console.clear();
      console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
      console.log(chalk.gray('使用命令行配置\n'));
      console.log(chalk.white('提供商:    ') + chalk.yellow(config.provider.toUpperCase()));
      console.log(chalk.white('Endpoint:  ') + chalk.green(config.endpoint));
      console.log(chalk.white('模型:      ') + chalk.cyan(config.model));
      console.log(chalk.white('起始值:    ') + chalk.gray(`${config.minTokens.toLocaleString()} tokens`));
      console.log(chalk.white('查找精度:  ') + chalk.gray(`±${config.tolerance.toLocaleString()} tokens`));
      console.log(chalk.yellow('\n💡 程序将自动探索模型的实际上下文上限'));

      console.log();

      // 确认开始
      const confirm = await select({
        message: '确认开始测试？',
        choices: [
          { name: chalk.green('✓ 开始测试'), value: 'yes' },
          { name: chalk.red('✗ 退出'), value: 'exit' }
        ]
      });

      if (confirm !== 'yes') {
        console.log(chalk.yellow('\n👋 已取消测试\n'));
        process.exit(0);
      }

    } else {
      // 交互式配置流程
      // 步骤 1: 选择提供商
      const provider = await selectProvider();

      // 步骤 2: 输入 Endpoint
      const endpoint = await inputEndpoint(provider);

      // 步骤 3: 输入 API Key
      const apiKey = await inputApiKey();

      // 步骤 4: 选择模型
      const model = await selectModel(provider, endpoint);

      // 构建完整配置（使用默认值）
      config = {
        provider,
        endpoint,
        apiKey,
        model,
        testMethod: 'exponential',
        minTokens: 10000,
        maxTokens: 1000000,
        tolerance: 1000
      };

      // 确认配置
      const shouldStart = await confirmConfig(config);

      if (!shouldStart) {
        console.log(chalk.yellow('\n👋 已取消测试\n'));
        process.exit(0);
      }
    }

    // 开始测试
    console.clear();

    const { waitUntilExit } = render(
      <TestRunner
        config={config}
        onComplete={(result) => {
          console.log(chalk.green.bold(`\n✓ 测试完成！上下文限制: ${result.toLocaleString()} tokens\n`));
        }}
      />
    );

    await waitUntilExit();

  } catch (error: any) {
    if (error.name === 'ExitPromptError') {
      console.log(chalk.yellow('\n\n👋 已退出\n'));
    } else {
      console.error(chalk.red('\n❌ 错误:'), error.message);
      process.exit(1);
    }
  }
}

// 运行主函数
main();