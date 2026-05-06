<template>
  <a-card :title="t('onboarding.title')">
    <a-steps :current="step" size="small" style="margin-bottom: 16px">
      <a-step :title="t('onboarding.stepPermissions')" />
      <a-step :title="t('onboarding.stepModels')" />
      <a-step :title="t('onboarding.stepStart')" />
    </a-steps>

    <template v-if="step === 0">
      <a-typography-paragraph>{{ t('onboarding.permissionsHint') }}</a-typography-paragraph>
      <a-tag :color="permissionGranted ? 'green' : 'default'">
        {{ permissionGranted ? t('onboarding.permissionsOk') : t('onboarding.permissionsPending') }}
      </a-tag>
      <div style="margin-top: 12px">
        <a-button type="primary" @click="checkPermissions">{{ t('onboarding.checkPermissions') }}</a-button>
      </div>
    </template>

    <template v-else-if="step === 1">
      <a-typography-paragraph>{{ t('onboarding.modelsHint') }}</a-typography-paragraph>
      <a-tag :color="modelsReady ? 'green' : 'default'">
        {{ modelsReady ? t('onboarding.modelsOk') : t('onboarding.modelsPending') }}
      </a-tag>
      <div style="margin-top: 12px">
        <a-button type="primary" :loading="installing" @click="installModels">
          {{ t('onboarding.installBaseModels') }}
        </a-button>
      </div>
    </template>

    <template v-else>
      <a-typography-paragraph>{{ t('onboarding.startHint') }}</a-typography-paragraph>
    </template>

    <a-space style="margin-top: 16px">
      <a-button :disabled="step === 0" @click="step -= 1">{{ t('onboarding.prev') }}</a-button>
      <a-button v-if="step < 2" type="primary" @click="step += 1">{{ t('onboarding.next') }}</a-button>
      <a-button v-else type="primary" @click="goLive">{{ t('onboarding.finish') }}</a-button>
    </a-space>
  </a-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { mapErrorMessage } from '@renderer/utils/error-message'

const { t } = useI18n()
const router = useRouter()
const step = ref(0)
const permissionGranted = ref(false)
const modelsReady = ref(false)
const installing = ref(false)

async function checkPermissions(): Promise<void> {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    permissionGranted.value = true
    message.success(t('onboarding.permissionsGranted'))
  } catch {
    permissionGranted.value = false
    message.error(t('onboarding.permissionsDenied'))
  }
}

async function installModels(): Promise<void> {
  installing.value = true
  try {
    const r = (await window.aiface.invoke(IPC_CHANNELS.ENSURE_BASE_MODELS)) as { ok?: boolean; error?: string }
    if (r?.ok) {
      modelsReady.value = true
      message.success(t('onboarding.installOk'))
    } else {
      message.error(mapErrorMessage(r?.error, 'onboarding.installFail'))
    }
  } finally {
    installing.value = false
  }
}

function goLive(): void {
  localStorage.setItem('aiface.onboardingDone', '1')
  void router.replace('/live')
}
</script>
