import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { SidecarMessage, SidecarFrameReady, SidecarError } from '@shared/sidecar-protocol'
import { SIDECAR_ERROR_CODES } from '@shared/sidecar-protocol'
import { SidecarManager } from './sidecar'
import { TrainSidecarManager } from './train-sidecar'
import { registerModelDownloadIpc, registerTrtBuildIpc } from './model-download'
import { registerModelVaultIpc } from './model-vault'
import { readFrameBytes, readRingSlot, ensureFrameBuffer } from './frame-buffer'

const sidecar = new SidecarManager()
const train = new TrainSidecarManager()
let mainWindow: BrowserWindow | null = null
let lastEmptyCacheAt = 0
const isDev = !app.isPackaged

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function broadcastSidecar(msg: SidecarMessage): void {
  if (!mainWindow?.webContents) return
  mainWindow.webContents.send('aiface:sidecar-message', msg)
}

function dispatchSidecarMessage(msg: SidecarMessage): void {
  if (msg.type === 'frame_ready') {
    const fr = msg as SidecarFrameReady
    logSidecarEvent('frame_ready', {
      frameId: fr.frameId,
      width: fr.width,
      height: fr.height,
      slotIndex: fr.slotIndex
    })
    try {
      let pixels: Buffer
      let w = fr.width
      let h = fr.height
      if (fr.slotIndex != null && fr.slotIndex >= 0) {
        const ring = readRingSlot(fr.slotIndex)
        if (!ring) return
        pixels = ring.buffer
        w = ring.width
        h = ring.height
      } else {
        pixels = readFrameBytes(fr.offset, fr.byteLength)
      }
      if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(
          'aiface:frame-pixels',
          {
            width: w,
            height: h,
            pixelFormat: fr.pixelFormat,
            frameId: fr.frameId,
            timestampMs: fr.timestampMs,
            slotIndex: fr.slotIndex
          },
          pixels
        )
      }
    } catch (e) {
      console.error('[frame_ready]', e)
    }
    return
  }
  if (msg.type === 'error') {
    const err = msg as SidecarError
    logSidecarEvent('error', { code: err.code, recoverable: err.recoverable, details: err.details })
    if (!(err.code === 'CUDA_OOM' && err.recoverable)) {
      broadcastSidecar(msg)
      return
    }
    const now = Date.now()
    if (now - lastEmptyCacheAt > 3000) {
      lastEmptyCacheAt = now
      logSidecarEvent('auto_empty_cache')
      sidecar.sendLine(JSON.stringify({ type: 'command', name: 'empty_cache', payload: {} }))
    }
    broadcastSidecar(msg)
    return
  }
  if (msg.type === 'metrics') {
    const m = msg as {
      fps?: number
      inferenceMs?: number
      vramUsedMb?: number
      droppedFrames?: number
    }
    logSidecarEvent('metrics', {
      fps: m.fps,
      inferenceMs: m.inferenceMs,
      vramUsedMb: m.vramUsedMb,
      droppedFrames: m.droppedFrames
    })
  }
  if (msg.type === 'ready') {
    logSidecarEvent('ready', { capabilities: (msg as { capabilities?: unknown }).capabilities })
  }
  if (msg.type === 'command_ack') {
    const ack = msg as { command?: unknown; ok?: unknown; detail?: unknown }
    logSidecarEvent('command_ack', { command: ack.command, ok: ack.ok, detail: ack.detail })
  }
  broadcastSidecar(msg)
}

function parseCudaFraction(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const n = Number(input)
  if (!Number.isFinite(n)) return null
  if (n <= 0 || n > 1) return null
  return n.toFixed(2)
}

function isTrainCommandLine(line: string): boolean {
  try {
    const parsed = JSON.parse(line) as { type?: unknown; name?: unknown; payload?: unknown }
    return parsed.type === 'command' && typeof parsed.name === 'string'
  } catch {
    return false
  }
}

function logTrainEvent(event: string, payload?: Record<string, unknown>): void {
  if (!isDev) return
  const body = payload ? ` ${JSON.stringify(payload)}` : ''
  console.info(`[train-event] ${event}${body}`)
}

