---
name: aiface-sidecar-protocol
description: >-
  Defines NDJSON stdio between Node SidecarManager and Python: control messages,
  protocolVersion 2 frame_ready + mmap file path, stdin commands, command_ack,
  CUDA_OOM self-heal. Use when extending frames, metrics, or engine commands.
---

# Sidecar NDJSON 协议

## 规则

1. **一行一条 JSON**；必须包含 `type`。
2. **`protocolVersion`**：新能力用 **2**（`frame_ready`、扩展 `metrics`）。
3. **stdout** 仅 JSON；日志走 stderr/文件。
4. 解析：`src/shared/sidecar-protocol.ts` 的 `parseSidecarLine`。

## Py → Node（stdout）

| type | 说明 |
|------|------|
| `ready` | `capabilities`, 可选 `frameBufferPath` |
| `metrics` | `fps`, `inferenceMs`, `vram*`, `droppedFrames?` |
| **`frame_ready`** | **v2**：像素在 `shmPath` 文件 `[offset, offset+byteLength)`；`width`,`height`,`pixelFormat`(`rgba`\|`bgr24`),`frameId` |
| `error` | `code`：`CUDA_OOM`, `SIDECAR_EXIT`, …；可选 `recoverable`,`suggest[]` |
| `command_ack` | `command`, `ok`, 可选 `detail` |
| `train_log` / `pong` | 按需 |

## Node → Py（stdin）

```json
{"type":"command","name":"empty_cache","payload":{}}
{"type":"command","name":"set_params","payload":{"grainStrength":0.1,"previewMaxEdge":768}}
{"type":"command","name":"preload_model","payload":{"modelId":"x"}}
{"type":"command","name":"swap_model","payload":{"modelId":"x"}}
{"type":"command","name":"warmup_infer","payload":{}}
{"type":"command","name":"simulate_cuda_oom","payload":{}}
```

## 帧缓冲（MVP）

- 环境变量 **`AIFACE_FRAME_BUFFER`**：用户目录下固定容量文件（见 `src/main/frame-buffer.ts`）。
- Python `mmap` 写入；Node `readFrameBytes` 后 **`webContents.send('aiface:frame-pixels', meta, Buffer)`**；渲染进程 `putImageData`。

## 升级

真 **命名共享内存** / 多槽环形缓冲 / GPU 读回优化：在保持 `frame_ready` 元数据契约的前提下替换底层存储实现。
