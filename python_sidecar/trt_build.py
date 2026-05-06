"""
TensorRT engine build helper: prefers trtexec if on PATH, else documents manual steps.
Usage:
  python trt_build.py --onnx model.onnx --engine model.engine --fp16
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--onnx", required=True)
    p.add_argument("--engine", required=True)
    p.add_argument("--fp16", action="store_true")
    p.add_argument("--int8", action="store_true")
    args = p.parse_args()

    trtexec = shutil.which("trtexec")
    if not trtexec:
        emit(
            {
                "type": "error",
                "code": "TRTEXEC_NOT_FOUND",
                "details": "Install TensorRT and add trtexec to PATH, or build via TensorRT Python API.",
                "protocolVersion": 2,
            }
        )
        sys.exit(1)

    cmd = [trtexec, f"--onnx={args.onnx}", f"--saveEngine={args.engine}", "--memPoolSize=workspace:4096"]
    if args.fp16:
        cmd.append("--fp16")
    if args.int8:
        cmd.append("--int8")
    emit({"type": "command_ack", "command": "trt_build_start", "ok": True, "detail": " ".join(cmd), "protocolVersion": 2})
    r = subprocess.run(cmd, capture_output=True, text=True, env=os.environ)
    if r.returncode != 0:
        emit(
            {
                "type": "error",
                "code": "TRT_BUILD_FAILED",
                "details": (r.stderr or r.stdout)[:2000],
                "protocolVersion": 2,
            }
        )
        sys.exit(r.returncode)
    emit({"type": "command_ack", "command": "trt_build_done", "ok": True, "detail": args.engine, "protocolVersion": 2})


if __name__ == "__main__":
    main()
