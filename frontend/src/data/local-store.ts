import { MODULE_BY_KEY } from './modules'
import { isRowAbnormal, isRowPending } from './metrics'
import { SEED_ROWS } from './seed'
import type { BootLogEntry, EntryRow, StorageMeta } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// 结构有版本号，旧版本的数据在读取时自动迁移，迁移缺的字段按旧记录自己的状态回填。
const STORAGE_KEY = 'pharma-cleanroom:entries'
const META_KEY = 'pharma-cleanroom:meta'
export const SCHEMA_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function emptyMeta(): StorageMeta {
  return { schemaVersion: SCHEMA_VERSION, seededAt: '', lastResetAt: '', log: [] }
}

function readMeta(): StorageMeta {
  if (!storageAvailable()) {
    return emptyMeta()
  }
  const raw = window.localStorage.getItem(META_KEY)
  if (!raw) {
    return emptyMeta()
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StorageMeta>
    return {
      schemaVersion: Number(parsed.schemaVersion) || 1,
      seededAt: String(parsed.seededAt ?? ''),
      lastResetAt: String(parsed.lastResetAt ?? ''),
      log: Array.isArray(parsed.log) ? (parsed.log as BootLogEntry[]) : [],
    }
  } catch {
    return emptyMeta()
  }
}

function writeMeta(meta: StorageMeta): void {
  if (storageAvailable()) {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta))
  }
}

export function storageMeta(): StorageMeta {
  ensureLoaded()
  return clone(metaCache)
}

export function appendLog(action: string, detail: string): void {
  ensureLoaded()
  const entry: BootLogEntry = { action, at: new Date().toISOString(), detail }
  metaCache = { ...metaCache, log: [...metaCache.log, entry].slice(-20) }
  writeMeta(metaCache)
}

// 迁移存量数据：旧记录里缺 id / status / pending / abnormal 的，按旧记录自己
// 已有的信息回填；同一模块里 id 重复的旧记录只留第一条（重复导入只算一次）。
function migrateRows(key: string, rows: unknown): EntryRow[] {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta || !Array.isArray(rows)) {
    return []
  }
  const seen = new Set<number>()
  let nextId = 1
  const migrated: EntryRow[] = []
  for (const item of rows) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const old = item as Record<string, unknown>
    let id = Number(old.id)
    if (!Number.isFinite(id) || seen.has(id)) {
      while (seen.has(nextId)) {
        nextId += 1
      }
      id = nextId
    }
    seen.add(id)
    nextId = Math.max(nextId, id + 1)
    const status = typeof old.status === 'string' && old.status !== '' ? old.status : meta.statuses[0]
    const row: EntryRow = {
      ...(old as EntryRow),
      id,
      status,
      pending:
        typeof old.pending === 'boolean'
          ? old.pending
          : isRowPending({ ...(old as EntryRow), id, status }, meta),
      abnormal:
        typeof old.abnormal === 'boolean'
          ? old.abnormal
          : isRowAbnormal({ ...(old as EntryRow), id, status }, meta),
    }
    migrated.push(row)
  }
  return migrated
}

function migrateStorage(parsed: Record<string, unknown>): {
  rows: Record<string, EntryRow[]>
  changed: boolean
} {
  const rows: Record<string, EntryRow[]> = {}
  let changed = false
  for (const key of MODULE_BY_KEY.keys()) {
    if (!(key in parsed)) {
      // 老数据里还没有这个模块：用种子补齐，相当于首次导入。
      rows[key] = clone(SEED_ROWS[key] ?? [])
      changed = true
      continue
    }
    const migrated = migrateRows(key, parsed[key])
    rows[key] = migrated
    if (JSON.stringify(migrated) !== JSON.stringify(parsed[key])) {
      changed = true
    }
  }
  return { rows, changed }
}

let cache: Record<string, EntryRow[]> | null = null
let metaCache: StorageMeta = emptyMeta()

function persist(rows: Record<string, EntryRow[]>): void {
  if (storageAvailable()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  }
}

function ensureLoaded(): void {
  if (cache !== null) {
    return
  }
  metaCache = readMeta()
  if (!storageAvailable()) {
    cache = clone(SEED_ROWS)
    return
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    cache = clone(SEED_ROWS)
    metaCache = { ...metaCache, schemaVersion: SCHEMA_VERSION, seededAt: new Date().toISOString() }
    persist(cache)
    writeMeta(metaCache)
    const moduleCount = Object.keys(cache).length
    const rowCount = Object.values(cache).reduce((sum, rows) => sum + rows.length, 0)
    appendLog('灌入种子数据', `${moduleCount} 个业务模块、${rowCount} 条示例记录已写入本地存储`)
    return
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const { rows, changed } = migrateStorage(parsed)
    cache = rows
    if (metaCache.schemaVersion < SCHEMA_VERSION || changed) {
      appendLog('迁移存量数据', `按旧记录回填到结构 v${SCHEMA_VERSION}，缺的字段按旧记录自己的状态补齐`)
      metaCache = { ...metaCache, schemaVersion: SCHEMA_VERSION }
      writeMeta(metaCache)
      persist(cache)
    }
  } catch {
    cache = clone(SEED_ROWS)
    persist(cache)
  }
}

export function allRows(): Record<string, EntryRow[]> {
  ensureLoaded()
  return cache as Record<string, EntryRow[]>
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

// 复位入口：清掉本地全部改动，回到种子数据，引导脚本和这里读的是同一份 seed.json。
export function resetAllRows(): void {
  cache = clone(SEED_ROWS)
  persist(cache)
  metaCache = { ...metaCache, schemaVersion: SCHEMA_VERSION, lastResetAt: new Date().toISOString() }
  writeMeta(metaCache)
}

// 幂等导入：同一模块的种子重复导入只算一次，已存在的 id 直接跳过。
export function importSeedRows(key: string): { added: number; skipped: number; total: number } {
  const seed = SEED_ROWS[key] ?? []
  const current = listRows(key)
  const existing = new Set(current.map((row) => Number(row.id)))
  const fresh = seed.filter((row) => !existing.has(Number(row.id)))
  if (fresh.length > 0) {
    saveRows(key, [...current, ...clone(fresh)])
  }
  return { added: fresh.length, skipped: seed.length - fresh.length, total: listRows(key).length }
}

export function storageKey(): string {
  return STORAGE_KEY
}
