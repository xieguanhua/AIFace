<template>
  <a-card :title="t('dashboard.title')">
    <a-space direction="vertical" style="width: 100%">
      <a-typography-paragraph>{{ t('dashboard.placeholder') }}</a-typography-paragraph>
      <a-button type="primary" :loading="loading" @click="refresh">{{ t('dashboard.hardware') }}</a-button>
      <a-descriptions v-if="hw.summary" bordered size="small" :column="1">
        <a-descriptions-item :label="t('dashboard.platform')">
          {{ String(hw.summary.platform ?? '—') }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('dashboard.cpu')">
          {{ String(hw.summary.cpuModel ?? '—') }} ({{ String(hw.summary.cpuCores ?? '—') }} cores)
        </a-descriptions-item>
        <a-descriptions-item :label="t('dashboard.ram')">
          {{ String(hw.summary.ramFreeMb ?? '—') }} / {{ String(hw.summary.ramTotalMb ?? '—') }} MB
        </a-descriptions-item>
        <a-descriptions-item :label="t('dashboard.gpu')">
          {{ String(hw.summary.gpuName ?? '—') }}
        </a-descriptions-item>
        <a-descriptions-item :label="t('dashboard.vram')">
          {{ String(hw.summary.vramUsedMb ?? '—') }} / {{ String(hw.summary.vramTotalMb ?? '—') }} MB
        </a-descriptions-item>
        <a-descriptions-item :label="t('dashboard.runtime')">
          Electron {{ String(hw.summary.electron ?? '—') }}, Node {{ String(hw.summary.node ?? '—') }}
        </a-descriptions-item>
      </a-descriptions>
    </a-space>
  </a-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHardwareStore } from '@renderer/stores/hardware'

const { t } = useI18n()
const hw = useHardwareStore()
const loading = ref(false)

async function refresh(): Promise<void> {
  loading.value = true
  try {
    await hw.refreshSummary()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped></style>
