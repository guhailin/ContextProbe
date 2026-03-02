/**
 * 主测试界面
 * 完整的测试流程 UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import type { Config, TestProgress } from '../types.js';
import { ContextTester } from '../tester.js';
import { TestProgressUI } from './TestProgressUI.js';

interface TestRunnerProps {
  config: Config;
  onComplete: (result: number) => void;
}

export const TestRunner: React.FC<TestRunnerProps> = ({ config, onComplete }) => {
  const { exit } = useApp();
  const [progress, setProgress] = useState<TestProgress>({
    phase: 'initializing',
    currentTest: 0,
    totalTests: 0,
    currentTokens: 0,
    results: [],
    message: '准备开始测试...'
  });
  const [tester, setTester] = useState<ContextTester | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const runTest = async () => {
      try {
        const testerInstance = new ContextTester(config);

        testerInstance.onProgress((p) => {
          setProgress(p);
        });

        setTester(testerInstance);

        const result = await testerInstance.start();

        // 等待 2 秒后退出
        setTimeout(() => {
          onComplete(result);
          exit();
        }, 2000);

      } catch (err: any) {
        setError(err.message || '未知错误');
        setTimeout(() => exit(), 3000);
      }
    };

    runTest();
  }, [config]);

  if (error || progress.phase === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="bold" borderColor="red" paddingX={1} marginBottom={1}>
          <Text color="red" bold>❌ 测试中断</Text>
        </Box>
        <Text color="red">{error || progress.message}</Text>
        {progress.statusDetail && (
          <Text color="yellow" dimColor>{progress.statusDetail}</Text>
        )}
        <Box marginTop={1}>
          <Text color="gray">请检查网络连接、API Key 或服务状态</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* 配置信息 */}
      <Box marginBottom={1} borderStyle="round" borderColor="blue" paddingX={1}>
        <Box flexDirection="column">
          <Text bold color="blue">测试配置</Text>
          <Box marginTop={1}>
            <Box width={15}>
              <Text color="gray">提供商:</Text>
            </Box>
            <Text color="yellow">{config.provider.toUpperCase()}</Text>
          </Box>
          <Box>
            <Box width={15}>
              <Text color="gray">Endpoint:</Text>
            </Box>
            <Text color="green">{config.endpoint}</Text>
          </Box>
          <Box>
            <Box width={15}>
              <Text color="gray">模型:</Text>
            </Box>
            <Text color="green">{config.model}</Text>
          </Box>
          <Box>
            <Box width={15}>
              <Text color="gray">测试方法:</Text>
            </Box>
            <Text color="cyan">{config.testMethod === 'binary' ? '二分查找' : '逐步测试'}</Text>
          </Box>
          <Box>
            <Box width={15}>
              <Text color="gray">Token 范围:</Text>
            </Box>
            <Text>{config.minTokens.toLocaleString()} - {config.maxTokens.toLocaleString()}</Text>
          </Box>
        </Box>
      </Box>

      {/* 进度显示 */}
      <TestProgressUI progress={progress} />

      {/* 完成提示 */}
      {progress.phase === 'completed' && (
        <Box marginTop={1}>
          <Text color="green" bold>
            ✓ 测试完成！按 Ctrl+C 退出
          </Text>
        </Box>
      )}
    </Box>
  );
};