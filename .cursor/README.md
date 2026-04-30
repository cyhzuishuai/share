# `.cursor/` 目录说明（AI 与人的协作入口）

本文档是本仓库 **Cursor / Agent 的起点**：先读摘要，再按阶段打开 `docs/` 正文实现。

---

## 1. 三件事的关系

| 文件 | 作用 |
|------|------|
| [`goal.md`](./goal.md) | **作业口径**：硬性要求（双 Tab、≤500ms、冲突、撤销、离线、AI 流式与文档答题点）。验收以这里为准。 |
| [`architecture.md`](./architecture.md) | **架构速览**（一页）：技术选型、拓扑、数据结构要点；详解在仓库根目录 `docs/01-architecture.md`。 |
| [`step.md`](./step.md) | **当前阶段勾选表**：不按章节重复长篇步骤，只做「勾选 + 跳转」。 |

正文级文档（GitHub / 答辩提交用）写在：

- `docs/01-architecture.md` — CRDT/Yjs、结构、同步、冲突、AI 流式、撤销、离线、安全  
- `docs/02-core-goals.md` — 能力清单、验收、非目标、最小 Demo 流程  
- `docs/03-implementation-steps.md` — 命令、目录结构、实现顺序与测试清单  

---

## 2. 项目一句话

多人实时协作 AI 白板：**React Flow + Yjs/y-websocket（CRDT）** 同步画布元素；**Express 后端代理 MiniMax**，`POST /api/ai/stream` 流式输出；令牌 **仅存 `apps/server/.env`**。

---

## 3. 按顺序执行（与 `goal` 对齐）

1. **脚手架**：Monorepo `apps/web`（Vite + React TS + React Flow + Yjs）、`apps/server`（Express + y-websocket + AI 代理）。  
2. **协作闭环**：同一 `roomId` 共享 `Y.Doc`，`elements` / `aiTasks` / `history`；延迟与双 Tab 自测。  
3. **画布**：文本节点、箭头边、框选、`soft delete`。  
4. **AI**：框选 → 改写/扩展/总结 → 占位节点 + `partialText`/`content` 随 chunk 写 Yjs。  
5. **撤销**：**仅撤销当前用户**最近若干步，`operation-based` 反向写入并广播。  
6. **离线**：依赖 y-websocket 重连与 Yjs 状态同步（题目 30 秒场景）。  
7. **收尾**：README、`docs/`、`.env.example`、简要说明 OT/CRDT、流式中间态结构、多人撤销策略（见架构文档）。

当前进度请勾选：[`step.md`](./step.md)。

---

## 4. 刻意矛盾题（须在技术文档里回答）

参见 `goal.md` 文末与 `docs/01-architecture.md` 对应小节：**OT vs CRDT（本项目选 CRDT/Yjs）**、**AI 不完整中间态数据结构**、**多人撤销不按全局时光倒流**。

---

## 5. `.cursor/` 约定

- 实现细节、类型定义、Prompt、测试用例：**以 `docs/` 为准**，避免在 `.cursor` 再放一份超长重复正文。  
- 修改阶段或范围时：**先更新 `step.md` 勾选状态**，再改代码。
