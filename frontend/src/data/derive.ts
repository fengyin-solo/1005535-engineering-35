import type { EntryRow, ModuleMeta } from './types'

// 异常态判定只认这一套关键字：命中以下任一结尾词的状态才算异常。
// 概览汇总、各模块页指标、导入校验全部走这里，保证各入口看到的异常量是同一套。
const ABNORMAL_KEYWORDS = ['超标', '不合格', '失败', '拒绝', '驳回', '冻结', '失效', '撤销', '作废', '终止', '升级', '整改', '复确认', '未通过', '退回']

export function isAbnormalStatus(status: string): boolean {
  return ABNORMAL_KEYWORDS.some((keyword) => status.includes(keyword))
}

// pending 由状态链统一派生：末态不再待处理，其余状态都算待处理。
export function isPendingStatus(meta: ModuleMeta, status: string): boolean {
  return status !== meta.statuses[meta.statuses.length - 1]
}

// 存量迁移与播种都用它：以状态为准回填 pending / abnormal，
// 旧记录里手写错位的标志位（比如已放行还挂着 abnormal）在这里被纠正。
export function normalizeRow(meta: ModuleMeta, row: EntryRow): EntryRow {
  const status = String(row.status ?? '')
  return { ...row, status, pending: isPendingStatus(meta, status), abnormal: isAbnormalStatus(status) }
}

export type ModuleStats = {
  created: number
  pending: number
  abnormal: number
  byStatus: Record<string, number>
}

export function moduleStats(meta: ModuleMeta, rows: EntryRow[]): ModuleStats {
  const byStatus: Record<string, number> = {}
  for (const status of meta.statuses) {
    byStatus[status] = 0
  }
  let pending = 0
  let abnormal = 0
  for (const row of rows) {
    const status = String(row.status)
    byStatus[status] = (byStatus[status] ?? 0) + 1
    if (row.pending) {
      pending += 1
    }
    if (row.abnormal) {
      abnormal += 1
    }
  }
  return { created: rows.length, pending, abnormal, byStatus }
}

// 指标标签 → 对应状态计数：取标签与状态名最长公共片段；
// 找不到对应状态的指标（如“本月归档数”“污染瓶总数”）保持 0。
function sharedTail(label: string, status: string): number {
  let best = 0
  for (let i = 0; i < label.length; i += 1) {
    for (let j = i + 1; j <= label.length; j += 1) {
      const piece = label.slice(i, j)
      if (piece.length > best && status.includes(piece)) {
        best = piece.length
      }
    }
  }
  return best
}

export function buildMetricValues(meta: ModuleMeta, rows: EntryRow[]): number[] {
  const stats = moduleStats(meta, rows)
  return meta.metrics.map((label) => {
    let match: string | null = null
    let bestLen = 1
    for (const status of meta.statuses) {
      const len = sharedTail(label, status)
      if (len > bestLen) {
        bestLen = len
        match = status
      }
    }
    return match ? stats.byStatus[match] : 0
  })
}
