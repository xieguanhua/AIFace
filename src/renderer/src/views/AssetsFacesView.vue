<template>
  <a-card :title="t('assets.facesTitle')">
    <a-space style="margin-bottom: 12px" wrap>
      <a-button type="primary" size="small" :loading="importing" @click="importFaces">
        {{ t('assets.importFaces') }}
      </a-button>
      <a-input-search
        :value="keyword"
        style="width: 280px"
        :placeholder="t('assets.searchFaces')"
        @update:value="onKeyword"
      />
      <a-select :value="sortBy" style="width: 180px" size="small" @update:value="onSortBy">
        <a-select-option value="quality">{{ t('assets.sortByQuality') }}</a-select-option>
        <a-select-option value="name">{{ t('assets.sortByName') }}</a-select-option>
      </a-select>
      <a-select :value="pageSize" style="width: 160px" size="small" @update:value="onPageSizeChange">
        <a-select-option :value="24">24 / page</a-select-option>
        <a-select-option :value="48">48 / page</a-select-option>
        <a-select-option :value="96">96 / page</a-select-option>
      </a-select>
      <a-button size="small" @click="refreshFaces">{{ t('assets.refresh') }}</a-button>
    </a-space>

    <a-empty v-if="filtered.length === 0" :description="t('assets.facesPlaceholder')" />
    <template v-else>
      <a-row :gutter="[12, 12]">
        <a-col v-for="item in pagedFaces" :key="item.path" :xs="24" :sm="12" :md="8" :lg="6" :xl="4">
        <a-card size="small">
          <a-image :src="item.fileUrl" :preview="{ mask: t('assets.previewFace') }" />
          <div class="name" :title="item.path">{{ item.path }}</div>
          <a-space>
            <a-tag color="blue">{{ t('assets.qualityScore') }}: {{ item.qualityScore ?? 0 }}</a-tag>
            <a-tag :color="qualityLevel(item.qualityScore).color">
              {{ qualityLevel(item.qualityScore).label }}
            </a-tag>
          </a-space>
          <a-space>
            <a-switch
              :checked="!!item.inTraining"
              size="small"
              @update:checked="(v:boolean) => toggleTraining(item, v)"
            />
            <span class="label">{{ t('assets.inTraining') }}</span>
          </a-space>
          <div style="margin-top: 8px">
            <a-button danger size="small" @click="removeFace(item)">
              {{ t('assets.deleteFace') }}
            </a-button>
          </div>
        </a-card>
        </a-col>
      </a-row>
      <div class="pager">
        <a-pagination
          :current="page"
          :page-size="pageSize"
          :total="filtered.length"
          :show-size-changer="false"
          @update:current="onPageChange"
        />
      </div>
    </template>
  </a-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { db } from '@renderer/db'
import { mapErrorMessage } from '@renderer/utils/error-message'

const { t } = useI18n()

type FaceDiskItem = {
  relativePath: string
  name: string
  fileUrl: string
  sizeBytes?: number
}
type FaceVm = {
  id?: number
  path: string
  fileUrl: string
  inTraining?: boolean
  qualityScore?: number
}

const importing = ref(false)
const keyword = ref('')
const sortBy = ref<'quality' | 'name'>('quality')
const page = ref(1)
const pageSize = ref(48)
const faces = ref<FaceVm[]>([])

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  const list = !k ? faces.value.slice() : faces.value.filter((x) => x.path.toLowerCase().includes(k))
  if (sortBy.value === 'name') {
    list.sort((a, b) => a.path.localeCompare(b.path))
  } else {
    list.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
  }
  return list
})

function onKeyword(v: string): void {
  keyword.value = v
}

function onSortBy(v: string): void {
  if (v === 'quality' || v === 'name') {
    sortBy.value = v
    page.value = 1
  }
}

function onPageSizeChange(v: number | string): void {
  const n = Number(v)
  if (n > 0) {
    pageSize.value = n
    page.value = 1
  }
}

function onPageChange(v: number): void {
  page.value = Math.max(1, v)
}

function qualityLevel(score?: number): { label: string; color: string } {
  const s = score ?? 0
  if (s >= 80) return { label: t('assets.qualityExcellent'), color: 'green' }
  if (s >= 60) return { label: t('assets.qualityGood'), color: 'blue' }
  if (s >= 40) return { label: t('assets.qualityFair'), color: 'orange' }
  return { label: t('assets.qualityPoor'), color: 'red' }
}

const pagedFaces = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

watch(keyword, () => {
  page.value = 1
})

