<template>
  <a-card :title="t('assets.modelsTitle')">
    <a-typography-paragraph type="secondary">{{ t('assets.modelsHint') }}</a-typography-paragraph>
    <a-space style="margin-bottom: 12px">
      <a-button size="small" @click="refresh">{{ t('assets.refresh') }}</a-button>
      <a-button size="small" type="primary" :loading="installBundledLoading" @click="installBundled">
        {{ t('assets.installBundled') }}
      </a-button>
      <a-button size="small" @click="importLocalModel">{{ t('assets.importLocal') }}</a-button>
      <a-input-search
        :value="keyword"
        style="width: 260px"
        :placeholder="t('assets.searchModels')"
        @update:value="onKeywordChange"
      />
      <a-select :value="statusFilter" style="width: 150px" size="small" @update:value="onStatusFilterChange">
        <a-select-option value="all">{{ t('assets.filterAll') }}</a-select-option>
        <a-select-option value="installed">{{ t('assets.filterInstalled') }}</a-select-option>
        <a-select-option value="notInstalled">{{ t('assets.filterNotInstalled') }}</a-select-option>
      </a-select>
    </a-space>
    <a-typography-paragraph type="secondary" style="margin-top: 8px">
      {{ t('assets.modelSourcesHint') }}
      <div class="sources-row">
        <span class="sources-label">{{ t('assets.sourceFace') }}</span>
        <a-space :size="8" wrap>
          <a
            v-for="s in faceSources"
            :key="`face-${s.name}`"
            href="#"
            @click.prevent="openExternal(s.url)"
          >
            {{ s.name }}
          </a>
        </a-space>
      </div>
      <div class="sources-row">
        <span class="sources-label">{{ t('assets.sourceVoice') }}</span>
        <a-space :size="8" wrap>
          <a
            v-for="s in voiceSources"
            :key="`voice-${s.name}`"
            href="#"
            @click.prevent="openExternal(s.url)"
          >
            {{ s.name }}
          </a>
        </a-space>
      </div>
    </a-typography-paragraph>
    <a-progress
      v-if="bundledProgress"
      :percent="bundledProgressPct"
      :status="bundledProgress.phase === 'error' ? 'exception' : bundledProgress.phase === 'done' ? 'success' : 'active'"
      size="small"
      style="margin-bottom: 12px"
    />
    <a-divider orientation="left">{{ t('assets.faceModelsSection') }}</a-divider>
    <a-table :columns="columns" :data-source="pagedFaceCatalog" :pagination="false" row-key="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button
              size="small"
              type="primary"
              :loading="loadingId === record.id"
              :disabled="isInstalled(record) || !record.url || !!progress[record.id]?.done"
              @click="downloadOne(record)"
            >
              {{ t('assets.download') }}
            </a-button>
            <a-button v-if="loadingId === record.id" size="small" @click="cancelOne(record.id)">
              {{ t('assets.cancel') }}
            </a-button>
          </a-space>
        </template>
        <template v-else-if="column.key === 'progress'">
          <a-progress
            v-if="progress[record.id]"
            :percent="pct(record.id)"
            :status="progress[record.id]?.error ? 'exception' : 'active'"
            size="small"
          />
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="isInstalled(record) ? 'green' : 'default'">
            {{ isInstalled(record) ? t('assets.installed') : t('assets.notInstalled') }}
          </a-tag>
        </template>
      </template>
    </a-table>
    <div class="pager">
      <a-pagination
        :current="facePage"
        :page-size="modelPageSize"
        :total="faceCatalog.length"
        :show-size-changer="false"
        @update:current="onFacePageChange"
      />
    </div>

    <a-divider orientation="left">{{ t('assets.voiceModelsSection') }}</a-divider>
    <a-table :columns="columns" :data-source="pagedVoiceCatalog" :pagination="false" row-key="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button
              size="small"
              type="primary"
              :loading="loadingId === record.id"
              :disabled="isInstalled(record) || !record.url || !!progress[record.id]?.done"
              @click="downloadOne(record)"
            >
              {{ t('assets.download') }}
            </a-button>
            <a-button v-if="loadingId === record.id" size="small" @click="cancelOne(record.id)">
              {{ t('assets.cancel') }}
            </a-button>
          </a-space>
        </template>
        <template v-else-if="column.key === 'progress'">
          <a-progress
            v-if="progress[record.id]"
            :percent="pct(record.id)"
            :status="progress[record.id]?.error ? 'exception' : 'active'"
            size="small"
          />
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="isInstalled(record) ? 'green' : 'default'">
            {{ isInstalled(record) ? t('assets.installed') : t('assets.notInstalled') }}
          </a-tag>
        </template>
      </template>
    </a-table>
    <div class="pager">
      <a-pagination
        :current="voicePage"
        :page-size="modelPageSize"
        :total="voiceCatalog.length"
        :show-size-changer="false"
        @update:current="onVoicePageChange"
      />
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { IPC_CHANNELS } from '@shared/ipc-channels'

const { t } = useI18n()

