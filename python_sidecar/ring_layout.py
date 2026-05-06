"""Binary layout shared with src/shared/frame-ring.ts (keep constants aligned)."""

from __future__ import annotations

import mmap
import struct

RING_MAGIC = 0xA1FACEFE
RING_VERSION = 2
RING_HEADER_BYTES = 256
RING_SLOT_COUNT = 3
RING_SLOT_META_BYTES = 64
RING_MAX_RGBA_BYTES = 1024 * 1024 * 4
RING_SLOT_STRIDE = RING_SLOT_META_BYTES + RING_MAX_RGBA_BYTES


def ring_file_total_bytes() -> int:
    return RING_HEADER_BYTES + RING_SLOT_COUNT * RING_SLOT_STRIDE


def slot_base(index: int) -> int:
    return RING_HEADER_BYTES + index * RING_SLOT_STRIDE


def write_ring_header(mm: mmap.mmap, write_seq: int = 0) -> None:
    hdr = struct.pack(
        "<8I",
        RING_MAGIC,
        RING_VERSION,
        RING_SLOT_COUNT,
        1024,
        1024,
        4,
        write_seq & 0xFFFFFFFF,
        0,
    )
    n = len(hdr)
    mm[0:n] = hdr
    if n < RING_HEADER_BYTES:
        mm[n:RING_HEADER_BYTES] = b"\x00" * (RING_HEADER_BYTES - n)
