# AIFace — Cursor Agent 指引

## Rules（`.cursor/rules/*.mdc`）

已落盘，Cursor 会根据 `description` / `globs` / `alwaysApply` 自动选用：

| 文件 | 作用 |
|------|------|
| `aiface-core.mdc` | 全局栈、安全、文案、目录（**始终应用**） |
| `aiface-vue-renderer.mdc` | Vue / Pinia / Dexie / 路由 / ECharts |
| `aiface-electron-main.mdc` | 主进程、preload、Sidecar、单实例 |
| `aiface-python-sidecar.mdc` | Python NDJSON、错误码 |
| `aiface-i18n.mdc` | vue-i18n + AntD + Day.js + 持久化优先级 |
| `aiface-shared.mdc` | `src/shared` IPC 与协议类型 |

## Skills（`.cursor/skills/`）

| Skill | 何时使用 |
|-------|----------|
| `aiface-architecture` | 加功能、对齐全局架构与数据流 |
| `aiface-sidecar-protocol` | 扩展 Node ↔ Python NDJSON 消息 |

## 本地运行

```bash
npm install
npm run dev
```

生产构建：`npm run build`（含 `electron-builder`）；仅打包目录：`npx electron-vite build && npx electron-builder --dir`。

Sidecar 帧：**mmap 文件**（`userData/aiface_frame_ring.bin`）+ `frame_ready` 元数据；渲染进程经 `window.aiface.onFramePixels` 上 Canvas。OOM 演示：`DEV_SIMULATE_CUDA_OOM` IPC（开发构建下 Live 页按钮）。

## 历史说明

[`.cursor/CURSOR_SETUP.md`](.cursor/CURSOR_SETUP.md) 为早期模板汇总；**以 `.mdc` / `SKILL.md` 为准**。