type Row = {
  id: string
  name: string
  kind: 'face' | 'voice' | 'other'
  url?: string
  relativePath: string
  sha256?: string
  sizeBytes?: number
  bundled?: boolean
}

const catalog = ref<Row[]>([])
const installedFiles = ref<Set<string>>(new Set())
const installBundledLoading = ref(false)
const modelPageSize = 8
const facePage = ref(1)
const voicePage = ref(1)
const statusFilter = ref<'all' | 'installed' | 'notInstalled'>('all')
const keyword = ref('')
const modelSources = [
  {
    kind: 'face',
    name: 'Hugging Face',
    url: 'https://huggingface.co/models?search=face%20swap'
  },
  {
    kind: 'face',
    name: 'Civitai',
    url: 'https://civitai.com/search/models?query=face%20swap'
  },
  {
    kind: 'face',
    name: 'GitHub',
    url: 'https://github.com/search?q=face+swap+model&type=repositories'
  },
  {
    kind: 'voice',
    name: 'Hugging Face',
    url: 'https://huggingface.co/models?search=RVC%20voice%20conversion'
  },
  {
    kind: 'voice',
    name: 'Civitai',
    url: 'https://civitai.com/search/models?query=RVC%20voice'
  },
  {
    kind: 'voice',
    name: 'GitHub',
    url: 'https://github.com/search?q=RVC+voice+model&type=repositories'
  }
] as const
const faceSources = computed(() => modelSources.filter((s) => s.kind === 'face'))
const voiceSources = computed(() => modelSources.filter((s) => s.kind === 'voice'))
const filteredCatalog = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  let list = catalog.value
  if (statusFilter.value !== 'all') {
    list = list.filter((x) => {
      const installed = installedFiles.value.has(x.relativePath)
      return statusFilter.value === 'installed' ? installed : !installed
    })
  }
  if (!k) return list
  return list.filter((x) => {
    const name = String(x.name ?? '').toLowerCase()
    const path = String(x.relativePath ?? '').toLowerCase()
    return name.includes(k) || path.includes(k)
  })
})

function onKeywordChange(v: string): void {
  keyword.value = v
  facePage.value = 1
  voicePage.value = 1
}

const faceCatalog = computed(() => filteredCatalog.value.filter((x) => x.kind === 'face'))
const voiceCatalog = computed(() => filteredCatalog.value.filter((x) => x.kind === 'voice'))
const pagedFaceCatalog = computed(() => {
  const start = (facePage.value - 1) * modelPageSize
  return faceCatalog.value.slice(start, start + modelPageSize)
})
const pagedVoiceCatalog = computed(() => {
  const start = (voicePage.value - 1) * modelPageSize
  return voiceCatalog.value.slice(start, start + modelPageSize)
})
const bundledProgress = ref<{
  phase: 'scan' | 'copy' | 'done' | 'error'
  totalBytes?: number
  copiedBytes?: number
  currentFile?: string
  error?: string
} | null>(null)

const bundledProgressPct = computed(() => {
  const p = bundledProgress.value
  if (!p || p.phase === 'scan') return 0
  const total = typeof p.totalBytes === 'number' ? p.totalBytes : 0
  const copied = typeof p.copiedBytes === 'number' ? p.copiedBytes : 0
  if (!total) return 0
  return Math.min(100, Math.round((100 * copied) / total))
})

const columns = computed(() => [
  { title: t('assets.colName'), dataIndex: 'name', key: 'name' },
  { title: t('assets.colAction'), key: 'status', width: 120 },
  { title: t('assets.colProgress'), key: 'progress', width: 220 },
  { title: t('assets.colAction'), key: 'action', width: 220 }
])

const loadingId = ref<string | null>(null)
const progress = reactive<
  Record<string, { received: number; total: number; done?: boolean; error?: string }>
>({})

function pct(id: string): number {
  const p = progress[id]
  if (!p || !p.total) return 0
  return Math.min(100, Math.round((100 * p.received) / p.total))
}

function isInstalled(row: Row): boolean {
  return installedFiles.value.has(row.relativePath)
}

function onStatusFilterChange(v: string): void {
  if (v === 'all' || v === 'installed' || v === 'notInstalled') {
    statusFilter.value = v
    facePage.value = 1
    voicePage.value = 1
  }
}

function onFacePageChange(v: number): void {
  facePage.value = Math.max(1, v)
}

function onVoicePageChange(v: number): void {
  voicePage.value = Math.max(1, v)
}

async function loadCatalog(): Promise<void> {
  const r = (await window.aiface.invoke(IPC_CHANNELS.GET_MODEL_CATALOG)) as {
    ok?: boolean
    error?: string
    catalog?: { version?: number; models?: Row[] }
  }
  if (!r?.ok) {
    message.error(t('assets.loadCatalogFail'))
    catalog.value = []
    return
  }
  catalog.value = Array.isArray(r.catalog?.models) ? r.catalog!.models! : []
}

async function loadInstalled(): Promise<void> {
  const r = (await window.aiface.invoke(IPC_CHANNELS.LIST_INSTALLED_MODELS)) as {
    ok?: boolean
    error?: string
    files?: string[]
  }
  if (!r?.ok) {
    installedFiles.value = new Set()
    return
  }
  installedFiles.value = new Set((r.files ?? []).map((p) => String(p)))
}

