import {
  existsSync,
  openSync,
  closeSync,
  readSync,
  ftruncateSync,
  writeSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  RING_HEADER_BYTES,
  RING_MAGIC,
  RING_MAX_RGBA_BYTES,
  RING_SLOT_COUNT,
  RING_SLOT_META_BYTES,
  ringFileTotalBytes,
  ringSlotBaseOffset,
  readSlotMeta,
  writeRingHeader
} from '@shared/frame-ring'

export function getFrameBufferPath(): string {
  return join(app.getPath('userData'), 'aiface_frame_ring.bin')
}

const RING_TOTAL = ringFileTotalBytes()

export function ensureFrameBuffer(): string {
  const p = getFrameBufferPath()
  if (!existsSync(p) || statSync(p).size < RING_TOTAL) {
    const fd = openSync(p, 'w')
    try {
      ftruncateSync(fd, RING_TOTAL)
    } finally {
      closeSync(fd)
    }
  }
  initRingHeaderIfNeeded()
  return p
}

function initRingHeaderIfNeeded(): void {
  const p = getFrameBufferPath()
  const fd = openSync(p, 'r+')
  try {
    const hdr = Buffer.alloc(RING_HEADER_BYTES)
    readSync(fd, hdr, 0, RING_HEADER_BYTES, 0)
    if (hdr.readUInt32LE(0) !== RING_MAGIC) {
      writeRingHeader(hdr)
      writeSync(fd, hdr, 0, RING_HEADER_BYTES, 0)
    }
  } finally {
    closeSync(fd)
  }
}

/** Legacy flat read (offset from file start). */
export function readFrameBytes(offset: number, byteLength: number): Buffer {
  const p = getFrameBufferPath()
  const fd = openSync(p, 'r')
  try {
    const buf = Buffer.allocUnsafe(byteLength)
    const n = readSync(fd, buf, 0, byteLength, offset)
    return n === byteLength ? buf : buf.subarray(0, n)
  } finally {
    closeSync(fd)
  }
}

/** Read RGBA payload for a ring slot (validates meta.ready). */
export function readRingSlot(slotIndex: number): { buffer: Buffer; width: number; height: number } | null {
  if (slotIndex < 0 || slotIndex >= RING_SLOT_COUNT) return null
  const p = getFrameBufferPath()
  const fd = openSync(p, 'r')
  try {
    const slotOff = ringSlotBaseOffset(slotIndex)
    const metaBuf = Buffer.alloc(RING_SLOT_META_BYTES)
    readSync(fd, metaBuf, 0, RING_SLOT_META_BYTES, slotOff)
    const meta = readSlotMeta(metaBuf)
    if (!meta.ready || meta.byteLength <= 0 || meta.byteLength > RING_MAX_RGBA_BYTES) return null
    const pixOff = slotOff + RING_SLOT_META_BYTES
    const buf = Buffer.allocUnsafe(meta.byteLength)
    const n = readSync(fd, buf, 0, meta.byteLength, pixOff)
    if (n !== meta.byteLength) return null
    return { buffer: buf, width: meta.width, height: meta.height }
  } finally {
    closeSync(fd)
  }
}

/** Node mock: write gradient RGBA into ring slot, update meta. */
export function writeMockRgbaToRingSlot(
  slotIndex: number,
  width: number,
  height: number,
  frameId: number
): number {
  const byteLength = width * height * 4
  if (byteLength > RING_MAX_RGBA_BYTES) throw new Error('frame too large for ring slot')

  const pixels = Buffer.allocUnsafe(byteLength)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      pixels[i] = (x + frameId) % 256
      pixels[i + 1] = (y + frameId * 2) % 256
      pixels[i + 2] = 128
      pixels[i + 3] = 255
    }
  }

  const p = getFrameBufferPath()
  const fd = openSync(p, 'r+')
  try {
    const slotOff = ringSlotBaseOffset(slotIndex)
    const meta = Buffer.alloc(RING_SLOT_META_BYTES)
    meta.writeUInt32LE(width, 0)
    meta.writeUInt32LE(height, 4)
    meta.writeUInt32LE(0, 8)
    meta.writeUInt32LE(byteLength, 12)
    meta.writeUInt32LE(frameId, 16)
    meta.writeUInt32LE(1, 20)
    meta.writeUInt32LE(slotIndex, 24)
    meta.writeUInt32LE(frameId, 28)
    writeSync(fd, meta, 0, RING_SLOT_META_BYTES, slotOff)
    writeSync(fd, pixels, 0, byteLength, slotOff + RING_SLOT_META_BYTES)
    return byteLength
  } finally {
    closeSync(fd)
  }
}

export { ringFileTotalBytes, ringSlotBaseOffset, RING_SLOT_COUNT, RING_MAX_RGBA_BYTES }

/** @deprecated use ring */
export const FRAME_BUFFER_CAPACITY = RING_MAX_RGBA_BYTES
