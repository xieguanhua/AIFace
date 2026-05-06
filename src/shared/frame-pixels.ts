import type { PixelFormat } from './sidecar-protocol'

export interface FramePixelsMeta {
  width: number
  height: number
  pixelFormat: PixelFormat
  frameId: number
  timestampMs?: number
  slotIndex?: number
}