async function estimateQualityScoreByImage(fileUrl: string): Promise<number> {
  const img = new Image()
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAIL'))
  })
  img.src = fileUrl
  await loaded

  const srcW = Math.max(1, img.naturalWidth || 1)
  const srcH = Math.max(1, img.naturalHeight || 1)
  const megapixels = (srcW * srcH) / 1_000_000
  const resolutionScore = Math.max(0, Math.min(1, Math.log2(1 + megapixels) / Math.log2(1 + 2.1)))

  const maxEdge = 256
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH))
  const w = Math.max(32, Math.round(srcW * scale))
  const h = Math.max(32, Math.round(srcH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return Math.round(35 + 65 * resolutionScore)
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  // Lightweight sharpness proxy: average local contrast on grayscale.
  let sumDiff = 0
  let count = 0
  const gray = new Float32Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const idx = y * w + x
      const gx = Math.abs(gray[idx] - gray[idx + 1])
      const gy = Math.abs(gray[idx] - gray[idx + w])
      sumDiff += gx + gy
      count += 2
    }
  }
  const meanDiff = count > 0 ? sumDiff / count : 0
  const sharpnessScore = Math.max(0, Math.min(1, meanDiff / 18))

  const finalScore = Math.round((0.45 * resolutionScore + 0.55 * sharpnessScore) * 100)
  return Math.max(1, Math.min(100, finalScore))
}

async function refreshFaces(): Promise<void> {
  const r = (await window.aiface.invoke(IPC_CHANNELS.LIST_FACE_ASSETS)) as {
    ok?: boolean
    error?: string
    items?: FaceDiskItem[]
  }
  if (!r?.ok) {
    message.error(mapErrorMessage(r?.error, 'assets.loadFacesFail'))
    return
  }
  const diskItems = Array.isArray(r.items) ? r.items : []
  const diskMap = new Map<string, FaceDiskItem>()
  for (const it of diskItems) diskMap.set(it.relativePath, it)

  const rows = await db.table_face_metadata.toArray()
  const rowMap = new Map(rows.map((x) => [x.path, x]))

  for (const it of diskItems) {
    if (!rowMap.has(it.relativePath)) {
      const qualityScore = await estimateQualityScoreByImage(it.fileUrl).catch(() => 0)
      const id = await db.table_face_metadata.add({
        path: it.relativePath,
        qualityScore,
        inTraining: false
      })
      rowMap.set(it.relativePath, { id, path: it.relativePath, qualityScore, inTraining: false })
      continue
    }
    const existing = rowMap.get(it.relativePath)
    if (existing && (existing.qualityScore == null || Number.isNaN(existing.qualityScore) || existing.qualityScore <= 0)) {
      const qualityScore = await estimateQualityScoreByImage(it.fileUrl).catch(() => 0)
      if (existing.id != null) {
        await db.table_face_metadata.update(existing.id, { qualityScore })
        existing.qualityScore = qualityScore
      }
    }
  }

  for (const row of rows) {
    if (!diskMap.has(row.path) && row.id != null) {
      await db.table_face_metadata.delete(row.id)
    }
  }

  const synced = await db.table_face_metadata.toArray()
  faces.value = synced
    .filter((x) => diskMap.has(x.path))
    .map((x) => ({
      id: x.id,
      path: x.path,
      fileUrl: diskMap.get(x.path)!.fileUrl,
      inTraining: !!x.inTraining,
      qualityScore: x.qualityScore
    }))
  const maxPage = Math.max(1, Math.ceil(filtered.value.length / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
}

async function importFaces(): Promise<void> {
  importing.value = true
  try {
    const r = (await window.aiface.invoke(IPC_CHANNELS.IMPORT_FACE_ASSETS)) as {
      ok?: boolean
      error?: string
      imported?: string[]
    }
    if (!r?.ok) {
      if (r?.error === 'cancelled') return
      message.error(mapErrorMessage(r?.error, 'assets.importFail'))
      return
    }
    message.success(t('assets.importOk'))
    await refreshFaces()
  } finally {
    importing.value = false
  }
}

async function removeFace(item: FaceVm): Promise<void> {
  const r = (await window.aiface.invoke(IPC_CHANNELS.DELETE_FACE_ASSET, item.path)) as {
    ok?: boolean
    error?: string
  }
  if (!r?.ok) {
    message.error(mapErrorMessage(r?.error, 'assets.deleteFaceFail'))
    return
  }
  if (item.id != null) await db.table_face_metadata.delete(item.id)
  await refreshFaces()
}

async function toggleTraining(item: FaceVm, checked: boolean): Promise<void> {
  if (item.id == null) return
  await db.table_face_metadata.update(item.id, { inTraining: checked })
  item.inTraining = checked
}

void refreshFaces()
</script>

<style scoped>
.name {
  margin-top: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.label {
  font-size: 12px;
  color: #666;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
