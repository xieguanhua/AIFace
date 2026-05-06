<template>
  <a-layout class="shell">
    <a-layout-sider v-model:collapsed="collapsed" collapsible :width="220" class="sider">
      <div class="logo">{{ t('app.title') }}</div>
      <a-menu v-model:selectedKeys="selected" theme="dark" mode="inline" @click="onMenu">
        <a-menu-item key="/dashboard">{{ t('menu.dashboard') }}</a-menu-item>
        <a-menu-item key="/live">{{ t('menu.live') }}</a-menu-item>
        <a-menu-item key="/train">{{ t('menu.train') }}</a-menu-item>
        <a-menu-item key="/assets/faces">{{ t('menu.assetsFaces') }}</a-menu-item>
        <a-menu-item key="/assets/models">{{ t('menu.assetsModels') }}</a-menu-item>
        <a-menu-item key="/settings">{{ t('menu.settings') }}</a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout class="right">
      <a-layout-header class="header">
        <div class="header-spacer" />
        <a-popover v-if="activeTaskCount > 0" placement="bottomRight" trigger="hover">
          <template #content>
            <div class="tasks-pop">
              <div class="tasks-title">{{ t('layout.tasks') }}</div>
              <div v-if="taskRows.length === 0" class="tasks-empty">—</div>
              <div v-else class="tasks-list">
                <div v-for="row in taskRows" :key="row.key" class="task-row">
                  <div class="task-head">
                    <div class="task-name">{{ row.title }}</div>
                    <div class="task-meta">{{ row.meta }}</div>
                  </div>
                  <a-progress
                    :percent="row.percent"
                    :status="row.status"
                    size="small"
                  />
                </div>
              </div>
            </div>
          </template>
          <a-badge :count="activeTaskCount" :offset="[-2, 4]">
            <a-tooltip :title="t('layout.tasks')">
              <a-button class="tasks-btn" size="small" @click="goTasks">
                <SyncOutlined :spin="true" />
              </a-button>
            </a-tooltip>
          </a-badge>
        </a-popover>
        <a-select :value="settings.locale" size="small" class="lang" @update:value="onLocale">
          <a-select-option value="zh-CN">{{ t('layout.langZh') }}</a-select-option>
          <a-select-option value="en">{{ t('layout.langEn') }}</a-select-option>
        </a-select>
      </a-layout-header>
      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { SyncOutlined } from '@ant-design/icons-vue'
import type { AppLocale } from '@renderer/i18n'
import { useSettingsStore } from '@renderer/stores/settings'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const collapsed = ref(false)
const selected = ref<string[]>([route.path === '/' ? '/dashboard' : route.path])

type DownloadProgress = { received: number; total: number; done?: boolean; error?: string; updatedAt: number }
type BaseInstallProgress = {
  phase: 'scan' | 'copy' | 'done' | 'error'
  totalBytes?: number
  copiedBytes?: number
  currentFile?: string
  error?: string
  updatedAt: number
}

const downloads = ref<Record<string, DownloadProgress>>({})
const baseInstall = ref<BaseInstallProgress | null>(null)

watch(
  () => route.path,
  (p) => {
    selected.value = [p]
  }
)

function onMenu(info: { key: string | number }): void {
  void router.push(String(info.key))
}

function onLocale(v: AppLocale | null): void {
  if (!v) return
  settings.setLocale(v)
  message.success(t('settings.saved'))
}

function goTasks(): void {
  void router.push('/assets/models')
}

const activeTaskCount = computed(() => {
  let n = 0
  const b = baseInstall.value
  if (b && b.phase !== 'done') n += 1
  for (const p of Object.values(downloads.value)) {
    if (!p.done && !p.error) n += 1
  }
  return n
})

