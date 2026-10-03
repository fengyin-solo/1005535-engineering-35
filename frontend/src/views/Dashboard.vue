<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。异常量与各模块明细同源，数字对得上。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
        <button class="btn ghost" type="button" @click="handleReset">复位本地数据</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value" :class="{ 'error-text': card.label === '异常量' && card.value > 0 }">{{ card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>登记总量</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td :class="{ 'error-text': row.abnormal > 0 }">{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器 localStorage（键：{{ storageKey() }}），「复位本地数据」会清掉旧数据并重灌同一份种子</span>
      <span v-if="message" class="error-text">{{ message }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadOverview, resetWorkspace, storageKey } from '@/api/local-service'
import type { OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const message = ref('')

function refresh() {
  message.value = ''
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
}

// 本地开发复位入口：浏览器缓存里上一轮的旧数据一次性清干净，所有模块重灌同一份种子。
function handleReset() {
  const confirmed = window.confirm('确定复位全部本地数据？所有模块将重新灌入种子数据。')
  if (!confirmed) {
    return
  }
  resetWorkspace()
  message.value = '本地数据已复位为种子数据'
  refresh()
}

onMounted(refresh)
</script>
