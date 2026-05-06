export const IPC_CHANNELS = {
  PING: 'aiface:ping',
  GET_LOCALE_HINT: 'aiface:get-locale-hint',
  GET_HARDWARE_SUMMARY: 'aiface:get-hardware-summary',
  SIDECAR_START: 'aiface:sidecar-start',
  SIDECAR_STOP: 'aiface:sidecar-stop',
  SIDECAR_SEND_LINE: 'aiface:sidecar-send-line',
  SIDECAR_GET_STATE: 'aiface:sidecar-get-state',
  OPEN_LOG_DIR: 'aiface:open-log-dir',
  /** Dev / QA: push CUDA_OOM through the same handler path as real Sidecar. */
  DEV_SIMULATE_CUDA_OOM: 'aiface:dev-simulate-cuda-oom',
  /** Model vault: get catalog bundled with app (and/or remote). */
  GET_MODEL_CATALOG: 'aiface:get-model-catalog',
  /** Model vault: list installed files under userData/models. */
  LIST_INSTALLED_MODELS: 'aiface:list-installed-models',
  /** Onboarding: ensure bundled base models installed to userData/models. */
  ENSURE_BASE_MODELS: 'aiface:ensure-base-models',
  /** Model vault: import user-selected local model file into userData/models/custom. */
  IMPORT_LOCAL_MODEL: 'aiface:import-local-model',
  /** Face assets: import user-selected face images into userData/faces. */
  IMPORT_FACE_ASSETS: 'aiface:import-face-assets',
  /** Face assets: list all face files from userData/faces. */
  LIST_FACE_ASSETS: 'aiface:list-face-assets',
  /** Face assets: delete a single face file from userData/faces. */
  DELETE_FACE_ASSET: 'aiface:delete-face-asset',
  /** Open external URL in system browser. */
  OPEN_EXTERNAL: 'aiface:open-external',
  DOWNLOAD_MODEL: 'aiface:download-model',
  CANCEL_DOWNLOAD: 'aiface:cancel-download',
  TRAIN_SIDECAR_START: 'aiface:train-sidecar-start',
  TRAIN_SIDECAR_STOP: 'aiface:train-sidecar-stop',
  TRAIN_SIDECAR_SEND_LINE: 'aiface:train-sidecar-send-line',
  TRAIN_GET_STATE: 'aiface:train-get-state',
  TRT_BUILD_RUN: 'aiface:trt-build-run'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
