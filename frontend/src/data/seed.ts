import seedRows from './seed.json'
import { MODULE_BY_KEY } from './modules'
import { normalizeRow } from './derive'
import type { EntryRow } from './types'

// 示例数据唯一来源是 seed.json：引导脚本、本地复位入口都读这一份。
// 播种前以状态为准统一回填 pending / abnormal，保证示例数据自身就自洽。
const RAW_SEED_ROWS = seedRows as unknown as Record<string, EntryRow[]>

export const SEED_ROWS: Record<string, EntryRow[]> = Object.fromEntries(
  Object.entries(RAW_SEED_ROWS).map(([key, rows]) => {
    const meta = MODULE_BY_KEY.get(key)
    if (!meta) {
      return [key, rows]
    }
    return [key, rows.map((row) => normalizeRow(meta, row))]
  }),
)
