import { app, ipcMain, type BrowserWindow, dialog, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export type ModelCatalogEntry = {
  id: string
  name: string
  kind: 'face' | 'voice' | 'other'
  url?: string
  relativePath: string
  sha256?: string
  sizeBytes?: number
  bundled?: boolean
}

function ioErrorCode(_e: unknown): string {
  return 'IO_ERROR'
}

async function safeListFileRelPaths(rootAbs: string): Promise<string[]> {
  const root = resolve(rootAbs)
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length) {
    const cur = stack.pop()!
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = await import('node:fs/promises')
    const ents = await fs.readdir(cur, { withFileTypes: true })
    for (const e of ents) {
      const abs = resolve(join(cur, e.name))
      if (!(abs === root || abs.startsWith(root + sep))) continue
      if (e.isDirectory()) stack.push(abs)
      else if (e.isFile()) out.push(abs.slice(root.length + 1).replaceAll('\\', '/'))
    }
  }
  return out
}

function modelsRoot(): string {
  return resolve(join(app.getPath('userData'), 'models'))
}

function facesRoot(): string {
  return resolve(join(app.getPath('userData'), 'faces'))
}

function sanitizeFileName(name: string): string {
  // keep it simple & cross-platform safe
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 180)
}

function isAllowedModelExt(ext: string): boolean {
  const e = ext.toLowerCase()
  return e === '.pth' || e === '.pt' || e === '.onnx' || e === '.engine' || e === '.zip'
}

function isAllowedFaceExt(ext: string): boolean {
  const e = ext.toLowerCase()
  return e === '.jpg' || e === '.jpeg' || e === '.png' || e === '.webp'
}

function bundledCatalogPath(): string {
  // packaged: <resources>/resources/model-catalog.json
  // dev: <appPath>/resources/model-catalog.json (repo root /resources)
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  return join(base, 'model-catalog.json')
}

function bundledBaseModelsDir(): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  return join(base, 'base-models')
}

type InstallProgressPayload = {
  phase: 'scan' | 'copy' | 'done' | 'error'
  totalBytes?: number
  copiedBytes?: number
  currentFile?: string
  error?: string
}

async function computeDirTotalBytes(srcDir: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = await import('node:fs/promises')
  let total = 0
  const stack: string[] = [srcDir]
  while (stack.length) {
    const cur = stack.pop()!
    const ents = await fs.readdir(cur, { withFileTypes: true })
    for (const e of ents) {
      const p = join(cur, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.isFile()) {
        const st = await fs.stat(p)
        total += st.size
      }
    }
  }
  return total
}

async function copyDirRecursiveWithProgress(
  srcDir: string,
  destDir: string,
  onFileCopied: (srcFile: string, bytes: number) => void
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = await import('node:fs/promises')
  await fs.mkdir(destDir, { recursive: true })
  const ents = await fs.readdir(srcDir, { withFileTypes: true })
  for (const e of ents) {
    const s = join(srcDir, e.name)
    const d = join(destDir, e.name)
    if (e.isDirectory()) await copyDirRecursiveWithProgress(s, d, onFileCopied)
    else if (e.isFile()) {
      const st = await fs.stat(s)
      await fs.copyFile(s, d)
      onFileCopied(s, st.size)
    }
  }
}

function broadcastProgress(getWin: () => BrowserWindow | null, payload: InstallProgressPayload): void {
  getWin()?.webContents.send('aiface:base-model-install-progress', payload)
}

