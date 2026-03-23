/**
 * Token 计数器
 * 使用 tiktoken 进行精确的 token 计数
 */

import { encoding_for_model, get_encoding, Tiktoken } from 'tiktoken';
import type { Provider } from './types.js';

export class TokenCounter {
  private encoder: Tiktoken | null = null;
  private provider: Provider;
  private model: string;
  // 修正系数：用于调整预估算法，使其更接近实际 API 返回值
  private correctionFactor: number = 1.0;
  private calibrationSamples: Array<{ estimated: number; actual: number }> = [];

  constructor(provider: Provider, model: string) {
    this.provider = provider;
    this.model = model;
    this.initEncoder();
  }

  private initEncoder(): void {
    try {
      // OpenAI 模型使用特定编码
      if (this.provider === 'openai') {
        try {
          this.encoder = encoding_for_model(this.model as any);
        } catch {
          // 如果模型不支持，使用通用编码
          this.encoder = get_encoding('cl100k_base');
        }
      } else {
        // Anthropic 使用 cl100k_base 编码（近似）
        this.encoder = get_encoding('cl100k_base');
      }
    } catch (error) {
      console.warn('tiktoken 初始化失败，将使用估算方法');
      this.encoder = null;
    }
  }

  /**
   * 计算文本的 token 数量
   */
  count(text: string): number {
    if (this.encoder) {
      try {
        return this.encoder.encode(text).length;
      } catch (error) {
        // 编码失败，使用估算
      }
    }

    // Fallback: 粗略估算
    // 英文约 4 字符 = 1 token
    // 中文约 1.5 字符 = 1 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 生成指定 token 数量的测试文本
   * 使用粗略估算，不依赖精确的 token 计数
   * 实际 token 数由 API 返回
   */
  /**
   * 生成指定 token 数量的测试文本
   * @param targetTokens - 目标 token 数量
   * @param uniqueId - 可选的唯一标识，用于生成不同的内容避免 prompt caching
   */
  generateTestText(targetTokens: number, uniqueId?: string | number): string {
    // 使用 uniqueId 生成不同的基础文本，避免 prompt caching
    const seed = uniqueId !== undefined ? `[${uniqueId}]` : '';
    const repeatUnit = `这是第${seed}12345句话。`;

    // 粗略估算：中文约 1.5 字符 = 1 token
    // repeatUnit 约 8-12 个字符（取决于 seed），估算约 6-8 tokens
    const estimatedUnitTokens = 6 + (seed.length > 0 ? 2 : 0);

    // 应用修正系数来调整生成的文本量
    const adjustedTarget = targetTokens / this.correctionFactor;
    const repeatCount = Math.ceil(adjustedTarget / estimatedUnitTokens);

    // 生成文本，不需要精确裁剪
    return repeatUnit.repeat(repeatCount);
  }

  /**
   * 使用 API 返回的实际 token 数来校准预估算法
   * @param estimatedTokens - 我们预估的 token 数
   * @param actualTokens - API 实际返回的 token 数
   */
  calibrate(estimatedTokens: number, actualTokens: number): void {
    if (estimatedTokens <= 0 || actualTokens <= 0) return;

    // 添加新的校准样本
    this.calibrationSamples.push({ estimated: estimatedTokens, actual: actualTokens });

    // 只保留最近的 10 个样本，避免过度拟合早期数据
    if (this.calibrationSamples.length > 10) {
      this.calibrationSamples.shift();
    }

    // 计算新的修正系数（实际值 / 预估值的平均值）
    const ratios = this.calibrationSamples.map(s => s.actual / s.estimated);
    this.correctionFactor = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  }

  /**
   * 获取当前的修正系数
   */
  getCorrectionFactor(): number {
    return this.correctionFactor;
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this.encoder) {
      this.encoder.free();
      this.encoder = null;
    }
  }
}