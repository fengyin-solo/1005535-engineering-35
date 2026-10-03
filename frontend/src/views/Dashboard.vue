<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
        <button class="btn ghost" type="button" @click="resetAll">复位本地数据</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>

    <section class="checklist">
      <h3>本地数据清洁验证清单</h3>
      <p class="page-desc">起步动作（灌种子数据、迁移、复位、导入）落到本地没有，在这里核对。</p>
      <ul class="checklist-items">
        <li v-for="item in checklist" :key="item.label" class="checklist-item">
          <span class="check-badge" :class="item.pass ? 'pass' : 'fail'">
            {{ item.pass ? '✓' : '✗' }}
          </span>
          <span class="check-label">{{ item.label }}</span>
          <span class="check-detail">{{ item.detail }}</span>
        </li>
      </ul>
    </section>

    <footer class="page-foot">
      <span>数据保存在本机浏览器里，点「复位本地数据」或清掉 {{ storageKeyText }} 会回到示例数据</span>
      <span v-if="notice" class="error-text">{{ notice }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { bootChecklist, loadOverview, resetAllModules } from '@/api/local-service'
import { storageKey } from '@/data/local-store'
import type { ChecklistItem, OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const checklist = ref<ChecklistItem[]>([])
const notice = ref('')
const storageKeyText = storageKey()

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  checklist.value = bootChecklist()
}

function resetAll() {
  if (!window.confirm('复位会清掉本地所有改动，回到种子数据，确定继续？')) {
    return
  }
  resetAllModules()
  notice.value = '已复位：所有模块回到种子数据'
  refresh()
}

onMounted(refresh)
</script>
