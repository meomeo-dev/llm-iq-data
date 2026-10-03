# LLM-IQ-Data 公开评测数据湖

[![License: MIT](https://img.shields.io/badge/Code%20License-MIT-blue.svg)](LICENSE-CODE)
[![License: CC BY 4.0](https://img.shields.io/badge/Data%20License-CC%20BY%204.0-lightgrey.svg)](LICENSE-DATA)
[![CI Validation](https://github.com/meomeo-dev/llm-iq-data/actions/workflows/validate.yml/badge.svg)](https://github.com/meomeo-dev/llm-iq-data/actions/workflows/validate.yml)

本项目是 [llm-iq-dashboard](https://github.com/meomeo-dev/llm-iq-dashboard) 的独立公开数据仓库（Open Data Lake Repository），用于持久化沉淀由自动化流水线生成的评测数据。评测任务覆盖**经典鹈鹕自行车基准（Pelican on a Bicycle Benchmark）**与 **2026 年 14 大前沿工程/视觉特效评测**（共 140 道题目）的全量脱敏运行记录与矢量艺术成果（SVG Artworks）。

---

## 1. 仓库定位与架构设计 (Overview)

* **代码与数据分离**：主仓专注于看板展示台、评测调度引擎与 CLI 适配器开发；本仓库作为冷归档数据湖（Cold Archive Data Lake），仅存储脱敏后的评测结果（`run.json` + `*.svg`）与索引，避免主代码库产生 Git 提交冲突与体积膨胀（Git Bloat）。
* **冷热分级与静态看板接入**：公开看板或第三方分析平台可直接按需读取根索引 `index.json` 与各日索引，无需遍历全量文件即可实现高并发、秒级流畅渲染。
* **只追加策略（Append-Only Strategy）**：仓库严格遵循只追加原则，已归档的轮次目录不改写、不删除，确保学术研究的可证伪性与持久引用稳定性（Permanent Citation）。
* **自动化质量与安全防线（CI Quality Gate）**：仓库内置轻量级工具链（零第三方依赖，基于 Node.js ≥ 22），提供契约结构验证、引用完整性检查以及发布前机密泄漏防护扫描。

---

## 2. 目录组织结构 (Directory Layout)

数据按 **年 (YYYY) / 月 (MM) / 日 (DD) / 轮次标识符 (<runId>)** 树状分级归档：

```text
llm-iq-data/
├── index.json                        # 顶层数据仓清单 (DataRepoManifest)
├── schemas/                          # JSON Schema 规范定义 (Draft 2020-12)
│   ├── manifest.schema.json          # 顶层清单规范
│   ├── day-index.schema.json         # 日分区索引规范
│   └── public-run.schema.json        # 轮次运行记录规范
├── scripts/                          # 运维与校验工具 (Node.js 纯标准库实现)
│   ├── validate.mjs                  # 数据仓规范与安全泄漏校验
│   └── build-index.mjs               # 确定性索引重建与 --check 工具
└── runs/                             # 全量评测数据存储树
    └── YYYY/                         # 年份 (如 2026)
        └── MM/                       # 月份 (如 09)
            └── DD/                   # 日期 (如 27)
                ├── index.json        # 日分区索引 (DayIndex，runs 按 runId 升序)
                └── <runId>/          # 单次运行目录 (紧凑 UTC，如 20260927T021708Z)
                    ├── run.json      # 单轮脱敏公开记录 (PublicRunRecord)
                    └── *.svg         # 各被测模型实际生成的纯净矢量作品
```

---

## 3. 数据契约与字段规范 (Data Contracts)

权威定义以主仓 `src/core/data-repo/contract.ts` 为准。

### 3.1 轮次标识符 (`runId`)
`runId` 采用紧凑 UTC 时间戳格式（如 `20260927T021708Z`，正则 `^\d{8}T\d{6}Z$`）。其所在日期分区由前 8 位 UTC 日期决定（例如 `20260927T...` 必须且仅能位于 `runs/2026/09/27/` 目录下）。

### 3.2 顶层元数据清单 (`index.json` / DataRepoManifest)
根目录清单记录仓库总体统计与各日索引索引指引：

| 字段名 | 类型 | 描述 |
| :--- | :--- | :--- |
| `schemaVersion` | `integer` | 契约版本，固定为 `1` |
| `name` | `string` | 索引清单名称（如 `"llm-iq-data-index"`） |
| `description` | `string` | 数据仓说明文字 |
| `repository` | `string` | 数据仓 Git 仓库地址 |
| `updatedAt` | `string` | 最新一轮评测完成的 ISO 8601 时间戳（若无轮次则保留初始值） |
| `totalRuns` | `integer` | 全量运行轮次总数（等于 $\sum \text{days.runs}$ 与实际轮次目录数） |
| `days` | `DayEntry[]` | 每日分区概要列表，**按日期降序排列（新的在前）** |

`days` 子项结构：
* `date`: 分区日期（`YYYY-MM-DD`）；
* `runs`: 该日运行轮次数量（非负整数）；
* `path`: 对应日索引相对路径（形如 `runs/YYYY/MM/DD`）。

### 3.3 日分区索引 (`runs/YYYY/MM/DD/index.json` / DayIndex)
每日归档目录下的轻量级索引，用于按日拉取概览：

| 字段名 | 类型 | 描述 |
| :--- | :--- | :--- |
| `schemaVersion` | `integer` | 契约版本，固定为 `1` |
| `date` | `string` | 当前分区日期（`YYYY-MM-DD`） |
| `runs` | `RunSummary[]` | 该日所有轮次摘要，**按 `runId` 升序排列** |

`RunSummary` 结构：
* `runId`: 轮次标识符（`YYYYMMDDTHHmmssZ`）；
* `startedAt` / `finishedAt`: 该轮起止时刻（ISO 8601）；
* `trigger`: 触发机制（`"schedule"` 定时计划 或 `"manual"` 手动触发）；
* `promptIds`: 该轮包含的题目 ID 列表（`string[]`）；
* `attempts`: 该轮测试尝试总数；
* `ok`: 成功生成有效 SVG 的尝试次数；
* `path`: 该轮次相对路径（`runs/YYYY/MM/DD/<runId>`）。

### 3.4 单轮脱敏公开记录 (`runs/YYYY/MM/DD/<runId>/run.json` / PublicRunRecord)
每一轮评测产物的核心元数据：

* `publicSchemaVersion`: 契约版本，固定为 `1`；
* `runId`: 轮次标识符；
* `prompts`: 本轮评测题目列表，每项含 `promptId` (string)、`text` (string) 与 `bindings` (键值映射对象 `Record<string, string>`)；
* `startedAt` / `finishedAt`: 运行起止时间（ISO 8601）；
* `durationMs`: 整轮运行实际耗时（毫秒）；
* `trigger`: `"schedule"` | `"manual"`；
* `inProgress`: 运行完成状态，公开数据中恒为 `false`；
* `cancelledAt`: 可选取消时间（ISO 8601 或 null）；
* `budgetStop`: 可选预算熔断终止状态；
* `harnessGuard`: 可选，本轮附在每条提示词之后的直出约束原文（要求模型不联网、不跑代码自测、不截图自检）；
  没开的轮次没有此字段，`prompts[].text` 仍是题目原文——比较结果时据此区分裸模型与带 harness 增强的轮次；
* `attempts`: 各模型执行评测明细（`PublicAttempt[]`）；
* `redactions`: 被脱敏拦截的作品列表（`{ file: string, reason: string }[]`）；
* `profiles`: 可选，本轮调用用到的上游 profile 公开视图（`PublicProfile[]`）；引入前的记录没有此字段。

#### 上游 profile 公开视图 (`PublicProfile`)
同一家 CLI 通往第三方上游的一套配置，只发布对比结果时要看的七个字段，按导出时主仓配置快照；官网、接口地址、查询参数与 key 状态永远不入库（数据仓不为第三方上游导流），校验器对多余字段拒收：
* `name`: 全局唯一的 kebab-case 名字，`attempts[].profile` 引用它；
* `label`: 显示名；
* `cli`: 所属 CLI；
* `upstreamType`: 上游类型（如 `"chatgpt-pro-5x"`、`"official-api-key"`）；
* `group`: 上游侧分组名（`string | null`）；
* `multiplier`: 相对官价的倍率（非负数），只用于显示折算成本；
* `enabled`: 导出时该 profile 是否启用。

#### 被测模型明细项 (`PublicAttempt`)
* `targetId`: 评测目标唯一标识符；
* `promptId`: 对应题目 ID；
* `cli`: 调用的执行命令行工具；
* `profile`: 可选，非登录态调用所经的上游 profile 名，须在顶层 `profiles` 里登记；登录态不写；
* `model`: 模型标识符；
* `effort`: 设定的思考强度（如 `"high"`、`"medium"`、`"low"` 或 `null`）；
* `appliedEffort`: 实际生效的思考强度；
* `effortHonored`: 思考强度参数是否被接口采纳（`boolean | null`）；
* `label`: 前端展示友好名称；
* `status`: 状态码（`"ok"` 产出有效作品、`"no-svg"` 未产出矢量、`"error"` 运行出错、`"timeout"` 超时）；
* `svgFile`: 相对文件名（如 `"gpt-5-pro.svg"`），未生成或被拦截脱敏时为 `null`；
* `rawFile`: 原始终端转录文件，公开数据中**恒为 `null`**（严禁入库）；
* `startedAt` / `finishedAt`: 单次尝试起止时刻（ISO 8601）；
* `durationMs`: 单次尝试耗时（毫秒）；
* `svgBytes`: 生成的 SVG 字节大小（非负整数或 `null`）；
* `error`: 异常报错信息（`string | null`）；
* `usage`: API Token 消耗与计费用量对象（`TokenUsage | null`）：
  * `tokens`: 详细用量对象，含可选 `input`、`cache_read`、`cache_write`、`cache_write_5m`、`cache_write_1h`、`output`（均为非负整数）；
  * `reasoningTokens`: 思考过程消耗的 Token 数量（非负整数或 `null`）；
  * `serviceTier`: 服务通道级别（`"standard"` | `"fast"` | `null`）；
  * `reportedCostUsd`: 接口上报或折算的美元成本（非负浮点数或 `null`）。

---

## 4. 脱敏规范与安全过滤机制 (Redaction & Security)

为确保公开数据湖符合开源安全合规与净室原则（Cleanroom Principle），所有数据在发布前均须通过共享扫描检测：

1. **绝对剥离原始终端流**：所有 attempt 的 `rawFile` 恒为 `null`，原始终端日志（`*.txt` 流）在同步流水线端即被剥离；
2. **受限入库白名单**：`runs/` 目录下仅允许存放各级 `index.json`、`run.json` 以及合法的 `*.svg` 作品文件；禁止提交任何多余未引用文件、临时文件或凭据文件；
3. **共享安全泄漏拦截规则**：
   * **本机绝对路径 (`local-path`)**：匹配 `/Users/<名>/`、`/home/<名>/`、`/root/`、`C:\Users\<名>\` 等路径特征；
   * **私钥块 (`private-key`)**：匹配 `-----BEGIN ... PRIVATE KEY-----`；
   * **敏感令牌特征 (`secret-pattern`)**：前置非字母数字及下划线短横线，拦截含大写字母与数字的 OpenAI/Anthropic 密钥（`sk-` 等，长度 ≥ 32）、GitHub 令牌（`ghp_` 等）、AWS 凭证（`AKIA...`）、Slack 令牌、Google API Key（`AIza...`）、Bearer Token 及 JWT；
   * **白名单与反例保护**：针对常规矢量图形 ID（如 `desk-lamp-base-gradient-highlight-01`）具备防误报过滤机制；
4. **被拦截作品记入 Redactions**：若某模型生成的矢量作品命中泄漏规则，同步流水线将该 attempt 的 `svgFile` 置为 `null`，作品文件不予入库，并在 `redactions` 数组中记录原文件名与拦截原因（如 `{ file: "claude-3-7-sonnet.svg", reason: "secret-pattern" }`）；
5. **日志安全脱敏**：CI 校验报告仅显示规则名与文件路径，严格禁止在控制台日志中回显敏感内容。
6. **本地测试题不发布**：以真实人物为主体或仅供本地测试的题目，其题面与结果不进入本仓库；同步时剔除，CI 校验遇到即判失败（`unpublishable-prompt`）。

---

## 5. 数据引用方式 (Data Access & CDN)

看板系统与学术研究人员可通过以下渠道高速获取最新公开数据：

### 5.1 GitHub 原生 Raw 访问
```text
https://raw.githubusercontent.com/meomeo-dev/llm-iq-data/main/runs/<YYYY>/<MM>/<DD>/<runId>/<svgFile>
```
*示例：*
* 轮次元数据：`https://raw.githubusercontent.com/meomeo-dev/llm-iq-data/main/runs/2026/09/27/20260927T021708Z/run.json`
* 矢量作品：`https://raw.githubusercontent.com/meomeo-dev/llm-iq-data/main/runs/2026/09/27/20260927T021708Z/gpt-5-pro.svg`
* 全局索引：`https://raw.githubusercontent.com/meomeo-dev/llm-iq-data/main/index.json`

### 5.2 全球 jsDelivr CDN 加速
```text
https://cdn.jsdelivr.net/gh/meomeo-dev/llm-iq-data@main/runs/<YYYY>/<MM>/<DD>/<runId>/<svgFile>
```
*示例：*
* 矢量作品：`https://cdn.jsdelivr.net/gh/meomeo-dev/llm-iq-data@main/runs/2026/09/27/20260927T021708Z/gpt-5-pro.svg`

---

## 6. 本地开发与工具命令 (Tooling & CLI)

本仓库工具链采用 Node.js 原生标准库实现，零第三方依赖（无需安装 node_modules 即可运行核心脚本）：

```bash
# 运行全部单元测试 (基于 node:test)
npm test

# 校验仓库结构、索引一致性与安全泄漏规则
npm run validate

# 机器可读 JSON 输出
node scripts/validate.mjs --json

# 重建全量索引 (从 runs/ 树确定性生成 index.json 与日索引)
npm run build-index

# 检查当前索引是否最新 (不写入任何文件，适合 CI)
npm run build-index -- --check
```

---

## 7. 作为模板建立自己的数据仓 (Use as a Template)

第三方部署 [llm-iq-dashboard](https://github.com/meomeo-dev/llm-iq-dashboard) 时可以用本仓库的工具链建立自己的公开数据仓：

1. 在 GitHub 上以本仓库为模板建仓（Use this template）或 fork，克隆到看板仓库的同级目录 `../<your-data-repo>`。
2. 清空历史数据：删除 `runs/` 下全部目录与根目录 `index.json`；`schemas/`、`scripts/`、`tests/` 与 `.github/workflows/validate.yml` 保留。
3. 看板侧在配置里写 `dataRepo.path: ../<your-data-repo>`（容器部署填 `/data-repo` 并把宿主机路径挂进 runner）。首次 `pnpm sync:data` 会生成根 `index.json`，其中 `name` 与 `repository` 从该仓的 `origin` 远程推导；`description` 可手改，之后的同步保留已有值。
4. 公网只读展台把 `PELICAN_DATA_REPO_URL` 指向 `https://raw.githubusercontent.com/<owner>/<repo>/main`。
5. 保留 CI：每次推送自动跑契约校验、索引一致性与泄漏扫描（`npm run validate`）。永不发布的题目清单 `UNPUBLISHABLE_PROMPT_IDS` 须与看板仓库的 `src/core/data-repo/contract.ts` 保持一致。

## 8. 开源许可证与署名要求 (Licensing & Citation)

本项目采用**代码与数据双轨开源授权**：

| 资产类型 | 包含内容 | 适用许可证 | 说明 |
| :--- | :--- | :--- | :--- |
| **工具与规范代码** | `scripts/` 与 `schemas/` 下的所有源码与工作流 | **[MIT License](LICENSE-CODE)** | 允许自由使用、集成、二次分发与商业应用。 |
| **评测数据与作品** | `runs/` 下的所有运行数据、SVG 作品与各级索引 | **[CC BY 4.0](LICENSE-DATA)** | 允许自由分发、引用与深度分析，唯一要求为保留作者署名与出处链接。 |

### 学术引用示例 (Citation)

如果在论文、评测对比、基准报告或开源项目中引用了本数据湖成果，请参考以下格式进行署名：

```bibtex
@misc{llm_iq_benchmark_2026,
  author = {xumetide-dev and contributors},
  title = {LLM-IQ Benchmark: Dynamic & Frontier Visual Evaluation Open Data Lake},
  year = {2026},
  publisher = {GitHub},
  howpublished = {\url{https://github.com/meomeo-dev/llm-iq-data}}
}
```

文末或图注致谢标注：
> 评测数据与矢量作品来源于 LLM-IQ Benchmark Open Data Lake (https://github.com/meomeo-dev/llm-iq-data)，基于 CC BY 4.0 许可协议发布。
