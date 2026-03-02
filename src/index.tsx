/**
 * 主入口文件
 * 交互式配置 + 测试流程
 * 支持命令行参数: --provider, --endpoint, --api-key, --model, --method, --min-tokens, --max-tokens, --tolerance, --step
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
      case '--method':
      case '-t':
        if (nextArg && (nextArg === 'binary' || nextArg === 'step')) {
          config.testMethod = nextArg;
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
      case '--step':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.step = Number(nextArg);
          i++;
        }
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
  -t, --method      测试方法 (binary | step)
  --min-tokens      最小 token 数 (默认: 1000)
  --max-tokens      最大 token 数
  --tolerance       查找精度，仅 binary 模式 (默认: 1000)
  --step            测试步长，仅 step 模式 (默认: 5000)
  -h, --help        显示帮助信息

${chalk.yellow('示例:')}
  # 使用 OpenAI 测试
  npm run dev -- -p openai -k YOUR_API_KEY -m gpt-4o -t binary --max-tokens 128000

  # 使用 Anthropic 测试
  npm run dev -- -p anthropic -k YOUR_API_KEY -m claude-3-5-sonnet-20241022 -t step --max-tokens 200000 --step 10000

  # 完全交互模式 (无参数)
  npm run dev
`);
}

/**
 * 检查是否提供了所有必需参数
 */
function hasRequiredArgs(config: Partial<Config>): boolean {
  return !!(config.provider && config.apiKey && config.model && config.testMethod);
}

/**
 * 步骤 1: 选择 API 提供商
 */
async function selectProvider(): Promise<Provider> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
  console.log(chalk.gray('步骤 1/4: 选择 API 提供商\n'));
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
  console.log(chalk.gray('步骤 2/4: 配置 API Endpoint\n'));
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
  console.log(chalk.gray('步骤 3/4: 输入 API Key\n'));
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
 * 步骤 4: 选择模型和测试方法
 */
async function configureTest(provider: Provider, endpoint: string): Promise<{
  model: string;
  testMethod: 'binary' | 'step';
  minTokens: number;
  maxTokens: number;
  tolerance: number;
}> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
  console.log(chalk.gray('步骤 4/4: 配置测试参数\n'));

  // 检测是否为官方 endpoint
  const defaultEndpoint = provider === 'openai'
    ? 'https://api.openai.com/v1'
    : 'https://api.anthropic.com';

  const isOfficialEndpoint = endpoint === defaultEndpoint;

  let model: string;
  let maxContextLimit: number;

  if (isOfficialEndpoint) {
    // 使用预设模型列表
    const models = provider === 'openai' ? OPENAI_MODELS : ANTHROPIC_MODELS;

    model = await select({
      message: '选择模型',
      choices: models.map(m => ({
        name: `${chalk.yellow(m.name)} - ${chalk.gray(m.description)}`,
        value: m.value,
        description: `最大上下文: ${m.maxContext.toLocaleString()} tokens`
      }))
    }) as string;

    const selectedModel = models.find(m => m.value === model)!;
    maxContextLimit = selectedModel.maxContext;

    console.log(chalk.gray(`\n该模型的官方最大上下文: ${maxContextLimit.toLocaleString()} tokens\n`));
  } else {
    // 第三方服务：手动输入模型信息
    console.log(chalk.yellow('⚠️  检测到第三方 API 服务\n'));
    console.log(chalk.gray('需要手动输入模型信息\n'));

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

    const customMaxContextInput = await input({
      message: '模型的最大上下文限制 (tokens)',
      default: '10,000',
      validate: (value) => {
        const num = parseInt(value.replace(/,/g, ''), 10);
        if (isNaN(num)) {
          return '请输入有效的数字';
        }
        if (num < 512) {
          return '最小值为 512';
        }
        if (num > 2000000) {
          return '最大值为 2,000,000';
        }
        return true;
      }
    });

    maxContextLimit = parseInt(customMaxContextInput.replace(/,/g, ''), 10) || 10000;

    console.log(chalk.gray(`\n模型: ${model}`));
    console.log(chalk.gray(`最大上下文: ${maxContextLimit.toLocaleString()} tokens\n`));
  }

  // 选择测试方法
  const testMethod = await select({
    message: '选择测试方法',
    choices: [
      {
        name: `${chalk.cyan('二分查找')} ${chalk.gray('(推荐)')}`,
        value: 'binary',
        description: '快速定位上下文限制，测试次数少'
      },
      {
        name: chalk.yellow('逐步测试'),
        value: 'step',
        description: '详细的性能分析，测试次数多'
      }
    ]
  }) as 'binary' | 'step';

  // 配置参数
  const minTokens = await number({
    message: '最小 Token 数',
    default: 1_000,
    min: 100
  });

  const maxTokens = await number({
    message: `最大 Token 数 (默认: ${maxContextLimit.toLocaleString()})`,
    default: maxContextLimit,
    min: minTokens || 1_000
  });

  let tolerance = 1_000;
  let step = 5_000;

  if (testMethod === 'binary') {
    tolerance = await number({
      message: '查找精度 (容差)',
      default: 1_000,
      min: 100
    }) || 1_000;
  } else {
    step = await number({
      message: '测试步长',
      default: 5_000,
      min: 100
    }) || 5_000;
  }

  return {
    model,
    testMethod,
    minTokens: minTokens || 1000,
    maxTokens: maxTokens || maxContextLimit,
    tolerance,
    ...(testMethod === 'step' && { step })
  };
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
  console.log(chalk.white('测试方法:  ') + chalk.magenta(config.testMethod === 'binary' ? '二分查找' : '逐步测试'));
  console.log(chalk.white('Token范围: ') + `${config.minTokens.toLocaleString()} - ${config.maxTokens.toLocaleString()}`);

  if (config.testMethod === 'binary') {
    console.log(chalk.white('查找精度:  ') + chalk.gray(`±${config.tolerance.toLocaleString()} tokens`));
  } else {
    console.log(chalk.white('测试步长:  ') + chalk.gray(`${(config as any).step?.toLocaleString() || 5000} tokens`));
  }

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
        testMethod: cliConfig.testMethod!,
        minTokens: cliConfig.minTokens || 1000,
        maxTokens: cliConfig.maxTokens || 128000,
        tolerance: cliConfig.tolerance || 1000,
        step: cliConfig.step
      };

      // 显示配置信息
      console.clear();
      console.log(chalk.cyan.bold('\n🚀 模型上下文长度测试工具\n'));
      console.log(chalk.gray('使用命令行配置\n'));
      console.log(chalk.white('提供商:    ') + chalk.yellow(config.provider.toUpperCase()));
      console.log(chalk.white('Endpoint:  ') + chalk.green(config.endpoint));
      console.log(chalk.white('模型:      ') + chalk.cyan(config.model));
      console.log(chalk.white('测试方法:  ') + chalk.magenta(config.testMethod === 'binary' ? '二分查找' : '逐步测试'));
      console.log(chalk.white('Token范围: ') + `${config.minTokens.toLocaleString()} - ${config.maxTokens.toLocaleString()}`);
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

      // 步骤 4: 配置测试参数
      const testConfig = await configureTest(provider, endpoint);

      // 构建完整配置
      config = {
        provider,
        endpoint,
        apiKey,
        ...testConfig
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