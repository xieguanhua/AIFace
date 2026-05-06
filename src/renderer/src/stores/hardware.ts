import { defineStore } from 'pinia'
import { ref } from 'vue'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export const useHardwareStore = defineStore('hardware', () => {
  const summary = ref<Record<string, unknown> | null>(null)
  const remainingVramMb = ref<number | null>(null)

  async function refreshSummary(): Promise<void> {
    const r = (await window.aiface.invoke(IPC_CHANNELS.GET_HARDWARE_SUMMARY)) as Record<
      string,
      unknown
    >
    summary.value = r
  }

  return { summary, remainingVramMb, refreshSummary }
})
