import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('.')
const scriptPath = resolve(root, 'python_sidecar', 'mock_sidecar.py')

function spawnSidecar() {
  return spawn('python', [scriptPath], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1'
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
      waiters.shift()(msg)
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
        // ignore invalid debug lines
      }
    }
  }
  proc.stdout.on('data', onData)
  return {
    async next(timeoutMs = 3000) {
      if (queue.length > 0) return queue.shift()
      return new Promise((resolveNext, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout waiting sidecar line')), timeoutMs)
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

async function waitFor(reader, predicate, timeoutMs = 3500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remain = Math.max(100, deadline - Date.now())
    const msg = await reader.next(remain)
    if (predicate(msg)) return msg
  }
  throw new Error('timeout waiting expected sidecar message')
}

async function sendCommandAndExpectAck(proc, reader, name, payload = {}) {
  proc.stdin.write(`${JSON.stringify({ type: 'command', name, payload })}\n`)
  const ack = await waitFor(reader, (msg) => msg.type === 'command_ack' && msg.command === name, 3000)
  if (!ack.ok) throw new Error(`command ${name} ack failed: ${JSON.stringify(ack)}`)
}

async function main() {
  if (!existsSync(scriptPath)) throw new Error(`missing script: ${scriptPath}`)
  const proc = spawnSidecar()
  const reader = createReader(proc)

  proc.stderr.on('data', (c) => {
    const text = c.toString('utf8').trim()
    if (text) process.stderr.write(`[sidecar-worker-stderr] ${text}\n`)
  })

  try {
    await waitFor(reader, (msg) => msg.type === 'ready', 4000)
    await waitFor(reader, (msg) => msg.type === 'metrics', 4000)
    await sendCommandAndExpectAck(proc, reader, 'empty_cache', {})
    await sendCommandAndExpectAck(proc, reader, 'set_params', {
      grainStrength: 0.2,
      motionBlur: 0.1,
      previewMaxEdge: 720
    })
    proc.stdin.write(`${JSON.stringify({ type: 'command', name: 'simulate_cuda_oom', payload: {} })}\n`)
    await waitFor(reader, (msg) => msg.type === 'error' && msg.code === 'CUDA_OOM', 4000)
    console.log('[sidecar-worker-smoke] passed')
  } finally {
    reader.dispose()
    if (!proc.killed) proc.kill()
  }
}

void main().catch((err) => {
  console.error('[sidecar-worker-smoke] failed')
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
