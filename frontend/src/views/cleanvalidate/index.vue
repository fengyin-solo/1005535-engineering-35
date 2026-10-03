<template>
  <section class="page" data-module="cleanvalidate">
    <header class="page-head">
      <div>
        <h2>清洁验证管理</h2>
        <p class="page-desc">维护清洁验证记录，围绕验证编号、设备名称、清洁规程、取样点做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记清洁验证记录</button>
        <button class="btn" type="button" @click="triggerImport">导入清洁验证记录</button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="handleImportFile"
        />
        <button class="btn ghost" type="button" @click="resetCurrent">复位本模块</button>
        <button class="btn" type="button" @click="exportRows">导出清洁验证清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in availableActions(row)"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无清洁验证数据，可先登记或导入清洁验证记录</td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">清洁验证清单（导入动作流水）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>时间</th><th>动作</th><th>结果</th><th>收到</th><th>新增</th><th>重复跳过</th><th>挡回</th><th>异常量</th><th>说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in importLog" :key="index">
          <td>{{ formatTime(item.time) }}</td>
          <td>{{ item.action }}</td>
          <td :class="item.ok ? '' : 'error-text'">{{ item.ok ? '成功' : '挡回' }}</td>
          <td>{{ item.received }}</td>
          <td>{{ item.inserted }}</td>
          <td>{{ item.duplicated }}</td>
          <td class="error-text">{{ item.rejected }}</td>
          <td :class="{ 'error-text': item.abnormal > 0 }">{{ item.abnormal }}</td>
          <td>{{ item.note }}</td>
        </tr>
        <tr v-if="!importLog.length">
          <td colspan="9" class="empty-state">还没有导入动作，导入示例见 frontend/examples/cleanvalidate-import.json</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条清洁验证记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  importEntries,
  listEntries,
  listImportLog,
  metricValues,
  moduleMeta,
  resetModule,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow, ImportLogEntry } from '@/data/types'

const meta = moduleMeta('cleanvalidate')
const columns = meta.fields
const actions = meta.actions
const statuses = meta.statuses

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const fileInput = ref<HTMLInputElement | null>(null)
const importLog = ref<ImportLogEntry[]>([])

// 指标卡与概览共用同一套派生数据，异常量各入口一致。
const stats = computed(() =>
  meta.metrics.map((label, index) => ({ label, value: metricValues(meta.key, rows.value)[index] })),
)

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 状态只能单向逐级推进：只给出「当前状态的下一步」动作，越级动作在服务层也会被挡回。
function availableActions(row: EntryRow): string[] {
  const index = statuses.indexOf(String(row.status))
  if (index < 0 || index >= statuses.length - 1) {
    return []
  }
  const nextStatus = statuses[index + 1]
  return actions.filter((action) => meta.actionTargets[action] === nextStatus)
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '清洁验证记录登记入口尚未接入审批流，可先用导入'
}

function resetCurrent() {
  resetModule(meta.key)
  errorMessage.value = '本模块已复位到种子数据'
  reloadLog()
  reload()
}

function triggerImport() {
  errorMessage.value = ''
  fileInput.value?.click()
}

function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(reader.result))
    } catch {
      errorMessage.value = '导入文件不是合法 JSON，整批挡回'
      return
    }
    const result = importEntries(meta.key, parsed)
    errorMessage.value = result.message
    reloadLog()
    reload()
  }
  reader.onerror = () => {
    errorMessage.value = '导入文件读取失败'
  }
  reader.readAsText(file)
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

function reloadLog() {
  importLog.value = listImportLog()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '清洁验证列表读取失败'
  }
}

onMounted(() => {
  reload()
  reloadLog()
})
</script>
