import type { EntryRow } from './types'
import seedJson from './seed.json'

// 示例数据的唯一来源是 seed.json：前端首次播种、概览页复位入口、根目录引导脚本
// （scripts/bootstrap.mjs）读的都是这一份，改数据只改 seed.json。
export const SEED_ROWS: Record<string, EntryRow[]> = seedJson as Record<string, EntryRow[]>
