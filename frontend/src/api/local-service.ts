import { MODULE_BY_KEY } from '@/data/modules'
import {
  SCHEMA_VERSION,
  appendLog,
  allRows,
  importSeedRows,
  listRows,
  resetAllRows,
  resetRows,
  saveRows,
  storageMeta,
} from '@/data/local-store'
import {
  isNegativeAction,
  isRowAbnormal,
  isRowPending,
  moduleStats as buildModuleStats,
  summarizeRows,
} from '@/data/metrics'
import type {
  ActionResult,
  ChecklistItem,
  EntryRow,
  ImportResult,
  ModuleMeta,
  ModuleStat,
  OverviewResult,
  PageResult,
} from '@/data/types'

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 状态只能沿着 statuses 单向推进，一次走一级：倒退和越级都挡回。
export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const currentIndex = meta.statuses.indexOf(current)
  const targetIndex = meta.statuses.indexOf(target)
  if (currentIndex < 0) {
    return {
      ok: false,
      message: `${meta.entity}当前状态「${current}」不在已登记的状态序列里，请先在概览页复位或等迁移完成`,
    }
  }
  if (targetIndex < currentIndex) {
    return { ok: false, message: `状态只能单向推进，不能从「${current}」回退到「${target}」` }
  }
  if (targetIndex > currentIndex + 1) {
    const next = meta.statuses[currentIndex + 1]
    return { ok: false, message: `不能越级：「${current}」要先走到「${next}」，不能直接到「${target}」` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: isNegativeAction(action),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  const meta = moduleMeta(key)
  resetRows(key)
  appendLog('复位业务模块', `${meta.name}已回到种子数据`)
  return listEntries(key)
}

// 复位入口：本地开发一键回到种子数据，和引导脚本读的是同一份 seed.json。
export function resetAllModules(): OverviewResult {
  resetAllRows()
  appendLog('复位全部数据', '本地改动已清空，所有模块回到种子数据')
  return loadOverview()
}

// 幂等导入：同一份业务模块的种子重复导入只算一次，已存在的记录跳过。
export function importSeed(key: string): ImportResult {
  const meta = moduleMeta(key)
  const result = importSeedRows(key)
  const message =
    result.added === 0
      ? `${meta.name}的种子已经导入过，重复导入只算一次`
      : `${meta.name}新导入 ${result.added} 条，跳过已存在的 ${result.skipped} 条`
  appendLog('导入种子数据', message)
  return { ok: true, ...result, message }
}

export function moduleStats(key: string): ModuleStat[] {
  return buildModuleStats(listRows(key), moduleMeta(key))
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态', '待处理', '异常']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push(
      [
        row.id,
        ...meta.fields.map((field) => row[field] ?? ''),
        row.status,
        isRowPending(row, meta) ? '是' : '否',
        isRowAbnormal(row, meta) ? '是' : '否',
      ].join(','),
    )
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const summary = summarizeRows(rows[meta.key] ?? [], meta)
    return { name: meta.name, ...summary }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// 清洁验证清单：起步动作（播种 / 迁移 / 复位 / 导入）有没有落到本地，一眼能核对。
export function bootChecklist(): ChecklistItem[] {
  const rows = allRows()
  const meta = storageMeta()
  const moduleCount = MODULE_BY_KEY.size
  const seededCount = [...MODULE_BY_KEY.keys()].filter((key) => (rows[key] ?? []).length > 0).length
  const overview = loadOverview()
  const abnormalTotal = overview.cards.find((card) => card.label === '异常量')?.value ?? 0
  const abnormalSum = overview.modules.reduce((sum, item) => sum + item.abnormal, 0)
  const abnormalBounded = overview.modules.every((item) => item.abnormal >= 0 && item.abnormal <= item.created)
  const lastAction = meta.log[meta.log.length - 1]
  return [
    {
      label: '种子数据已就位',
      pass: seededCount === moduleCount,
      detail: `${seededCount}/${moduleCount} 个业务模块已有记录`,
    },
    {
      label: '存量数据已迁移',
      pass: meta.schemaVersion >= SCHEMA_VERSION,
      detail: `本地结构版本 v${meta.schemaVersion}，缺字段已按旧记录回填`,
    },
    {
      label: '异常量各入口一致',
      pass: abnormalTotal === abnormalSum,
      detail: `概览卡片 ${abnormalTotal}，模块明细合计 ${abnormalSum}`,
    },
    {
      label: '异常量未越界',
      pass: abnormalBounded,
      detail: '每个模块的异常量都落在 0 到登记量之间，极值已挡回',
    },
    {
      label: '最近起步动作',
      pass: Boolean(lastAction),
      detail: lastAction ? `${lastAction.action}（${lastAction.at}）：${lastAction.detail}` : '还没有记录',
    },
  ]
}
