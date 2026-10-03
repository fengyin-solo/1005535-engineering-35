import { MODULE_BY_KEY, MODULES } from '@/data/modules'
import {
  allRows,
  listRows,
  resetAllRows,
  resetRows,
  saveRows,
  storageKey,
} from '@/data/local-store'
import {
  buildMetricValues,
  isAbnormalStatus,
  moduleStats,
  normalizeRow,
} from '@/data/derive'
import type {
  ActionResult,
  EntryRow,
  ImportLogEntry,
  ImportResult,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 导入流水单独存一份，复位业务数据时一起清掉。
const IMPORT_LOG_KEY = 'pharma-cleanroom:import-log'

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

// 模块页顶部指标卡：标签沿用 modules.ts 里登记的，数值统一从状态链派生。
// rows 由页面传入当前列表，保证状态流转 / 导入后指标卡跟着刷新。
export function metricValues(key: string, rows: EntryRow[]): number[] {
  const meta = moduleMeta(key)
  return buildMetricValues(meta, rows)
}

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
    return { ok: false, message: `${meta.entity}当前状态「${current}」不在登记的状态链里，已挡回，请先复位数据` }
  }
  if (targetIndex <= currentIndex) {
    return { ok: false, message: `状态只能单向推进，不能从「${current}」${action}到「${target}」` }
  }
  if (targetIndex !== currentIndex + 1) {
    return {
      ok: false,
      message: `不能越级流转：「${current}」只能先到「${meta.statuses[currentIndex + 1]}」，不能直接到「${target}」`,
    }
  }
  const next = [...rows]
  next[index] = normalizeRow(meta, { ...rows[index], status: target })
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// 同一份业务模块重复导入只算一次：以模块首个业务字段（业务编号）为去重键。
function businessKeyOf(meta: ModuleMeta, row: EntryRow): string {
  return String(row[meta.fields[0]] ?? '').trim()
}

function loadImportLog(): ImportLogEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  try {
    const raw = window.localStorage.getItem(IMPORT_LOG_KEY)
    return raw ? (JSON.parse(raw) as ImportLogEntry[]) : []
  } catch {
    return []
  }
}

function appendImportLog(entry: ImportLogEntry): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  const log = [entry, ...loadImportLog()].slice(0, 20)
  window.localStorage.setItem(IMPORT_LOG_KEY, JSON.stringify(log))
}

export function listImportLog(): ImportLogEntry[] {
  return loadImportLog()
}

