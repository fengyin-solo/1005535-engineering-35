import { SEED_ROWS } from './seed'
import { MODULE_BY_KEY } from './modules'
import { normalizeRow } from './derive'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'pharma-cleanroom:entries'
const STORAGE_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedSnapshot(): Record<string, EntryRow[]> {
  return clone(SEED_ROWS)
}

// v1：值直接是 Record<string, EntryRow[]>（旧版本写进缓存的格式）。
// v2：{ version: 2, rows: Record<string, EntryRow[]> }。
type StoredPayload =
  | { version?: number; rows?: Record<string, EntryRow[]> }
  | Record<string, EntryRow[]>

function isVersioned(payload: StoredPayload): payload is { version: number; rows: Record<string, EntryRow[]> } {
  return typeof payload === 'object' && payload !== null && 'version' in payload && 'rows' in payload
}

// 存量迁移：旧记录里 pending / abnormal 是随手写死的，按状态链重新回填，
// 同时补齐种子里新增、但旧缓存里没有的模块。
function migrateV1Rows(rows: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const merged = { ...seedSnapshot(), ...rows }
  const next: Record<string, EntryRow[]> = {}
  for (const [key, moduleRows] of Object.entries(merged)) {
    const meta = MODULE_BY_KEY.get(key)
    next[key] = meta ? moduleRows.map((row) => normalizeRow(meta, row)) : moduleRows
  }
  return next
}

function writeStorage(rows: Record<string, EntryRow[]>): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, rows }))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = seedSnapshot()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    writeStorage(fallback)
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as StoredPayload
    if (isVersioned(parsed) && parsed.version === STORAGE_VERSION) {
      // 同样补齐种子里新增的模块，防止新增模块时旧缓存读不到数据。
      return { ...fallback, ...parsed.rows }
    }
    // 无版本信息或旧版本：按旧记录回填迁移后落盘。
    const legacy = isVersioned(parsed) ? parsed.rows ?? {} : (parsed as Record<string, EntryRow[]>)
    const migrated = migrateV1Rows(legacy)
    writeStorage(migrated)
    return migrated
  } catch {
    writeStorage(fallback)
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  writeStorage(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

// 本地开发复位入口：丢掉浏览器里上一轮的旧数据，所有模块重新灌同一份种子。
export function resetAllRows(): Record<string, EntryRow[]> {
  const rows = seedSnapshot()
  cache = rows
  writeStorage(rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
