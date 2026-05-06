import type { FramePixelsMeta } from './frame-pixels'
import type { SidecarMessage } from './sidecar-protocol'

export interface AifaceWindowApi {
  platform: NodeJS.Platform
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  onSidecarMessage: (cb: (msg: SidecarMessage) => void) => () => void
  onFramePixels: (cb: (meta: FramePixelsMeta, pixels: ArrayBuffer) => void) => () => void
  onTrainMessage: (cb: (msg: SidecarMessage) => void) => () => void
  onDownloadProgress: (cb: (msg: Record<string, unknown>) => void) => () => void
  onBaseModelInstallProgress: (cb: (msg: Record<string, unknown>) => void) => () => void
}

declare global {
  interface Window {
    aiface: AifaceWindowApi
  }
}

export {}
