# llm-iq-data 代理须知

本文件记录在本仓库工作的长期规则，适用于所有编码代理与协作者。

## 数据来源与写入

- 本仓库只存脱敏后的评测结果（`run.json`、`*.svg`）与索引，由
  [`meomeo-dev/llm-iq-dashboard`](https://github.com/meomeo-dev/llm-iq-dashboard)
  的 `pnpm sync:data` 写入；不要手工复制运行目录。
- 只追加：已发布的轮次目录不改写、不删除。
- `runs/` 下只允许各级 `index.json`、`run.json` 与 `*.svg`；原始转录 `*.txt` 永不入库。
- 推送即公开发布，须先经人工确认。

## 永不发布的题目

- `leijun-v1`（雷军骑自行车）只是本地测试题，其题面与结果永远不进入本仓库。
- `scripts/lib/validator.mjs` 的 `UNPUBLISHABLE_PROMPT_IDS` 在 CI 中拒收这些题目，
  与主仓 `src/core/data-repo/contract.ts` 的同名清单保持一致。

## 质量门

提交前运行：`npm test`、`npm run validate`、`npm run build-index -- --check`。
