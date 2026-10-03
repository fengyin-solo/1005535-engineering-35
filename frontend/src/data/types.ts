/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

export type ModuleStat = { label: string; value: number }

export type ImportResult = {
  ok: boolean
  added: number
  skipped: number
  total: number
  message: string
}

export type BootLogEntry = {
  action: string
  at: string
  detail: string
}

export type StorageMeta = {
  schemaVersion: number
  seededAt: string
  lastResetAt: string
  log: BootLogEntry[]
}

export type ChecklistItem = {
  label: string
  pass: boolean
  detail: string
}
