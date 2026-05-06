import { defineStore } from 'pinia'
import { ref } from 'vue'

export type PreviewEdge = 512 | 768 | 1024

export const useLiveStore = defineStore('live', () => {
  const sourceFaceId = ref(0)
  const codeFormer = ref(0.5)
  const codeFormerEnabled = ref(true)
  const trtPrecision = ref<'fp16' | 'fp32' | 'int8'>('fp16')
  const rvcIndexRate = ref(0.75)
  const streamDelayMs = ref(30)
  const isStreaming = ref(false)
  /** Max edge for inference / preview downgrade (OOM self-heal). */
  const previewMaxEdge = ref<PreviewEdge>(1024)
  /** Visual compensation: grain injection 0–1 (Python set_params). */
  const grainStrength = ref(0)
  /** Mouth-region motion blur 0–1 (Python vision_post). */
  const motionBlur = ref(0)

  function applyOomDegradation(): void {
    if (previewMaxEdge.value >= 1024) {
      previewMaxEdge.value = 768
    } else if (previewMaxEdge.value >= 768) {
      previewMaxEdge.value = 512
    }
    codeFormer.value = Math.min(codeFormer.value, 0.35)
    codeFormerEnabled.value = false
  }

  function resetPreviewBudget(): void {
    previewMaxEdge.value = 1024
    codeFormerEnabled.value = true
  }

  return {
    sourceFaceId,
    codeFormer,
    codeFormerEnabled,
    trtPrecision,
    rvcIndexRate,
    streamDelayMs,
    isStreaming,
    previewMaxEdge,
    grainStrength,
    motionBlur,
    applyOomDegradation,
    resetPreviewBudget
  }
})
