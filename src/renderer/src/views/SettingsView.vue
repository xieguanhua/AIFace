<template>
  <a-card :title="t('settings.title')">
    <a-form layout="vertical" style="max-width: 480px">
      <a-form-item :label="t('settings.locale')">
        <a-select
          :value="settings.locale"
          style="width: 100%"
          @update:value="onLocale"
        >
          <a-select-option value="zh-CN">中文</a-select-option>
          <a-select-option value="en">English</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item :label="t('settings.vramWatermark')">
        <a-input-number
          :value="settings.vramWatermarkMb"
          :min="1024"
          :max="65536"
          style="width: 100%"
          @update:value="onVramWatermark"
        />
      </a-form-item>
      <a-form-item :label="t('settings.trainCudaFraction')">
        <a-input
          :value="settings.trainCudaFraction"
          placeholder="0.35"
          @update:value="onTrainCudaFraction"
        />
      </a-form-item>
      <a-form-item :label="t('settings.autoStartEngine')">
        <a-switch :checked="settings.autoStartEngine" @update:checked="onAutoStartEngine" />
      </a-form-item>
      <a-form-item>
        <a-space>
          <a-button @click="openLogs">{{ t('settings.openLogs') }}</a-button>
        </a-space>
      </a-form-item>
      <a-divider>{{ t('settings.trtBuild') }}</a-divider>
      <a-form-item :label="t('settings.trtOnnxPath')">
        <a-input v-model:value="trtOnnx" :placeholder="t('settings.trtOnnxPlaceholder')" />
      </a-form-item>
      <a-form-item :label="t('settings.trtEnginePath')">
        <a-input v-model:value="trtEngine" :placeholder="t('settings.trtEnginePlaceholder')" />
      </a-form-item>
      <a-form-item>
        <a-space>
          <a-checkbox v-model:checked="trtFp16">{{ t('settings.trtFp16') }}</a-checkbox>
          <a-checkbox v-model:checked="trtInt8">{{ t('settings.trtInt8') }}</a-checkbox>
          <a-button :loading="trtLoading" @click="runTrtBuild">{{ t('settings.trtRun') }}</a-button>
        </a-space>
      </a-form-item>
      <a-typography-paragraph v-if="trtLast" type="secondary" copyable>{{ trtLast }}</a-typography-paragraph>
    </a-form>
  </a-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { useSettingsStore } from '@renderer/stores/settings'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { AppLocale } from '@renderer/i18n'
import { mapErrorMessage } from '@renderer/utils/error-message'

const { t } = useI18n()
const settings = useSettingsStore()

const trtOnnx = ref('')
const trtEngine = ref('')
const trtFp16 = ref(true)
const trtInt8 = ref(false)
const trtLoading = ref(false)
const trtLast = ref('')

async function runTrtBuild(): Promise<void> {
  if (!trtOnnx.value.trim() || !trtEngine.value.trim()) {
    message.warning(t('settings.trtNeedPaths'))
    return
  }
  trtLoading.value = true
  trtLast.value = ''
  try {
    const r = (await window.aiface.invoke(IPC_CHANNELS.TRT_BUILD_RUN, {
      onnxPath: trtOnnx.value.trim(),
      enginePath: trtEngine.value.trim(),
      fp16: trtFp16.value,
      int8: trtInt8.value
    })) as { ok?: boolean; stderr?: string; code?: number; error?: string }
    if (r?.ok) {
      message.success(t('settings.trtOk'))
    } else {
      trtLast.value = r?.stderr ?? r?.error ?? `code ${r?.code ?? '—'}`
      if (r?.error) {
        message.error(mapErrorMessage(r.error, 'settings.trtFail'))
        return
      }
      message.error(t('settings.trtFail'))
    }
  } finally {
    trtLoading.value = false
  }
}

function onLocale(v: AppLocale | null): void {
  if (!v) return
  settings.setLocale(v)
  message.success(t('settings.saved'))
}

async function openLogs(): Promise<void> {
  await window.aiface.invoke(IPC_CHANNELS.OPEN_LOG_DIR)
}

function onVramWatermark(v: number | null): void {
  if (typeof v === 'number') settings.setVramWatermark(v)
}

function onTrainCudaFraction(v: string): void {
  settings.setTrainCudaFraction(v)
}

function onAutoStartEngine(v: boolean): void {
  settings.setAutoStartEngine(v)
}
</script>