async function refresh(): Promise<void> {
  await Promise.all([loadCatalog(), loadInstalled()])
}

watch(faceCatalog, (arr) => {
  const maxPage = Math.max(1, Math.ceil(arr.length / modelPageSize))
  if (facePage.value > maxPage) facePage.value = maxPage
})
watch(voiceCatalog, (arr) => {
  const maxPage = Math.max(1, Math.ceil(arr.length / modelPageSize))
  if (voicePage.value > maxPage) voicePage.value = maxPage
})

async function installBundled(): Promise<void> {
  installBundledLoading.value = true
  try {
    const r = (await window.aiface.invoke(IPC_CHANNELS.ENSURE_BASE_MODELS)) as { ok?: boolean; error?: string }
    if (!r?.ok) {
      message.error(r?.error ?? t('assets.installFail'))
      return
    }
    await loadInstalled()
    message.success(t('assets.installOk'))
  } finally {
    installBundledLoading.value = false
  }
}

async function openExternal(url: string): Promise<void> {
  try {
    const r = (await window.aiface.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url)) as {
      ok?: boolean
    }
    if (r?.ok) return
  } catch {
    // fallback below
  }
  const w = window.open(url, '_blank')
  if (!w) message.error(t('assets.openLinkFail'))
}

async function importLocalModel(): Promise<void> {
  const r = (await window.aiface.invoke(IPC_CHANNELS.IMPORT_LOCAL_MODEL)) as {
    ok?: boolean
    error?: string
    relativePath?: string
  }
  if (!r?.ok) {
    if (r?.error === 'cancelled') return
    message.error(r?.error ?? t('assets.importFail'))
    return
  }
  message.success(t('assets.importOk'))
  await loadInstalled()
}

let offDl: (() => void) | null = window.aiface.onDownloadProgress((msg) => {
  const id = typeof msg.id === 'string' ? msg.id : ''
  if (!id) return
  if (msg.error) {
    progress[id] = { received: 0, total: 0, error: String(msg.error) }
    const code = String(msg.error)
    const mapped =
      code === 'SHA256_MISMATCH'
        ? t('assets.shaMismatch')
        : code === 'INVALID_PATH'
          ? t('assets.invalidPath')
          : code === 'cancelled'
            ? t('assets.cancelled')
            : code
    message.error(mapped)
    if (loadingId.value === id) loadingId.value = null
    return
  }
  const received = typeof msg.received === 'number' ? msg.received : 0
  const total = typeof msg.total === 'number' ? msg.total : 0
  progress[id] = { received, total, done: !!msg.done }
  if (msg.done && loadingId.value === id) {
    loadingId.value = null
    message.success(t('assets.downloadDone'))
  }
})

let offBaseInstall: (() => void) | null = window.aiface.onBaseModelInstallProgress((msg) => {
  const phase = String((msg as any).phase ?? '')
  if (phase !== 'scan' && phase !== 'copy' && phase !== 'done' && phase !== 'error') return
  bundledProgress.value = {
    phase,
    totalBytes: typeof (msg as any).totalBytes === 'number' ? (msg as any).totalBytes : undefined,
    copiedBytes: typeof (msg as any).copiedBytes === 'number' ? (msg as any).copiedBytes : undefined,
    currentFile: typeof (msg as any).currentFile === 'string' ? (msg as any).currentFile : undefined,
    error: typeof (msg as any).error === 'string' ? (msg as any).error : undefined
  }
  if (phase === 'done') void loadInstalled()
})

async function downloadOne(row: Row): Promise<void> {
  if (!row.url) return
  loadingId.value = row.id
  progress[row.id] = { received: 0, total: 0 }
  const r = (await window.aiface.invoke(IPC_CHANNELS.DOWNLOAD_MODEL, {
    id: row.id,
    url: row.url,
    relativePath: row.relativePath,
    sha256: row.sha256
  })) as { ok?: boolean; error?: string; path?: string }
  if (!r?.ok) {
    loadingId.value = null
    const code = r?.error ?? 'download failed'
    const mapped =
      code === 'SHA256_MISMATCH'
        ? t('assets.shaMismatch')
        : code === 'INVALID_PATH'
          ? t('assets.invalidPath')
          : code === 'cancelled'
            ? t('assets.cancelled')
            : code
    message.error(mapped)
  }
}

async function cancelOne(id: string): Promise<void> {
  await window.aiface.invoke(IPC_CHANNELS.CANCEL_DOWNLOAD, id)
  loadingId.value = null
}

onMounted(() => {
  void refresh()
})

onUnmounted(() => {
  offDl?.()
  offDl = null
  offBaseInstall?.()
  offBaseInstall = null
})
</script>

<style scoped>
.pager {
  margin-top: 12px;
  margin-bottom: 4px;
  display: flex;
  justify-content: flex-end;
}

.sources-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.sources-label {
  min-width: 56px;
}
</style>
