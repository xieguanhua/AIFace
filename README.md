# AIFace

Electron + Vue 3 桌面应用骨架：实时工作台（`/live`）、训练实验（`/train`）、素材与设置；Python Sidecar 经 **NDJSON** 与主进程通信（含 `mock_sidecar.py` 与无 Python 时的 Node mock）。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

未打包目录调试：`npx electron-vite build && npx electron-builder --dir`，输出在 `release/win-unpacked`。

## 质量与发布

- 质量检查：`npm run quality:check`
- 产物冒烟：`npm run release:smoke`
- `quality:check` 包含：TypeScript 类型检查、中英文 i18n 键一致性、错误码映射覆盖、`train_worker.py` 与 `mock_sidecar.py` 命令链路冒烟校验。

发布前建议回归：

1. 首次启动进入 `#/onboarding`，权限与基础模型流程可完成。
2. `#/live` 可启动/停止引擎，指标有刷新，心跳异常有提示。
3. `#/train` 可启动/暂停/恢复/停止训练，自动循环可按间隔步进，Loss 曲线持续更新。
4. `#/assets/faces` 导入/删除素材正常，训练开关状态可持久化。
5. `#/assets/models` 下载/取消/导入/安装基础模型正常，错误码文案可读。
6. `#/settings` 语言、显存阈值、训练显存占比、自动启动开关可保存并生效。

## 开发日志排障

开发模式下，主进程会输出结构化事件日志（生产包默认不输出）：

- 训练链路：`[train-event] ...`
- 实时引擎链路：`[sidecar-event] ...`

可按关键字过滤查看：

- `train-event`：关注训练启动/状态流转/命令回执/异常退出。
- `sidecar-event`：关注引擎启动、metrics、frame_ready、OOM 自愈、进程退出。

## Cursor

项目 Rules 与 Skills 见 [AGENTS.md](./AGENTS.md)。
