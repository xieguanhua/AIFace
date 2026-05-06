/** NDJSON line types: Python Sidecar → Node (stdout). */
export type SidecarMessageType =
  | 'ready'
  | 'metrics'
  | 'frame'
  | 'frame_ready'
  | 'error'
  | 'train_log'
  | 'train_status'
  | 'pong'
  | 'command_ack'

export interface SidecarTrainLog extends SidecarMessageBase {
  type: 'train_log'
  step?: number
  loss?: number
}

export type TrainWorkerState = 'starting' | 'running' | 'stopping' | 'stopped'

export interface SidecarTrainStatus extends SidecarMessageBase {
  type: 'train_status'
  state: TrainWorkerState
  reason?: string
}

export type PixelFormat = 'rgba' | 'bgr24'

export interface SidecarMessageBase {
  type: SidecarMessageType
  protocolVersion?: number
}

export interface SidecarReady extends SidecarMessageBase {
  type: 'ready'
  pythonVersion?: string
  capabilities?: string[]
  frameBufferPath?: string
}

export interface SidecarMetrics extends SidecarMessageBase {
  type: 'metrics'
  fps?: number
  inferenceMs?: number
  vramUsedMb?: number
  vramTotalMb?: number
  droppedFrames?: number
}

/**
 * v2: pixels in mmap file shmPath.
 * - If `slotIndex` set: multi-slot ring at `ring_layout` (meta + RGBA in slot).
 * - Else legacy flat: `[offset, offset + byteLength)`.
 */
export interface SidecarFrameReady extends SidecarMessageBase {
  type: 'frame_ready'
  protocolVersion: 2
  shmPath: string
  offset: number
  byteLength: number
  width: number
  height: number
  pixelFormat: PixelFormat
  frameId: number
  timestampMs?: number
  /** Ring buffer slot 0..RING_SLOT_COUNT-1 */
  slotIndex?: number
}

export interface SidecarError extends SidecarMessageBase {
  type: 'error'
  code: string
  details?: string
  recoverable?: boolean
  suggest?: ('empty_cache' | 'lower_resolution' | 'disable_codeformer')[]
}

export interface SidecarCommandAck extends SidecarMessageBase {
  type: 'command_ack'
  command?: string
  ok?: boolean
  detail?: string
}

export type SidecarMessage =
  | SidecarReady
  | SidecarMetrics
  | SidecarFrameReady
  | SidecarError
  | SidecarCommandAck
  | SidecarTrainLog
  | SidecarTrainStatus
  | SidecarMessageBase

export function parseSidecarLine(line: string): SidecarMessage | null {
  const t = line.trim()
  if (!t) return null
  try {
    const o = JSON.parse(t) as SidecarMessage
    if (o && typeof o === 'object' && typeof o.type === 'string') return o
  } catch {
    /* ignore */
  }
  return null
}

/** Well-known error codes for i18n / self-heal. */
export const SIDECAR_ERROR_CODES = {
  SIDECAR_EXIT: 'SIDECAR_EXIT',
  CUDA_OOM: 'CUDA_OOM',
  MODEL_LOAD_TIMEOUT: 'MODEL_LOAD_TIMEOUT',
  INVALID_IPC_ARGS: 'INVALID_IPC_ARGS',
  INVALID_COMMAND_JSON: 'INVALID_COMMAND_JSON',
  INVALID_TRAIN_COMMAND: 'INVALID_TRAIN_COMMAND'
} as const

/** Well-known train worker related codes for renderer mapping. */
export const TRAIN_ERROR_CODES = {
  TRAIN_EXIT: 'TRAIN_EXIT',
  TRAIN_SCRIPT_MISSING: 'TRAIN_SCRIPT_MISSING',
  TRAIN_INIT: 'TRAIN_INIT'
} as const
