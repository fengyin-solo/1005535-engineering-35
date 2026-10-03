#!/usr/bin/env node
// 本地开发复位入口：npm run reset（或 make reset）。
//   1. 用与引导脚本同一份校验确认种子数据 src/data/seed.json 可用；
//   2. 清掉本地构建缓存（node_modules/.vite、dist），避免上一轮的旧产物干扰；
//   3. 浏览器 localStorage 里的旧数据，在页面上复位：运营概览 →「复位本地数据」，
//      或清洁验证页 →「复位本模块」；复位后各模块重新灌的还是同一份 seed.json。
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { checkSeed, FRONTEND_ROOT } from './seed-check.mjs'

function log(message) {
  console.log(`[reset] ${message}`)
}

try {
  const summary = checkSeed()
  log(
    `种子数据校验通过：${summary.modules} 个业务模块、${summary.rows} 条记录，异常量 ${summary.abnormal}（来源 src/data/seed.json）✓`,
  )
} catch (error) {
  console.error(`[reset] ✗ 种子数据校验未通过：${error.message}`)
  process.exit(1)
}

for (const target of ['node_modules/.vite', 'dist']) {
  rmSync(resolve(FRONTEND_ROOT, target), { recursive: true, force: true })
  log(`已清理 ${target}`)
}

log('本地缓存已复位。请在浏览器里打开「运营概览 → 复位本地数据」清掉浏览器旧数据。')
