import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncIndexes } from '../scripts/lib/indexer.mjs';

function setupMultiDayRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-iq-indexer-'));

  const run1Dir = path.join(tmpDir, 'runs', '2026', '09', '26', '20260926T100000Z');
  const run2Dir = path.join(tmpDir, 'runs', '2026', '09', '27', '20260927T020000Z');
  const run3Dir = path.join(tmpDir, 'runs', '2026', '09', '27', '20260927T080000Z');

  fs.mkdirSync(run1Dir, { recursive: true });
  fs.mkdirSync(run2Dir, { recursive: true });
  fs.mkdirSync(run3Dir, { recursive: true });

  const makeRun = (runId, finishedAt, okCount = 1) => ({
    publicSchemaVersion: 1,
    runId,
    prompts: [{ promptId: 'p1', text: 'txt', bindings: {} }],
    startedAt: runId.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6.000Z'),
    finishedAt,
    durationMs: 10000,
    trigger: 'schedule',
    inProgress: false,
    attempts: [
      {
        targetId: 't1',
        promptId: 'p1',
        cli: 'c',
        model: 'm',
        effort: null,
        appliedEffort: null,
        effortHonored: null,
        label: 'L',
        status: okCount > 0 ? 'ok' : 'error',
        svgFile: okCount > 0 ? 'out.svg' : null,
        rawFile: null,
        startedAt: '2026-09-26T10:00:00.000Z',
        finishedAt,
        durationMs: 10000,
        svgBytes: 100,
        error: null,
        usage: null,
      },
    ],
    redactions: [],
  });

  fs.writeFileSync(
    path.join(run1Dir, 'run.json'),
    JSON.stringify(makeRun('20260926T100000Z', '2026-09-26T10:00:10.000Z', 1)),
    'utf8'
  );
  fs.writeFileSync(
    path.join(run2Dir, 'run.json'),
    JSON.stringify(makeRun('20260927T020000Z', '2026-09-27T02:00:10.000Z', 1)),
    'utf8'
  );
  fs.writeFileSync(
    path.join(run3Dir, 'run.json'),
    JSON.stringify(makeRun('20260927T080000Z', '2026-09-27T08:00:10.000Z', 0)),
    'utf8'
  );

  return {
    tmpDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test('syncIndexes: 确定性构建与排序规则', () => {
  const repo = setupMultiDayRepo();
  try {
    const { filesWritten } = syncIndexes(repo.tmpDir, false);
    assert.equal(filesWritten.length, 3); // 2 个日索引 + 1 个根索引

    const manifestPath = path.join(repo.tmpDir, 'index.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // 校验 totalRuns
    assert.equal(manifest.totalRuns, 3);

    // 校验 updatedAt 取最新 finishedAt
    assert.equal(manifest.updatedAt, '2026-09-27T08:00:10.000Z');

    // 校验 days 倒序 (新的在前)
    assert.equal(manifest.days.length, 2);
    assert.equal(manifest.days[0].date, '2026-09-27');
    assert.equal(manifest.days[0].runs, 2);
    assert.equal(manifest.days[1].date, '2026-09-26');
    assert.equal(manifest.days[1].runs, 1);

    // 校验 2026-09-27 日索引中的 runs 升序
    const day27Path = path.join(repo.tmpDir, 'runs', '2026', '09', '27', 'index.json');
    const day27 = JSON.parse(fs.readFileSync(day27Path, 'utf8'));
    assert.equal(day27.runs.length, 2);
    assert.equal(day27.runs[0].runId, '20260927T020000Z');
    assert.equal(day27.runs[1].runId, '20260927T080000Z');
    assert.equal(day27.runs[0].ok, 1);
    assert.equal(day27.runs[1].ok, 0);
  } finally {
    repo.cleanup();
  }
});

test('syncIndexes: 幂等性测试 (字节完全一致)', () => {
  const repo = setupMultiDayRepo();
  try {
    syncIndexes(repo.tmpDir, false);

    const manifest1 = fs.readFileSync(path.join(repo.tmpDir, 'index.json'));
    const day27Path = path.join(repo.tmpDir, 'runs', '2026', '09', '27', 'index.json');
    const day1 = fs.readFileSync(day27Path);

    // 二次构建
    syncIndexes(repo.tmpDir, false);

    const manifest2 = fs.readFileSync(path.join(repo.tmpDir, 'index.json'));
    const day2 = fs.readFileSync(day27Path);

    assert.ok(manifest1.equals(manifest2), '根 index.json 两次构建字节必须完全一致');
    assert.ok(day1.equals(day2), '日 index.json 两次构建字节必须完全一致');
  } finally {
    repo.cleanup();
  }
});

test('syncIndexes: --check 模式正例与反例', () => {
  const repo = setupMultiDayRepo();
  try {
    // 尚未生成索引时，--check 报告不一致
    const checkBefore = syncIndexes(repo.tmpDir, true);
    assert.equal(checkBefore.inSync, false);
    assert.ok(checkBefore.diffs.length > 0);

    // 生成索引后，--check 报告完全一致
    syncIndexes(repo.tmpDir, false);
    const checkAfter = syncIndexes(repo.tmpDir, true);
    assert.equal(checkAfter.inSync, true);
    assert.equal(checkAfter.diffs.length, 0);

    // 人工篡改根 index.json
    const manifestPath = path.join(repo.tmpDir, 'index.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.totalRuns = 888;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    // 篡改后 --check 必须发现差异且不写回文件
    const checkTampered = syncIndexes(repo.tmpDir, true);
    assert.equal(checkTampered.inSync, false);
    assert.ok(checkTampered.diffs.some((d) => d.includes('index.json')));

    // 确认磁盘内容未被 --check 修改
    const currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(currentManifest.totalRuns, 888);
  } finally {
    repo.cleanup();
  }
});

test('syncIndexes: 空仓测试', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-iq-empty-'));
  fs.mkdirSync(path.join(tmpDir, 'runs'), { recursive: true });

  const initialManifest = {
    schemaVersion: 1,
    name: 'custom-name',
    description: 'custom-desc',
    repository: 'https://github.com/test/repo',
    updatedAt: '2026-09-01T00:00:00.000Z',
    totalRuns: 0,
    days: [],
  };
  fs.writeFileSync(
    path.join(tmpDir, 'index.json'),
    JSON.stringify(initialManifest, null, 2) + '\n',
    'utf8'
  );

  try {
    const { inSync, filesWritten } = syncIndexes(tmpDir, false);
    assert.equal(inSync, true);
    assert.equal(filesWritten.length, 1);

    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, 'index.json'), 'utf8'));
    assert.equal(content.name, 'custom-name');
    assert.equal(content.description, 'custom-desc');
    assert.equal(content.totalRuns, 0);
    assert.equal(content.days.length, 0);
    assert.equal(content.updatedAt, '2026-09-01T00:00:00.000Z');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
