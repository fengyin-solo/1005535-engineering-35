#!/usr/bin/env node
// 引导脚本：新同事克隆仓库后只跑这一条。
//   npm run setup  （或 make setup）
// 做三件事：
//   1. 检查 Node 版本；
//   2. 安装依赖（package-lock.json 在就用 npm ci，不在就 npm install）；
//   3. 校验种子数据 src/data/seed.json，浏览器首次打开时灌的就是这一份。
// 不会动浏览器 localStorage：那部分数据在首次打开页面 / 概览页点「复位本地数据」时播种。
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

import { checkSeed, FRONTEND_ROOT } from './seed-check.mjs'

function log(message) {
  console.log(`[setup] ${message}`)
}

function fail(message) {
  console.error(`[setup] ✗ ${message}`)
  process.exit(1)
}

const major = Number(process.versions.node.split('.')[0])
if (Number.isNaN(major) || major < 18) {
  fail(`Node 版本过低，当前 ${process.versions.node}，需要 Node >= 18`)
}
log(`Node 版本 ${process.versions.node} ✓`)

const npmCommand = existsSync(resolve(FRONTEND_ROOT, 'package-lock.json')) ? 'npm ci' : 'npm install'
log(`安装依赖（${npmCommand}）…`)
try {
  execSync(npmCommand, { cwd: FRONTEND_ROOT, stdio: 'inherit' })
} catch {
  fail('依赖安装失败，请检查网络或 npm 源配置')
}

try {
  const summary = checkSeed()
  log(
    `种子数据校验通过：${summary.modules} 个业务模块、${summary.rows} 条记录，异常量 ${summary.abnormal}（来源 src/data/seed.json）✓`,
  )
} catch (error) {
  fail(`种子数据校验未通过：${error.message}`)
}

log('环境就绪。下一步：npm run dev，然后打开 http://127.0.0.1:5173/')
