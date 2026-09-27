import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateManifest,
  validateDayIndex,
  validatePublicRun,
} from '../scripts/lib/schema-validators.mjs';

const fixturesDir = path.resolve('tests/fixtures');
const sampleManifest = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'sample-manifest.json'), 'utf8')
);
const sampleDayIndex = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'sample-day-index.json'), 'utf8')
);
const sampleRun = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'sample-run.json'), 'utf8')
);

test('validateManifest: 正例测试', () => {
  const errors = validateManifest(sampleManifest);
  assert.equal(errors.length, 0);
});

test('validateManifest: 反例测试 (版本、字段、排序、路径)', () => {
  // schemaVersion 非 1
  const badVersion = { ...sampleManifest, schemaVersion: 2 };
  assert.ok(validateManifest(badVersion).some((e) => e.includes('schemaVersion')));

  // 缺少必填字段
  const missingDays = { ...sampleManifest };
  delete missingDays.days;
  assert.ok(validateManifest(missingDays).some((e) => e.includes('days 必须为数组')));

  // totalRuns 非整数
  const badRuns = { ...sampleManifest, totalRuns: -1 };
  assert.ok(validateManifest(badRuns).some((e) => e.includes('totalRuns')));

  // days 排序错误 (旧的在前)
  const unsortedDays = {
    ...sampleManifest,
    days: [
      { date: '2026-09-26', runs: 1, path: 'runs/2026/09/26' },
      { date: '2026-09-27', runs: 1, path: 'runs/2026/09/27' },
    ],
  };
  assert.ok(
    validateManifest(unsortedDays).some((e) => e.includes('必须按日期降序排列'))
  );

  // days[i].path 格式不符
  const badPath = {
    ...sampleManifest,
    days: [{ date: '2026-09-27', runs: 1, path: 'runs/invalid' }],
  };
  assert.ok(validateManifest(badPath).some((e) => e.includes('path 必须为')));

  // 包含未知属性
  const extraProps = { ...sampleManifest, unknownField: true };
  assert.ok(
    validateManifest(extraProps).some((e) => e.includes('含有多余字段'))
  );
});

test('validateDayIndex: 正例测试', () => {
  const errors = validateDayIndex(sampleDayIndex, '2026-09-27');
  assert.equal(errors.length, 0);
});

test('validateDayIndex: 反例测试 (日期不匹配、排序、未知属性)', () => {
  // 日期与目录不一致
  assert.ok(
    validateDayIndex(sampleDayIndex, '2026-09-28').some((e) =>
      e.includes('date 必须与目录日期一致')
    )
  );

  // runId 乱序 (未按升序排列)
  const unsortedRuns = {
    ...sampleDayIndex,
    runs: [
      { ...sampleDayIndex.runs[0], runId: '20260927T030000Z' },
      { ...sampleDayIndex.runs[0], runId: '20260927T010000Z' },
    ],
  };
  assert.ok(
    validateDayIndex(unsortedRuns, '2026-09-27').some((e) =>
      e.includes('必须按 runId 升序排列')
    )
  );

  // trigger 非法
  const badTrigger = {
    ...sampleDayIndex,
    runs: [{ ...sampleDayIndex.runs[0], trigger: 'invalid' }],
  };
  assert.ok(
    validateDayIndex(badTrigger, '2026-09-27').some((e) =>
      e.includes('trigger 必须为 schedule 或 manual')
    )
  );
});

test('validatePublicRun: 正例测试', () => {
  const errors = validatePublicRun(sampleRun);
  assert.equal(errors.length, 0);
});

test('validatePublicRun: 反例测试 (版本、字段缺少、rawFile不为null、usage校验)', () => {
  // inProgress 必须为 false
  const runInProgress = { ...sampleRun, inProgress: true };
  assert.ok(
    validatePublicRun(runInProgress).some((e) => e.includes('inProgress 必须为 false'))
  );

  // rawFile 必须恒为 null
  const badRaw = JSON.parse(JSON.stringify(sampleRun));
  badRaw.attempts[0].rawFile = 'some/path.txt';
  assert.ok(
    validatePublicRun(badRaw).some((e) => e.includes('rawFile 必须恒为 null'))
  );

  // status 必须合法
  const badStatus = JSON.parse(JSON.stringify(sampleRun));
  badStatus.attempts[0].status = 'failed';
  assert.ok(
    validatePublicRun(badStatus).some((e) => e.includes('status 必须为 ok|no-svg|error|timeout'))
  );

  // attempt 缺少 usage
  const missingUsage = JSON.parse(JSON.stringify(sampleRun));
  delete missingUsage.attempts[0].usage;
  assert.ok(
    validatePublicRun(missingUsage).some((e) => e.includes('缺少必需字段: usage'))
  );

  // usage tokens 负数
  const negativeTokens = JSON.parse(JSON.stringify(sampleRun));
  negativeTokens.attempts[0].usage.tokens.input = -10;
  assert.ok(
    validatePublicRun(negativeTokens).some((e) => e.includes('必须为非负整数'))
  );

  // usage 含有未知字段
  const extraUsageProp = JSON.parse(JSON.stringify(sampleRun));
  extraUsageProp.attempts[0].usage.unknownField = 123;
  assert.ok(
    validatePublicRun(extraUsageProp).some((e) => e.includes('usage 含有不允许的多余字段'))
  );

  // redactions 项必须含 file 与 reason
  const badRedactions = { ...sampleRun, redactions: [{ file: 'foo.svg' }] };
  assert.ok(
    validatePublicRun(badRedactions).some((e) => e.includes('redactions[0]'))
  );
});