function logSidecarEvent(event: string, payload?: Record<string, unknown>): void {
  if (!isDev) return
  const body = payload ? ` ${JSON.stringify(payload)}` : ''
  console.info(`[sidecar-event] ${event}${body}`)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...(details.responseHeaders ?? {}) }
      headers['Cross-Origin-Opener-Policy'] = ['same-origin']
      headers['Cross-Origin-Embedder-Policy'] = ['require-corp']
      callback({ responseHeaders: headers })
    })

    ensureFrameBuffer()

    ipcMain.handle(IPC_CHANNELS.PING, async () => ({ ok: true, t: Date.now() }))

    ipcMain.handle(IPC_CHANNELS.GET_LOCALE_HINT, async () => ({
      locale: app.getLocale()
    }))

    ipcMain.handle(IPC_CHANNELS.GET_HARDWARE_SUMMARY, async () => ({
      platform: process.platform,
      arch: process.arch,
      vramTotalMb: null as number | null,
      note: 'Replace with nvidia-smi / Sidecar probe'
    }))

    ipcMain.handle(IPC_CHANNELS.SIDECAR_START, async () => {
      logSidecarEvent('start')
      sidecar.start()
      return { started: true }
    })

    ipcMain.handle(IPC_CHANNELS.SIDECAR_STOP, async () => {
      logSidecarEvent('stop')
      sidecar.stop()
      return { stopped: true }
    })

    ipcMain.handle(IPC_CHANNELS.SIDECAR_SEND_LINE, async (_e, line: string) => {
      if (typeof line !== 'string') return { ok: false }
      logSidecarEvent('command_sent', { line })
      sidecar.sendLine(line)
      return { ok: true }
    })

    ipcMain.handle(IPC_CHANNELS.SIDECAR_GET_STATE, async () => ({
      running: sidecar.running
    }))

    ipcMain.handle(IPC_CHANNELS.OPEN_LOG_DIR, async () => {
      await shell.openPath(app.getPath('logs'))
      return { ok: true }
    })

    ipcMain.handle(IPC_CHANNELS.DEV_SIMULATE_CUDA_OOM, async () => {
      broadcastSidecar({
        type: 'error',
        code: 'CUDA_OOM',
        recoverable: true,
        suggest: ['empty_cache', 'lower_resolution'],
        protocolVersion: 2
      })
      return { ok: true }
    })

    ipcMain.handle(IPC_CHANNELS.TRAIN_SIDECAR_START, async (_e, cudaFraction?: unknown) => {
      const normalized = cudaFraction == null ? '0.35' : parseCudaFraction(cudaFraction)
      if (!normalized) {
        logTrainEvent('start_rejected', { reason: SIDECAR_ERROR_CODES.INVALID_IPC_ARGS, cudaFraction })
        mainWindow?.webContents.send('aiface:train-message', {
          type: 'error',
          code: SIDECAR_ERROR_CODES.INVALID_IPC_ARGS,
          details: 'Invalid cudaFraction. Expected string in range (0,1].',
          protocolVersion: 2
        })
        return { ok: false, code: SIDECAR_ERROR_CODES.INVALID_IPC_ARGS }
      }
      mainWindow?.webContents.send('aiface:train-message', {
        type: 'train_status',
        state: 'starting',
        protocolVersion: 2
      })
      logTrainEvent('start', { cudaFraction: normalized })
      train.start(normalized)
      return { ok: true }
    })
    ipcMain.handle(IPC_CHANNELS.TRAIN_SIDECAR_STOP, async () => {
      mainWindow?.webContents.send('aiface:train-message', {
        type: 'train_status',
        state: 'stopping',
        protocolVersion: 2
      })
      logTrainEvent('stop_requested')
      train.stop()
      mainWindow?.webContents.send('aiface:train-message', {
        type: 'train_status',
        state: 'stopped',
        reason: 'manual_stop',
        protocolVersion: 2
      })
      return { ok: true }
    })
    ipcMain.handle(IPC_CHANNELS.TRAIN_SIDECAR_SEND_LINE, async (_e, line: string) => {
      if (typeof line !== 'string') {
        logTrainEvent('command_rejected', { reason: SIDECAR_ERROR_CODES.INVALID_IPC_ARGS })
        return { ok: false, code: SIDECAR_ERROR_CODES.INVALID_IPC_ARGS }
      }
      if (!isTrainCommandLine(line)) {
        logTrainEvent('command_rejected', { reason: SIDECAR_ERROR_CODES.INVALID_COMMAND_JSON })
        return { ok: false, code: SIDECAR_ERROR_CODES.INVALID_COMMAND_JSON }
      }
      logTrainEvent('command_sent', { line })
      train.sendLine(line)
      return { ok: true }
    })
    ipcMain.handle(IPC_CHANNELS.TRAIN_GET_STATE, async () => ({ running: train.running }))

    registerModelDownloadIpc(getMainWindow)
    registerTrtBuildIpc()
    registerModelVaultIpc(getMainWindow)

    sidecar.on('message', (msg: SidecarMessage) => dispatchSidecarMessage(msg))
    sidecar.on('exit', () => {
      logSidecarEvent('exit')
      broadcastSidecar({ type: 'error', code: 'SIDECAR_EXIT', protocolVersion: 1 })
    })

    train.on('message', (msg: SidecarMessage) => {
      if (msg.type === 'error') {
        const m = msg as SidecarError
        logTrainEvent('worker_error', { code: m.code, details: m.details })
      } else if (msg.type === 'train_status') {
        logTrainEvent('worker_status', {
          state: (msg as { state?: unknown }).state,
          reason: (msg as { reason?: unknown }).reason
        })
      } else if (msg.type === 'command_ack') {
        const ack = msg as { command?: unknown; ok?: unknown; detail?: unknown }
        logTrainEvent('command_ack', { command: ack.command, ok: ack.ok, detail: ack.detail })
      }
      if (msg.type === 'ready') {
        logTrainEvent('worker_ready', { capabilities: (msg as { capabilities?: unknown }).capabilities })
        mainWindow?.webContents.send('aiface:train-message', {
          type: 'train_status',
          state: 'running',
          protocolVersion: 2
        })
      }
      mainWindow?.webContents.send('aiface:train-message', msg)
    })
    train.on('exit', () => {
      logTrainEvent('worker_exit')
      mainWindow?.webContents.send('aiface:train-message', {
        type: 'train_status',
        state: 'stopped',
        reason: 'process_exit',
        protocolVersion: 2
      })
      mainWindow?.webContents.send('aiface:train-message', {
        type: 'error',
        code: 'TRAIN_EXIT',
        protocolVersion: 2
      })
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    sidecar.stop()
    train.stop()
  })
}
