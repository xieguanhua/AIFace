/// <reference lib="webworker" />

type FrameMeta = {
  width: number
  height: number
  pixelFormat: string
  frameId: number
  timestampMs?: number
  slotIndex?: number
}

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let sabBuf: Uint8ClampedArray | null = null

self.onmessage = (e: MessageEvent) => {
  const d = e.data as Record<string, unknown>
  if (d.type === 'init') {
    canvas = d.canvas as OffscreenCanvas
    ctx = canvas.getContext('2d', { alpha: true })
    if (d.sab && self.crossOriginIsolated) {
      sabBuf = new Uint8ClampedArray(d.sab as SharedArrayBuffer)
    }
    return
  }
  if (d.type === 'frame' && ctx && canvas) {
    const meta = d.meta as FrameMeta
    const { width, height } = meta
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const buffer = d.buffer as ArrayBuffer
    const need = width * height * 4
    if (sabBuf && sabBuf.byteLength >= need) {
      sabBuf.set(new Uint8ClampedArray(buffer, 0, need))
      ctx.putImageData(new ImageData(sabBuf.subarray(0, need), width, height), 0, 0)
    } else {
      const src = new Uint8ClampedArray(buffer, 0, need)
      ctx.putImageData(new ImageData(src, width, height), 0, 0)
    }
  }
}

export {}