type TaskRow = { key: string; title: string; meta: string; percent: number; status: 'active' | 'success' | 'exception' }
const taskRows = computed<TaskRow[]>(() => {
  const rows: TaskRow[] = []
  const b = baseInstall.value
  if (b) {
    const total = typeof b.totalBytes === 'number' ? b.totalBytes : 0
    const copied = typeof b.copiedBytes === 'number' ? b.copiedBytes : 0
    const percent = total ? Math.min(100, Math.round((100 * copied) / total)) : b.phase === 'scan' ? 0 : 0
    const status: TaskRow['status'] = b.phase === 'error' ? 'exception' : b.phase === 'done' ? 'success' : 'active'
    const meta =
      b.phase === 'error'
        ? t('layout.taskFailed')
        : b.phase === 'done'
          ? t('layout.taskDone')
          : b.phase === 'scan'
            ? t('layout.taskScanning')
            : t('layout.taskCopying')
    rows.push({ key: 'baseModels', title: t('layout.baseModels'), meta, percent, status })
  }
  for (const [id, p] of Object.entries(downloads.value)) {
    const total = p.total || 0
    const percent = total ? Math.min(100, Math.round((100 * p.received) / total)) : 0
    const status: TaskRow['status'] = p.error ? 'exception' : p.done ? 'success' : 'active'
    const meta = p.error ? t('layout.taskFailed') : p.done ? t('layout.taskDone') : t('layout.taskDownloading')
    rows.push({ key: `dl:${id}`, title: `${t('layout.modelDownload')} ${id}`, meta, percent, status })
  }
  // newest first
  rows.sort((a, b2) => (a.key > b2.key ? -1 : 1))
  return rows
})

function pruneOldTasks(): void {
  const now = Date.now()
  const next: Record<string, DownloadProgress> = {}
  for (const [id, p] of Object.entries(downloads.value)) {
    const age = now - p.updatedAt
    const keep = (!p.done && !p.error) || age < 20_000
    if (keep) next[id] = p
  }
  downloads.value = next
  if (baseInstall.value) {
    const age = now - baseInstall.value.updatedAt
    const keep = baseInstall.value.phase === 'copy' || baseInstall.value.phase === 'scan' || age < 20_000
    if (!keep) baseInstall.value = null
  }
}

let offDl: (() => void) | null = null
let offBase: (() => void) | null = null
let pruneTimer: number | null = null

onMounted(() => {
  offDl = window.aiface.onDownloadProgress((msg) => {
    const id = typeof (msg as any).id === 'string' ? String((msg as any).id) : ''
    if (!id) return
    const received = typeof (msg as any).received === 'number' ? (msg as any).received : 0
    const total = typeof (msg as any).total === 'number' ? (msg as any).total : 0
    const done = !!(msg as any).done
    const error = typeof (msg as any).error === 'string' ? String((msg as any).error) : undefined
    downloads.value = {
      ...downloads.value,
      [id]: { received, total, done, error, updatedAt: Date.now() }
    }
  })
  offBase = window.aiface.onBaseModelInstallProgress((msg) => {
    const phase = String((msg as any).phase ?? '')
    if (phase !== 'scan' && phase !== 'copy' && phase !== 'done' && phase !== 'error') return
    baseInstall.value = {
      phase,
      totalBytes: typeof (msg as any).totalBytes === 'number' ? (msg as any).totalBytes : undefined,
      copiedBytes: typeof (msg as any).copiedBytes === 'number' ? (msg as any).copiedBytes : undefined,
      currentFile: typeof (msg as any).currentFile === 'string' ? (msg as any).currentFile : undefined,
      error: typeof (msg as any).error === 'string' ? (msg as any).error : undefined,
      updatedAt: Date.now()
    }
  })
  pruneTimer = window.setInterval(pruneOldTasks, 2000)
})

onUnmounted(() => {
  offDl?.()
  offDl = null
  offBase?.()
  offBase = null
  if (pruneTimer) window.clearInterval(pruneTimer)
  pruneTimer = null
})
</script>

<style scoped>
.shell {
  height: 100vh;
}
.sider {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: auto;
}
.right {
  min-height: 0;
}
.logo {
  color: #fff;
  font-weight: 600;
  padding: 16px;
  text-align: center;
}
.header {
  position: sticky;
  top: 0;
  z-index: 10;
  height: 48px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border-bottom: 1px solid #eee;
}
.header-spacer {
  flex: 1;
}
.tasks-pop {
  width: 340px;
}
.tasks-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.tasks-empty {
  color: #999;
}
.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.task-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.task-name {
  font-size: 12px;
  color: #111;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-meta {
  font-size: 12px;
  color: #666;
  flex: none;
}
.tasks-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.lang {
  width: 140px;
}
.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: #f5f5f5;
}
</style>
