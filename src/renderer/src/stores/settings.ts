import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppLocale } from '@renderer/i18n'
import { persistLocale } from '@renderer/i18n'
import { getI18n, applyI18nLocale } from '@renderer/i18n/instance'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/en'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import enUS from 'ant-design-vue/es/locale/en_US'
import type { Locale } from 'ant-design-vue/es/locale'

function applyAntdDayjs(l: AppLocale): Locale {
  document.documentElement.lang = l
  if (l === 'zh-CN') {
    dayjs.locale('zh-cn')
    return zhCN
  }
  dayjs.locale('en')
  return enUS
}

export const useSettingsStore = defineStore('settings', () => {
  const locale = ref<AppLocale>('zh-CN')
  const vramWatermarkMb = ref(14000)
  const trainCudaFraction = ref('0.35')
  const autoStartEngine = ref(true)
  const antdLocale = ref<Locale>(zhCN)

  const STORAGE_KEY = 'aiface.settings.v1'

  function persist(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        locale: locale.value,
        vramWatermarkMb: vramWatermarkMb.value,
        trainCudaFraction: trainCudaFraction.value,
        autoStartEngine: autoStartEngine.value
      })
    )
  }

  function restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const o = JSON.parse(raw) as {
        vramWatermarkMb?: unknown
        trainCudaFraction?: unknown
        autoStartEngine?: unknown
      }
      if (typeof o.vramWatermarkMb === 'number' && Number.isFinite(o.vramWatermarkMb)) {
        vramWatermarkMb.value = o.vramWatermarkMb
      }
      if (typeof o.trainCudaFraction === 'string') {
        trainCudaFraction.value = o.trainCudaFraction
      }
      if (typeof o.autoStartEngine === 'boolean') {
        autoStartEngine.value = o.autoStartEngine
      }
    } catch {
      /* ignore */
    }
  }

  function bootstrapLocale(l: AppLocale): void {
    locale.value = l
    persistLocale(l)
    antdLocale.value = applyAntdDayjs(l)
    const i18n = getI18n()
    if (i18n) applyI18nLocale(i18n, l)
    restore()
    persist()
  }

  function setLocale(l: AppLocale): void {
    locale.value = l
    persistLocale(l)
    antdLocale.value = applyAntdDayjs(l)
    const i18n = getI18n()
    if (i18n) applyI18nLocale(i18n, l)
    persist()
  }

  function setVramWatermark(v: number): void {
    vramWatermarkMb.value = v
    persist()
  }

  function setTrainCudaFraction(v: string): void {
    trainCudaFraction.value = v
    persist()
  }

  function setAutoStartEngine(v: boolean): void {
    autoStartEngine.value = v
    persist()
  }

  return {
    locale,
    vramWatermarkMb,
    trainCudaFraction,
    autoStartEngine,
    antdLocale,
    bootstrapLocale,
    setLocale,
    setVramWatermark,
    setTrainCudaFraction,
    setAutoStartEngine
  }
})
