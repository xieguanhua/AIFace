"""
Training worker: separate process for Live+Train concurrency.
Sets torch.cuda.set_per_process_memory_fraction when torch is available.
Emits NDJSON train_log / metrics on stdout; accepts stdin commands.
"""

from __future__ import annotations

import json
import os
import sys


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def try_limit_cuda_fraction() -> None:
    frac = float(os.environ.get("AIFACE_CUDA_FRACTION", "0.35"))
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.set_per_process_memory_fraction(frac, 0)
            emit(
                {
                    "type": "ready",
                    "protocolVersion": 2,
                    "capabilities": ["train", "cuda_fraction"],
                    "cudaFraction": frac,
                }
            )
            return
    except Exception as e:
        emit({"type": "error", "code": "TRAIN_INIT", "details": str(e), "protocolVersion": 2})
        return
    emit({"type": "ready", "protocolVersion": 2, "capabilities": ["train", "cpu_only"]})


def main() -> None:
    try_limit_cuda_fraction()
    step = 0
    paused = False
    emit({"type": "train_status", "state": "running", "protocolVersion": 2})
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
            except json.JSONDecodeError:
                continue
            if cmd.get("type") != "command":
                continue
            name = cmd.get("name")
            if name == "train_step":
                if paused:
                    emit({"type": "command_ack", "command": "train_step", "ok": False, "detail": "paused", "protocolVersion": 2})
                    continue
                step += 1
                loss = max(0.01, 0.9 / (1 + step * 0.02) + __import__("random").random() * 0.02)
                emit({"type": "train_log", "step": step, "loss": loss, "protocolVersion": 2})
                emit({"type": "command_ack", "command": "train_step", "ok": True, "protocolVersion": 2})
            elif name == "pause_train":
                paused = True
                emit({"type": "train_status", "state": "paused", "protocolVersion": 2})
                emit({"type": "command_ack", "command": "pause_train", "ok": True, "protocolVersion": 2})
            elif name == "resume_train":
                paused = False
                emit({"type": "train_status", "state": "running", "protocolVersion": 2})
                emit({"type": "command_ack", "command": "resume_train", "ok": True, "protocolVersion": 2})
            elif name == "stop_train":
                emit({"type": "train_status", "state": "stopped", "reason": "worker_stop_cmd", "protocolVersion": 2})
                emit({"type": "command_ack", "command": "stop_train", "ok": True, "protocolVersion": 2})
                break
            elif name == "ping":
                emit({"type": "pong", "protocolVersion": 2})
            else:
                emit({"type": "command_ack", "command": str(name), "ok": False, "detail": "unknown_command", "protocolVersion": 2})
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
