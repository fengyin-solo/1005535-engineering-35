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

export type ImportResult = {
  ok: boolean
  message: string
  received: number
  inserted: number
  duplicated: number
  rejected: number
  abnormal: number
}

// 清洁验证清单上的导入流水：动作（导入 / 复位）都要反映到这份清单。
export type ImportLogEntry = {
  time: string
  action: string
  ok: boolean
  note: string
  received: number
  inserted: number
  duplicated: number
  rejected: number
  abnormal: number
}
