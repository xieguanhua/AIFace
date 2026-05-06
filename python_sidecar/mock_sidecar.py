"""
Live Sidecar v2: multi-slot mmap ring + vision_post (grain / mouth blur).
Env: AIFACE_FRAME_BUFFER -> ring file path.
"""

from __future__ import annotations

import json
import mmap
import os
import random
import sys
import threading
import time

import numpy as np

from ring_layout import (
    RING_MAGIC,
    RING_MAX_RGBA_BYTES,
    RING_SLOT_COUNT,
    RING_SLOT_META_BYTES,
    ring_file_total_bytes,
    slot_base,
    write_ring_header,
)
from vision_post import postprocess_preview


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def open_ring(path: str) -> tuple[mmap.mmap, object]:
    total = ring_file_total_bytes()
    if not os.path.exists(path) or os.path.getsize(path) < total:
        with open(path, "wb") as f:
            f.seek(total - 1)
            f.write(b"\x00")
    fh = open(path, "r+b")
    mm = mmap.mmap(fh.fileno(), 0)
    if int.from_bytes(mm[0:4], "little") != RING_MAGIC:
        write_ring_header(mm, 0)
    return mm, fh


def write_frame_to_slot(
    mm: mmap.mmap,
    slot: int,
    rgba: np.ndarray,
    frame_id: int,
    write_seq: int,
) -> int:
    h, w, _c = rgba.shape
    if rgba.shape[2] != 4:
        raise ValueError("RGBA only")
    byte_len = w * h * 4
    if byte_len > RING_MAX_RGBA_BYTES:
        raise ValueError("frame too large")
    base = slot_base(slot)
    meta_off = base
    pix_off = base + RING_SLOT_META_BYTES
    flat = rgba.astype(np.uint8, copy=False).tobytes()
    mm[meta_off : meta_off + RING_SLOT_META_BYTES] = b"\x00" * RING_SLOT_META_BYTES
    mm[meta_off + 0 : meta_off + 4] = w.to_bytes(4, "little")
    mm[meta_off + 4 : meta_off + 8] = h.to_bytes(4, "little")
    mm[meta_off + 8 : meta_off + 12] = (0).to_bytes(4, "little")
    mm[meta_off + 12 : meta_off + 16] = byte_len.to_bytes(4, "little")
    mm[meta_off + 16 : meta_off + 20] = frame_id.to_bytes(4, "little")
    mm[meta_off + 20 : meta_off + 24] = (1).to_bytes(4, "little")
    mm[meta_off + 24 : meta_off + 28] = slot.to_bytes(4, "little")
    mm[meta_off + 28 : meta_off + 32] = write_seq.to_bytes(4, "little")
    mm[pix_off : pix_off + byte_len] = flat
    mm.flush()
    return byte_len


def build_gradient_rgba(w: int, h: int, frame_id: int) -> np.ndarray:
    x = (np.arange(w, dtype=np.uint32) + frame_id) % 256
    y = (np.arange(h, dtype=np.uint32) + frame_id * 2) % 256
    r = np.broadcast_to(x, (h, w)).astype(np.float32)
    g = np.broadcast_to(y[:, None], (h, w)).astype(np.float32)
    b = np.full((h, w), 128.0, dtype=np.float32)
    a = np.full((h, w), 255.0, dtype=np.float32)
    return np.stack([r, g, b, a], axis=-1).astype(np.uint8)


def metrics_loop(stop: threading.Event, state: dict) -> None:
    while not stop.is_set():
        emit(
            {
                "type": "metrics",
                "protocolVersion": 2,
                "fps": 28 + random.random() * 4,
                "inferenceMs": 20 + random.random() * 20,
                "vramUsedMb": 6000 + random.random() * 500,
                "vramTotalMb": 16384,
                "droppedFrames": state.get("dropped", 0),
            }
        )
        time.sleep(0.5)


