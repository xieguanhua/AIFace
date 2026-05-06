<template>
  <a-card :title="t('dashboard.title')">
    <a-space direction="vertical" style="width: 100%">
      <a-typography-paragraph>{{ t('dashboard.placeholder') }}</a-typography-paragraph>
      <a-button type="primary" :loading="loading" @click="refresh">{{ t('dashboard.hardware') }}</a-button>
      <pre v-if="hw.summary" class="json">{{ JSON.stringify(hw.summary, null, 2) }}</pre>
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

<style scoped>
.json {
  background: #111;
  color: #e6e6e6;
  padding: 12px;
  border-radius: 8px;
  overflow: auto;
  max-height: 320px;
}
</style>
