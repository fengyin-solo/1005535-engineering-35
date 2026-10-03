# 制药企业洁净区与批生产记录管理平台

面向洁净区环境监测、批生产记录编录、物料放行、偏差与变更控制、灭菌与清洁验证、成品检验与年度质量回顾的一体化药品生产质量管理工作台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── scripts/setup.mjs     引导脚本：查环境、拉依赖、校验种子（npm run setup）
│   ├── scripts/reset.mjs     本地复位：校验种子、清构建缓存（npm run reset）
│   ├── examples/             导入用示例数据
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导入、导出
│   ├── src/data/             模块元数据 / seed.json 种子 / localStorage 持久化 / 状态派生
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── Makefile                  make setup / make reset / make frontend
├── .gitignore
└── docker-compose.yml
```

## 快速开始（两条路）

新同事克隆仓库后，**先跑引导脚本**：

```bash
cd frontend
npm run setup        # 等价于仓库根目录 make setup
```

引导脚本依次做三件事：

1. 检查 Node 版本（要求 Node >= 18）；
2. 安装依赖（有 `package-lock.json` 走 `npm ci`，否则 `npm install`）；
3. 校验种子数据 `frontend/src/data/seed.json`（模块齐全、状态合法、异常量在 0~总量之间）。

然后启动：

```bash
npm run dev          # http://127.0.0.1:5173/
```

首次打开页面时，浏览器会把**同一份** `seed.json` 灌进 `localStorage`（键 `pharma-cleanroom:entries`，带版本号）。

**本地开发要复位时**，有复位入口（两条复位都读同一份种子）：

- 页面复位（推荐）：运营概览页右上「复位本地数据」，清空全部模块的浏览器旧数据并重灌种子；
  清洁验证页另有「复位本模块」；
- 命令行复位：`npm run reset`（或 `make reset`），先校验种子，再清 `node_modules/.vite`、`dist`
  这类本地构建缓存；浏览器里的数据按上面的页面复位清。

> 注意：命令行脚本无法直接操作浏览器存储，所以「清浏览器旧数据」这一步放在页面上做，
> 两边用的都是 `src/data/seed.json` 这一份种子，不会出现两边数据不一致。

### 依赖清单与示例数据来源

| 项 | 说明 |
| --- | --- |
| 运行时 | Node.js >= 18（开发用 20 验证） |
| 前端依赖 | `vue@^3.4`、`vue-router@^4.3`、`pinia@^2.1`（见 `frontend/package.json`） |
| 构建依赖 | `vite@^5.2`、`@vitejs/plugin-vue@^5`、`typescript@^5.4`、`vue-tsc@^2` |
| 种子数据 | `frontend/src/data/seed.json`，引导脚本、页面播种、各复位入口共用这一份 |
| 导入示例 | `frontend/examples/cleanvalidate-import.json`（清洁验证页导入用，含重复记录演示去重） |

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 批生产记录 | `batchrecord` | 批生产记录 | 批号、产品名称、生产工序 |
| 洁净区环境监测 | `cleanroom` | 环境监测记录 | 监测点位、洁净级别、悬浮粒子数 |
| 物料放行 | `materialrelease` | 物料放行单 | 物料批号、物料名称、供应商 |
| 偏差处理 | `deviation` | 偏差记录 | 偏差编号、偏差类型、发生工序 |
| 变更控制 | `changecontrol` | 变更申请 | 变更编号、变更类别、涉及工序 |
| 清洁验证 | `cleanvalidate` | 清洁验证记录 | 验证编号、设备名称、清洁规程 |
| 灭菌验证 | `sterilize` | 灭菌验证记录 | 验证编号、灭菌设备、灭菌程序 |
| 培养基模拟灌装 | `mediafill` | 模拟灌装记录 | 灌装编号、灌装规格、灌装批量 |
| 工艺用水监测 | `watermonitor` | 水质监测记录 | 取样点、水系统类别、电导率 |
| 更衣确认 | `gowning` | 更衣确认记录 | 确认编号、洁净级别、更衣步骤 |
| 成品检验 | `finishedqc` | 成品检验报告 | 检验编号、产品批号、检验项目 |
| 留样管理 | `retainsample` | 留样记录 | 留样编号、对应批号、留样数量 |
| 稳定性考察 | `stability` | 稳定性考察记录 | 考察编号、考察批号、考察条件 |
| 产品召回 | `recall` | 召回记录 | 召回编号、涉及批号、召回级别 |
| 供应商审计 | `supplieraudit` | 供应商审计记录 | 审计编号、供应商名称、物料类别 |
| 人员培训 | `training` | 培训记录 | 培训编号、培训主题、受训岗位 |
| 年度质量回顾 | `annualreview` | 年度回顾报告 | 回顾编号、回顾年度、涉及产品 |
| 质量投诉 | `complaint` | 投诉记录 | 投诉编号、投诉来源、涉及产品 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.json`（经 `src/data/seed.ts` 归一化后导出）。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。

### 状态机规则

- **单向逐级推进**：状态链按 `modules.ts` 里 `statuses` 的顺序推进，只能走到「当前状态的下一步」；
  越级（如「待验证」直接「已验证」）和回退（如「已复核」退回「编制中」）一律挡回并提示。
- **异常量同一套**：`pending` / `abnormal` 不由人工填写，统一由 `src/data/derive.ts` 按状态派生
  （命中「超标 / 不合格 / 失败 / 拒绝 / 冻结 / 失效 / 撤销 / 作废 / 终止 / 升级 / 整改 / 复确认 /
  未通过 / 退回」等关键字的状态为异常态，末态不再待处理）。概览卡片、各模块指标卡、导入结果
  全部走这套派生，汇总数和明细永远对得上。
- **存量迁移**：`localStorage` 数据带版本号；读到旧版（无版本）数据时，按上述规则回填
  `pending` / `abnormal` 并补齐缺失模块后落盘，旧记录不用手工清理。

### 导入规则（清洁验证页）

- 入口：清洁验证页「导入清洁验证记录」，文件格式参考 `frontend/examples/cleanvalidate-import.json`，
  支持 `{ "records": [...] }` 或直接传数组，每行至少要带业务编号（该模块第一个字段，清洁验证为「验证编号」）和合法 `status`。
- **同一份业务模块重复导入只算一次**：业务编号与存量重复、或同一文件内重复的记录自动跳过，不重复计数。
- **异常量给极值整批挡回**：申报的 `summary.abnormal` 必须是 0~记录条数之间的整数，负数或超过总量直接挡回；
  申报值与按状态实算的异常量对不上也整批挡回，不落库。
- **动作反映到清洁验证清单**：每次导入（收到 / 新增 / 重复跳过 / 挡回 / 异常量）都会写进页面下方
  「清洁验证清单（导入动作流水）」，复位本地数据时一并清空。
