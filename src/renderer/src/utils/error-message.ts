import { translate } from '@renderer/i18n/instance'

const CODE_TO_I18N_KEY: Record<string, string> = {
  CUDA_OOM: 'errors.cudaOom',
  SIDECAR_EXIT: 'errors.sidecarExit',
  INVALID_IPC_ARGS: 'errors.invalidIpcArgs',
  INVALID_COMMAND_JSON: 'errors.invalidCommandJson',
  INVALID_TRAIN_COMMAND: 'errors.invalidTrainCommand',
  MODEL_LOAD_TIMEOUT: 'errors.modelLoadTimeout',
  TRAIN_SCRIPT_MISSING: 'errors.trainScriptMissing',
  TRAIN_INIT: 'errors.trainInit',
  TRAIN_EXIT: 'errors.trainExit',
  IO_ERROR: 'errors.ioError',
  OPEN_EXTERNAL_FAILED: 'errors.openExternalFailed',
  CATALOG_MISSING: 'errors.catalogMissing',
  BUNDLED_MODELS_MISSING: 'errors.bundledModelsMissing',
  UNSUPPORTED_EXT: 'errors.unsupportedExt',
  SHA256_MISMATCH: 'assets.shaMismatch',
  INVALID_PATH: 'assets.invalidPath',
  cancelled: 'assets.cancelled',
  DOWNLOAD_HTTP_ERROR: 'errors.downloadHttpError',
  DOWNLOAD_FAILED: 'errors.downloadFailed',
  TRT_SCRIPT_MISSING: 'errors.trtScriptMissing',
  TRT_BUILD_FAILED: 'errors.trtBuildFailed'
}

export function mapErrorMessage(codeOrMessage: string | null | undefined, fallbackKey?: string): string {
  const raw = String(codeOrMessage ?? '').trim()
  if (raw) {
    const key = CODE_TO_I18N_KEY[raw]
    if (key) return translate(key)
    return raw
  }
  if (fallbackKey) return translate(fallbackKey)
  return ''
}
