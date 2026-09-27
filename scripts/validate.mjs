#!/usr/bin/env node

/**
 * CLI 入口：数据仓结构、一致性与泄漏扫描验证工具。
 * 用法：
 *   node scripts/validate.mjs [--json]
 */

import { validateRepository } from './lib/validator.mjs';

function formatTextReport(result) {
  const lines = [];
  lines.push('========================================');
  lines.push('         LLM-IQ 数据仓校验报告          ');
  lines.push('========================================');
  lines.push(`扫描文件总数: ${result.summary.scannedFiles}`);
  lines.push(`实际轮次总数: ${result.summary.totalRuns}`);
  lines.push(`日期分区总数: ${result.summary.totalDays}`);
  lines.push(`发现问题总数: ${result.summary.errorsCount}`);
  lines.push('----------------------------------------');

  if (result.valid) {
    lines.push('✅ 所有校验项均已通过：');
    lines.push('  - 根清单 (manifest) 结构及统计一致');
    lines.push('  - 各日分区索引与轮次目录完整对应');
    lines.push('  - 各轮次 run.json 规范与 SVG 文件引用完整');
    lines.push('  - 泄漏安全扫描未发现任何敏感信息');
    lines.push('========================================');
    return lines.join('\n');
  }

  lines.push('❌ 发现以下校验错误：\n');
  const groupedErrors = new Map();
  for (const err of result.errors) {
    const list = groupedErrors.get(err.file) || [];
    list.push(err);
    groupedErrors.set(err.file, list);
  }

  for (const [file, errList] of groupedErrors) {
    lines.push(`📄 [文件] ${file}`);
    for (const err of errList) {
      if (err.type === 'leak') {
        lines.push(`   - [安全泄漏] 命中防护规则: ${err.rule}`);
      } else if (err.type === 'schema') {
        lines.push(`   - [结构规范] ${err.message}`);
      } else if (err.type === 'consistency') {
        lines.push(`   - [一致性]   ${err.message}`);
      } else if (err.type === 'unexpected-file') {
        lines.push(`   - [非法文件] ${err.message}`);
      } else {
        lines.push(`   - [错误]     ${err.message}`);
      }
    }
    lines.push('');
  }

  lines.push('========================================');
  lines.push('校验未通过，请根据上述提示修正数据或清理非法文件。');
  lines.push('========================================');
  return lines.join('\n');
}

function main() {
  const isJson = process.argv.includes('--json');
  const rootDir = process.cwd();
  const result = validateRepository(rootDir);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatTextReport(result));
  }

  if (!result.valid) {
    process.exit(1);
  }
}

main();
