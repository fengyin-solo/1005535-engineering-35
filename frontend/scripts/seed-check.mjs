// 引导脚本与复位脚本共用的种子数据校验：两条路读的是同一份 seed.json，
// 校验规则也只在这里维护一份。Node ESM 脚本，前端构建不经过这里。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const FRONTEND_ROOT = resolve(here, '..')

export function loadSeed() {
  const raw = readFileSync(resolve(FRONTEND_ROOT, 'src/data/seed.json'), 'utf8')
  return JSON.parse(raw)
}

// 从 modules.ts 里把每个模块的字段与状态链粗解析出来，避免脚本再引一份 TS 运行时。
export function loadModuleMeta() {
  const raw = readFileSync(resolve(FRONTEND_ROOT, 'src/data/modules.ts'), 'utf8')
  const result = {}
  const blockRe = /key:\s*"([^"]+)"[\s\S]*?fields:\s*\[([^\]]+)\][\s\S]*?statuses:\s*\[([^\]]+)\]/g
  let match
  while ((match = blockRe.exec(raw)) !== null) {
    const pick = (body) => body.match(/"([^"]+)"/g).map((item) => item.slice(1, -1))
    result[match[1]] = { fields: pick(match[2]), statuses: pick(match[3]) }
  }
  return result
}

const ABNORMAL_KEYWORDS = ['超标', '不合格', '失败', '拒绝', '驳回', '冻结', '失效', '撤销', '作废', '终止', '升级', '整改', '复确认', '未通过', '退回']

export function isAbnormalStatus(status) {
  return ABNORMAL_KEYWORDS.some((keyword) => status.includes(keyword))
}

export function checkSeed() {
  const seed = loadSeed()
  const metaMap = loadModuleMeta()
  const moduleKeys = Object.keys(metaMap)

  for (const key of moduleKeys) {
    if (!Array.isArray(seed[key])) {
      throw new Error(`种子数据缺模块：${key}`)
    }
  }
  for (const key of Object.keys(seed)) {
    if (!metaMap[key]) {
      throw new Error(`种子数据里有未登记的模块：${key}`)
    }
  }

  let totalRows = 0
  let totalAbnormal = 0
  for (const key of moduleKeys) {
    const { fields, statuses } = metaMap[key]
    const codeField = fields[0]
    const seenIds = new Set()
    const seenCodes = new Set()
    for (const row of seed[key]) {
      totalRows += 1
      if (typeof row.id !== 'number' || !Number.isInteger(row.id)) {
        throw new Error(`${key} 存在非整数 id`)
      }
      if (seenIds.has(row.id)) {
        throw new Error(`${key} 的 id=${row.id} 在种子里重复`)
      }
      seenIds.add(row.id)
      if (!statuses.includes(row.status)) {
        throw new Error(`${key} 的 id=${row.id} 状态「${row.status}」不在状态链里`)
      }
      const expectedPending = row.status !== statuses[statuses.length - 1]
      const expectedAbnormal = isAbnormalStatus(row.status)
      if (Boolean(row.pending) !== expectedPending || Boolean(row.abnormal) !== expectedAbnormal) {
        throw new Error(
          `${key} 的 id=${row.id} 标志位与状态不一致（status=${row.status} 应为 pending=${expectedPending}, abnormal=${expectedAbnormal}）`,
        )
      }
      const code = String(row[codeField] ?? '').trim()
      if (!code) {
        throw new Error(`${key} 的 id=${row.id} 缺少业务编号字段「${codeField}」`)
      }
      if (seenCodes.has(code)) {
        throw new Error(`${key} 的业务编号「${code}」在种子里重复`)
      }
      seenCodes.add(code)
      totalAbnormal += expectedAbnormal ? 1 : 0
    }
  }

  // 极值自检：异常量永远在 0~登记总量之间。
  if (totalAbnormal < 0 || totalAbnormal > totalRows) {
    throw new Error(`异常量越界：${totalAbnormal} / ${totalRows}`)
  }
  return { modules: moduleKeys.length, rows: totalRows, abnormal: totalAbnormal }
}
