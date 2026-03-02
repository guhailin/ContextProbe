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
   */
  generateTestText(targetTokens: number): string {
    const repeatUnit = '这是第12345句话。';
    const avgCharsPerToken = 3; // 平均每个 token 约 3 个字符（中文）
    const charsNeeded = targetTokens * avgCharsPerToken;

    const repeatCount = Math.ceil(charsNeeded / repeatUnit.length);
    const text = repeatUnit.repeat(repeatCount);

    return text.substring(0, charsNeeded);
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