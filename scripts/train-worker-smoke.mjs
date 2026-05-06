import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('.')
const scriptPath = resolve(root, 'python_sidecar', 'train_worker.py')

function spawnWithPython(pythonBin) {
  return spawn(pythonBin, [scriptPath], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      AIFACE_CUDA_FRACTION: '0.35'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })
}

function createReader(proc) {
  let buf = ''
  const queue = []
  const waiters = []
  const push = (msg) => {
    if (waiters.length > 0) {
      const fn = waiters.shift()
      fn(msg)
      return
    }
    queue.push(msg)
  }
  const onData = (chunk) => {
    buf += chunk.toString('utf8')
    while (true) {
      const idx = buf.indexOf('\n')
      if (idx < 0) return
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        push(JSON.parse(line))
      } catch {
        // ignore non-json lines from sidecar
      }
    }
  }
  proc.stdout.on('data', onData)

  return {
    async next(timeoutMs = 2500) {
      if (queue.length > 0) return queue.shift()
      return new Promise((resolveNext, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('timeout waiting sidecar line'))
        }, timeoutMs)
        waiters.push((msg) => {
          clearTimeout(timer)
          resolveNext(msg)
        })
      })
    },
    dispose() {
      proc.stdout.off('data', onData)
    }
  }
}

async function waitFor(reader, predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remain = Math.max(100, deadline - Date.now())
    const msg = await reader.next(remain)
    if (predicate(msg)) return msg
  }
  throw new Error('timeout waiting expected sidecar message')
}

async function sendCommandAndExpect(proc, reader, name, expectOk = true, expectState = null) {
  proc.stdin.write(`${JSON.stringify({ type: 'command', name, payload: {} })}\n`)
  const deadline = Date.now() + 3000
  let ackSeen = false
  let stateSeen = expectState == null
  while (Date.now() < deadline) {
    const remain = Math.max(100, deadline - Date.now())
    const msg = await reader.next(remain)
    if (msg.type === 'command_ack' && msg.command === name) {
      if (!!msg.ok !== expectOk) {
        throw new Error(`unexpected ack for ${name}: ${JSON.stringify(msg)}`)
      }
      ackSeen = true
    }
    if (expectState != null && msg.type === 'train_status' && msg.state === expectState) {
      stateSeen = true
    }
    if (ackSeen && stateSeen) return
  }
  throw new Error(`timeout waiting expected events for ${name}`)
}

async function main() {
  if (!existsSync(scriptPath)) {
    throw new Error(`missing script: ${scriptPath}`)
  }

  const proc = spawnWithPython('python')
  const reader = createReader(proc)

  proc.stderr.on('data', (c) => {
    const text = c.toString('utf8').trim()
    if (text) process.stderr.write(`[train-worker-stderr] ${text}\n`)
  })

  try {
    await waitFor(reader, (msg) => msg.type === 'ready', 3000)
    await waitFor(reader, (msg) => msg.type === 'train_status' && msg.state === 'running', 3000)

    await sendCommandAndExpect(proc, reader, 'train_step', true)
    await sendCommandAndExpect(proc, reader, 'pause_train', true, 'paused')
    await sendCommandAndExpect(proc, reader, 'train_step', false)
    await sendCommandAndExpect(proc, reader, 'resume_train', true, 'running')
    await sendCommandAndExpect(proc, reader, 'stop_train', true, 'stopped')

    console.log('[train-worker-smoke] passed')
  } finally {
    reader.dispose()
    if (!proc.killed) proc.kill()
  }
}

void main().catch((err) => {
  console.error('[train-worker-smoke] failed')
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
