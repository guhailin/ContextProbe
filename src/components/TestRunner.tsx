/**
 * 主测试界面
 * 完整的测试流程 UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import type { Config, TestProgress } from '../types.js';
import { ContextTester } from '../tester.js';
import { TestProgressUI } from './TestProgressUI.js';
import { TestReport } from './TestReport.js';

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
  const [startTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [showReport, setShowReport] = useState<boolean>(false);

  useEffect(() => {
    const runTest = async () => {
      try {
        const testerInstance = new ContextTester(config);

        testerInstance.onProgress((p) => {
          setProgress(p);

          // 当测试完成或出错时，显示报告
          if (p.phase === 'completed' || p.phase === 'error') {
            setEndTime(new Date());
            setShowReport(true);
          }
        });

        setTester(testerInstance);

        const result = await testerInstance.start();

        // 显示报告后等待用户按 Ctrl+C
        // 不再自动退出
        onComplete(result);

      } catch (err: any) {
        setError(err.message || '未知错误');
        setEndTime(new Date());
        setShowReport(true);
      }
    };

    runTest();
  }, [config]);

  if (error || progress.phase === 'error') {
    // 如果有报告数据，显示报告
    if (showReport && endTime) {
      return <TestReport config={config} progress={progress} startTime={startTime} endTime={endTime} />;
    }

    // 否则显示简单错误信息
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

  // 如果测试完成，显示报告
  if (showReport && endTime && progress.phase === 'completed') {
    return <TestReport config={config} progress={progress} startTime={startTime} endTime={endTime} />;
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
            <Text color="cyan">指数+精细化</Text>
          </Box>
        </Box>
      </Box>

      {/* 进度显示 */}
      <TestProgressUI progress={progress} config={config} />

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