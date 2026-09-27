/**
 * 数据仓全量校验器。
 * 覆盖结构校验、目录与引用一致性校验、非法/未引用文件检查及泄漏扫描。
 */

import fs from 'node:fs';
import path from 'node:path';
import { LEAK_RULES, scanLeaks } from './leak-detector.mjs';
import {
  validateDayIndex,
  validateManifest,
  validatePublicRun,
} from './schema-validators.mjs';

/**
 * 递归收集目录下的文件与目录信息
 * @param {string} rootDir 仓库根目录
 * @returns {object}
 */
export function scanRunsDirectory(rootDir) {
  const runsRoot = path.join(rootDir, 'runs');
  const result = {
    disallowedFiles: [],
    dayDirs: new Map(), // date -> { dayPath, runDirs: Map<runId, { runPath, files }> }
    allScannedFiles: [],
  };

  if (!fs.existsSync(runsRoot)) {
    return result;
  }

  function walk(currentDir, depth) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        // 允许 runs/.gitkeep 作为空仓占位符
        if (relPath === path.join('runs', '.gitkeep')) {
          continue;
        }

        result.allScannedFiles.push(relPath);

        // 只允许各级 index.json、run.json、*.svg
        const isIndex = entry.name === 'index.json';
        const isRun = entry.name === 'run.json';
        const isSvg = entry.name.endsWith('.svg');

        if (!isIndex && !isRun && !isSvg) {
          result.disallowedFiles.push(relPath);
        }
      }
    }
  }

  walk(runsRoot, 1);
  return result;
}

/**
 * 校验 runId 与日期分区的 UTC 一致性
 * @param {string} runId 形如 YYYYMMDDTHHmmssZ
 * @param {string} dateStr 形如 YYYY-MM-DD
 * @returns {boolean}
 */
export function isRunIdMatchingDate(runId, dateStr) {
  if (!/^\d{8}T\d{6}Z$/.test(runId)) return false;
  const runDate = `${runId.slice(0, 4)}-${runId.slice(4, 6)}-${runId.slice(6, 8)}`;
  return runDate === dateStr;
}

/**
 * 校验单一 run.json 与对应 SVG 文件引用
 * @param {string} rootDir
 * @param {string} runDirRel
 * @param {object} runData
 * @param {string[]} errors
 * @param {Set<string>} referencedSvgs
 */
function checkRunDirectoryContents(
  rootDir,
  runDirRel,
  runData,
  errors,
  referencedSvgs
) {
  const fullRunDir = path.join(rootDir, runDirRel);
  const dirFiles = fs.readdirSync(fullRunDir);

  for (const file of dirFiles) {
    if (file === 'run.json') continue;
    const relFilePath = path.join(runDirRel, file);
    if (!file.endsWith('.svg')) {
      errors.push({
        file: relFilePath,
        type: 'unexpected-file',
        message: `轮次目录下存在不允许的文件: ${file}`,
      });
    }
  }

  if (Array.isArray(runData.attempts)) {
    for (const [idx, attempt] of runData.attempts.entries()) {
      if (attempt.svgFile) {
        const svgRelPath = path.join(runDirRel, attempt.svgFile);
        const svgFullPath = path.join(rootDir, svgRelPath);
        referencedSvgs.add(svgRelPath);

        if (!fs.existsSync(svgFullPath)) {
          errors.push({
            file: svgRelPath,
            type: 'consistency',
            message: `attempts[${idx}].svgFile 引用的文件不存在: ${attempt.svgFile}`,
          });
        }
      }
    }
  }

  // 检查是否有未被引用的 svg
  for (const file of dirFiles) {
    if (file.endsWith('.svg')) {
      const relFilePath = path.join(runDirRel, file);
      if (!referencedSvgs.has(relFilePath)) {
        errors.push({
          file: relFilePath,
          type: 'consistency',
          message: `发现未被任何 attempt 引用的 SVG 文件: ${file}`,
        });
      }
    }
  }
}

/**
 * 执行数据仓全量校验
 * @param {string} rootDir
 * @returns {object} 校验结果
 */