// 导入业务记录。支持两种载荷：
//   { records: [...] } 或直接 [...]；可带 summary: { abnormal }。
// 校验规则：
//   1. 异常量必须是 0~记录总数之间的整数，给极值（负数 / 超过总量）整批挡回；
//   2. 每行状态必须在模块状态链里，否则整批挡回；
//   3. 业务编号重复的行只算一次（文件内、与存量重复都去重）。
// 无论成功还是挡回，动作都写进导入流水清单。
export function importEntries(key: string, payload: unknown): ImportResult {
  const meta = moduleMeta(key)
  const actionLabel = `导入${meta.entity}`
  const received0 = Array.isArray(payload)
    ? payload.length
    : Array.isArray((payload as { records?: unknown[] } | null)?.records)
      ? ((payload as { records: unknown[] }).records.length)
      : 0

  const reject = (input: Partial<ImportResult> & { message: string }): ImportResult => {
    const result: ImportResult = {
      ok: false,
      message: input.message,
      received: input.received ?? 0,
      inserted: 0,
      duplicated: input.duplicated ?? 0,
      rejected: input.received ?? 0,
      abnormal: input.abnormal ?? 0,
    }
    appendImportLog({
      time: new Date().toISOString(),
      action: actionLabel,
      ok: false,
      note: result.message,
      received: result.received,
      inserted: 0,
      duplicated: result.duplicated,
      rejected: result.rejected,
      abnormal: result.abnormal,
    })
    return result
  }

  const body = (payload ?? {}) as { records?: unknown; summary?: { abnormal?: unknown } }
  const rawRecords: unknown = Array.isArray(payload) ? payload : body.records
  if (!Array.isArray(rawRecords)) {
    return reject({ message: '导入文件格式不对：需要 records 数组，或直接给记录数组' })
  }
  const received = rawRecords.length
  if (received === 0) {
    return reject({ received, message: '导入文件里没有记录，已挡回' })
  }

  const declaredAbnormalRaw = body.summary?.abnormal
  if (declaredAbnormalRaw !== undefined) {
    const value = Number(declaredAbnormalRaw)
    if (!Number.isInteger(value) || value < 0 || value > received) {
      return reject({
        received,
        message: `异常量极值校验未通过：申报异常量「${declaredAbnormalRaw}」超出 0~${received}，整批挡回`,
      })
    }
  }

  const candidates: EntryRow[] = []
  for (const item of rawRecords) {
    if (typeof item !== 'object' || item === null) {
      return reject({ received, message: '存在不是对象的记录，整批挡回' })
    }
    const row = item as EntryRow
    const status = String(row.status ?? '').trim()
    if (!meta.statuses.includes(status)) {
      return reject({
        received,
        message: `记录「${businessKeyOf(meta, row) || (row.id ?? '未命名')}」的状态「${status || '空'}」不在状态链里，整批挡回`,
      })
    }
    const code = businessKeyOf(meta, row)
    if (!code) {
      return reject({ received, message: `存在缺少「${meta.fields[0]}」的记录，整批挡回` })
    }
    candidates.push(normalizeRow(meta, { ...row, status }))
  }

  const rows = listRows(key)
  const existingKeys = new Set(rows.map((row) => businessKeyOf(meta, row)))
  const seenKeys = new Set<string>()
  const inserts: EntryRow[] = []
  let duplicated = 0
  for (const row of candidates) {
    const code = businessKeyOf(meta, row)
    if (existingKeys.has(code) || seenKeys.has(code)) {
      duplicated += 1
      continue
    }
    seenKeys.add(code)
    inserts.push(row)
  }

  let nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0)
  for (const row of inserts) {
    nextId += 1
    row.id = nextId
  }
  const nextRows = [...rows, ...inserts]
  saveRows(key, nextRows)

  const abnormalAfterImport = moduleStats(meta, nextRows).abnormal
  if (declaredAbnormalRaw !== undefined && Number(declaredAbnormalRaw) !== abnormalAfterImport) {
    // 申报值与按状态派生出的异常量对不上：不落库，回滚到导入前。
    saveRows(key, rows)
    return reject({
      received,
      duplicated,
      abnormal: moduleStats(meta, rows).abnormal,
      message: `异常量对不上：申报 ${declaredAbnormalRaw}，按状态实算是 ${abnormalAfterImport}，整批挡回`,
    })
  }

  const abnormal = abnormalAfterImport
  const result: ImportResult = {
    ok: true,
    message: `导入完成：收到 ${received} 条，新增 ${inserts.length} 条，重复跳过 ${duplicated} 条，当前异常量 ${abnormal}`,
    received,
    inserted: inserts.length,
    duplicated,
    rejected: 0,
    abnormal,
  }
  appendImportLog({
    time: new Date().toISOString(),
    action: actionLabel,
    ok: true,
    note: '成功',
    received,
    inserted: inserts.length,
    duplicated,
    rejected: 0,
    abnormal,
  })
  return result
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

// 本地开发复位：清掉浏览器里上一轮缓存的旧数据，全部模块重新灌同一份种子。
export function resetWorkspace(): void {
  resetAllRows()
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(IMPORT_LOG_KEY)
  }
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
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

export { storageKey }

// 概览汇总与模块明细共用 moduleStats，异常量各入口看到的是同一套。
export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = MODULES.map((meta) => {
    const stats = moduleStats(meta, rows[meta.key] ?? [])
    return {
      name: meta.name,
      created: stats.created,
      pending: stats.pending,
      abnormal: stats.abnormal,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// 供页面与测试复用的异常判定，避免各入口再各写一份。
export { isAbnormalStatus }
