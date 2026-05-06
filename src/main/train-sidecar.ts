import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { parseSidecarLine, type SidecarMessage } from '@shared/sidecar-protocol'

/** Independent training process (separate CUDA fraction via env). */
export class TrainSidecarManager extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buf = ''

  get running(): boolean {
    return this.proc !== null
  }

  start(cudaFraction = '0.35'): void {
    if (this.running) return
    const script = this.resolveScript()
    if (!script) {
      this.emit('message', {
        type: 'error',
        code: 'TRAIN_SCRIPT_MISSING',
        protocolVersion: 2
      } as SidecarMessage)
      return
    }
    const python = process.platform === 'win32' ? 'python' : 'python3'
    this.proc = spawn(python, [script], {
      cwd: join(app.getAppPath()),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        AIFACE_MODE: 'train',
        AIFACE_CUDA_FRACTION: cudaFraction
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.proc.stdout.on('data', (c: Buffer) => this.onStdout(c.toString('utf8')))
    this.proc.stderr.on('data', (c: Buffer) => console.error('[train]', c.toString('utf8')))
    this.proc.on('exit', () => {
      this.proc = null
      this.emit('exit')
    })
  }

  private resolveScript(): string | null {
    const isDev = !app.isPackaged
    const candidates = isDev
      ? [join(app.getAppPath(), 'python_sidecar', 'train_worker.py')]
      : [
          join(process.resourcesPath, 'python_sidecar', 'train_worker.py'),
          join(app.getAppPath(), 'python_sidecar', 'train_worker.py')
        ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return null
  }

  stop(): void {
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
