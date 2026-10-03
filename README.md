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
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出、复位、清单
│   ├── src/data/             模块元数据 / 种子数据(seed.json) / localStorage 持久化 / 指标口径
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── scripts/bootstrap.mjs     起步引导脚本：拉依赖、灌种子数据
├── Makefile                  bootstrap / install / frontend / build / typecheck
├── .gitignore
└── docker-compose.yml
```

## 起步（新同事克隆仓库后）

起步动作固化成两条路，**两边读的是同一份种子数据** `frontend/src/data/seed.json`：

### 路线一：引导脚本（拉依赖、灌种子数据）

```bash
make bootstrap
# 等价于 node scripts/bootstrap.mjs，或 cd frontend && npm run bootstrap
```

脚本会依次做：

1. 检查 Node 版本（需要 v18+），把 `frontend` 的依赖装齐（已装齐会自动跳过）；
2. 读取 `frontend/src/data/seed.json`，对照 `frontend/src/data/modules.ts` 的模块清单校验
   种子数据（模块一一对应、每条记录 id / status / pending / abnormal 齐全、id 无重复），
   并验证「同一份种子重复导入只算一次」；
3. 打印清洁验证清单，全部打勾才算起步完成。

之后启动 dev server：

```bash
cd frontend
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。
浏览器首次打开时会自动把 seed.json 灌进 localStorage，不用手工灌数据。

### 路线二：复位入口（本地开发用）

浏览器里还留着上一轮的旧数据时，不用钻 DevTools 翻存储：

- 打开「运营概览」页，点右上角的 **复位本地数据**，确认后所有模块回到种子数据；
- 或者清掉浏览器里 `pharma-cleanroom:entries` 这一项，刷新后自动重新播种。

两条路都是整体替换，不会把种子和旧数据拼在一起。

### 生产构建与检查

```bash
cd frontend
npm run build       # 先 vue-tsc 类型检查再 vite build
npm run typecheck   # 只跑类型检查
```

## 依赖清单

运行环境：Node.js v18+（Vite 5 要求），包管理用 npm。全部依赖都在 `frontend/package.json`：

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| vue | ^3.4.21 | 页面框架 |
| vue-router | ^4.3.0 | 模块页路由 |
| pinia | ^2.1.7 | 会话与筛选状态 |
| vite | ^5.2.6 | dev server 与构建（devDependencies） |
| @vitejs/plugin-vue | ^5.0.4 | Vite 的 Vue 插件（devDependencies） |
| typescript | ^5.4.3 | 类型系统（devDependencies） |
| vue-tsc | ^2.0.7 | SFC 类型检查（devDependencies） |
| @types/node | ^20.11.30 | Node 侧脚本类型（devDependencies） |

## 示例数据来源

- 种子数据只有一份：`frontend/src/data/seed.json`（18 个业务模块、54 条示例记录）。
  前端首次播种、概览页复位入口、根目录引导脚本读的都是它，改数据只改这个文件。
- `frontend/src/data/seed.ts` 只是把 seed.json 包了一层类型导出，方便 TS 引用。
- 首次打开页面时自动播种；之后浏览器里的改动优先，复位才会回到这份。
- 同一模块的种子**重复导入只算一次**：按 id 去重，已存在的记录跳过（见
  `local-service.ts` 的 `importSeed` 与 `local-store.ts` 的 `importSeedRows`）。

## 数据规则

- **状态单向推进，越级挡回**：动作只能把记录沿 `modules.ts` 里登记的状态序列往后走一级，
  回退和跨级都会被挡回并提示先走到哪一级；规则只在 `local-service.ts` 的 `runAction` 里，
  页面组件不做业务判断。
- **异常量各入口同一套**：待处理 / 异常的判定只在 `src/data/metrics.ts`，概览汇总、
  模块页统计卡片、导出清单都从它取数，概览的异常量必然等于各模块明细之和。
- **异常量极值挡回**：计数只接受 0 到登记总量之间的整数，越界一律按边界截断
  （`metrics.ts` 的 `clampCount`）。
- **迁移存量数据，按旧记录回填**：localStorage 里的旧结构在读取时自动迁移到当前版本，
  缺的 pending / abnormal 按旧记录自己的状态回填，同一模块 id 重复的旧记录只留第一条；
  迁移动作会写进本地日志。
- **动作反映到清洁验证的清单**：播种、迁移、复位、导入这些起步动作都会记进本地日志，
  概览页的「本地数据清洁验证清单」逐条核对（种子就位、迁移完成、异常量一致、未越界、
  最近动作），动作结果也会体现在各模块导出的清单里（含待处理 / 异常两列）。

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
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；种子数据在
  `frontend/src/data/seed.json`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：用概览页的「复位本地数据」，清掉浏览器里 `pharma-cleanroom:entries`
  这一项，或调用 `resetModule(模块)` / `resetAllModules()`。