export function registerModelVaultIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_e, url: string) => {
    if (typeof url !== 'string') return { ok: false, error: 'INVALID_IPC_ARGS' }
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'INVALID_IPC_ARGS' }
    try {
      await shell.openExternal(u)
      return { ok: true }
    } catch {
      return { ok: false, error: 'OPEN_EXTERNAL_FAILED' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_MODEL_CATALOG, async () => {
    const p = bundledCatalogPath()
    if (!existsSync(p)) return { ok: false, error: 'CATALOG_MISSING' }
    try {
      const raw = await readFile(p, 'utf8')
      const json = JSON.parse(raw) as { version?: number; models?: ModelCatalogEntry[] }
      const models = Array.isArray(json.models) ? json.models : []
      return { ok: true, catalog: { version: json.version ?? 1, models } }
    } catch (e) {
      return { ok: false, error: ioErrorCode(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LIST_INSTALLED_MODELS, async () => {
    const root = modelsRoot()
    try {
      const files = existsSync(root) ? await safeListFileRelPaths(root) : []
      return { ok: true, root, files }
    } catch (e) {
      return { ok: false, error: ioErrorCode(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ENSURE_BASE_MODELS, async () => {
    const src = bundledBaseModelsDir()
    const root = modelsRoot()
    const dest = join(root, 'bundled')
    if (!existsSync(src)) return { ok: false, error: 'BUNDLED_MODELS_MISSING' }
    try {
      broadcastProgress(getWin, { phase: 'scan' })
      const totalBytes = await computeDirTotalBytes(src)
      let copiedBytes = 0
      broadcastProgress(getWin, { phase: 'copy', totalBytes, copiedBytes })
      await copyDirRecursiveWithProgress(src, dest, (currentFile, bytes) => {
        copiedBytes += bytes
        broadcastProgress(getWin, { phase: 'copy', totalBytes, copiedBytes, currentFile })
      })
      broadcastProgress(getWin, { phase: 'done', totalBytes, copiedBytes })
      return { ok: true, installedTo: dest }
    } catch (e) {
      broadcastProgress(getWin, { phase: 'error', error: 'IO_ERROR' })
      return { ok: false, error: ioErrorCode(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_LOCAL_MODEL, async () => {
    const r = await dialog.showOpenDialog({
      title: 'Import model file',
      properties: ['openFile'],
      filters: [
        { name: 'Model files', extensions: ['pth', 'pt', 'onnx', 'engine', 'zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (r.canceled || !r.filePaths?.length) return { ok: false, error: 'cancelled' }
    try {
      const src = r.filePaths[0]
      const ext = extname(src)
      if (!isAllowedModelExt(ext)) return { ok: false, error: 'UNSUPPORTED_EXT' }
      const root = modelsRoot()
      const destDir = join(root, 'custom')
      const fileName = sanitizeFileName(basename(src))
      const dest = resolve(join(destDir, fileName))
      if (!(dest === root || dest.startsWith(root + sep))) return { ok: false, error: 'INVALID_PATH' }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = await import('node:fs/promises')
      await fs.mkdir(destDir, { recursive: true })
      await fs.copyFile(src, dest)
      const relativePath = dest.slice(root.length + 1).replaceAll('\\', '/')
      return { ok: true, relativePath }
    } catch (e) {
      return { ok: false, error: ioErrorCode(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_FACE_ASSETS, async () => {
    const r = await dialog.showOpenDialog({
      title: 'Import face images',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (r.canceled || !r.filePaths?.length) return { ok: false, error: 'cancelled' }

    try {
      const root = facesRoot()
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = await import('node:fs/promises')
      await fs.mkdir(root, { recursive: true })

      const imported: string[] = []
      for (const src of r.filePaths) {
        const ext = extname(src)
        if (!isAllowedFaceExt(ext)) continue
        const base = sanitizeFileName(basename(src, ext))
        let fileName = `${base}${ext.toLowerCase()}`
        let dest = resolve(join(root, fileName))
        let idx = 1
        while (existsSync(dest)) {
          fileName = `${base}_${idx}${ext.toLowerCase()}`
          dest = resolve(join(root, fileName))
          idx += 1
        }
        if (!(dest === root || dest.startsWith(root + sep))) continue
        await fs.copyFile(src, dest)
        imported.push(dest.slice(root.length + 1).replaceAll('\\', '/'))
      }
      return { ok: true, imported }
    } catch (e) {
      return { ok: false, error: ioErrorCode(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LIST_FACE_ASSETS, async () => {
    const root = facesRoot()
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = await import('node:fs/promises')
      const files = existsSync(root) ? await safeListFileRelPaths(root) : []
      const items = files
        .filter((f) => isAllowedFaceExt(extname(f)))
        .map(async (relativePath) => {
          const abs = resolve(join(root, relativePath))
          const st = await fs.stat(abs).catch(() => ({ size: 0 }))
          const fileUrl = `file:///${abs.replaceAll('\\', '/')}`
          return {
            relativePath,
            name: basename(relativePath),
            fileUrl,
            sizeBytes: st.size
          }
        })
      return { ok: true, items: await Promise.all(items) }
    } catch (e) {
      return { ok: false, error: ioErrorCode(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_FACE_ASSET, async (_e, relativePath: string) => {
    if (typeof relativePath !== 'string' || !relativePath.trim()) return { ok: false, error: 'INVALID_PATH' }
    const root = facesRoot()
    const safeRel = relativePath.replace(/^([/\\])+/, '')
    const target = resolve(join(root, safeRel))
    if (!(target === root || target.startsWith(root + sep))) return { ok: false, error: 'INVALID_PATH' }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = await import('node:fs/promises')
      await fs.unlink(target)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: ioErrorCode(e) }
    }
  })
}

