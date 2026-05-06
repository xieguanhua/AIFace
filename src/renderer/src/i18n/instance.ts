import type { I18n } from 'vue-i18n'

let _i18n: I18n | null = null

export function setI18nInstance(i: I18n): void {
  _i18n = i
}

export function getI18n(): I18n | null {
  return _i18n
}

export function translate(key: string): string {
  if (!_i18n) return key
  const t = _i18n.global.t as (k: string) => string
  return String(t(key))
}

function setGlobalLocale(i18n: I18n, locale: string): void {
  const g = i18n.global as unknown as { locale: { value: string } | string }
  if (typeof g.locale === 'object' && g.locale !== null && 'value' in g.locale) {
    g.locale.value = locale
  }
}

export function applyI18nLocale(i18n: I18n, locale: string): void {
  setGlobalLocale(i18n, locale)
}
