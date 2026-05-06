import { contextBridge, ipcRenderer } from 'electron'
import type { AifaceWindowApi } from '@shared/window-api'
import type { FramePixelsMeta } from '@shared/frame-pixels'
import type { SidecarMessage } from '@shared/sidecar-protocol'

function bufferToArrayBuffer(data: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(data.byteLength)
  new Uint8Array(ab).set(data)
  return ab
}

const api: AifaceWindowApi = {
  platform: process.platform,
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  onSidecarMessage: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: SidecarMessage) => cb(msg)
    ipcRenderer.on('aiface:sidecar-message', listener)
    return () => ipcRenderer.removeListener('aiface:sidecar-message', listener)
  },
  onFramePixels: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, meta: FramePixelsMeta, data: Buffer) => {
      cb(meta, bufferToArrayBuffer(data))
    }
    ipcRenderer.on('aiface:frame-pixels', listener)
    return () => ipcRenderer.removeListener('aiface:frame-pixels', listener)
  },
  onTrainMessage: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: SidecarMessage) => cb(msg)
    ipcRenderer.on('aiface:train-message', listener)
    return () => ipcRenderer.removeListener('aiface:train-message', listener)
  },
  onDownloadProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: Record<string, unknown>) => cb(msg)
    ipcRenderer.on('aiface:download-progress', listener)
    return () => ipcRenderer.removeListener('aiface:download-progress', listener)
  },
  onBaseModelInstallProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: Record<string, unknown>) => cb(msg)
    ipcRenderer.on('aiface:base-model-install-progress', listener)
    return () => ipcRenderer.removeListener('aiface:base-model-install-progress', listener)
  }
}

contextBridge.exposeInMainWorld('aiface', api)