export function validateRepository(rootDir) {
  const errors = [];
  const manifestPath = path.join(rootDir, 'index.json');
  let manifestData = null;

  // 1. 结构检查：根 index.json
  if (!fs.existsSync(manifestPath)) {
    errors.push({
      file: 'index.json',
      type: 'schema',
      message: '根目录缺少 index.json',
    });
  } else {
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      manifestData = JSON.parse(content);
      const manifestErrors = validateManifest(manifestData);
      for (const err of manifestErrors) {
        errors.push({ file: 'index.json', type: 'schema', message: err });
      }
    } catch (e) {
      errors.push({
        file: 'index.json',
        type: 'schema',
        message: `index.json 解析失败: ${e.message}`,
      });
    }
  }

  // 2. 扫描 runs 目录树
  const runsScan = scanRunsDirectory(rootDir);
  for (const disallowed of runsScan.disallowedFiles) {
    errors.push({
      file: disallowed,
      type: 'unexpected-file',
      message: 'runs/ 下发现不允许的文件类型',
    });
  }

  // 发现实际磁盘上的日目录与轮次目录
  const diskDays = new Map(); // date -> Map<runId, fullPath>
  const runsRoot = path.join(rootDir, 'runs');
  if (fs.existsSync(runsRoot)) {
    for (const year of fs.readdirSync(runsRoot)) {
      if (!/^\d{4}$/.test(year)) continue;
      const yearPath = path.join(runsRoot, year);
      if (!fs.statSync(yearPath).isDirectory()) continue;

      for (const month of fs.readdirSync(yearPath)) {
        if (!/^\d{2}$/.test(month)) continue;
        const monthPath = path.join(yearPath, month);
        if (!fs.statSync(monthPath).isDirectory()) continue;

        for (const day of fs.readdirSync(monthPath)) {
          if (!/^\d{2}$/.test(day)) continue;
          const dayPath = path.join(monthPath, day);
          if (!fs.statSync(dayPath).isDirectory()) continue;

          const dateStr = `${year}-${month}-${day}`;
          const runMap = new Map();

          for (const item of fs.readdirSync(dayPath)) {
            const itemPath = path.join(dayPath, item);
            if (fs.statSync(itemPath).isDirectory()) {
              runMap.set(item, itemPath);
            }
          }
          diskDays.set(dateStr, runMap);
        }
      }
    }
  }

  let totalActualRuns = 0;
  for (const [_, runMap] of diskDays) {
    totalActualRuns += runMap.size;
  }

  // 3. 一致性检查：manifest.totalRuns = Σdays.runs = 实际轮次目录数
  if (manifestData) {
    let sumDaysRuns = 0;
    if (Array.isArray(manifestData.days)) {
      for (const day of manifestData.days) {
        sumDaysRuns += day.runs;
      }
    }
    if (manifestData.totalRuns !== sumDaysRuns) {
      errors.push({
        file: 'index.json',
        type: 'consistency',
        message: `manifest.totalRuns (${manifestData.totalRuns}) 与 Σdays.runs (${sumDaysRuns}) 不一致`,
      });
    }
    if (manifestData.totalRuns !== totalActualRuns) {
      errors.push({
        file: 'index.json',
        type: 'consistency',
        message: `manifest.totalRuns (${manifestData.totalRuns}) 与实际轮次目录数 (${totalActualRuns}) 不一致`,
      });
    }
  }

  const referencedSvgs = new Set();
  const allRunDataMap = new Map(); // runId -> runData

  // 4. 校验每个日索引与日分区
  for (const [dateStr, runMap] of diskDays) {
    const dayRelDir = `runs/${dateStr.replace(/-/g, '/')}`;
    const dayIndexPath = path.join(rootDir, dayRelDir, 'index.json');

    if (!fs.existsSync(dayIndexPath)) {
      errors.push({
        file: path.join(dayRelDir, 'index.json'),
        type: 'consistency',
        message: `缺少日索引文件: ${dayRelDir}/index.json`,
      });
      continue;
    }

    let dayData = null;
    try {
      const content = fs.readFileSync(dayIndexPath, 'utf8');
      dayData = JSON.parse(content);
      const dayErrors = validateDayIndex(dayData, dateStr);
      for (const err of dayErrors) {
        errors.push({
          file: path.join(dayRelDir, 'index.json'),
          type: 'schema',
          message: err,
        });
      }
    } catch (e) {
      errors.push({
        file: path.join(dayRelDir, 'index.json'),
        type: 'schema',
        message: `日索引解析失败: ${e.message}`,
      });
      continue;
    }

    // 校验日索引条目与实际目录一一对应
    if (dayData && Array.isArray(dayData.runs)) {
      const indexRunIds = new Set(dayData.runs.map((r) => r.runId));
      const diskRunIds = new Set(runMap.keys());

      for (const rId of indexRunIds) {
        if (!diskRunIds.has(rId)) {
          errors.push({
            file: path.join(dayRelDir, 'index.json'),
            type: 'consistency',
            message: `日索引中记录了不存在的轮次: ${rId}`,
          });
        }
      }
      for (const dId of diskRunIds) {
        if (!indexRunIds.has(dId)) {
          errors.push({
            file: path.join(dayRelDir, 'index.json'),
            type: 'consistency',
            message: `磁盘上存在未在日索引中记录的轮次目录: ${dId}`,
          });
        }
      }
    }

    // 5. 校验该天下的每个轮次目录与 run.json
    for (const [runId, fullRunPath] of runMap) {
      const runRelDir = path.join(dayRelDir, runId);
      const runJsonPath = path.join(fullRunPath, 'run.json');

      if (!isRunIdMatchingDate(runId, dateStr)) {
        errors.push({
          file: runRelDir,
          type: 'consistency',
          message: `runId (${runId}) 与所在日期分区 (${dateStr}) 不一致`,
        });
      }

      if (!fs.existsSync(runJsonPath)) {
        errors.push({
          file: path.join(runRelDir, 'run.json'),
          type: 'consistency',
          message: `轮次缺少 run.json 文件`,
        });
        continue;
      }

      let runData = null;
      try {
        const content = fs.readFileSync(runJsonPath, 'utf8');
        runData = JSON.parse(content);
        allRunDataMap.set(runId, runData);
        const runErrors = validatePublicRun(runData);
        for (const err of runErrors) {
          errors.push({
            file: path.join(runRelDir, 'run.json'),
            type: 'schema',
            message: err,
          });
        }
        if (runData.runId !== runId) {
          errors.push({
            file: path.join(runRelDir, 'run.json'),
            type: 'consistency',
            message: `run.json 中的 runId (${runData.runId}) 与目录名 (${runId}) 不符`,
          });
        }
      } catch (e) {
        errors.push({
          file: path.join(runRelDir, 'run.json'),
          type: 'schema',
          message: `run.json 解析失败: ${e.message}`,
        });
        continue;
      }

      if (runData) {
        checkRunDirectoryContents(
          rootDir,
          runRelDir,
          runData,
          errors,
          referencedSvgs
        );

        // 校验日索引条目与 run.json 字段一致性
        if (dayData && Array.isArray(dayData.runs)) {
          const summary = dayData.runs.find((r) => r.runId === runId);
          if (summary) {
            if (summary.startedAt !== runData.startedAt) {
              errors.push({
                file: path.join(dayRelDir, 'index.json'),
                type: 'consistency',
                message: `${runId} startedAt 与 run.json 不一致`,
              });
            }
            if (summary.finishedAt !== runData.finishedAt) {
              errors.push({
                file: path.join(dayRelDir, 'index.json'),
                type: 'consistency',
                message: `${runId} finishedAt 与 run.json 不一致`,
              });
            }
            if (summary.trigger !== runData.trigger) {
              errors.push({
                file: path.join(dayRelDir, 'index.json'),
                type: 'consistency',
                message: `${runId} trigger 与 run.json 不一致`,
              });
            }
            const expectedOk = (runData.attempts || []).filter(
              (a) => a.status === 'ok'
            ).length;
            if (summary.ok !== expectedOk) {
              errors.push({
                file: path.join(dayRelDir, 'index.json'),
                type: 'consistency',
                message: `${runId} ok 数量 (${summary.ok}) 与 run.json 实际 ok 数 (${expectedOk}) 不一致`,
              });
            }
            const expectedAttempts = (runData.attempts || []).length;
            if (summary.attempts !== expectedAttempts) {
              errors.push({
                file: path.join(dayRelDir, 'index.json'),
                type: 'consistency',
                message: `${runId} attempts 数量 (${summary.attempts}) 与 run.json 实际数量 (${expectedAttempts}) 不一致`,
              });
            }
          }
        }
      }
    }
  }

  // 6. 泄漏扫描：所有 JSON 与 SVG 文件
  const filesToScan = new Set(runsScan.allScannedFiles);
  if (fs.existsSync(manifestPath)) {
    filesToScan.add('index.json');
  }

  for (const relFile of filesToScan) {
    if (
      relFile.endsWith('.json') ||
      relFile.endsWith('.svg')
    ) {
      const fullPath = path.join(rootDir, relFile);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const leakedRules = scanLeaks(content);
          for (const rule of leakedRules) {
            errors.push({
              file: relFile,
              type: 'leak',
              rule,
              message: `命中泄漏防护规则: ${rule}`,
            });
          }
        } catch (e) {
          errors.push({
            file: relFile,
            type: 'schema',
            message: `读取文件进行泄漏扫描时失败: ${e.message}`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    summary: {
      totalRuns: totalActualRuns,
      totalDays: diskDays.size,
      scannedFiles: filesToScan.size,
      errorsCount: errors.length,
    },
    errors,
  };
}
