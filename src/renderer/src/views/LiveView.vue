<template>
  <a-row :gutter="16" class="live">
    <a-col :xs="24" :lg="10">
      <a-card :title="t('live.center')" size="small">
        <a-space direction="vertical" style="width: 100%">
          <video ref="videoRef" class="preview" autoplay playsinline muted />
          <a-space>
            <a-button type="primary" @click="startCam">{{ t('live.startCamera') }}</a-button>
            <a-button danger @click="stopCam">{{ t('live.stopCamera') }}</a-button>
          </a-space>
          <a-divider>{{ t('live.engineOutput') }}</a-divider>
          <canvas ref="canvasRef" class="preview canvas-out" />
          <a-divider />
          <div>
            <div class="label">{{ t('live.previewBudget') }}</div>
            <a-select
              :value="live.previewMaxEdge"
              style="width: 100%"
              @update:value="onPreviewEdge"
            >
              <a-select-option :value="512">512</a-select-option>
              <a-select-option :value="768">768</a-select-option>
              <a-select-option :value="1024">1024</a-select-option>
            </a-select>
          </div>
          <div>
            <a-space>
              <span class="label">{{ t('live.codeFormerOn') }}</span>
              <a-switch v-model:checked="live.codeFormerEnabled" />
            </a-space>
            <div class="label">{{ t('live.codeFormer') }}</div>
            <a-slider v-model:value="live.codeFormer" :min="0" :max="1" :step="0.05" :disabled="!live.codeFormerEnabled" />
          </div>
          <div>
            <div class="label">{{ t('live.grain') }}</div>
            <a-slider v-model:value="live.grainStrength" :min="0" :max="1" :step="0.05" />
          </div>
          <div>
            <div class="label">{{ t('live.motionBlur') }}</div>
            <a-slider v-model:value="live.motionBlur" :min="0" :max="1" :step="0.05" />
          </div>
          <div>
            <div class="label">{{ t('live.sourceFace') }}</div>
            <a-slider v-model:value="live.sourceFaceId" :min="0" :max="8" />
          </div>
          <div>
            <div class="label">{{ t('live.trtPrecision') }}</div>
            <a-select v-model:value="live.trtPrecision" style="width: 100%">
              <a-select-option value="fp16">fp16</a-select-option>
              <a-select-option value="fp32">fp32</a-select-option>
              <a-select-option value="int8">int8</a-select-option>
            </a-select>
          </div>
          <div>
            <div class="label">{{ t('live.rvcIndex') }}</div>
            <a-slider v-model:value="live.rvcIndexRate" :min="0" :max="1" :step="0.05" />
          </div>
          <a-button size="small" @click="live.resetPreviewBudget">{{ t('live.resetBudget') }}</a-button>
        </a-space>
      </a-card>
    </a-col>
    <a-col :xs="24" :lg="8">
      <a-card :title="t('live.right')" size="small">
        <a-space direction="vertical" style="width: 100%">
          <a-space>
            <a-button type="primary" @click="startEngine">{{ t('live.startSidecar') }}</a-button>
            <a-button @click="stopEngine">{{ t('live.stopSidecar') }}</a-button>
          </a-space>
          <a-tag :color="sidecar.connected ? 'green' : 'default'">
            {{ sidecar.connected ? t('live.sidecarOk') : t('live.sidecarIdle') }}
          </a-tag>
          <a-tag v-if="sidecar.stale" color="orange">{{ t('live.sidecarStale') }}</a-tag>
          <div>
            <div class="label">{{ t('live.metrics') }}</div>
            <a-descriptions bordered size="small" :column="1">
              <a-descriptions-item :label="t('live.fps')">
                {{ fmt(sidecar.lastMetrics?.fps) }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('live.inferMs')">
                {{ fmt(sidecar.lastMetrics?.inferenceMs) }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('live.vram')">
                {{ vramText }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('live.droppedFrames')">
                {{ sidecar.lastMetrics?.droppedFrames ?? '—' }}
              </a-descriptions-item>
            </a-descriptions>
          </div>
          <a-divider orientation="left">{{ t('live.modelSection') }}</a-divider>
          <a-space wrap>
            <a-button
              size="small"
              :loading="model.isModelLoading"
              :disabled="model.preloadPending || model.swapPending"
              @click="model.preloadModel('demo-a')"
            >
              {{ t('live.preload') }} demo-a
            </a-button>
            <a-button
              size="small"
              :loading="model.swapPending"
              :disabled="!model.stagingModelId || model.preloadPending || model.swapPending"
              @click="model.swapModel('demo-a')"
            >
              {{ t('live.swapModel') }}
            </a-button>
            <a-button
              size="small"
              :loading="model.warmupPending"
              :disabled="!model.activeModelId || model.warmupPending"
              @click="model.requestWarmup"
            >
              {{ t('live.warmup') }}
            </a-button>
            <a-tag v-if="model.warmupDone" color="blue">{{ t('live.warmupOk') }}</a-tag>
            <a-tag v-if="model.stagingModelId" color="orange">{{ t('live.preloadReady') }}</a-tag>
            <a-tag v-if="model.activeModelId" color="green">{{ t('live.activeModel') }}: {{ model.activeModelId }}</a-tag>
          </a-space>
          <a-button v-if="isDev" size="small" danger @click="model.simulateCudaOom">
            {{ t('live.simulateOom') }}
          </a-button>
          <div>
            <div class="label">AV delay (ms)</div>
            <a-slider v-model:value="live.streamDelayMs" :min="0" :max="200" />
          </div>
        </a-space>
      </a-card>
    </a-col>
  </a-row>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PreviewEdge } from '@renderer/stores/live'
import { useLiveStore } from '@renderer/stores/live'
import { useSidecarStore } from '@renderer/stores/sidecar'
import { useModelStore } from '@renderer/stores/model'
import { useSettingsStore } from '@renderer/stores/settings'

const { t } = useI18n()
const isDev = import.meta.env.DEV

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let mediaStream: MediaStream | null = null
let offFrame: (() => void) | null = null
let paramTimer: ReturnType<typeof setTimeout> | null = null
let frameWorker: Worker | null = null

const live = useLiveStore()
const sidecar = useSidecarStore()
const model = useModelStore()
const settings = useSettingsStore()

const vramText = computed(() => {
  const m = sidecar.lastMetrics
  if (!m?.vramUsedMb) return '—'
  const t2 = m.vramTotalMb ? ` / ${Math.round(m.vramTotalMb)}` : ''
  return `${Math.round(m.vramUsedMb)}${t2}`
})

function fmt(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(1)
}

function onPreviewEdge(v: number): void {
  live.$patch({ previewMaxEdge: v as PreviewEdge })
}

function scheduleParamSync(): void {
  if (paramTimer) clearTimeout(paramTimer)
  paramTimer = setTimeout(() => {
    void model.sendCommand('set_params', {
      grainStrength: live.grainStrength,
      motionBlur: live.motionBlur,
      previewMaxEdge: live.previewMaxEdge,
      codeFormer: live.codeFormer,
      codeFormerEnabled: live.codeFormerEnabled
    })
  }, 300)
}

watch(
  () => [
    live.grainStrength,
    live.motionBlur,
    live.previewMaxEdge,
    live.codeFormer,
    live.codeFormerEnabled
  ],
  () => scheduleParamSync(),
  { deep: true }
)

function drawFrameMainThread(meta: { width: number; height: number; pixelFormat: string }, ab: ArrayBuffer): void {
  const c = canvasRef.value
  if (!c || meta.pixelFormat !== 'rgba') return
  c.width = meta.width
  c.height = meta.height
  const ctx = c.getContext('2d')
  if (!ctx) return
  const arr = new Uint8ClampedArray(ab)
  ctx.putImageData(new ImageData(arr, meta.width, meta.height), 0, 0)
}

async function startCam(): Promise<void> {
  stopCam()
  mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  if (videoRef.value) videoRef.value.srcObject = mediaStream
}

function stopCam(): void {
  mediaStream?.getTracks().forEach((x) => x.stop())
  mediaStream = null
  if (videoRef.value) videoRef.value.srcObject = null
}

async function startEngine(): Promise<void> {
  await sidecar.start()
}

async function stopEngine(): Promise<void> {
  await sidecar.stop()
}

onMounted(() => {
  void nextTick(() => {
    const c = canvasRef.value
    if (c && typeof c.transferControlToOffscreen === 'function') {
      try {
        const off = c.transferControlToOffscreen()
        frameWorker = new Worker(new URL('../workers/frame-draw.worker.ts', import.meta.url), {
          type: 'module'
        })
        const init: Record<string, unknown> = { type: 'init', canvas: off }
        if (typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated) {
          init.sab = new SharedArrayBuffer(1024 * 1024 * 4)
        }
        frameWorker.postMessage(init, [off])
      } catch (e) {
        console.warn('[LiveView] Offscreen worker fallback:', e)
        frameWorker = null
      }
    }
  })

  offFrame = window.aiface.onFramePixels((meta, ab) => {
    if (meta.pixelFormat !== 'rgba') return
    if (frameWorker) {
      frameWorker.postMessage({ type: 'frame', meta, buffer: ab }, [ab])
    } else {
      drawFrameMainThread(meta, ab)
    }
  })
  if (settings.autoStartEngine && !sidecar.connected) {
    void startEngine()
  }
})

onUnmounted(() => {
  stopCam()
  offFrame?.()
  offFrame = null
  frameWorker?.terminate()
  frameWorker = null
  if (paramTimer) clearTimeout(paramTimer)
})
</script>

<style scoped>
.live {
  align-items: stretch;
}
.preview {
  width: 100%;
  max-height: 360px;
  background: #000;
  border-radius: 8px;
}
.canvas-out {
  max-height: 280px;
}
.label {
  margin-bottom: 4px;
  font-size: 12px;
  color: #666;
}
</style>
