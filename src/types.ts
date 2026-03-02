/**
 * 类型定义文件
 */

// API 提供商类型
export type Provider = 'openai' | 'anthropic';

// 配置信息
export interface Config {
  provider: Provider;
  endpoint: string;
  apiKey: string;
  model: string;
  testMethod: 'binary' | 'step';
  minTokens: number;
  maxTokens: number;
  tolerance: number;
  step?: number;  // 仅 step 方法使用
}

// 测试结果
export interface TestResult {
  tokenCount: number;
  success: boolean;
  errorMessage?: string;
  responseTime?: number;
  timestamp: Date;
}

// 测试进度信息
export interface TestProgress {
  phase: 'initializing' | 'testing' | 'completed' | 'error';
  currentTest: number;
  totalTests: number;
  currentTokens: number;
  lastResult?: TestResult;
  results: TestResult[];
  message: string;
  // 新增状态信息
  status?: 'sending' | 'waiting' | 'success' | 'failed' | 'retrying' | 'next_step';
  statusDetail?: string;  // 详细状态说明
  nextAction?: string;    // 下一步计划
}

// 模型预设
export interface ModelPreset {
  name: string;
  value: string;
  maxContext: number;
  description: string;
}

// OpenAI 模型列表
export const OPENAI_MODELS: ModelPreset[] = [
  {
    name: 'GPT-4 (8K)',
    value: 'gpt-4',
    maxContext: 8192,
    description: '标准 GPT-4 模型'
  },
  {
    name: 'GPT-4 Turbo (128K)',
    value: 'gpt-4-turbo',
    maxContext: 128000,
    description: '长上下文版本'
  },
  {
    name: 'GPT-4o (128K)',
    value: 'gpt-4o',
    maxContext: 128000,
    description: '最新多模态模型'
  },
  {
    name: 'GPT-3.5 Turbo (16K)',
    value: 'gpt-3.5-turbo-16k',
    maxContext: 16384,
    description: '经济实惠'
  }
];

// Anthropic 模型列表
export const ANTHROPIC_MODELS: ModelPreset[] = [
  {
    name: 'Claude 3.5 Sonnet (200K)',
    value: 'claude-3-5-sonnet-20241022',
    maxContext: 200000,
    description: '最新最强'
  },
  {
    name: 'Claude 3 Opus (200K)',
    value: 'claude-3-opus-20240229',
    maxContext: 200000,
    description: '最强性能'
  },
  {
    name: 'Claude 3 Sonnet (200K)',
    value: 'claude-3-sonnet-20240229',
    maxContext: 200000,
    description: '平衡选择'
  },
  {
    name: 'Claude 3 Haiku (200K)',
    value: 'claude-3-haiku-20240307',
    maxContext: 200000,
    description: '快速响应'
  }
];