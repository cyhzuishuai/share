# 实时协作 AI 白板 — 架构文档

## 1. 背景与范围

多人同时进入同一房间，对**文本节点**与**箭头边**协作编辑；任意用户可框选节点触发 **改写 / 扩展 / 总结**；AI 输出需 **流式** 同步到所有人。本文档描述协议、数据结构与关键技术决策。

---

## 2. 技术栈

### 前端

- React / TypeScript / Vite  
- React Flow  
- Yjs、`y-websocket`  
- Zustand  

### 后端

- Node.js / Express  
- `y-websocket`（与 WS 共用或同机部署）  
- MiniMax Chat Completions（`stream: true`）  
- `dotenv`  

### 协作模型

**CRDT（Yjs）+ WebSocket 增量 update**

---

## 3. 为何选 CRDT 而非 OT

| 考量 | OT | CRDT（Yjs） |
|------|----|--------------|
| 白板操作类型 | 需为 move/delete/edit/undo/AI 流式等两两变换规则 | Map/Array + 确定性合并，适配「元素集合」 |
| 离线/重连 | 需服务器版本与变换队列 | Yjs **状态向量**补发缺失 update，适合 Demo |

本作业场景中状态是 **`elements`、`aiTasks`、`history` 结构化集合**，用 Yjs Map/Array **实现成本与时间更可控**。字符级正文合并若需更强保证，可将节点 `content` 升级为 **`Y.Text`**（当前 Demo 可采用整段字符串 + **LWW**）。

---

## 4. 系统拓扑（逻辑）

两个浏览器 Tab 各自的 `Y.Doc` 通过 `WebsocketProvider(wsUrl, roomId, ydoc)` 连到同一服务端；服务端转发 Yjs binary update。

HTTP 示例：

```txt
前端 → POST http://localhost:1234/api/ai/stream （或 vite 代理到后端）
WebSocket → ws://localhost:1234 （与 y-websocket 约定路径一致）
```

**开发态建议：** Vite 已将 `http://localhost:5173/api` 代理到 `http://localhost:1234`；WebSocket 仍直连 **`ws://localhost:1234`**（避免把升级请求走 Vite）。

**依赖说明：** 前端使用 **`y-websocket@3`**（仅客户端 Provider）；服务端使用 **`y-websocket@1.x` 的 `require('y-websocket/bin/utils')` 中 `setupWSConnection`**，与 **`yjs@13`** 协议一致。Monorepo 下勿把两端 `y-websocket` 误合并为同一主版本。

房间示例 URL：`http://localhost:5173/board/demo-room` → `roomId = "demo-room"`。

---

## 5. `Y.Doc` 结构

```ts
const yElements = ydoc.getMap<ElementId>("elements");
const yAiTasks = ydoc.getMap<TaskId>("aiTasks");
const yHistory = ydoc.getArray<HistoryItem>("history");
```

- **`elements`**：节点与边的扁平 Map（id → 序列化 JSON 对象）。  
- **`aiTasks`**：一次 AI 调用的任务元数据（含流式片段）。  
- **`history`**：用于 **按用户的 operation-based undo**（见 §10）。

可选：`y-protocols/awareness` 展示远端光标/选区（不占持久结构）。

---

## 6. 元素类型定义（建议）

### 6.1 文本节点

```ts
type TextNodeElement = {
  id: string;
  kind: "node";
  nodeType: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  deleted: boolean;
  version: number;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
  isStreaming?: boolean;
  aiTaskId?: string;
};
```

### 6.2 箭头边

```ts
type ArrowEdgeElement = {
  id: string;
  kind: "edge";
  edgeType: "arrow";
  sourceId: string;
  targetId: string;
  deleted: boolean;
  version: number;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
};
```

### 6.3 AI 任务

```ts
type AiTask = {
  id: string;
  type: "rewrite" | "expand" | "summarize";
  status: "pending" | "streaming" | "done" | "error";
  selectedElementIds: string[];
  targetElementIds: string[];
  partialText: string;
  errorMessage?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};
```

### 6.4 历史项（Undo）

