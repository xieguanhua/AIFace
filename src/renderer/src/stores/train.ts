import { defineStore } from 'pinia'
import { ref } from 'vue'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { db, type TrainRunStatus } from '@renderer/db'
import { mapErrorMessage } from '@renderer/utils/error-message'
import { message } from 'ant-design-vue'

export const useTrainStore = defineStore('train', () => {
  const lossPoints = ref<{ step: number; value: number }[]>([])
  const trainRunning = ref(false)
  const trainStatus = ref<TrainRunStatus>('stopped')
  const autoLoopRunning = ref(false)
  const autoLoopIntervalMs = ref(300)
  const currentRunId = ref<string | null>(null)
  const currentStep = ref(0)
  const lastLoss = ref<number | null>(null)
  const recentRuns = ref<
    {
      id: string
      status: TrainRunStatus
      step: number
      lastLoss?: number
      updatedAt: number
    }[]
  >([])
  let autoLoopTimer: ReturnType<typeof setTimeout> | null = null

  interface IpcResult {
    ok?: boolean
    code?: string
  }

  function makeRunId(): string {
    return `run_${Date.now()}_${Math.floor(Math.random() * 10000)}`
  }

  async function refreshRecentRuns(): Promise<void> {
    const rows = await db.table_train_runs.orderBy('updatedAt').reverse().limit(8).toArray()
    recentRuns.value = rows.map((x) => ({
      id: x.id,
      status: x.status,
      step: x.step,
      lastLoss: x.lastLoss,
      updatedAt: x.updatedAt
    }))
  }

  async function ensureRun(status: TrainRunStatus, cudaFraction = '0.35', note?: string): Promise<string> {
    const now = Date.now()
    const id = currentRunId.value ?? makeRunId()
    currentRunId.value = id
    await db.table_train_runs.put({
      id,
      status,
      step: currentStep.value,
      lastLoss: lastLoss.value ?? undefined,
      cudaFraction,
      note,
      createdAt: now,
      updatedAt: now
    })
    await refreshRecentRuns()
    return id
  }

  async function patchRun(status: TrainRunStatus, note?: string): Promise<void> {
    if (!currentRunId.value) return
    await db.table_train_runs.update(currentRunId.value, {
      status,
      step: currentStep.value,
      lastLoss: lastLoss.value ?? undefined,
      note,
      updatedAt: Date.now()
    })
    await refreshRecentRuns()
  }

  function pushLoss(step: number, value: number): void {
    lossPoints.value = [...lossPoints.value, { step, value }].slice(-200)
    currentStep.value = step
    lastLoss.value = value
    void patchRun(trainStatus.value)
  }

  function seedMock(): void {
    lossPoints.value = []
    let v = 0.8
    for (let i = 0; i < 40; i++) {
      v *= 0.97
      pushLoss(i, v + Math.random() * 0.02)
    }
  }

  async function startTrain(cudaFraction = '0.35'): Promise<void> {
    trainStatus.value = 'starting'
    await ensureRun('starting', cudaFraction)
    const result = (await window.aiface.invoke(IPC_CHANNELS.TRAIN_SIDECAR_START, cudaFraction)) as IpcResult
    if (result?.ok === false) {
      trainStatus.value = 'failed'
      await patchRun('failed', result.code)
      message.error(mapErrorMessage(result.code, 'errors.trainInit'))
      return
    }
    trainRunning.value = true
    trainStatus.value = 'running'
    await patchRun('running')
  }

  async function stopTrain(): Promise<void> {
    stopAutoLoop()
    trainStatus.value = 'stopping'
    await patchRun('stopping')
    const result = (await window.aiface.invoke(IPC_CHANNELS.TRAIN_SIDECAR_STOP)) as IpcResult
    if (result?.ok === false) {
      trainStatus.value = 'failed'
      await patchRun('failed', result.code)
      message.error(mapErrorMessage(result.code, 'errors.trainExit'))
      return
    }
    trainRunning.value = false
    trainStatus.value = 'stopped'
    await patchRun('stopped', 'manual_stop')
  }

  async function sendTrainStep(): Promise<void> {
    const line = JSON.stringify({ type: 'command', name: 'train_step', payload: {} })
    await window.aiface.invoke(IPC_CHANNELS.TRAIN_SIDECAR_SEND_LINE, line)
  }

  function clearAutoLoopTimer(): void {
    if (autoLoopTimer) {
      clearTimeout(autoLoopTimer)
      autoLoopTimer = null
    }
  }

  function setAutoLoopInterval(ms: number): void {
    const n = Number(ms)
    if (!Number.isFinite(n)) return
    autoLoopIntervalMs.value = Math.max(100, Math.min(5000, Math.round(n)))
  }

  function scheduleAutoLoopTick(): void {
    clearAutoLoopTimer()
    if (!autoLoopRunning.value) return
    autoLoopTimer = setTimeout(() => {
      void runAutoLoopTick()
    }, autoLoopIntervalMs.value)
  }

  async function runAutoLoopTick(): Promise<void> {
    if (!autoLoopRunning.value) return
    if (!trainRunning.value || trainStatus.value !== 'running') {
      scheduleAutoLoopTick()
      return
    }
    await sendTrainStep().catch(() => undefined)
    scheduleAutoLoopTick()
  }

  function startAutoLoop(): void {
    autoLoopRunning.value = true
    scheduleAutoLoopTick()
  }

  function stopAutoLoop(): void {
    autoLoopRunning.value = false
    clearAutoLoopTimer()
  }

  async function pauseTrain(): Promise<void> {
    stopAutoLoop()
    const line = JSON.stringify({ type: 'command', name: 'pause_train', payload: {} })
    const result = (await window.aiface.invoke(IPC_CHANNELS.TRAIN_SIDECAR_SEND_LINE, line)) as IpcResult
    if (result?.ok === false) {
      message.error(mapErrorMessage(result.code, 'errors.invalidCommandJson'))
      return
    }
    trainStatus.value = 'paused'
    trainRunning.value = false
    await patchRun('paused')
  }

  async function resumeTrain(): Promise<void> {
    const line = JSON.stringify({ type: 'command', name: 'resume_train', payload: {} })
    const result = (await window.aiface.invoke(IPC_CHANNELS.TRAIN_SIDECAR_SEND_LINE, line)) as IpcResult
    if (result?.ok === false) {
      message.error(mapErrorMessage(result.code, 'errors.invalidCommandJson'))
      return
    }
    trainStatus.value = 'running'
    trainRunning.value = true
    await patchRun('running')
  }

  function setTrainRunning(v: boolean): void {
    trainRunning.value = v
    if (!v) stopAutoLoop()
  }

  function setTrainStatus(status: TrainRunStatus): void {
    trainStatus.value = status
    trainRunning.value = status === 'running' || status === 'starting' || status === 'stopping'
    if (status !== 'running') stopAutoLoop()
    void patchRun(status)
  }

  async function bootstrap(): Promise<void> {
    await refreshRecentRuns()
  }

  return {
    lossPoints,
    trainRunning,
    trainStatus,
    autoLoopRunning,
    autoLoopIntervalMs,
    currentStep,
    lastLoss,
    recentRuns,
    pushLoss,
    seedMock,
    startTrain,
    stopTrain,
    pauseTrain,
    resumeTrain,
    sendTrainStep,
    startAutoLoop,
    stopAutoLoop,
    setAutoLoopInterval,
    setTrainRunning,
    setTrainStatus,
    bootstrap
  }
})
