# 架构速览（`.cursor/` 一页版）

完整版（数据结构、冲突规则、撤销、AI、安全）：请阅读 **`docs/01-architecture.md`**。

---

## 拓扑

```txt
Browser (React Flow + Zustand + Y.Doc)
        │ WebSocket CRDT (y-websocket)
        ▼
Node.js: Express HTTP + y-websocket 房间 + `/api/ai/stream` → MiniMax
        ▲
        │ 同上
Browser
```

同一 `roomId` 共用一份 **`Y.Doc`**：根上建议 `elements`（Y.Map）、`aiTasks`（Y.Map）、`history`（Y.Array）。

---

## 技术选型（摘要）

| 层 | 选型 |
|----|------|
| 协作 | **CRDT：Yjs + y-websocket**（画布为对象集合 + 增量 update，比在 3 小时内自研 OT 更可行） |
| 画布 | React Flow（节点/边、框选、连接） |
| AI | 前端只调自有后端；**`MINIMAX_*` 仅 `apps/server/.env`** |

---

## 一致性策略（摘要）

- 元数据与整段文案（Demo）：**LWW**（`version` / `updatedAt` / tie-break）。  
- 删除：**delete wins**，关联边一并 soft delete。  
- 撤销：**按用户的 operation-based undo**，不向全局快照回滚。

---

## AI 流式中间态（摘要）

创建 `AiTask(status: streaming)` + 目标文本节点 **`isStreaming: true`**；每个 chunk **`content`/`partialText` 追加**，经 Yjs 广播，结束置 `done` / `isStreaming: false`。详见 `docs/01-architecture.md` §9。
