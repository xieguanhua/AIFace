import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('.')

async function readText(path) {
  return readFile(resolve(root, path), 'utf8')
}

function flattenKeys(obj, prefix = '', out = new Set()) {
  if (!obj || typeof obj !== 'object') return out
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key
    out.add(next)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenKeys(value, next, out)
    }
  }
  return out
}

function diffSet(a, b) {
  const list = []
  for (const item of a) {
    if (!b.has(item)) list.push(item)
  }
  return list.sort()
}

function extractObjectValues(tsText, constName) {
  const bodyMatch = tsText.match(new RegExp(`export const ${constName} = \\{([\\s\\S]*?)\\} as const`))
  if (!bodyMatch) return []
  const body = bodyMatch[1] ?? ''
  const values = []
  const re = /:\s*'([^']+)'/g
  let m = re.exec(body)
  while (m) {
    values.push(m[1])
    m = re.exec(body)
  }
  return values
}

function extractErrorCodeMap(errorMessageTs) {
  const bodyMatch = errorMessageTs.match(/const CODE_TO_I18N_KEY[\s\S]*?=\s*\{([\s\S]*?)\}\s*/)
  if (!bodyMatch) return new Map()
  const body = bodyMatch[1] ?? ''
  const map = new Map()
  const re = /^\s*([A-Za-z0-9_]+):\s*'([^']+)'/gm
  let m = re.exec(body)
  while (m) {
    map.set(m[1], m[2])
    m = re.exec(body)
  }
  return map
}

async function main() {
  const zhText = await readText('src/renderer/src/locales/zh-CN.json')
  const enText = await readText('src/renderer/src/locales/en.json')
  const errorMessageTs = await readText('src/renderer/src/utils/error-message.ts')
  const protocolTs = await readText('src/shared/sidecar-protocol.ts')

  const zh = JSON.parse(zhText)
  const en = JSON.parse(enText)

  const zhKeys = flattenKeys(zh)
  const enKeys = flattenKeys(en)

  const onlyZh = diffSet(zhKeys, enKeys)
  const onlyEn = diffSet(enKeys, zhKeys)

  const codeMap = extractErrorCodeMap(errorMessageTs)
  const mappedI18nKeys = Array.from(codeMap.values())
  const missingInZh = mappedI18nKeys.filter((k) => !zhKeys.has(k))
  const missingInEn = mappedI18nKeys.filter((k) => !enKeys.has(k))

  const protocolErrorCodes = [
    ...extractObjectValues(protocolTs, 'SIDECAR_ERROR_CODES'),
    ...extractObjectValues(protocolTs, 'TRAIN_ERROR_CODES')
  ]
  const missingCodeMappings = protocolErrorCodes.filter((code) => !codeMap.has(code))

  const failures = []

  if (onlyZh.length > 0) {
    failures.push(`zh-CN only keys (${onlyZh.length}):\n- ${onlyZh.join('\n- ')}`)
  }
  if (onlyEn.length > 0) {
    failures.push(`en only keys (${onlyEn.length}):\n- ${onlyEn.join('\n- ')}`)
  }
  if (missingInZh.length > 0) {
    failures.push(`mapped i18n keys missing in zh-CN (${missingInZh.length}):\n- ${missingInZh.join('\n- ')}`)
  }
  if (missingInEn.length > 0) {
    failures.push(`mapped i18n keys missing in en (${missingInEn.length}):\n- ${missingInEn.join('\n- ')}`)
  }
  if (missingCodeMappings.length > 0) {
    failures.push(
      `protocol error codes missing mapErrorMessage mapping (${missingCodeMappings.length}):\n- ${missingCodeMappings.join('\n- ')}`
    )
  }

  if (failures.length > 0) {
    console.error('[quality-check] failed')
    for (const msg of failures) {
      console.error(`\n${msg}`)
    }
    process.exit(1)
  }

  console.log('[quality-check] passed')
  console.log(`- locale keys: ${zhKeys.size}`)
  console.log(`- mapped error codes: ${codeMap.size}`)
  console.log(`- protocol error codes covered: ${protocolErrorCodes.length}`)
}

void main()
