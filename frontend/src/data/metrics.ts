import type { EntryRow, ModuleMeta, ModuleStat } from './types'

// 异常 / 待处理口径全仓只有这一份：概览汇总、模块页统计卡片、导出清单都从这里取，
// 保证各入口看到的是同一套数。

// 会让记录落入异常态的动作前缀（写数据时置 abnormal=true）。
export const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function isNegativeAction(action: string): boolean {
  return NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb))
}

// 模块里由负向动作到达的状态集合，迁移旧记录时按它回填 abnormal。
export function negativeStatuses(meta: ModuleMeta): Set<string> {
  const targets = new Set<string>()
  for (const [action, target] of Object.entries(meta.actionTargets)) {
    if (isNegativeAction(action)) {
      targets.add(target)
    }
  }
  return targets
}

export function isRowPending(row: EntryRow, meta: ModuleMeta): boolean {
  if (typeof row.pending === 'boolean') {
    return row.pending
  }
  // 旧记录没有 pending 字段时按它自己的状态回填：未到终态都算待处理。
  return String(row.status ?? '') !== meta.statuses[meta.statuses.length - 1]
}

export function isRowAbnormal(row: EntryRow, meta: ModuleMeta): boolean {
  if (typeof row.abnormal === 'boolean') {
    return row.abnormal
  }
  // 旧记录没有 abnormal 字段时按它自己的状态回填：落在负向状态里才算异常。
  return negativeStatuses(meta).has(String(row.status ?? ''))
}

// 计数只允许是 [0, total] 里的有限整数，越界的极值一律挡回到边界。
export function clampCount(value: number, total: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  const rounded = Math.trunc(value)
  if (rounded < 0) {
    return 0
  }
  return Math.min(rounded, Math.max(total, 0))
}

export type ModuleSummary = {
  created: number
  pending: number
  abnormal: number
}

export function summarizeRows(rows: EntryRow[], meta: ModuleMeta): ModuleSummary {
  const created = clampCount(rows.length, rows.length)
  const pending = clampCount(rows.filter((row) => isRowPending(row, meta)).length, created)
  const abnormal = clampCount(rows.filter((row) => isRowAbnormal(row, meta)).length, created)
  return { created, pending, abnormal }
}

// 指标文案与状态名做最长公共子串打分，至少命中 2 个字才算匹配，
// 避免「编制中批记录」错配到「待编制」这类包含关系误判。
function longestCommonLength(a: string, b: string): number {
  let best = 0
  const dp = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = b.length; j >= 1; j -= 1) {
      dp[j] = a[i - 1] === b[j - 1] ? (dp[j - 1] ?? 0) + 1 : 0
      best = Math.max(best, dp[j] ?? 0)
    }
  }
  return best
}

function matchStatus(label: string, meta: ModuleMeta): string | null {
  let matched: string | null = null
  let best = 1 // 至少 2 个字才认
  for (const status of meta.statuses) {
    const score = longestCommonLength(label, status)
    if (score > best) {
      best = score
      matched = status
    }
  }
  return matched
}

// 模块页统计卡片：先按状态名匹配指标文案（如「超标点位数」命中「超标预警」），
// 匹配不上再试同名字段的数值求和，都没有就给 0，绝不返回极值。
export function metricValue(label: string, rows: EntryRow[], meta: ModuleMeta): number {
  const byStatus = matchStatus(label, meta)
  if (byStatus) {
    return clampCount(rows.filter((row) => String(row.status) === byStatus).length, rows.length)
  }
  const normalized = label.replace(/[总数]/g, '')
  const field = meta.fields.find((name) => label.includes(name) || name.includes(normalized))
  if (field) {
    const sum = rows.reduce((acc, row) => {
      const value = Number(row[field])
      return Number.isFinite(value) ? acc + value : acc
    }, 0)
    return clampCount(sum, Number.MAX_SAFE_INTEGER)
  }
  return 0
}

export function moduleStats(rows: EntryRow[], meta: ModuleMeta): ModuleStat[] {
  return meta.metrics.map((label) => ({ label, value: metricValue(label, rows, meta) }))
}
