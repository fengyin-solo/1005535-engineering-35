#!/usr/bin/env node
// 起步引导脚本：新同事克隆仓库后跑这一条就够。
//   node scripts/bootstrap.mjs        （或 make bootstrap / cd frontend && npm run bootstrap）
// 做的事：拉依赖 → 校验并灌种子数据。种子数据和前端复位入口读的是同一份
// frontend/src/data/seed.json，浏览器首次打开时会自动把它灌进 localStorage。
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const frontendDir = join(root, 'frontend')
const seedPath = join(frontendDir, 'src/data/seed.json')
const modulesPath = join(frontendDir, 'src/data/modules.ts')
const require = createRequire(join(frontendDir, 'package.json'))

const checklist = []
let failed = false

function record(label, pass, detail) {
  checklist.push({ label, pass, detail })
  if (!pass) {
    failed = true
  }
  console.log(`${pass ? '✓' : '✗'} ${label}：${detail}`)
}

function nodeMajor() {
  return Number(process.versions.node.split('.')[0])
}

// 依赖清单来自 frontend/package.json，node_modules 里每个包都在才算装齐。
function depsSatisfied(manifest) {
  const names = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]
  return names.every((name) => existsSync(join(frontendDir, 'node_modules', ...name.split('/'))))
}

// 光目录在还不够：npm 有可选依赖漏装的毛病（如 @rollup/rollup-linux-arm64-gnu），
// 实际 require 一次探针，加载失败就当没装齐，触发重装。
function depsLoadable() {
  for (const probe of ['rollup', 'vite', 'vue-tsc']) {
    try {
      require.resolve(probe)
      require(probe)
    } catch {
      return false
    }
  }
  return true
}

function installDeps() {
  try {
    execSync('npm install', { cwd: frontendDir, stdio: 'inherit' })
    return depsLoadable()
  } catch {
    return false
  }
}

function stepDeps() {
  if (nodeMajor() < 18) {
    record('Node 版本', false, `当前 v${process.versions.node}，需要 v18 及以上`)
    return
  }
  record('Node 版本', true, `v${process.versions.node}`)
  const manifest = JSON.parse(readFileSync(join(frontendDir, 'package.json'), 'utf8'))
  if (depsSatisfied(manifest) && depsLoadable()) {
    record('安装依赖', true, 'node_modules 已装齐且能加载，跳过 npm install')
    return
  }
  if (installDeps()) {
    record('安装依赖', true, 'npm install 完成，依赖可正常加载')
  } else {
    record('安装依赖', false, '依赖装不齐：请检查网络或 npm registry，必要时删掉 frontend/node_modules 后重跑本脚本')
  }
}

function stepSeed() {
  let seed
  try {
    seed = JSON.parse(readFileSync(seedPath, 'utf8'))
  } catch (error) {
    record('读取种子数据', false, `frontend/src/data/seed.json 解析失败：${error.message}`)
    return
  }
  // 模块清单从 modules.ts 里取 key，和前端运行时是同一份元数据。
  const modulesSource = readFileSync(modulesPath, 'utf8')
  const moduleKeys = [...modulesSource.matchAll(/key:\s*"([^"]+)"/g)].map((match) => match[1])
  const seedKeys = Object.keys(seed)
  const missing = moduleKeys.filter((key) => !(key in seed))
  const extra = seedKeys.filter((key) => !moduleKeys.includes(key))
  if (missing.length > 0 || extra.length > 0) {
    record('种子数据覆盖模块', false, `缺 ${missing.join(',') || '无'}，多 ${extra.join(',') || '无'}`)
    return
  }
  record('种子数据覆盖模块', true, `${moduleKeys.length} 个业务模块一一对应`)

  const badRows = []
  let total = 0
  for (const [key, rows] of Object.entries(seed)) {
    if (!Array.isArray(rows)) {
      badRows.push(`${key} 不是数组`)
      continue
    }
    total += rows.length
    const ids = new Set()
    for (const row of rows) {
      const flags = ['id', 'status', 'pending', 'abnormal'].filter((field) => !(field in row))
      if (flags.length > 0) {
        badRows.push(`${key} 有记录缺 ${flags.join('/')}`)
      }
      if (ids.has(row.id)) {
        badRows.push(`${key} 的 id ${row.id} 重复`)
      }
      ids.add(row.id)
    }
  }
  if (badRows.length > 0) {
    record('校验种子数据', false, badRows.slice(0, 3).join('；'))
    return
  }
  record('校验种子数据', true, `${total} 条记录，id / status / pending / abnormal 齐全且无重复`)

  // 幂等验证：同一份种子按 id 合并两次，结果必须和导入一次相同（重复导入只算一次）。
  let mergedOnce = 0
  let mergedTwice = 0
  for (const rows of Object.values(seed)) {
    const once = new Map()
    for (const row of rows) once.set(row.id, row)
    mergedOnce += once.size
    const twice = new Map()
    for (const row of rows) twice.set(row.id, row)
    for (const row of rows) twice.set(row.id, row)
    mergedTwice += twice.size
  }
  record('重复导入只算一次', mergedOnce === mergedTwice, `导入一次 ${mergedOnce} 条，导入两次仍是 ${mergedTwice} 条`)
}

function main() {
  console.log('== 起步引导：拉依赖、灌种子数据 ==')
  stepDeps()
  stepSeed()
  console.log('\n== 清洁验证清单 ==')
  for (const item of checklist) {
    console.log(`${item.pass ? '✓' : '✗'} ${item.label}`)
  }
  if (failed) {
    console.log('\n有检查没通过，按上面的提示处理后重跑本脚本。')
    process.exit(1)
  }
  console.log('\n起步完成。接下来：')
  console.log('  1. cd frontend && npm run dev')
  console.log('  2. 浏览器打开终端里打印的地址（默认 http://127.0.0.1:5173/）')
  console.log('  3. 首次打开会自动把 seed.json 灌进 localStorage；概览页的「复位本地数据」可以随时回到这份数据')
}

main()
