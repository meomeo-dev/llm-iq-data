import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateRepository } from '../scripts/lib/validator.mjs';

function createTempRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-iq-repo-'));
  const runsDir = path.join(tmpDir, 'runs', '2026', '09', '27', '20260927T021708Z');
  fs.mkdirSync(runsDir, { recursive: true });

  const fixturesDir = path.resolve('tests/fixtures');
  const sampleManifest = fs.readFileSync(path.join(fixturesDir, 'sample-manifest.json'), 'utf8');
  const sampleDayIndex = fs.readFileSync(path.join(fixturesDir, 'sample-day-index.json'), 'utf8');
  const sampleRun = fs.readFileSync(path.join(fixturesDir, 'sample-run.json'), 'utf8');

  fs.writeFileSync(path.join(tmpDir, 'index.json'), sampleManifest, 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'runs', '2026', '09', '27', 'index.json'), sampleDayIndex, 'utf8');
  fs.writeFileSync(path.join(runsDir, 'run.json'), sampleRun, 'utf8');

  // sampleRun 中 gpt-5-pro.svg 要求存在，且大小符合 svgBytes: 120
  const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="green"/></svg>\n';
  const paddedSvg = svgContent.padEnd(120, ' ');
  fs.writeFileSync(path.join(runsDir, 'gpt-5-pro.svg'), paddedSvg, 'utf8');

  return {
    tmpDir,
    runsDir,
    dayDir: path.join(tmpDir, 'runs', '2026', '09', '27'),
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test('validateRepository: 完整合法数据仓校验通过', () => {
  const repo = createTempRepo();
  try {
    const result = validateRepository(repo.tmpDir);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.summary.totalRuns, 1);
    assert.equal(result.summary.totalDays, 1);
  } finally {
    repo.cleanup();
  }
});

test('validateRepository: 一致性反例 - totalRuns 与 Σdays.runs 或目录数不一致', () => {
  const repo = createTempRepo();
  try {
    const manifestPath = path.join(repo.tmpDir, 'index.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.totalRuns = 999;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    const result = validateRepository(repo.tmpDir);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.message.includes('manifest.totalRuns')));
  } finally {
    repo.cleanup();
  }
});

test('validateRepository: 一致性反例 - 日索引条目与目录不对应', () => {
  const repo = createTempRepo();
  try {
    // 增加一个未经索引的轮次目录
    const unindexedRun = path.join(repo.dayDir, '20260927T030000Z');
    fs.mkdirSync(unindexedRun, { recursive: true });
    fs.writeFileSync(path.join(unindexedRun, 'run.json'), '{}', 'utf8');

    const result = validateRepository(repo.tmpDir);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.message.includes('未在日索引中记录'))
    );
  } finally {
    repo.cleanup();
  }
});

test('validateRepository: 一致性反例 - runId 与所在日期分区不一致', () => {
  const repo = createTempRepo();
  try {
    const mismatchedDir = path.join(repo.dayDir, '20260928T120000Z');
    fs.mkdirSync(mismatchedDir, { recursive: true });
    fs.writeFileSync(
      path.join(mismatchedDir, 'run.json'),
      JSON.stringify({ publicSchemaVersion: 1, runId: '20260928T120000Z' }),
      'utf8'
    );

    const result = validateRepository(repo.tmpDir);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.message.includes('与所在日期分区'))
    );
  } finally {
    repo.cleanup();
  }
});

test('validateRepository: 一致性反例 - 引用 SVG 文件缺失与未引用 SVG 文件', () => {
  const repo = createTempRepo();
  try {
    // 1. 删除引用的 gpt-5-pro.svg
    fs.unlinkSync(path.join(repo.runsDir, 'gpt-5-pro.svg'));
    // 2. 增加未引用的 orphan.svg
    fs.writeFileSync(path.join(repo.runsDir, 'orphan.svg'), '<svg></svg>', 'utf8');

    const result = validateRepository(repo.tmpDir);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.message.includes('引用的文件不存在')));
    assert.ok(result.errors.some((e) => e.message.includes('未被任何 attempt 引用')));
  } finally {
    repo.cleanup();
  }
});

test('validateRepository: 非法文件反例 - runs/ 下存在不允许的文件类型', () => {
  const repo = createTempRepo();
  try {
    const disallowedFile = path.join(repo.dayDir, 'temp-log.txt');
    fs.writeFileSync(disallowedFile, 'test log', 'utf8');

    const result = validateRepository(repo.tmpDir);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.type === 'unexpected-file')
    );
  } finally {
    repo.cleanup();
  }
});

test('validateRepository: 泄漏扫描反例 - SVG 中含有私钥或本地路径', () => {
  const repo = createTempRepo();
  try {
    // 向 SVG 注入本地路径与密钥
    const leakedSvg = '<svg><!-- /Users/secret/path --></svg>';
    fs.writeFileSync(path.join(repo.runsDir, 'gpt-5-pro.svg'), leakedSvg, 'utf8');

    const result = validateRepository(repo.tmpDir);
    assert.equal(result.valid, false);
    const leakErr = result.errors.find((e) => e.type === 'leak');
    assert.ok(leakErr, '必须捕获到 leak 类型错误');
    assert.equal(leakErr.rule, 'local-path');
    // 报告只含规则名与文件路径，不回显原文
    assert.ok(!leakErr.message.includes('/Users/secret/path'));
  } finally {
    repo.cleanup();
  }
});

test('validateRepository: 反例 - 含永不发布的题目', () => {
  const repo = createTempRepo();
  try {
    const runPath = path.join(repo.runsDir, 'run.json');
    const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
    run.prompts.push({ promptId: 'leijun-v1', text: '测试题', bindings: {} });
    fs.writeFileSync(runPath, JSON.stringify(run, null, 2) + '\n', 'utf8');
    const result = validateRepository(repo.tmpDir);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.type === 'unpublishable-prompt'));
  } finally {
    repo.cleanup();
  }
});
