/**
 * 核心测试器
 * 负责执行上下文长度测试
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { Config, TestResult, TestProgress } from './types.js';
import { TokenCounter } from './token-counter.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// 获取本地时间戳
function getTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
}

// 日志输出到 stderr，避免与 Ink 的 UI 冲突
function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: any[]) {
  const timestamp = getTimestamp();
  const colors = {
    info: chalk.blue,
    warn: chalk.yellow,
    error: chalk.red,
    debug: chalk.gray
  };
  const color = colors[level];
  const prefix = color(`[${timestamp}] [${level.toUpperCase()}]`);

  // 输出到 stderr
  if (args.length > 0) {
    console.error(prefix, message, ...args);
  } else {
    console.error(prefix, message);
  }
}

export class ContextTester {
  private config: Config;
  private tokenCounter: TokenCounter;
  private client: OpenAI | Anthropic | null = null;
  private progressCallback?: (progress: TestProgress) => void;
  private shouldStop = false;
  private totalTests = 0;  // 保存总测试数以供子方法使用
  private fatalError: Error | null = null;  // 存储致命错误信息
  private verbose = false;
  private logStream: fs.WriteStream | null = null;
  private maxSuccessfulInputTokens: number = 0;  // 跟踪最大成功 token 数
  private minFailedInputTokens?: number;  // 跟踪最小失败 token 数

  /**
   * 判断是否为需要重试的错误（超时、连接中断等网络问题）
   */
  private isRetryableError(error: any, errorMsg: string): boolean {
    // 超时错误 - 需要重试
    if (error.name === 'AbortError' || errorMsg.includes('abort')) {
      return true;
    }
    // 网络连接错误 - 需要重试
    if (/network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket|connection|connect/i.test(errorMsg)) {
      return true;
    }
    // 其他错误（包括 4xx、5xx 等）只要接口有响应，都不重试，视为触发上限
    return false;
  }

  /**
   * 判断是否为致命错误（应中断测试）
   */
  private isFatalError(error: any, errorMsg: string): boolean {
    // 认证错误 - 致命错误，中断测试
    if (/401|authentication|unauthorized|api key|invalid key/i.test(errorMsg)) {
      return true;
    }
    // 速率限制 - 致命错误，中断测试
    if (/429|rate limit|too many requests/i.test(errorMsg)) {
      return true;
    }
    // 其他都不是致命错误
    return false;
  }

  constructor(config: Config) {
    this.config = config;
    this.tokenCounter = new TokenCounter(config.provider, config.model);
    this.verbose = config.verbose || false;

    // 如果开启 verbose，创建日志文件
    if (this.verbose) {
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `verbose-${timestamp}.log`);
      this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
      this.verboseLog(`=== Verbose log started at ${getTimestamp()} ===`);
      this.verboseLog(`Provider: ${config.provider}, Model: ${config.model}, Method: ${config.testMethod}`);
      console.error(chalk.cyan(`[Verbose] 日志文件: ${logFile}`));
    }
  }

  /**
   * 写入 verbose 日志到文件
   */
  private verboseLog(message: string): void {
    if (this.logStream) {
      const timestamp = getTimestamp();
      this.logStream.write(`[${timestamp}] ${message}\n`);
    }
  }

  /**
   * 写入 HTTP 请求/响应日志
   */
  private verboseHttpLog(direction: 'REQUEST' | 'RESPONSE', data: any): void {
    if (this.logStream) {
      this.verboseLog(`--- HTTP ${direction} ---`);

      // 对很长的内容进行截断，只显示前后部分
      const jsonStr = JSON.stringify(data, null, 2);
      const maxLength = 2000;
      if (jsonStr.length > maxLength) {
        const half = Math.floor((maxLength - 50) / 2);
        const truncated = jsonStr.slice(0, half) + '\n... [truncated] ...\n' + jsonStr.slice(-half);
        this.verboseLog(truncated);
      } else {
        this.verboseLog(jsonStr);
      }
    }
  }

  /**
   * 设置进度回调
   */
  onProgress(callback: (progress: TestProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * 初始化 API 客户端
   */
  async initialize(): Promise<void> {
    log('info', `[${getTimestamp()}]initialize() 开始`);

    this.emitProgress({
      phase: 'initializing',
      currentTest: 0,
      totalTests: 0,
      currentTokens: 0,
      results: [],
      message: '正在初始化 API 客户端...'
    });

    try {
      log('debug', `[${getTimestamp()}] 配置信息: provider=${this.config.provider}, model=${this.config.model}`);
      log('debug', `[${getTimestamp()}] endpoint=${this.config.endpoint || '默认'}`);
      log('debug', `[${getTimestamp()}] apiKey 长度: ${this.config.apiKey.length} 字符`);

      if (this.config.provider === 'openai') {
        log('warn', `[${getTimestamp()}] 创建 OpenAI 客户端...`);
        this.client = new OpenAI({
          apiKey: this.config.apiKey,
          baseURL: this.config.endpoint || undefined
        });
        log('info', `[${getTimestamp()}] OpenAI 客户端创建成功`);
      } else {
        log('warn', `[${getTimestamp()}] 创建 Anthropic 客户端...`);
        this.client = new Anthropic({
          apiKey: this.config.apiKey,
          baseURL: this.config.endpoint || undefined
        });
        log('info', `[${getTimestamp()}] Anthropic 客户端创建成功`);
      }

      this.emitProgress({
        phase: 'initializing',
        currentTest: 0,
        totalTests: 0,
        currentTokens: 0,
        results: [],
        message: 'API 客户端初始化成功'
      });

      log('info', `[${getTimestamp()}] initialize() 完成`);
    } catch (error) {
      console.error(chalk.red(`[${getTimestamp()}] initialize() 失败:`), error);
      throw new Error(`客户端初始化失败: ${error}`);
    }
  }

  /**
   * 测试指定 token 数量
   * @param tokenCount - 要测试的 token 数量
   * @param testCount - 当前是第几次测试（用于进度显示）
   */
  private async testTokenCount(tokenCount: number, testCount: number): Promise<TestResult> {
    log('info', `[${getTimestamp()}]testTokenCount 开始: tokenCount=${tokenCount}`);

    log('debug', `[${getTimestamp()}] 生成测试文本...`);
    const testText = this.tokenCounter.generateTestText(tokenCount);
    log('debug', `[${getTimestamp()}] 测试文本长度: ${testText.length} 字符`);

    const prompt = `请记住以下文本的开头和结尾：

${testText}

请回答：
1. 文本的第一句话是什么？
2. 文本的最后一句话是什么？
3. 总共有多少个字符？`;

    log('debug', `[${getTimestamp()}] Prompt 长度: ${prompt.length} 字符`);

    const startTime = Date.now();
    log('warn', `[${getTimestamp()}] 准备调用 API... provider=${this.config.provider}, model=${this.config.model}`);

    // 发送请求前更新状态
    this.emitProgress({
      phase: 'testing',
      currentTest: testCount,
      totalTests: this.totalTests,
      currentTokens: tokenCount,
      results: [],
      message: `测试 ${tokenCount.toLocaleString()} tokens`,
      status: 'sending',
      statusDetail: `正在发送请求到 ${this.config.provider} API...`,
      nextAction: '等待 API 响应'
    });

    try {
      let answer: string;

      if (this.config.provider === 'openai') {
        log('warn', `[${getTimestamp()}] 调用 OpenAI API...`);
        const openai = this.client as OpenAI;
        log('warn', `[${getTimestamp()}] 请求 URL: ${this.config.endpoint}/chat/completions`);
        log('warn', `[${getTimestamp()}] 模型: ${this.config.model}`);
        log('debug', `[${getTimestamp()}] OpenAI 客户端已创建，开始创建 chat completion...`);

        // 设置 300 秒（5分钟）超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        // 记录请求日志
        const openaiRequest = {
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100
        };
        this.verboseLog(`[OpenAI] 测试 ${tokenCount} tokens`);
        this.verboseHttpLog('REQUEST', openaiRequest);

        // 更新为等待状态
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: this.totalTests,
          currentTokens: tokenCount,
          results: [],
          message: `测试 ${tokenCount.toLocaleString()} tokens`,
          status: 'waiting',
          statusDetail: `请求已发送，等待 OpenAI API 响应...`,
          nextAction: '最长等待 300 秒'
        });

        const response = await openai.chat.completions.create({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100
        }, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // 记录响应日志
        this.verboseHttpLog('RESPONSE', response);

        log('info', `[${getTimestamp()}] OpenAI API 调用成功`);
        answer = response.choices[0].message.content || '';
      } else {
        log('warn', `[${getTimestamp()}] 调用 Anthropic API...`);
        const anthropic = this.client as Anthropic;
        log('warn', `[${getTimestamp()}] 请求 URL: ${this.config.endpoint}/v1/messages`);
        log('warn', `[${getTimestamp()}] 模型: ${this.config.model}`);
        log('debug', `[${getTimestamp()}] Anthropic 客户端已创建，开始创建 message...`);

        // 设置 300 秒（5分钟）超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        // 记录请求日志
        const anthropicRequest = {
          model: this.config.model,
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }]
        };
        this.verboseLog(`[Anthropic] 测试 ${tokenCount} tokens`);
        this.verboseHttpLog('REQUEST', anthropicRequest);

        // 更新为等待状态
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: this.totalTests,
          currentTokens: tokenCount,
          results: [],
          message: `测试 ${tokenCount.toLocaleString()} tokens`,
          status: 'waiting',
          statusDetail: `请求已发送，等待 Anthropic API 响应...`,
          nextAction: '最长等待 300 秒'
        });

        const response = await anthropic.messages.create({
          model: this.config.model,
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }]
        }, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // 记录响应日志
        this.verboseHttpLog('RESPONSE', response);

        log('info', `[${getTimestamp()}] Anthropic API 调用成功`);
        answer = response.content[0].type === 'text' ? response.content[0].text : '';
      }

      const elapsed = (Date.now() - startTime) / 1000;
      log('info', `[${getTimestamp()}] testTokenCount 成功完成，耗时: ${elapsed.toFixed(2)}s`);

      // 更新最大成功 token 数
      this.maxSuccessfulInputTokens = Math.max(this.maxSuccessfulInputTokens, tokenCount);

      // 更新成功状态
      this.emitProgress({
        phase: 'testing',
        currentTest: testCount,
        totalTests: this.totalTests,
        currentTokens: tokenCount,
        results: [],
        message: `测试 ${tokenCount.toLocaleString()} tokens 成功`,
        status: 'success',
        statusDetail: `✓ API 响应成功，耗时 ${elapsed.toFixed(2)} 秒`,
        nextAction: '准备下一步测试',
        maxSuccessfulInputTokens: this.maxSuccessfulInputTokens,
        minFailedInputTokens: this.minFailedInputTokens
      });

      return {
        tokenCount,
        success: true,
        responseTime: elapsed,
        timestamp: new Date()
      };
    } catch (error: any) {
      const elapsed = (Date.now() - startTime) / 1000;

      // 记录失败信息到 verbose 日志
      this.verboseLog(`[FAILED] 测试 ${tokenCount} tokens 失败`);
      this.verboseLog(`错误信息: ${error.message || error.toString()}`);
      if (error.response) {
        this.verboseLog(`响应数据: ${JSON.stringify(error.response, null, 2)}`);
      } else if (error.status) {
        this.verboseLog(`HTTP 状态: ${error.status}`);
        this.verboseLog(`响应内容: ${JSON.stringify(error, null, 2)}`);
      }

      console.error(chalk.red(`[${getTimestamp()}] testTokenCount 出错 (耗时: ${elapsed.toFixed(2)}s):`), error);

      const errorMsg = error.message || error.toString();

      // 检测是否为致命错误（应中断测试）
      if (this.isFatalError(error, errorMsg)) {
        this.fatalError = new Error(`API 致命错误: ${errorMsg}`);

        this.emitProgress({
          phase: 'error',
          currentTest: testCount,
          totalTests: this.totalTests,
          currentTokens: tokenCount,
          results: [],
          message: `测试中断 - 致命错误`,
          status: 'failed',
          statusDetail: `✗ ${errorMsg}`,
          nextAction: '测试已中断'
        });

        console.error(chalk.red(`\n❌ 致命错误，测试中断: ${errorMsg}\n`));
        throw this.fatalError;
      }

      // 所有其他错误（包括 4xx、5xx）都视为触发上限，继续测试
      const failReason = '超出上下文限制';

      // 更新最小失败 token 数
      if (this.minFailedInputTokens === undefined || tokenCount < this.minFailedInputTokens) {
        this.minFailedInputTokens = tokenCount;
      }

      // 更新失败状态
      this.emitProgress({
        phase: 'testing',
        currentTest: testCount,
        totalTests: this.totalTests,
        currentTokens: tokenCount,
        results: [],
        message: `测试 ${tokenCount.toLocaleString()} tokens 失败`,
        status: 'failed',
        statusDetail: `✗ 失败原因: ${failReason}`,
        nextAction: '超出限制，将降低 token 数继续测试',
        maxSuccessfulInputTokens: this.maxSuccessfulInputTokens,
        minFailedInputTokens: this.minFailedInputTokens
      });

      return {
        tokenCount,
        success: false,
        errorMessage: failReason,
        responseTime: elapsed,
        timestamp: new Date()
      };
    }
  }

  /**
   * 执行二分查找测试
   */
  async runBinarySearch(): Promise<number> {
    log('info', `[${getTimestamp()}]runBinarySearch() 开始`);

    const { minTokens, maxTokens, tolerance } = this.config;
    let left = minTokens;
    let right = maxTokens;
    let lastSuccessful = 0;
    let testCount = 0;
    this.totalTests = Math.ceil(Math.log2((right - left) / tolerance));
    const results: TestResult[] = [];

    log('debug', `[${getTimestamp()}] 二分查找配置: minTokens=${minTokens}, maxTokens=${maxTokens}, tolerance=${tolerance}`);
    log('debug', `[${getTimestamp()}] 预计测试次数: ${this.totalTests}`);

    this.emitProgress({
      phase: 'testing',
      currentTest: testCount,
      totalTests: this.totalTests,
      currentTokens: 0,
      results,
      message: `开始二分查找测试 (范围: ${left.toLocaleString()} - ${right.toLocaleString()} tokens)`
    });

    while (right - left > tolerance && !this.shouldStop) {
      testCount++;
      const mid = Math.floor((left + right) / 2);
      log('warn', `[${getTimestamp()}] 第 ${testCount} 次测试: left=${left}, right=${right}, mid=${mid}`);

      this.emitProgress({
        phase: 'testing',
        currentTest: testCount,
        totalTests: this.totalTests,
        currentTokens: mid,
        results,
        message: `测试 ${mid.toLocaleString()} tokens...`
      });

      log('warn', `[${getTimestamp()}] 调用 testTokenCount(${mid})...`);
      const result = await this.testTokenCountWithRetry(mid, testCount);
      log('info', `[${getTimestamp()}] testTokenCount(${mid}) 完成: success=${result.success}, responseTime=${result.responseTime}s`);
      results.push(result);

      if (result.success) {
        lastSuccessful = mid;
        left = mid;
        // 更新全局最大成功 token 数
        this.maxSuccessfulInputTokens = Math.max(this.maxSuccessfulInputTokens, mid);
        const nextMid = Math.floor((left + right) / 2);
        log('info', `[${getTimestamp()}] 测试成功，更新 left=${left}, right=${right}`);
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: this.totalTests,
          currentTokens: mid,
          lastResult: result,
          results,
          message: `✓ ${mid.toLocaleString()} tokens 成功`,
          status: 'next_step',
          statusDetail: `✓ 测试成功，当前最佳: ${mid.toLocaleString()} tokens`,
          nextAction: `下一步测试 ${nextMid.toLocaleString()} tokens (向上搜索)`
        });
      } else {
        right = mid;
        const nextMid = Math.floor((left + right) / 2);
        log('error', `[${getTimestamp()}] 测试失败，更新 right=${right}, left=${left}`);
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: this.totalTests,
          currentTokens: mid,
          lastResult: result,
          results,
          message: `✗ ${mid.toLocaleString()} tokens 失败`,
          status: 'next_step',
          statusDetail: `✗ 测试失败，${result.errorMessage || '超出限制'}`,
          nextAction: `下一步测试 ${nextMid.toLocaleString()} tokens (向下搜索)`
        });
      }

      // 避免请求过快
      log('debug', `[${getTimestamp()}] 等待 500ms...`);
      await this.sleep(500);
      log('debug', `[${getTimestamp()}] 等待结束，继续下一次测试`);
    }

    const finalResult = lastSuccessful > 0 ? lastSuccessful : left;
    log('info', `[${getTimestamp()}] runBinarySearch() 完成，最终结果: ${finalResult}`);

    this.emitProgress({
      phase: 'completed',
      currentTest: testCount,
      totalTests: this.totalTests,
      currentTokens: finalResult,
      results,
      message: `测试完成！上下文限制: ${finalResult.toLocaleString()} tokens`
    });

    return finalResult;
  }

  /**
   * 执行逐步测试
   */
  async runStepTest(): Promise<number> {
    log('info', `[${getTimestamp()}]runStepTest() 开始`);

    const { minTokens, maxTokens } = this.config;
    const step = this.config.step || 5000;
    const results: TestResult[] = [];
    let current = minTokens;
    let maxSuccessful = 0;
    let testCount = 0;

    this.totalTests = Math.ceil((maxTokens - minTokens) / step);
    log('debug', `[${getTimestamp()}] 逐步测试配置: minTokens=${minTokens}, maxTokens=${maxTokens}, step=${step}`);
    log('debug', `[${getTimestamp()}] 预计测试次数: ${this.totalTests}`);

    this.emitProgress({
      phase: 'testing',
      currentTest: testCount,
      totalTests: this.totalTests,
      currentTokens: minTokens,
      results,
      message: `开始逐步测试 (步长: ${step.toLocaleString()} tokens)`
    });

    while (current <= maxTokens && !this.shouldStop) {
      testCount++;
      log('warn', `\n[${getTimestamp()}] ========== 第 ${testCount} 次测试: current=${current} ==========`);

      this.emitProgress({
        phase: 'testing',
        currentTest: testCount,
        totalTests: this.totalTests,
        currentTokens: current,
        results,
        message: `测试 ${current.toLocaleString()} tokens...`
      });

      log('warn', `[${getTimestamp()}] 调用 testTokenCount(${current})...`);
      const result = await this.testTokenCountWithRetry(current, testCount);
      log('info', `[${getTimestamp()}] testTokenCount(${current}) 完成: success=${result.success}, responseTime=${result.responseTime}s`);
      results.push(result);

      if (result.success) {
        maxSuccessful = Math.max(maxSuccessful, current);
        // 更新全局最大成功 token 数
        this.maxSuccessfulInputTokens = Math.max(this.maxSuccessfulInputTokens, current);
        const nextTokens = current + step;
        log('info', `[${getTimestamp()}] 测试成功，更新 maxSuccessful=${maxSuccessful}`);
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: this.totalTests,
          currentTokens: current,
          lastResult: result,
          results,
          message: `✓ ${current.toLocaleString()} tokens 成功`,
          status: 'next_step',
          statusDetail: `✓ 测试成功，当前最大: ${maxSuccessful.toLocaleString()} tokens (耗时 ${result.responseTime?.toFixed(2)}s)`,
          nextAction: nextTokens <= maxTokens ? `下一步测试 ${nextTokens.toLocaleString()} tokens` : '即将完成测试'
        });
      } else {
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: this.totalTests,
          currentTokens: current,
          lastResult: result,
          results,
          message: `✗ ${current.toLocaleString()} tokens 失败`,
          status: 'failed',
          statusDetail: `✗ 测试失败，${result.errorMessage || '超出上下文限制'}`,
          nextAction: `测试停止，最大成功值为 ${maxSuccessful.toLocaleString()} tokens`
        });
        break; // 失败后停止
      }

      current += step;
      log('debug', `[${getTimestamp()}] 等待 500ms...`);
      await this.sleep(500);
      log('debug', `[${getTimestamp()}] 等待结束，继续下一次测试`);
    }

    log('info', `[${getTimestamp()}] runStepTest() 完成，最大成功: ${maxSuccessful}`);

    this.emitProgress({
      phase: 'completed',
      currentTest: testCount,
      totalTests: this.totalTests,
      currentTokens: maxSuccessful,
      results,
      message: `测试完成！最大成功: ${maxSuccessful.toLocaleString()} tokens`
    });

    return maxSuccessful;
  }

  /**
   * 带重试的测试方法
   * 当遇到超时或网络连接错误时自动重试3次
   */
  private async testTokenCountWithRetry(tokenCount: number, testCount: number): Promise<TestResult> {
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.testTokenCount(tokenCount, testCount);
      } catch (error: any) {
        lastError = error;
        const errorMsg = error.message || error.toString();

        // 判断是否为重试able错误：超时或网络连接错误
        const shouldRetry = this.isRetryableError(error, errorMsg);

        if (!shouldRetry) {
          throw error; // 非重试able错误，直接抛出
        }

        const errorType = error.name === 'AbortError' || errorMsg.includes('abort') ? '超时' : '连接错误';
        if (attempt < maxRetries) {
          log('warn', `[${getTimestamp()}] 测试 ${tokenCount} tokens 第 ${attempt} 次尝试${errorType}，准备重试...`);
          await this.sleep(1000); // 重试前等待1秒
        }
      }
    }

    // 所有重试都失败了
    log('error', `[${getTimestamp()}] 测试 ${tokenCount} tokens 重试 ${maxRetries} 次后仍然失败`);
    throw lastError;
  }

  /**
   * 执行指数搜索测试（指数探测 + 二分查找）
   */
  async runExponentialSearch(): Promise<number> {
    log('info', `[${getTimestamp()}]runExponentialSearch() 开始`);

    const { minTokens, maxTokens, tolerance } = this.config;
    const results: TestResult[] = [];
    let testCount = 0;

    log('debug', `[${getTimestamp()}] 指数搜索配置: minTokens=${minTokens}, maxTokens=${maxTokens}, tolerance=${tolerance}`);

    this.emitProgress({
      phase: 'testing',
      currentTest: testCount,
      totalTests: 0,
      currentTokens: 0,
      results,
      message: `开始指数探测 (起始: ${minTokens.toLocaleString()} tokens)`
    });

    // 阶段一：指数探测，快速找到失败区间
    let current = minTokens;
    let lastSuccessful = 0;
    let failedAt: number | undefined;

    while (current <= maxTokens && !this.shouldStop) {
      testCount++;
      log('warn', `\n[${getTimestamp()}] ========== [指数探测] 第 ${testCount} 次测试: current=${current} ==========`);

      this.emitProgress({
        phase: 'testing',
        currentTest: testCount,
        totalTests: 0,
        currentTokens: current,
        results,
        message: `[指数探测] 测试 ${current.toLocaleString()} tokens...`
      });

      const result = await this.testTokenCountWithRetry(current, testCount);
      results.push(result);

      if (result.success) {
        lastSuccessful = current;
        this.maxSuccessfulInputTokens = Math.max(this.maxSuccessfulInputTokens, current);
        const nextTokens = current * 2;
        log('info', `[${getTimestamp()}] 指数探测成功，下一步: ${nextTokens}`);
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: 0,
          currentTokens: current,
          lastResult: result,
          results,
          message: `✓ [指数探测] ${current.toLocaleString()} tokens 成功`,
          status: 'next_step',
          statusDetail: `✓ 成功，当前最大: ${lastSuccessful.toLocaleString()} tokens`,
          nextAction: nextTokens <= maxTokens ? `下一步探测 ${nextTokens.toLocaleString()} tokens (x2)` : '已达上限，将进行二分查找',
          maxSuccessfulInputTokens: this.maxSuccessfulInputTokens,
          minFailedInputTokens: this.minFailedInputTokens
        });

        if (nextTokens > maxTokens) {
          // 已达到配置上限，直接用上限值测试一次确认
          if (current < maxTokens) {
            current = maxTokens;
          } else {
            break;
          }
        } else {
          current = nextTokens;
        }
      } else {
        failedAt = current;
        this.minFailedInputTokens = current;
        log('error', `[${getTimestamp()}] 指数探测失败，失败点: ${failedAt}, 最后成功: ${lastSuccessful}`);
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: 0,
          currentTokens: current,
          lastResult: result,
          results,
          message: `✗ [指数探测] ${current.toLocaleString()} tokens 失败`,
          status: 'next_step',
          statusDetail: `✗ 失败，将在 ${lastSuccessful.toLocaleString()} - ${failedAt.toLocaleString()} 之间进行二分查找`,
          nextAction: '进入二分查找阶段',
          maxSuccessfulInputTokens: this.maxSuccessfulInputTokens,
          minFailedInputTokens: this.minFailedInputTokens
        });
        break;
      }

      await this.sleep(500);
    }

    // 如果没有找到失败点（全部成功），直接返回最大成功值
    if (failedAt === undefined || lastSuccessful === 0) {
      log('info', `[${getTimestamp()}] runExponentialSearch() 完成，未找到失败点，最终结果: ${lastSuccessful}`);
      this.emitProgress({
        phase: 'completed',
        currentTest: testCount,
        totalTests: testCount,
        currentTokens: lastSuccessful,
        results,
        message: `测试完成！上下文限制: ${lastSuccessful.toLocaleString()} tokens (全部成功)`
      });
      return lastSuccessful;
    }

    // 阶段二：在 [lastSuccessful, failedAt) 区间进行二分查找
    log('warn', `\n[${getTimestamp()}] ========== 进入二分查找阶段: [${lastSuccessful}, ${failedAt}) ==========`);

    let left = lastSuccessful;
    let right = failedAt;
    const binaryStartTestCount = testCount;
    const estimatedBinaryTests = Math.ceil(Math.log2((right - left) / tolerance));

    this.emitProgress({
      phase: 'testing',
      currentTest: testCount,
      totalTests: testCount + estimatedBinaryTests,
      currentTokens: 0,
      results,
      message: `开始二分查找 (范围: ${left.toLocaleString()} - ${right.toLocaleString()} tokens)`
    });

    while (right - left > tolerance && !this.shouldStop) {
      testCount++;
      const mid = Math.floor((left + right) / 2);
      log('warn', `[${getTimestamp()}] [二分查找] 第 ${testCount} 次测试: left=${left}, right=${right}, mid=${mid}`);

      this.emitProgress({
        phase: 'testing',
        currentTest: testCount,
        totalTests: binaryStartTestCount + estimatedBinaryTests,
        currentTokens: mid,
        results,
        message: `[二分查找] 测试 ${mid.toLocaleString()} tokens...`
      });

      const result = await this.testTokenCountWithRetry(mid, testCount);
      results.push(result);

      if (result.success) {
        lastSuccessful = mid;
        left = mid;
        this.maxSuccessfulInputTokens = Math.max(this.maxSuccessfulInputTokens, mid);
        const nextMid = Math.floor((left + right) / 2);
        log('info', `[${getTimestamp()}] 二分查找成功，更新 left=${left}, right=${right}`);
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: binaryStartTestCount + estimatedBinaryTests,
          currentTokens: mid,
          lastResult: result,
          results,
          message: `✓ [二分] ${mid.toLocaleString()} tokens 成功`,
          status: 'next_step',
          statusDetail: `✓ 成功，当前最佳: ${left.toLocaleString()} tokens`,
          nextAction: right - left > tolerance ? `下一步测试 ${nextMid.toLocaleString()} tokens` : '即将完成',
          maxSuccessfulInputTokens: this.maxSuccessfulInputTokens,
          minFailedInputTokens: this.minFailedInputTokens
        });
      } else {
        right = mid;
        this.minFailedInputTokens = mid;
        const nextMid = Math.floor((left + right) / 2);
        log('error', `[${getTimestamp()}] 二分查找失败，更新 right=${right}, left=${left}`);
        this.emitProgress({
          phase: 'testing',
          currentTest: testCount,
          totalTests: binaryStartTestCount + estimatedBinaryTests,
          currentTokens: mid,
          lastResult: result,
          results,
          message: `✗ [二分] ${mid.toLocaleString()} tokens 失败`,
          status: 'next_step',
          statusDetail: `✗ 失败，${result.errorMessage || '超出限制'}`,
          nextAction: right - left > tolerance ? `下一步测试 ${nextMid.toLocaleString()} tokens` : '即将完成',
          maxSuccessfulInputTokens: this.maxSuccessfulInputTokens,
          minFailedInputTokens: this.minFailedInputTokens
        });
      }

      await this.sleep(500);
    }

    const finalResult = lastSuccessful > 0 ? lastSuccessful : left;
    log('info', `[${getTimestamp()}] runExponentialSearch() 完成，最终结果: ${finalResult}`);

    this.emitProgress({
      phase: 'completed',
      currentTest: testCount,
      totalTests: testCount,
      currentTokens: finalResult,
      results,
      message: `测试完成！上下文限制: ${finalResult.toLocaleString()} tokens`
    });

    return finalResult;
  }

  /**
   * 开始测试
   */
  async start(): Promise<number> {
    log('info', `\n[${getTimestamp()}] ========== start() 开始测试 ==========`);
    log('debug', `[${getTimestamp()}] 测试方法: ${this.config.testMethod}`);
    log('debug', `[${getTimestamp()}] Token 范围: ${this.config.minTokens} - ${this.config.maxTokens}`);

    log('warn', `[${getTimestamp()}] 调用 initialize()...`);
    await this.initialize();
    log('info', `[${getTimestamp()}] initialize() 完成`);

    let result: number;
    if (this.config.testMethod === 'binary') {
      log('warn', `[${getTimestamp()}] 开始二分查找测试...`);
      result = await this.runBinarySearch();
    } else if (this.config.testMethod === 'exponential') {
      log('warn', `[${getTimestamp()}] 开始指数搜索测试...`);
      result = await this.runExponentialSearch();
    } else {
      log('warn', `[${getTimestamp()}] 开始逐步测试...`);
      result = await this.runStepTest();
    }

    log('info', `\n[${getTimestamp()}] ========== start() 测试完成，结果: ${result} ==========\n`);
    return result;
  }

  /**
   * 停止测试
   */
  stop(): void {
    this.shouldStop = true;
  }

  /**
   * 发送进度更新
   */
  private emitProgress(progress: TestProgress): void {
    if (this.progressCallback) {
      // 自动补充 maxSuccessfulInputTokens 和 minFailedInputTokens
      this.progressCallback({
        ...progress,
        maxSuccessfulInputTokens: this.maxSuccessfulInputTokens,
        minFailedInputTokens: this.minFailedInputTokens
      });
    }
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.tokenCounter.dispose();
    this.client = null;
    if (this.logStream) {
      this.verboseLog('=== Verbose log ended ===');
      this.logStream.end();
      this.logStream = null;
    }
  }
}