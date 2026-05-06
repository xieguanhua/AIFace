import { defineStore } from 'pinia'
import { ref } from 'vue'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export const useModelStore = defineStore('model', () => {
  const isModelLoading = ref(false)
  const activeModelId = ref<string | null>(null)
  const stagingModelId = ref<string | null>(null)
  const selectedModelId = ref<string | null>(null)
  const installedModelIds = ref<string[]>([])
  const warmupDone = ref(false)
  const preloadPending = ref(false)
  const swapPending = ref(false)
  const warmupPending = ref(false)
  const lastCommandError = ref<string | null>(null)

  async function sendCommand(name: string, payload?: Record<string, unknown>): Promise<void> {
    const line = JSON.stringify({ type: 'command', name, payload: payload ?? {} })
    await window.aiface.invoke(IPC_CHANNELS.SIDECAR_SEND_LINE, line)
  }

  async function preloadModel(modelId: string): Promise<void> {
    isModelLoading.value = true
    preloadPending.value = true
    stagingModelId.value = modelId
    warmupDone.value = false
    lastCommandError.value = null
    try {
      await sendCommand('preload_model', { modelId })
    } finally {
      // cleared by command_ack; fallback timeout safety
      window.setTimeout(() => {
        preloadPending.value = false
        isModelLoading.value = swapPending.value || warmupPending.value
      }, 3000)
    }
  }

  async function refreshInstalledModels(): Promise<void> {
    const r = (await window.aiface.invoke(IPC_CHANNELS.LIST_INSTALLED_MODELS)) as {
      ok?: boolean
      files?: string[]
    }
    if (!r?.ok) {
      installedModelIds.value = []
      selectedModelId.value = null
      return
    }
    const files = Array.isArray(r.files) ? r.files.map((x) => String(x)) : []
    installedModelIds.value = files
    if (selectedModelId.value && files.includes(selectedModelId.value)) return
    selectedModelId.value = files[0] ?? null
  }

  function setSelectedModel(modelId: string | null): void {
    selectedModelId.value = modelId
  }

  async function swapModel(modelId: string): Promise<void> {
    isModelLoading.value = true
    swapPending.value = true
    lastCommandError.value = null
    try {
      await sendCommand('swap_model', { modelId })
    } finally {
      window.setTimeout(() => {
        swapPending.value = false
        isModelLoading.value = preloadPending.value || warmupPending.value
      }, 3000)
    }
  }

  async function requestWarmup(): Promise<void> {
    isModelLoading.value = true
    warmupPending.value = true
    lastCommandError.value = null
    await sendCommand('warmup_infer', {})
    window.setTimeout(() => {
      warmupPending.value = false
      isModelLoading.value = preloadPending.value || swapPending.value
    }, 3000)
  }

  async function simulateCudaOom(): Promise<void> {
    await window.aiface.invoke(IPC_CHANNELS.DEV_SIMULATE_CUDA_OOM)
  }

  function setWarmupDone(v: boolean): void {
    warmupDone.value = v
  }

  function onCommandAck(command?: string, ok?: boolean, detail?: string): void {
    if (!command) return
    if (ok === false) {
      lastCommandError.value = command
    }
    if (command === 'preload_model') {
      preloadPending.value = false
      isModelLoading.value = swapPending.value || warmupPending.value
      if (ok && typeof detail === 'string' && detail) {
        stagingModelId.value = detail
      }
    }
    if (command === 'swap_model') {
      swapPending.value = false
      if (ok) {
        const id = (typeof detail === 'string' && detail) || stagingModelId.value
        activeModelId.value = id ?? activeModelId.value
        stagingModelId.value = null
      }
      isModelLoading.value = preloadPending.value || warmupPending.value
    }
    if (command === 'warmup_infer') {
      warmupPending.value = false
      if (ok) warmupDone.value = true
      isModelLoading.value = preloadPending.value || swapPending.value
    }
    if (command === 'empty_cache') {
      // no-op: sidecar store drives OOM self-heal UX.
    }
  }

  return {
    isModelLoading,
    activeModelId,
    stagingModelId,
    selectedModelId,
    installedModelIds,
    warmupDone,
    preloadPending,
    swapPending,
    warmupPending,
    lastCommandError,
    preloadModel,
    refreshInstalledModels,
    setSelectedModel,
    swapModel,
    requestWarmup,
    simulateCudaOom,
    sendCommand,
    setWarmupDone,
    onCommandAck
  }
})
