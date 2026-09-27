#!/usr/bin/env node

/**
 * CLI 入口：确定性重建或校验数据仓索引。
 * 用法：
 *   node scripts/build-index.mjs [--check]
 */

import { syncIndexes } from './lib/indexer.mjs';

function main() {
  const isCheck = process.argv.includes('--check');
  const rootDir = process.cwd();

  const { inSync, diffs, filesWritten } = syncIndexes(rootDir, isCheck);

  if (isCheck) {
    if (inSync) {
      console.log('✅ 所有索引均为最新状态，与 runs/ 目录树完全一致。');
      process.exit(0);
    } else {
      console.error('❌ 索引校验失败，发现以下差异：');
      for (const diff of diffs) {
        console.error(`   - ${diff}`);
      }
      console.error('请运行 `npm run build-index` 重新生成索引。');
      process.exit(1);
    }
  } else {
    console.log(`✅ 索引构建完成，已更新 ${filesWritten.length} 个索引文件：`);
    for (const f of filesWritten) {
      console.log(`   - ${f}`);
    }
  }
}

main();
