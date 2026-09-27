# LLM-IQ-Data 评测数据湖

[![License: MIT](https://img.shields.io/badge/Code%20License-MIT-blue.svg)](LICENSE-CODE)
[![License: CC BY 4.0](https://img.shields.io/badge/Data%20License-CC%20BY%204.0-lightgrey.svg)](LICENSE-DATA)

本项目是 [llm-iq-dashboard](https://github.com/xumetide-dev/llm-iq-dashboard) 的独立公开数据仓库（Data Lake Hub），用于持久化沉淀由本地/自建集群运行产生的**经典鹈鹕自行车基准（Pelican on a Bicycle）**与 **2026 年 14 大前沿工程/视觉特效评测**（共 140 道题目）的全量运行数据与生成的矢量艺术成果。

---

## 1. 为什么代码与数据分离？

* **保护核心代码库**：`llm-iq-dashboard` 专注于看板前端、调度引擎与 CLI 适配器的开发。高频评测产生的大量数据独立存放在本仓库，避免代码库因频繁提交运行记录产生 Git 冲突或仓库体积膨胀（Git Bloat）。
* **冷热数据分级**：看板运行时只加载最近几天的“热数据”，确保秒级流畅渲染；本仓库作为只追加不删除（Append-only）的“冷归档数据湖”，沉淀 100% 完整历史。
* **永久学术可证伪性（Permanent Citation）**：每一轮基准运行拥有独立的 Git Commit 历史和持久链接，评测结果和生成的原始 SVG 完全开源透明，可直接在论文或分析报告中作为固定出处引用。

---

## 2. 目录组织结构

为避免单目录下成千上万个文件夹导致 Git 检索或网页渲染卡顿，评测数据按 **年 / 月 / 日** 树状分级归档：

```text
llm-iq-data/
├── README.md                      # 仓库说明、数据字段规范与引用指南
├── LICENSE                        # 许可证双轨概览声明
├── LICENSE-CODE                   # MIT 许可证（代码与同步工具）
├── LICENSE-DATA                   # CC-BY-4.0 许可证（评测数据与矢量作品）
├── index.json                     # 顶层元数据清单 (记录所有运行轮次的轻量索引)
└── runs/
    └── YYYY/                      # 年份 (如 2026)
        └── MM/                    # 月份 (如 09)
            └── DD/                # 日期 (如 27)
                └── <runId>/       # 某一轮的具体产物 (如 2026-09-27T020000Z)
                    ├── run.json   # 该轮运行元数据、耗时、模型状态与 API 折算成本
                    └── *.svg      # 各被测模型实际输出的纯净矢量作品
```

---

## 3. 数据格式与规范

### `run.json` 核心字段
每一轮运行目录下的 `run.json` 包含该轮所有被测模型的评测快照：
* `runId`：形如 `2026-09-27T020000Z` 的唯一时间戳标识；
* `startedAt` / `endedAt`：整轮运行的精确起始与结束时刻（ISO 8601）；
* `prompt`：包含 `id`、`title`、`standard`（客观黄金参考标准、判读准则与权威 DOI 学术出处）；
* `targets`：各模型的执行明细：
  * `targetKey` / `cli` / `model` / `effort`：调用的 CLI、模型版本与思考强度；
  * `status`：状态码，包括 `ok`（成功产出有效 SVG）、`no-svg`（输出无 SVG）、`timeout`（超时终止）、`error`（执行异常）；
  * `cost`：API 等价成本估算与 Token 用量；
  * `svgFile`：生成的 SVG 相对文件名。

### `index.json` 索引
仓库根目录的 `index.json` 是一个轻量级聚合清单，方便在线看板（如部署在 Vercel 上的展示台）无需遍历目录即可快速获取每日轮次概览。

---

## 4. 净室原则与数据安全边界

为确保数据完全合规与安全，本仓库严格执行以下准入过滤规则：
* **仅允许入库**：经过机器清洗的 `run.json`、生成的 `*.svg` 矢量图、以及聚合索引 `index.json`；
* **严禁入库**：
  * 包含本地环境、绝对路径或调试日志的原始终端转录（`*.txt` 流已在 `.gitignore` 中强制屏蔽）；
  * 任何 API 密钥、身份凭证或私有配置文件。

---

## 5. 开源许可证与署名要求 (Licensing)

本项目采用**代码与数据双轨开源许可**：

| 资产类型 | 适用许可证 | 说明 |
| :--- | :--- | :--- |
| **代码与工具** | **[MIT License](LICENSE-CODE)** | 允许任何个人或企业免费使用、修改、分发或整合。**无传染性**。 |
| **评测数据与作品** | **[CC-BY 4.0](LICENSE-DATA)** | 允许自由分享、分发、二次分析及商业使用。**无传染性**，唯一条件是保留出处署名。 |

### 引用格式示例（Citation）
如果您在学术论文、研究报告、技术博客或新闻中引用了本基准数据，请按如下格式注明出处：

```bibtex
@misc{llm_iq_benchmark_2026,
  author = {xumetide-dev and contributors},
  title = {LLM-IQ Benchmark: Dynamic & Frontier Visual Evaluation Data},
  year = {2026},
  publisher = {GitHub},
  howpublished = {\url{https://github.com/xumetide-dev/llm-iq-data}}
}
```
或文末标注：
> 数据来源于 LLM-IQ Benchmark (https://github.com/xumetide-dev/llm-iq-data)，采用 CC-BY 4.0 许可协议。
