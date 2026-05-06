import { defineStore } from 'pinia'
import { ref } from 'vue'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { message } from 'ant-design-vue'
import { translate } from '@renderer/i18n/instance'
import { useLiveStore } from './live'
import { useModelStore } from './model'

export const useSidecarStore = defineStore('sidecar', () => {
  const connected = ref(false)
  const stale = ref(false)
  const lastMessageAt = ref(0)
  const lastMetrics = ref<{
    fps?: number
    inferenceMs?: number
    vramUsedMb?: number
    vramTotalMb?: number
    droppedFrames?: number
  } | null>(null)

  let off: (() => void) | null = null
  let oomWindow: number[] = []
  let staleTimer: ReturnType<typeof setInterval> | null = null

  function pruneOomWindow(now: number): void {
    oomWindow = oomWindow.filter((t) => now - t < 60_000)
  }

  async function requestEmptyCache(): Promise<void> {
    const line = JSON.stringify({ type: 'command', name: 'empty_cache', payload: {} })
    await window.aiface.invoke(IPC_CHANNELS.SIDECAR_SEND_LINE, line)
  }

  function handleCudaOom(): void {
    const now = Date.now()
    pruneOomWindow(now)
    if (oomWindow.length >= 3) {
      message.error(translate('errors.cudaOomLimit'))
      return
    }
    oomWindow.push(now)
    message.warning(translate('errors.cudaOom'))
    useLiveStore().applyOomDegradation()
  }

  function subscribe(): void {
    if (off) return
    if (!staleTimer) {
      staleTimer = setInterval(() => {
        if (!connected.value) {
          stale.value = false
          return
        }
        stale.value = Date.now() - lastMessageAt.value > 5_000
      }, 1000)
    }
    off = window.aiface.onSidecarMessage((raw) => {
      const m = raw as { type?: string; code?: string }
      lastMessageAt.value = Date.now()
      stale.value = false
      if (m.type === 'ready') connected.value = true
      if (m.type === 'metrics') {
        connected.value = true
        lastMetrics.value = m as typeof lastMetrics.value
      }
      if (m.type === 'error' && m.code === 'SIDECAR_EXIT') {
        connected.value = false
        stale.value = false
        message.warning(translate('errors.sidecarExit'))
      }
      if (m.type === 'error' && m.code === 'CUDA_OOM') {
        handleCudaOom()
      }
      if (m.type === 'command_ack') {
        const ack = m as { command?: string; ok?: boolean; detail?: string }
        useModelStore().onCommandAck(ack.command, ack.ok, ack.detail)
      }
    })
  }

  function unsubscribe(): void {
    off?.()
    off = null
    if (staleTimer) {
      clearInterval(staleTimer)
      staleTimer = null
    }
  }

  async function start(): Promise<void> {
    subscribe()
    await window.aiface.invoke(IPC_CHANNELS.SIDECAR_START)
  }

  async function stop(): Promise<void> {
    await window.aiface.invoke(IPC_CHANNELS.SIDECAR_STOP)
    connected.value = false
    stale.value = false
  }

  return { connected, stale, lastMessageAt, lastMetrics, start, stop, subscribe, unsubscribe, requestEmptyCache }
})
