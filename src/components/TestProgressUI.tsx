/**
 * 测试进度 UI 组件
 * 显示测试过程的实时进度
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { TestProgress, Config } from '../types.js';

interface TestProgressUIProps {
  progress: TestProgress;
  config: Config;
}

export const TestProgressUI: React.FC<TestProgressUIProps> = ({ progress, config }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const { phase, currentTest, totalTests, currentTokens, lastResult, message } = progress;

  const renderProgressBar = () => {
    // 如果没有总测试数，显示不确定进度
    if (totalTests === 0) {
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color="gray">[</Text>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text color="gray">]</Text>
            <Text> 计算中...</Text>
          </Text>
        </Box>
      );
    }

    const percent = Math.min((currentTest / totalTests) * 100, 100);
    const filled = Math.floor(percent / 2);
    const empty = 50 - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color="gray">[</Text>
          <Text color="green">{bar}</Text>
          <Text color="gray">]</Text>
          <Text> {percent.toFixed(1)}%</Text>
        </Text>
      </Box>
    );
  };

  // 格式化 token 数字为简化显示（1k, 10k, 1m 等）
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 1)}m`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(tokens % 1000 === 0 ? 0 : 1)}k`;
    }
    return tokens.toString();
  };

  const renderStats = () => {
    const maxSuccessTokens = progress.maxSuccessfulInputTokens;
    const minTokens = config.minTokens;
    // 使用失败的最小 token 数作为动态上限，如果没有失败记录则使用配置的最大值
    const maxTokens = progress.minFailedInputTokens !== undefined
      ? progress.minFailedInputTokens
      : config.maxTokens;

    // 计算进度条百分比
    // 使用当前正在测试的 token 数或最大input token 数（取较大值）
    const getProgressPercent = () => {
      // 如果正在测试中，使用当前测试的 token 数
      const currentTokens = progress.phase === 'testing' && progress.currentTokens > 0
        ? Math.max(progress.currentTokens, maxSuccessTokens || 0)
        : (maxSuccessTokens || 0);

      if (currentTokens <= 0) return 0;
      const range = maxTokens - minTokens;
      const current = currentTokens - minTokens;
      return Math.min(Math.max((current / range) * 100, 0), 100);
    };

    const percent = getProgressPercent();
    const barWidth = 30;
    const filled = Math.floor((percent / 100) * barWidth);
    const empty = barWidth - filled;
    const progressBar = '█'.repeat(filled) + '░'.repeat(empty);

    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold color="cyan">测试统计</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Box width={20}>
              <Text color="gray">最大input token:</Text>
            </Box>
            {maxSuccessTokens !== undefined && maxSuccessTokens !== null && maxSuccessTokens > 0 ? (
              <Text bold color="green">{maxSuccessTokens.toLocaleString()} input</Text>
            ) : (
              <Text color="gray" italic>暂无成功记录</Text>
            )}
          </Box>
          {maxSuccessTokens !== undefined && maxSuccessTokens !== null && maxSuccessTokens > 0 && (
            <Box marginTop={1}>
              <Text color="gray">{formatTokens(minTokens)} [</Text>
              <Text color="green">{progressBar}</Text>
              <Text color="gray">] {formatTokens(maxTokens)}</Text>
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Box width={20}>
            <Text color="gray">已用时间:</Text>
          </Box>
          <Text>{formatTime(elapsed)}</Text>
        </Box>
        {lastResult && (
          <Box>
            <Box width={20}>
              <Text color="gray">响应时间:</Text>
            </Box>
            <Text color="magenta">{lastResult.responseTime?.toFixed(2)}s</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderStatusIcon = () => {
    if (phase === 'completed') {
      return <Text color="green">✓</Text>;
    } else if (phase === 'error') {
      return <Text color="red">✗</Text>;
    } else {
      return (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      );
    }
  };

  return (
    <Box flexDirection="column">
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="cyan" inverse>
          {' '}测试进度{' '}
        </Text>
      </Box>

      {/* 当前状态 */}
      <Box>
        {renderStatusIcon()}
        <Text> {message}</Text>
      </Box>

      {/* 统计信息 */}
      {renderStats()}

      {/* 最后一次结果 */}
      {lastResult && (
        <Box marginTop={1}>
          <Text color="gray">上次测试: </Text>
          <Text color={lastResult.success ? 'green' : 'red'}>
            {lastResult.success ? '✓ 成功' : '✗ 失败'}
          </Text>
          {lastResult.inputTokens !== undefined && lastResult.inputTokens !== null && lastResult.inputTokens > 0 && (
            <>
              <Text color="gray"> - </Text>
              <Text bold color="yellow">{lastResult.inputTokens.toLocaleString()}</Text>
              <Text color="gray"> input</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
