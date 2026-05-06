import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import router from './router'
import type { I18n } from 'vue-i18n'
import { createAppI18n, pickLocaleFromHint } from './i18n'
import { setI18nInstance } from './i18n/instance'
import { useSettingsStore } from './stores/settings'
import { useTrainStore } from './stores/train'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { db, seedDefaultPreset } from './db'

const BASE_MODELS_INSTALLED_KEY = 'aiface.baseModelsInstalled'
const ONBOARDING_DONE_KEY = 'aiface.onboardingDone'

async function bootstrap(): Promise<void> {
  let hint = ''
  try {
    const r = (await window.aiface.invoke(IPC_CHANNELS.GET_LOCALE_HINT)) as { locale?: string }
    hint = r?.locale ?? ''
  } catch {
    hint = ''
  }

  const initial = pickLocaleFromHint(hint, navigator.language)
  const i18n = createAppI18n(initial)
  setI18nInstance(i18n as I18n)

  await db.open()
  await seedDefaultPreset()

  const app = createApp(App)
  app.use(createPinia())
  app.use(i18n)
  app.use(router)
  app.use(Antd)

  const settings = useSettingsStore()
  const trainStore = useTrainStore()
  settings.bootstrapLocale(initial)
  await trainStore.bootstrap()

  window.aiface.onTrainMessage((msg) => {
    if (
      msg.type === 'train_log' &&
      'step' in msg &&
      'loss' in msg &&
      typeof msg.step === 'number' &&
      typeof msg.loss === 'number'
    ) {
      trainStore.pushLoss(msg.step, msg.loss)
    }
    if (
      msg.type === 'ready' &&
      'capabilities' in msg &&
      Array.isArray(msg.capabilities) &&
      msg.capabilities.includes('train')
    ) {
      trainStore.setTrainRunning(true)
    }
    if (msg.type === 'train_status' && 'state' in msg) {
      trainStore.setTrainStatus(msg.state)
    }
    if (msg.type === 'error' && 'code' in msg && msg.code === 'TRAIN_EXIT') {
      trainStore.setTrainStatus('failed')
    }
  })

  app.mount('#app')

  if (localStorage.getItem(ONBOARDING_DONE_KEY) !== '1') {
    await router.replace('/onboarding')
  }

  // First run default: install bundled base models silently.
  if (localStorage.getItem(BASE_MODELS_INSTALLED_KEY) !== '1') {
    try {
      const r = (await window.aiface.invoke(IPC_CHANNELS.ENSURE_BASE_MODELS)) as { ok?: boolean }
      if (r?.ok) localStorage.setItem(BASE_MODELS_INSTALLED_KEY, '1')
    } catch {
      // Silent: user can still install via Model Vault button.
    }
  }
}

void bootstrap()
