import { app, ipcMain, type BrowserWindow } from 'electron'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import https from 'node:https'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc-channels'

const active = new Map<string, { cancelled: boolean; abort?: () => void }>()

function normalizeDownloadErrorCode(message: string): string {
  if (message === 'cancelled') return 'cancelled'
  if (message === 'SHA256_MISMATCH') return 'SHA256_MISMATCH'
  if (message.startsWith('HTTP ')) return 'DOWNLOAD_HTTP_ERROR'
  return 'DOWNLOAD_FAILED'
}

function broadcastProgress(
  getWin: () => BrowserWindow | null,
  payload: { id: string; received: number; total: number; done?: boolean; error?: string }
): void {
  getWin()?.webContents.send('aiface:download-progress', payload)
}

function downloadFile(
  url: string,
  dest: string,
  id: string,
  getWin: () => BrowserWindow | null,
  sha256?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const state = active.get(id)
    if (!state) {
      reject(new Error('no download state'))
      return
    }
    const temp = `${dest}.part`
    const finalize = async (): Promise<void> => {
      await rename(temp, dest)
      if (sha256 && sha256.trim()) {
        const digest = await hashFileSha256(dest)
        if (digest.toLowerCase() !== sha256.toLowerCase()) {
          await unlink(dest).catch(() => undefined)
          throw new Error('SHA256_MISMATCH')
        }
      }
    }
    const tryReq = async (u: string): Promise<void> => {
      const offset = await stat(temp)
        .then((s) => s.size)
        .catch(() => 0)
      const lib = u.startsWith('https') ? https : http
      const req = lib.get(u, { headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined }, (res) => {
        if (state.cancelled) {
          res.resume()
          req.destroy()
          reject(new Error('cancelled'))
          return
        }
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          void tryReq(new URL(res.headers.location, u).href)
          return
        }
        if (res.statusCode === 416) {
          void finalize().then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const rangeTotal = parseTotalFromContentRange(String(res.headers['content-range'] ?? ''))
        const contentLength = parseInt(String(res.headers['content-length'] ?? '0'), 10) || 0
        const total = rangeTotal || (res.statusCode === 206 ? offset + contentLength : contentLength)
        const append = res.statusCode === 206 && offset > 0
        const startWritten = append ? offset : 0
        let received = startWritten
        const file = createWriteStream(temp, append ? { flags: 'a' } : undefined)
        res.on('data', (chunk: Buffer) => {
          if (state.cancelled) return
          received += chunk.length
          broadcastProgress(getWin, { id, received, total: total || received })
        })
        res.pipe(file)
        file.on('finish', () => {
          file.close(() => {
            void finalize()
              .then(() => {
                broadcastProgress(getWin, { id, received, total: total || received, done: true })
                resolve()
              })
              .catch(reject)
          })
        })
        file.on('error', reject)
        res.on('error', reject)
      })
      state.abort = () => {
        req.destroy()
      }
      req.on('error', reject)
    }
    void tryReq(url)
  })
}

async function hashFileSha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(path)
    rs.on('data', (chunk: string | Buffer) => {
      hash.update(chunk)
    })
    rs.on('end', () => resolve())
    rs.on('error', reject)
  })
  return hash.digest('hex')
}

function parseTotalFromContentRange(value: string): number {
  // bytes start-end/total
  const m = /\/(\d+)$/.exec(value)
  return m ? parseInt(m[1], 10) : 0
}

export function registerModelDownloadIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle(
    IPC_CHANNELS.DOWNLOAD_MODEL,
    async (_e, opts: { id: string; url: string; relativePath: string; sha256?: string }) => {
      if (
        !opts ||
        typeof opts.id !== 'string' ||
        typeof opts.url !== 'string' ||
        typeof opts.relativePath !== 'string' ||
        !opts.id.trim() ||
        !/^https?:\/\//i.test(opts.url)
      ) {
        return { ok: false, error: 'INVALID_IPC_ARGS' }
      }
      const root = resolve(join(app.getPath('userData'), 'models'))
      const safeRel = opts.relativePath.replace(/^([/\\])+/, '')
      const dest = resolve(join(root, safeRel))
      if (!(dest === root || dest.startsWith(root + sep))) {
        return { ok: false, error: 'INVALID_PATH' }
      }
      await mkdir(dirname(dest), { recursive: true })
      active.set(opts.id, { cancelled: false })
      try {
        await downloadFile(opts.url, dest, opts.id, getWin, opts.sha256)
        return { ok: true, path: dest }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const errorCode = normalizeDownloadErrorCode(msg)
        broadcastProgress(getWin, { id: opts.id, received: 0, total: 0, error: errorCode })
        return { ok: false, error: errorCode }
      } finally {
        active.delete(opts.id)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CANCEL_DOWNLOAD, async (_e, id: string) => {
    const s = active.get(id)
    if (s) {
      s.cancelled = true
      s.abort?.()
    }
    return { ok: true }
  })
}

export function registerTrtBuildIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.TRT_BUILD_RUN,
    async (_e, payload: { onnxPath: string; enginePath: string; fp16?: boolean; int8?: boolean }) => {
      if (
        !payload ||
        typeof payload.onnxPath !== 'string' ||
        typeof payload.enginePath !== 'string' ||
        !payload.onnxPath.trim() ||
        !payload.enginePath.trim()
      ) {
        return { ok: false, error: 'INVALID_IPC_ARGS' }
      }
      const cwd = join(app.getAppPath(), 'python_sidecar')
      const script = join(cwd, 'trt_build.py')
      if (!existsSync(script)) {
        return { ok: false, error: 'TRT_SCRIPT_MISSING' }
      }
      const python = process.platform === 'win32' ? 'python' : 'python3'
      const args = ['trt_build.py', '--onnx', payload.onnxPath, '--engine', payload.enginePath]
      if (payload.fp16) args.push('--fp16')
      if (payload.int8) args.push('--int8')
      const proc = spawn(python, args, {
        cwd,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      })
      let stderr = ''
      proc.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString('utf8')
      })
      const code: number = await new Promise((resolve) => {
        proc.on('close', resolve)
      })
      if (code !== 0) {
        return { ok: false, code, error: 'TRT_BUILD_FAILED', stderr: stderr.slice(-4000) }
      }
      return { ok: true, code, stderr: stderr.slice(-4000) }
    }
  )
}