def frame_loop(stop: threading.Event, mm: mmap.mmap | None, path: str, state: dict) -> None:
    frame_id = 0
    w, h = 320, 240
    while not stop.is_set():
        frame_id += 1
        if mm is not None:
            try:
                slot = (frame_id - 1) % RING_SLOT_COUNT
                rgba = build_gradient_rgba(w, h, frame_id)
                rgba = postprocess_preview(
                    rgba,
                    float(state.get("grain", 0.0)),
                    float(state.get("motion_blur", 0.0)),
                    frame_id,
                )
                bl = write_frame_to_slot(mm, slot, rgba, frame_id, frame_id)
                emit(
                    {
                        "type": "frame_ready",
                        "protocolVersion": 2,
                        "shmPath": path,
                        "offset": 0,
                        "byteLength": bl,
                        "width": w,
                        "height": h,
                        "pixelFormat": "rgba",
                        "frameId": frame_id,
                        "slotIndex": slot,
                        "timestampMs": int(time.time() * 1000),
                    }
                )
            except Exception as e:
                emit({"type": "error", "code": "FRAME_WRITE", "details": str(e), "protocolVersion": 2})
        time.sleep(0.2)


def handle_command(line: str, state: dict) -> None:
    line = line.strip()
    if not line:
        return
    try:
        cmd = json.loads(line)
    except json.JSONDecodeError:
        return
    if cmd.get("type") != "command":
        return
    name = cmd.get("name")
    payload = cmd.get("payload") or {}
    if name == "empty_cache":
        emit({"type": "command_ack", "command": name, "ok": True, "protocolVersion": 2})
    elif name == "set_params":
        state["grain"] = float(payload.get("grainStrength", state.get("grain", 0)))
        state["motion_blur"] = float(payload.get("motionBlur", state.get("motion_blur", 0)))
        state["previewMaxEdge"] = int(payload.get("previewMaxEdge", state.get("previewMaxEdge", 1024)))
        emit({"type": "command_ack", "command": name, "ok": True, "protocolVersion": 2})
    elif name == "preload_model":
        mid = payload.get("modelId", "")
        time.sleep(0.05)
        emit({"type": "command_ack", "command": name, "ok": True, "detail": mid, "protocolVersion": 2})
    elif name == "swap_model":
        mid = payload.get("modelId", "")
        emit({"type": "command_ack", "command": name, "ok": True, "detail": mid, "protocolVersion": 2})
    elif name == "warmup_infer":
        emit({"type": "command_ack", "command": name, "ok": True, "protocolVersion": 2})
    elif name == "simulate_cuda_oom":
        emit(
            {
                "type": "error",
                "code": "CUDA_OOM",
                "recoverable": True,
                "suggest": ["empty_cache", "lower_resolution"],
                "protocolVersion": 2,
            }
        )


def stdin_loop(stop: threading.Event, state: dict) -> None:
    try:
        for line in sys.stdin:
            if stop.is_set():
                break
            handle_command(line, state)
    except Exception:
        pass


def main() -> None:
    path = os.environ.get("AIFACE_FRAME_BUFFER", "")
    mm: mmap.mmap | None = None
    fh = None
    if path:
        mm, fh = open_ring(path)

    state: dict = {"dropped": 0, "grain": 0.0, "motion_blur": 0.0, "previewMaxEdge": 1024}
    emit(
        {
            "type": "ready",
            "protocolVersion": 2,
            "capabilities": ["mock_py", "frame_ring", "vision_post", "commands"],
            "frameBufferPath": path or None,
        }
    )

    stop = threading.Event()
    threading.Thread(target=metrics_loop, args=(stop, state), daemon=True).start()
    threading.Thread(target=frame_loop, args=(stop, mm, path, state), daemon=True).start()
    threading.Thread(target=stdin_loop, args=(stop, state), daemon=True).start()

    try:
        while not stop.is_set():
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    stop.set()
    if mm is not None:
        mm.close()
    if fh is not None:
        fh.close()


if __name__ == "__main__":
    main()
