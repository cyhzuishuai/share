# 多人实时协作 AI 白板（作业 Demo）

本项目目标与验收见：**[`.cursor/goal.md`](.cursor/goal.md)**。

- 架构：**[`docs/01-architecture.md`](docs/01-architecture.md)**  
- 能力与手测：**[`docs/02-core-goals.md`](docs/02-core-goals.md)**  
- 实现顺序：**[`docs/03-implementation-steps.md`](docs/03-implementation-steps.md)**  
- Cursor 协作入口：**[`.cursor/README.md`](.cursor/README.md)**

## 当前仓库状态

已从 **阶段①（脚手架）** 与 **阶段②中的协作服务端雏形**落地：

- **`apps/web`**：Vite + React TS，`reactflow`、`yjs@13`、`y-websocket@3`、`zustand`；`vite.config.ts` 已配置 `/api` → `localhost:1234`。
- **`apps/server`**：`Express` + 与 HTTP 同端口 **Yjs WebSocket**（`y-websocket@1.5.4` + `setupWSConnection`），`POST /api/ai/stream` 占位 501；**`apps/server/.env.example`**。
- **根目录**：`npm run dev`（`concurrently` 同时起 server + web）。

接下来按 **`.cursor/step.md`** 勾选：React Flow 画布、Y.Doc 持久结构、AI 真流式、撤销栈、离线 UI。

## 环境与密钥

后端 **`apps/server/.env`**：`MINIMAX_API_KEY`、`MINIMAX_MODEL` 等。**勿提交**。参照 **`apps/server/.env.example`**（创建该文件并实现服务器后一并提交）。