```ts
type HistoryItem = {
  id: string;
  userId: string;
  action:
    | "create_node"
    | "update_node"
    | "delete_node"
    | "create_edge"
    | "delete_edge"
    | "ai_generate";
  before: unknown;
  after: unknown;
  createdAt: number;
  undone?: boolean;
};
```

---

## 7. 端到端同步链路

React Flow **不独占权威状态**：用户事件 → **事务**写入 Yjs → 产生 update → WS 广播 → 对端 `ydoc.on("update")` → 再从 `elements` **派生** `nodes` / `edges`。

---

## 8. CRUD 与删除策略

- **新增**：`yElements.set(id, element)`，`version: 1`。  
- **移动/改文案**：整块替换对象，`version += 1`，刷新 `updatedAt` / `updatedBy`。  
- **删除**：**soft delete**：`deleted: true`，不 `delete(id)`（便于 undo 与因果边清理）。  

**删节点**：同一次事务内将与该节点相连的边全部 **soft delete**。

---

## 9. 冲突策略（Demo 可实现层）

### 9.1 元数据与同字段整段文案

确定性 **Last-Writer-Wins**（示例优先级）：

1. `version` 更大者优先；  
2. 相等则 `updatedAt` 更大者优先；  
3. 仍相等可用 `updatedBy`/client id 字典序兜底。  

实现上可直接 **以写入 Y.Map 的最终对象为准**，业务层写入前若读旧值可比较上述字段决定是否覆盖。

### 9.2 删除 vs 并发编辑

**删除优先（delete wins）**：一边删、一边挪/编辑同一节点，收敛为 **节点已删除**；边一律随端点删除。

---

## 10. AI：代理与流式数据结构

### 10.1 安全

MiniMax **`MINIMAX_API_KEY` / 模型配置仅 `apps/server/.env`**；前端只请求 **`POST /api/ai/stream`**。

### 10.2 流式中间态（回答「不完整内容如何建模」）

- 任务级：**`AiTask.status = streaming`**，`partialText` **累加**。  
- 画布级：**目标文本节点 `isStreaming: true`**，`content` **随 SSE/chunk 累加**。  
- 每一段追加都在 **`ydoc.transact`** 中完成，以便一条 Yjs update 可含多次 token（亦可批处理防抖，Demo 可直接每 chunk 写）。

完成时：`isStreaming = false`，`AiTask.status = "done"`；失败：`"error"` + `errorMessage`。

### 10.3 Prompt（业务）

- **改写**：简洁、正式，只输出结果。  
- **扩展**：3 条延伸想法（可用单节点内编号列表，实现最快）。  
- **总结**：多段输入 → 一句话结论。  

---

## 11. 撤销（回答「多人 + 撤销」）

**不做全局时间轴回滚**。采用 **`operation-based undo`**：

- 仅撤销 **当前 `userId` 最近一次且 `undone !== true`** 的历史项；  
- 通过 **写入反向补丁**（如 create → 对标元素 soft delete）同步给所有人；  
- B 在 A 之后基于共享状态继续编辑 **不受影响**。  

建议维护 **每名用户至多 20 条可撤销粒度**（入栈时裁剪或遍历窗口）。

---

## 12. 离线与重连

`y-websocket` 自动重连后，服务端（或对等端）补足缺失 **Yjs state vector** 区间的 update。**不得**因单客户端离线阻塞他人编辑。Demo 下服务端常为 **内存态** —— **进程重启会丢房间**（写明为已知限制）。

---

## 13. React Flow 映射

从 `elements` Map 取值 → 跳过 `deleted` → 映射为 RF `nodes` / `edges`（`position: { x, y }`，`source`/`target` 用 `sourceId`/`targetId`）。

---

## 14. 已知限制（答辩可主动说）

1. Demo 正文用 string + LWW，非字符级 CRDT。  
2. Undo 为用户局部，不支持协作全局 rewind。  
3. 服务端无持久化时重启丢状态。  
4. 权限、登录、房间列表不在范围。  

---

## 15. `.env.example`（后端）

```env
PORT=1234
MINIMAX_API_KEY=your_minimax_api_key
MINIMAX_MODEL=MiniMax-M2.5
MINIMAX_BASE_URL=https://api.minimax.chat/v1
```

`.env` 禁止提交仓库。
