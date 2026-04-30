# 多人实时协作 AI 白板（作业 Demo）

本项目目标与验收见：**[`.cursor/goal.md`](.cursor/goal.md)**。

- 架构：**[`docs/01-architecture.md`](docs/01-architecture.md)**  
- 能力与手测：**[`docs/02-core-goals.md`](docs/02-core-goals.md)**  
- 实现顺序：**[`docs/03-implementation-steps.md`](docs/03-implementation-steps.md)**  
- **作业四项交付摘要（同步 / 数据结构 / AI 流式 / 测试）：[`docs/04-technical-delivery.md`](docs/04-technical-delivery.md)**  
- Cursor 协作入口：**[`.cursor/README.md`](.cursor/README.md)**

## 当前仓库状态

- **`apps/web`**：React Flow + Yjs，`WebsocketProvider` 直连 **`ws://localhost:1234`**；`/api` 由 Vite 代理到后端。  
- **`apps/server`**：Express + 同端口 **y-websocket**（`setupWSConnection`）；**`POST /api/ai/stream`** 服务端代理 MiniMax 流式。  
- **根目录**：**`npm run dev`** 并行启动 web + server。  

开发与交付勾选见：**[`.cursor/step.md`](.cursor/step.md)**。

## 环境与密钥

后端 **`apps/server/.env`**：`MINIMAX_API_KEY`、`MINIMAX_MODEL` 等。**勿提交**。参照 **`apps/server/.env.example`**（创建该文件并实现服务器后一并提交）。
