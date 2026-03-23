/**
 * 测试报告组件
 * 在测试完成或失败时显示详细报告
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Config, TestProgress } from '../types.js';

interface TestReportProps {
  config: Config;
  progress: TestProgress;
  startTime: Date;
  endTime: Date;
}

export const TestReport: React.FC<TestReportProps> = ({
  config,
  progress,
  startTime,
  endTime
}) => {
  const { results } = progress;
  const totalDuration = (endTime.getTime() - startTime.getTime()) / 1000;

  // 统计信息
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const successRate = results.length > 0
    ? ((successCount / results.length) * 100).toFixed(1)
    : '0.0';

  // 最大成功 tokens
  const maxSuccess = progress.maxSuccessfulInputTokens || 0;

  // 总响应时间
  const totalResponseTime = results.reduce((sum, r) =>
    sum + (r.responseTime || 0), 0
  );

  // 平均响应时间
  const avgResponseTime = results.length > 0
    ? (totalResponseTime / results.length).toFixed(2)
    : '0.00';

  return (
    <Box flexDirection="column" padding={1}>
      {/* 报告标题 */}
      <Box
        borderStyle="double"
        borderColor={progress.phase === 'completed' ? 'green' : 'red'}
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color={progress.phase === 'completed' ? 'green' : 'red'}>
          {progress.phase === 'completed' ? '✓ 测试报告' : '✗ 测试报告（测试中断）'}
        </Text>
      </Box>

      {/* 测试配置 */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">测试配置</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>
            <Text color="gray">提供商: </Text>
            <Text color="yellow">{config.provider.toUpperCase()}</Text>
          </Text>
          <Text>
            <Text color="gray">模型: </Text>
            <Text color="green">{config.model}</Text>
          </Text>
          <Text>
            <Text color="gray">Endpoint: </Text>
            <Text dimColor>{config.endpoint}</Text>
          </Text>
          <Text>
            <Text color="gray">测试方法: </Text>
            <Text>指数探测 + 精细化指数查找</Text>
          </Text>
          <Text>
            <Text color="gray">Token 范围: </Text>
            <Text>{config.minTokens.toLocaleString()} - {config.maxTokens.toLocaleString()}</Text>
          </Text>
        </Box>
      </Box>

      {/* 测试结果摘要 */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">测试结果摘要</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>
            <Text color="gray">最大成功: </Text>
            <Text bold color="green">{maxSuccess.toLocaleString()}</Text>
            <Text color="gray"> input</Text>
          </Text>
          <Text>
            <Text color="gray">总测试次数: </Text>
            <Text>{results.length}</Text>
          </Text>
          <Text>
            <Text color="gray">成功次数: </Text>
            <Text color="green">{successCount}</Text>
          </Text>
          <Text>
            <Text color="gray">失败次数: </Text>
            <Text color="red">{failCount}</Text>
          </Text>
          <Text>
            <Text color="gray">成功率: </Text>
            <Text color={parseFloat(successRate) >= 50 ? 'green' : 'yellow'}>
              {successRate}%
            </Text>
          </Text>
          <Text>
            <Text color="gray">总耗时: </Text>
            <Text>{totalDuration.toFixed(2)} 秒</Text>
          </Text>
          <Text>
            <Text color="gray">平均响应时间: </Text>
            <Text>{avgResponseTime} 秒</Text>
          </Text>
        </Box>
      </Box>

      {/* 测试历史记录 */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">测试历史记录</Text>
        <Box marginLeft={2} flexDirection="column">
          {results.length === 0 ? (
            <Text color="gray">无测试记录</Text>
          ) : (
            results.map((result, index) => (
              <Box key={index}>
                <Text color={result.success ? 'green' : 'red'}>
                  {result.success ? '✓' : '✗'}
                </Text>
                <Text> </Text>
                <Text color="gray">#{index + 1}</Text>
                <Text> </Text>
                <Text>
                  {result.inputTokens
                    ? `${result.inputTokens.toLocaleString()} input`
                    : `${result.tokenCount.toLocaleString()} EST`}
                </Text>
                <Text> </Text>
                <Text color="gray">-</Text>
                <Text> </Text>
                <Text dimColor>
                  {result.responseTime?.toFixed(2)}s
                </Text>
                {result.errorMessage && (
                  <>
                    <Text> </Text>
                    <Text color="red" dimColor>
                      ({result.errorMessage})
                    </Text>
                  </>
                )}
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* 失败原因汇总 */}
      {failCount > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">失败原因汇总</Text>
          <Box marginLeft={2} flexDirection="column">
            {Array.from(
              new Set(
                results
                  .filter(r => !r.success && r.errorMessage)
                  .map(r => r.errorMessage!)
              )
            ).map((error, index) => {
              const count = results.filter(
                r => !r.success && r.errorMessage === error
              ).length;
              return (
                <Text key={index}>
                  <Text color="red">• </Text>
                  <Text>{error}</Text>
                  <Text color="gray"> (x{count})</Text>
                </Text>
              );
            })}
          </Box>
        </Box>
      )}

      {/* 底部提示 */}
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray" dimColor>
          {progress.phase === 'completed'
            ? '测试成功完成。按 Ctrl+C 退出'
            : '测试已中断。按 Ctrl+C 退出'}
        </Text>
      </Box>
    </Box>
  );
};

