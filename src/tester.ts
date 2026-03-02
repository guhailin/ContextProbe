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
  return new Date().toLocaleString('zh-CN', { hour12: false });
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

  /**
   * 判断是否为非正常错误（应中断测试）
   */
  private isNonNormalError(error: any, errorMsg: string): boolean {
    // 上下文超限错误 - 这是正常错误，应该继续测试
    if (/context.*exceed|context.*limit|token.*exceed|maximum.*context|too long/i.test(errorMsg)) {
      return false;
    }
    // 超时错误
    if (error.name === 'AbortError' || errorMsg.includes('abort')) {
      return true;
    }
    // 网络错误
    if (/network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket/i.test(errorMsg)) {
      return true;
    }
    // 认证错误
    if (/401|authentication|unauthorized|api key|invalid key/i.test(errorMsg)) {
      return true;
    }
    // 速率限制
    if (/429|rate limit|too many requests/i.test(errorMsg)) {
      return true;
    }
    // 服务器错误 (5xx)
    if (/5\d{2}|internal error|server error|service unavailable/i.test(errorMsg)) {
      return true;
    }
    // 客户端错误 (4xx，但排除上下文相关错误)
    if (/4\d{2}/.test(errorMsg) && !/context|token|length|maximum|exceed|too long/i.test(errorMsg)) {
      return true;
    }
    // 其他未知错误
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
      this.verboseLog(JSON.stringify(data, null, 2));
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

        // 设置 60 秒超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

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
          nextAction: '最长等待 60 秒'
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

        // 设置 60 秒超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

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
          nextAction: '最长等待 60 秒'
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
        nextAction: '准备下一步测试'
      });

      return {
        tokenCount,
        success: true,
        responseTime: elapsed,
        timestamp: new Date()
      };
    } catch (error: any) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.error(chalk.red(`[${getTimestamp()}] testTokenCount 出错 (耗时: ${elapsed.toFixed(2)}s):`), error);

      const errorMsg = error.message || error.toString();

      // 检测是否为非正常错误（应中断测试）
      if (this.isNonNormalError(error, errorMsg)) {
        this.fatalError = new Error(`API 非正常错误: ${errorMsg}`);
        throw this.fatalError;
      }

      // 超时错误视为非正常错误
      if (error.name === 'AbortError' || errorMsg.includes('abort')) {
        this.fatalError = new Error(`请求超时: ${errorMsg}`);

        this.emitProgress({
          phase: 'error',
          currentTest: testCount,
          totalTests: this.totalTests,
          currentTokens: tokenCount,
          results: [],
          message: `测试中断 - 请求超时`,
          status: 'failed',
          statusDetail: `✗ 请求超时 (60s)，可能是网络问题或服务器无响应`,
          nextAction: '测试已中断'
        });

        console.error(chalk.red(`\n❌ 请求超时，测试中断\n`));
        throw this.fatalError;
      }

      // 上下文超限错误是正常失败，继续测试
      const isContextError = /context|token|length|maximum|exceed|too long/i.test(errorMsg);
      const failReason = isContextError ? '超出上下文限制' : errorMsg;

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
        nextAction: isContextError ? '超出限制，将降低 token 数继续测试' : '遇到错误，将尝试继续'
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
      const result = await this.testTokenCount(mid, testCount);
      log('info', `[${getTimestamp()}] testTokenCount(${mid}) 完成: success=${result.success}, responseTime=${result.responseTime}s`);
      results.push(result);

      if (result.success) {
        lastSuccessful = mid;
        left = mid;
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
      const result = await this.testTokenCount(current, testCount);
      log('info', `[${getTimestamp()}] testTokenCount(${current}) 完成: success=${result.success}, responseTime=${result.responseTime}s`);
      results.push(result);

      if (result.success) {
        maxSuccessful = Math.max(maxSuccessful, current);
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
      this.progressCallback(progress);
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