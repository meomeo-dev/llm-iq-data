/**
 * 数据仓索引构建器。
 * 从 runs/ 目录树确定性生成根 index.json 与各日分区 index.json。
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 扫描 runs/ 目录并收集所有轮次数据
 * @param {string} rootDir
 * @returns {Map<string, Array<{ runId: string, runData: object }>>}
 */
export function collectRunsByDate(rootDir) {
  const runsRoot = path.join(rootDir, 'runs');
  const dateMap = new Map(); // dateStr -> Array<{ runId, runData }>

  if (!fs.existsSync(runsRoot)) {
    return dateMap;
  }

  const years = fs.readdirSync(runsRoot).filter((y) => /^\d{4}$/.test(y));
  for (const year of years) {
    const yearPath = path.join(runsRoot, year);
    if (!fs.statSync(yearPath).isDirectory()) continue;

    const months = fs.readdirSync(yearPath).filter((m) => /^\d{2}$/.test(m));
    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      if (!fs.statSync(monthPath).isDirectory()) continue;

      const days = fs.readdirSync(monthPath).filter((d) => /^\d{2}$/.test(d));
      for (const day of days) {
        const dayPath = path.join(monthPath, day);
        if (!fs.statSync(dayPath).isDirectory()) continue;

        const dateStr = `${year}-${month}-${day}`;
        const runDirs = fs.readdirSync(dayPath).filter((name) => {
          const p = path.join(dayPath, name);
          return fs.statSync(p).isDirectory() && /^\d{8}T\d{6}Z$/.test(name);
        });

        const runsList = [];
        for (const runId of runDirs) {
          const runJsonPath = path.join(dayPath, runId, 'run.json');
          if (fs.existsSync(runJsonPath)) {
            try {
              const runContent = fs.readFileSync(runJsonPath, 'utf8');
              const runData = JSON.parse(runContent);
              runsList.push({ runId, runData });
            } catch (err) {
              throw new Error(
                `无法解析轮次文件 ${path.relative(rootDir, runJsonPath)}: ${err.message}`
              );
            }
          }
        }

        if (runsList.length > 0) {
          dateMap.set(dateStr, runsList);
        }
      }
    }
  }

  return dateMap;
}

/**
 * 确定性生成日索引对象
 * @param {string} dateStr YYYY-MM-DD
 * @param {Array<{ runId: string, runData: object }>} runs
 * @returns {object} DayIndex 对象
 */
export function buildDayIndex(dateStr, runs) {
  // runs 按 runId 升序排列
  const sortedRuns = [...runs].sort((a, b) => a.runId.localeCompare(b.runId));

  const runSummaries = sortedRuns.map(({ runId, runData }) => {
    const promptIds = Array.isArray(runData.prompts)
      ? runData.prompts.map((p) => p.promptId)
      : [];
    const attempts = Array.isArray(runData.attempts) ? runData.attempts : [];
    const okCount = attempts.filter((a) => a.status === 'ok').length;
    const dayRel = dateStr.replace(/-/g, '/');

    return {
      runId,
      startedAt: runData.startedAt,
      finishedAt: runData.finishedAt,
      trigger: runData.trigger,
      promptIds,
      attempts: attempts.length,
      ok: okCount,
      path: `runs/${dayRel}/${runId}`,
    };
  });

  return {
    schemaVersion: 1,
    date: dateStr,
    runs: runSummaries,
  };
}

/**
 * 确定性生成根 Manifest 对象
 * @param {string} rootDir
 * @param {Map<string, Array<{ runId: string, runData: object }>>} dateMap
 * @returns {object} DataRepoManifest 对象
 */
export function buildManifest(rootDir, dateMap) {
  let name = 'llm-iq-data-index';
  let description = '鹈鹕基准与前沿大模型可视化评测全量运行索引';
  let repository = 'https://github.com/meomeo-dev/llm-iq-data';
  let fallbackUpdatedAt = '2026-09-27T07:12:00.000Z';

  const manifestPath = path.join(rootDir, 'index.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (existing.name) name = existing.name;
      if (existing.description) description = existing.description;
      if (existing.repository) repository = existing.repository;
      if (existing.updatedAt) fallbackUpdatedAt = existing.updatedAt;
    } catch {
      // 若原文件解析失败，回退到默认
    }
  }

  // 日期排序：新的在前 (倒序)
  const sortedDates = Array.from(dateMap.keys()).sort((a, b) =>
    b.localeCompare(a)
  );

  let totalRuns = 0;
  let latestFinishedAt = null;

  const days = sortedDates.map((dateStr) => {
    const runs = dateMap.get(dateStr);
    totalRuns += runs.length;
    for (const { runData } of runs) {
      if (runData.finishedAt) {
        if (!latestFinishedAt || runData.finishedAt > latestFinishedAt) {
          latestFinishedAt = runData.finishedAt;
        }
      }
    }
    return {
      date: dateStr,
      runs: runs.length,
      path: `runs/${dateStr.replace(/-/g, '/')}`,
    };
  });

  return {
    schemaVersion: 1,
    name,
    description,
    repository,
    updatedAt: latestFinishedAt || fallbackUpdatedAt,
    totalRuns,
    days,
  };
}

/**
 * 执行索引重建或检查
 * @param {string} rootDir
 * @param {boolean} checkOnly
 * @returns {{ inSync: boolean, diffs: string[], filesWritten: string[] }}
 */
export function syncIndexes(rootDir, checkOnly = false) {
  const dateMap = collectRunsByDate(rootDir);
  const diffs = [];
  const filesWritten = [];

  // 1. 生成并比对/写入各日索引
  for (const [dateStr, runs] of dateMap) {
    const dayObj = buildDayIndex(dateStr, runs);
    const dayContent = JSON.stringify(dayObj, null, 2) + '\n';
    const dayRelPath = path.join('runs', ...dateStr.split('-'), 'index.json');
    const dayFullPath = path.join(rootDir, dayRelPath);

    if (fs.existsSync(dayFullPath)) {
      const existing = fs.readFileSync(dayFullPath, 'utf8');
      if (existing !== dayContent) {
        diffs.push(`日索引不一致: ${dayRelPath}`);
      }
    } else {
      diffs.push(`缺失日索引: ${dayRelPath}`);
    }

    if (!checkOnly) {
      fs.writeFileSync(dayFullPath, dayContent, 'utf8');
      filesWritten.push(dayRelPath);
    }
  }

  // 2. 生成并比对/写入根 manifest
  const manifestObj = buildManifest(rootDir, dateMap);
  const manifestContent = JSON.stringify(manifestObj, null, 2) + '\n';
  const manifestFullPath = path.join(rootDir, 'index.json');

  if (fs.existsSync(manifestFullPath)) {
    const existing = fs.readFileSync(manifestFullPath, 'utf8');
    if (existing !== manifestContent) {
      diffs.push('根索引不一致: index.json');
    }
  } else {
    diffs.push('缺失根索引: index.json');
  }

  if (!checkOnly) {
    fs.writeFileSync(manifestFullPath, manifestContent, 'utf8');
    filesWritten.push('index.json');
  }

  return {
    inSync: diffs.length === 0,
    diffs,
    filesWritten,
  };
}
