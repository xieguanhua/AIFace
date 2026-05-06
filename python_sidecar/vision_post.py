"""Post-process RGBA uint8 (H,W,4) — grain injection + mouth-region motion blur (numpy only)."""

from __future__ import annotations

import numpy as np


def apply_grain_rgba(rgba: np.ndarray, strength: float, seed: int = 0) -> np.ndarray:
    """Additive Gaussian noise; strength 0..1 scaled to sigma ~0–12 on 0–255."""
    if strength <= 0:
        return rgba
    rng = np.random.default_rng(seed & 0xFFFFFFFF)
    h, w, _ = rgba.shape
    noise = rng.standard_normal((h, w, 3)).astype(np.float32) * (strength * 12.0)
    out = rgba.astype(np.float32)
    out[:, :, :3] = np.clip(out[:, :, :3] + noise, 0, 255)
    return out.astype(np.uint8)


def _box_blur_channel(ch: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return ch
    k = radius * 2 + 1
    pad = np.pad(ch.astype(np.float32), radius, mode="edge")
    acc = np.cumsum(pad, axis=0)
    tmp = (acc[k:, :] - acc[:-k, :]) / k
    pad2 = np.pad(tmp, radius, mode="edge")
    acc2 = np.cumsum(pad2, axis=1)
    return ((acc2[:, k:] - acc2[:, :-k]) / k).astype(np.float32)


def apply_mouth_motion_blur_rgba(
    rgba: np.ndarray, strength: float, mouth_center_y: float = 0.62, mouth_half_h: float = 0.12
) -> np.ndarray:
    """
    Radial-ish blur in lower-central band (mouth). strength 0..1 -> blur radius 0..4.
    """
    if strength <= 0:
        return rgba
    h, w, _ = rgba.shape
    r = int(round(strength * 4))
    if r < 1:
        return rgba
    y0 = int(max(0, (mouth_center_y - mouth_half_h) * h))
    y1 = int(min(h, (mouth_center_y + mouth_half_h) * h))
    x0 = int(w * 0.25)
    x1 = int(w * 0.75)
    out = rgba.copy()
    roi = out[y0:y1, x0:x1, :]
    for c in range(3):
        roi[:, :, c] = _box_blur_channel(roi[:, :, c], r).astype(np.uint8)
    return out


def postprocess_preview(
    rgba: np.ndarray, grain: float, motion_blur: float, frame_id: int
) -> np.ndarray:
    x = apply_grain_rgba(rgba, grain, seed=frame_id)
    x = apply_mouth_motion_blur_rgba(x, motion_blur)
    return x
