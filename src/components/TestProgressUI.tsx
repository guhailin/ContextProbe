/**
 * 测试进度 UI 组件
 * 显示测试过程的实时进度
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { TestProgress } from '../types.js';

interface TestProgressUIProps {
  progress: TestProgress;
}

export const TestProgressUI: React.FC<TestProgressUIProps> = ({ progress }) => {
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

  const renderStats = () => {
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold color="cyan">测试统计</Text>
        <Box marginTop={1}>
          <Box width={20}>
            <Text color="gray">当前 Tokens:</Text>
          </Box>
          <Text bold color="yellow">{currentTokens.toLocaleString()}</Text>
        </Box>
        <Box>
          <Box width={20}>
            <Text color="gray">测试进度:</Text>
          </Box>
          <Text>{totalTests === 0 ? '准备中...' : `${currentTest} / ${totalTests}`}</Text>
        </Box>
        <Box>
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

      {/* 进度条 */}
      {renderProgressBar()}

      {/* 统计信息 */}
      {renderStats()}

      {/* 最后一次结果 */}
      {lastResult && (
        <Box marginTop={1}>
          <Text color="gray">上次测试: </Text>
          <Text color={lastResult.success ? 'green' : 'red'}>
            {lastResult.success ? '✓ 成功' : '✗ 失败'}
          </Text>
          <Text color="gray"> - {lastResult.tokenCount.toLocaleString()} tokens</Text>
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
