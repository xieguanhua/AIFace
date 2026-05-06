import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { parseSidecarLine, type SidecarMessage, type SidecarFrameReady } from '@shared/sidecar-protocol'
import { ensureFrameBuffer, getFrameBufferPath, writeMockRgbaToRingSlot, RING_SLOT_COUNT } from './frame-buffer'

export class SidecarManager extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private mockTimer: ReturnType<typeof setInterval> | null = null
  private buf = ''
  private mockFrameId = 0

  get running(): boolean {
    return this.proc !== null || this.mockTimer !== null
  }

  start(): void {
    if (this.running) return
    const bufferPath = ensureFrameBuffer()
    const script = this.resolveScript()
    if (script) {
      const python = process.platform === 'win32' ? 'python' : 'python3'
      this.proc = spawn(python, [script], {
        cwd: join(app.getAppPath()),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          AIFACE_FRAME_BUFFER: bufferPath,
          AIFACE_PROTOCOL_VERSION: '2'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      this.proc.stdout.on('data', (c: Buffer) => this.onStdout(c.toString('utf8')))
      this.proc.stderr.on('data', (c: Buffer) => console.error('[sidecar]', c.toString('utf8')))
      this.proc.on('exit', () => {
        this.proc = null
        this.emit('exit')
      })
      return
    }
    this.emit('message', {
      type: 'ready',
      capabilities: ['mock', 'frame_shm'],
      protocolVersion: 2,
      frameBufferPath: bufferPath
    } as SidecarMessage)
    this.mockTimer = setInterval(() => {
      this.mockFrameId += 1
      const w = 320
      const h = 240
      try {
        const slot = (this.mockFrameId - 1) % RING_SLOT_COUNT
        const byteLength = writeMockRgbaToRingSlot(slot, w, h, this.mockFrameId)
        const fr: SidecarFrameReady = {
          type: 'frame_ready',
          protocolVersion: 2,
          shmPath: getFrameBufferPath(),
          offset: 0,
          byteLength,
          width: w,
          height: h,
          pixelFormat: 'rgba',
          frameId: this.mockFrameId,
          slotIndex: slot,
          timestampMs: Date.now()
        }
        this.emit('message', fr)
      } catch (e) {
        console.error('[sidecar mock frame]', e)
      }
      this.emit('message', {
        type: 'metrics',
        protocolVersion: 2,
        fps: 30 + Math.random() * 5,
        inferenceMs: 25 + Math.random() * 15,
        vramUsedMb: 6200 + Math.random() * 200,
        vramTotalMb: 16384,
        droppedFrames: 0
      } as SidecarMessage)
    }, 200)
  }

  private resolveScript(): string | null {
    const isDev = !app.isPackaged
    const candidates = isDev
      ? [join(app.getAppPath(), 'python_sidecar', 'mock_sidecar.py')]
      : [
          join(process.resourcesPath, 'python_sidecar', 'mock_sidecar.py'),
          join(app.getAppPath(), 'python_sidecar', 'mock_sidecar.py')
        ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return null
  }

  stop(): void {
    if (this.mockTimer) {
      clearInterval(this.mockTimer)
      this.mockTimer = null
    }
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this.buf = ''
  }

  sendLine(line: string): void {
    if (this.proc?.stdin && !this.proc.stdin.destroyed) {
      this.proc.stdin.write(`${line}\n`)
    }
  }

  private onStdout(chunk: string): void {
    this.buf += chunk
    let i: number
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const raw = this.buf.slice(0, i)
      this.buf = this.buf.slice(i + 1)
      const msg = parseSidecarLine(raw)
      if (msg) this.emit('message', msg)
    }
  }
}
