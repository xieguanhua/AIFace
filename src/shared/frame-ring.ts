/**
 * Multi-slot mmap ring layout (v2). Keep in sync with python_sidecar/ring_layout.py
 * Windows: file-backed mapping behaves like shared memory across Python/Node.
 */
export const RING_MAGIC = 0xa1facefe
export const RING_VERSION = 2
/** Global header size (bytes). */
export const RING_HEADER_BYTES = 256
/** Number of frame slots (producer rotates). */
export const RING_SLOT_COUNT = 3
/** Per-slot metadata (width, height, …) before pixel blob. */
export const RING_SLOT_META_BYTES = 64
/** Max RGBA8888 payload per slot (1024²). */
export const RING_MAX_RGBA_BYTES = 1024 * 1024 * 4

export const RING_SLOT_STRIDE = RING_SLOT_META_BYTES + RING_MAX_RGBA_BYTES

export function ringFileTotalBytes(): number {
  return RING_HEADER_BYTES + RING_SLOT_COUNT * RING_SLOT_STRIDE
}

/** Byte offset of slot `index` (0..SLOT_COUNT-1). */
export function ringSlotBaseOffset(index: number): number {
  return RING_HEADER_BYTES + index * RING_SLOT_STRIDE
}

/** Layout of first 32 bytes of slot meta (little-endian, all uint32). */
export interface RingSlotMeta {
  width: number
  height: number
  pixelFormat: number
  byteLength: number
  frameId: number
  ready: number
  slotIndex: number
  writeSeq: number
}

/** Parse 64-byte slot meta blob (little-endian uint32 fields). */
export function readSlotMeta(buf: Buffer): RingSlotMeta {
  return {
    width: buf.readUInt32LE(0),
    height: buf.readUInt32LE(4),
    pixelFormat: buf.readUInt32LE(8),
    byteLength: buf.readUInt32LE(12),
    frameId: buf.readUInt32LE(16),
    ready: buf.readUInt32LE(20),
    slotIndex: buf.readUInt32LE(24),
    writeSeq: buf.readUInt32LE(28)
  }
}

export function writeRingHeader(buf: Buffer): void {
  buf.fill(0)
  buf.writeUInt32LE(RING_MAGIC, 0)
  buf.writeUInt32LE(RING_VERSION, 4)
  buf.writeUInt32LE(RING_SLOT_COUNT, 8)
  buf.writeUInt32LE(1024, 12)
  buf.writeUInt32LE(1024, 16)
  buf.writeUInt32LE(4, 20)
}
