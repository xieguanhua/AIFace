import { createI18n } from 'vue-i18n'
import zhCN from '../locales/zh-CN.json'
import en from '../locales/en.json'

export type AppLocale = 'zh-CN' | 'en'

const STORAGE_KEY = 'aiface.locale'

export function pickLocaleFromHint(electronLocale: string, navLanguage: string): AppLocale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'zh-CN' || saved === 'en') return saved
  const e = electronLocale.trim().toLowerCase()
  if (e.startsWith('zh')) return 'zh-CN'
  const n = navLanguage.toLowerCase()
  if (n.startsWith('zh')) return 'zh-CN'
  return 'en'
}

export function persistLocale(locale: AppLocale): void {
  localStorage.setItem(STORAGE_KEY, locale)
}

export function createAppI18n(initial: AppLocale) {
  return createI18n({
    legacy: false,
    locale: initial,
    fallbackLocale: 'zh-CN',
    globalInjection: true,
    messages: {
      'zh-CN': zhCN,
      en
    }
  })
}
