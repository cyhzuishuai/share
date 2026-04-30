# 技术交付说明（四项作业要求）

本文档对应作业文档要求：**实时同步方案**、**数据结构设计与增量同步**、**AI 流式同步**、**并发冲突验证方案**。与实现代码对应关系：`apps/web`、`apps/server`，详细协议见 **`docs/01-architecture.md`**。

---

## 一、实时同步方案说明：协议 / 库与冲突处理

### 选用的协议与库

| 层级 | 选型 | 说明 |
|------|------|------|
| 文档模型 | **Yjs 13（CRDT）** | 画布权威状态存放在共享 `Y.Doc`。 |
| 传输 | **WebSocket（y-websocket）** | 浏览器端：`y-websocket@3` 的 **`WebsocketProvider(wsUrl, roomId, ydoc)`**；服务端：与 **`Express` + `http`** 共用端口，使用 **`require('y-websocket/bin/utils').setupWSConnection`** 处理升级连接，转发 **二进制 Yjs update**。 |
| 拓扑 | **房间 = `roomId` 字符串** | 同一 `roomId` 共用一份文档状态向量；服务端在内存中为各房间维护会话（Demo 默认无磁盘持久化）。 |

HTTP 独立通道：前端 **`POST /api/ai/stream`** → 服务端代理 MiniMax（密钥不出浏览器）；协作状态只走 WebSocket。

### 冲突如何解决（协作语义）

本项目采用 **CRDT 的最终收敛**，而不是 OT 的操作变换。

1. **`Y.Map(elements)` + 整块元素 JSON**  
   对每个元素 id，协作双方通过 **Yjs 的确定性合并规则**收敛；应用层在同一事务内 **`set(id, {...})`** 整块替换节点/边对象，同步语义清晰。

2. **应用层约定（与 OT 取舍对应）**  
   - **同字段文案 / 元数据**：以 **`version`、`updatedAt` 等业务字段**可做 **Last-Writer-Wins**；实践中以 **最后一次成功写入 `yElements` 的快照**为准（详见 `docs/01-architecture.md` §9）。  
   - **正文**：当前 Demo 使用 **字符串整段替换**，多人同时编辑同一 `textarea` 易出现「后写覆盖先写」——非字符级 CRDT；若要加强，可将 `content` 升级为 **`Y.Text`**。  
   - **删除 vs 并发移动/编辑**：**删除优先（delete wins）**；删节点时同事务内级联 **soft delete** 关联边，避免悬挂引用。

3. **为何不用 OT**  
   状态是「元素集合」的增删改与软删，**Yjs Map + 增量 update** 在本作业时间盒内实现成本更低；**断线重连**靠 **状态向量补发缺失区间** 即可追上，无需服务端维护 OT 版本链（对比见 `docs/01-architecture.md` §3）。

---

## 二、数据结构设计：画布状态表示与增量同步

### 画布在 `Y.Doc` 中的表示

根文档下划分三类共享结构（与 **`apps/web/src/board/yjs/doc.ts`** 一致）：

| 名称 | 类型 | 职责 |
|------|------|------|
| **`elements`** | `Y.Map<id, object>` | **扁平**存储所有「文本节点」与「箭头边」的 **POJO**（`kind: 'node' | 'edge'` 等），含 `x,y,content,deleted,version,...`。 |
| **`aiTasks`** | `Y.Map<taskId, object>` | AI 一次调用的任务：**`status`、`partialText`、关联节点 id** 等。 |
| **`history`** | `Y.Array` | **结构化操作日志**：`create_* / update_node / delete_* / ai_generate`，带 `userId`、`before/after`、`undone`，供 **仅本人 Ctrl+Z** 逆向写回（见 **`apps/web/src/board/yjs/undoHistory.ts`**）。 |

**视图层（React Flow）** 不持久化：从 `elements` **派生** `nodes`/`edges`（过滤 `deleted: true`），见 **`elementsToFlow.ts`**；连接、拖拽、撤销等均 **先写 Yjs**，再经 **`ydoc.on('update')`** 或 Provider **`sync`** 触发 **`flushFromY`**。

### 如何支持增量同步

- **Yjs 内核**：每次 `ydoc.transact(...)` 内对 `Y.Map`/`Y.Array` 的修改会生成 **二进制 update**；`y-websocket` 将该 update 广播到同房间的其他客户端。  
- **对端应用**：对端 `Y.Doc` **应用 update** 合并进同一 CRDT 状态，**无需**自研「增量 JSON diff」协议。  
- **全量/补洞**：重连后通过 **Yjs 状态向量（state vector）** 交换，由服务端/会话补发缺失区间的 update，从而在 **较长时间断线** 后仍可向 **最终一致** 收敛（与 `goal.md` 离线条目一致）。  

**已知限制**：服务端进程若重启且未做持久化，房间状态会丢失（答辩可主动说明）。

---

## 三、AI 流式同步的实现方式

### 链路

1. 前端框选节点 → 调 **`POST /api/ai/stream`**，body：`{ type: 'rewrite'|'expand'|'summarize', texts: string[] }`。  
2. 服务端（**`apps/server/src/ai.ts`**）用 **MiniMax OpenAI 兼容** `chat/completions`，**`stream: true`**，解析 **SSE**，将 **`delta.content`** 以 **`text/plain`** 流式写给浏览器。  
3. 浏览器 **`fetch` ReadableStream** 分块解码，每块在 **`ydoc.transact`** 中调用 **`appendAiStreamText`**（**`apps/web/src/board/yjs/aiOperations.ts`**），把文本 **追加**到目标节点 `content`，并更新 **`yAiTasks` 中 `partialText`**。  

### 「不完整中间态」如何建模（多人可见）

- **占位**：`seedAiGeneration` 先在同一事务写入 **新文本节点**（如占位文案）+ **`AiTask(status: 'streaming')`**，并记入 **`history`** 的 **`ai_generate`**，便于撤销与可追溯。  
- **流式期**：节点标记 **`isStreaming: true`**，前端 **禁止**用语义化编辑持久化路径覆盖流式正文（见 **`persistNodeContent`**、`TextNode` 只读态）。  
- **结束**：`finalizeAiGeneration` 将 **`status`** 置 **`done`/`error`**，**`isStreaming: false`**，失败时附带错误文案。  

这样 **其他人** 只看到 **同一个 `elementId`** 的内容随 Yjs update **逐步变长**，满足「不完整内容也在协同层可见」的题目要求。

---

## 四、测试方案：并发与冲突验证（手测已通过）

以下为 **可复述、可重复的验证设计**（与 `docs/03-implementation-steps.md` §冲突与离线、`docs/02-core-goals.md` §4 一致）。

| 序号 | 场景 | 操作步骤 | 预期（冲突策略） |
|------|------|----------|------------------|
| T1 | 双 Tab **实时延迟** | 同 `room` 打开两 Tab，一侧新增/拖动节点 | 另一侧 **体感约 500ms 内** 可见更新（局域网/本机）。 |
| T2 | **并发拖动**同一节点 | A、B 同时拖同一节点后先后松手 | 收敛为 **Yjs CRDT + 最后一次 `persistNodePosition` 写入** 一致；不出现「单方节点整颗静默消失」。 |
| T3 | **删除 vs 移动** | A 删除节点的同时 B 正在移动该节点 | **删除优先**；节点与其边在两侧均为 **`deleted`**，无悬挂边。 |
| T4 | **并发编辑正文**（已知弱保证） | 双 Tab 同时改同一节点不同文案 | **后提交的整段文案覆盖前者**（string + LWW）；用于证明策略为 **确定性**，非随机静默丢若需更强可答辩提出 **Y.Text** 演进。 |
| T5 | **AI 流式 + 观察者** | A 触发 AI，B 仅观察 | B 见目标节点 **`content` 持续增长**，流式结束前只读。 |
| T6 | **撤销仅限本人 + 远端可见** | A 在正文外焦点下 **Ctrl+Z / Cmd+Z** | 仅撤回 **本人在 `history` 中尚未 `undone` 的一步**；B 不写键盘亦见 **结构上**的回退（与 `history` 同步标记一致）。 |
| T7 | **离线重连** | B 断网期间 A 多步编辑，B 恢复网络 | **不阻塞 A**；B 连接徽章经 **断开 → 重连 → 已同步**；画布与 A **最终一致**（Yjs 状态向量补洞）。 |

**结论**：本实现下协作冲突服从 **元素级 CRDT + 删除优先 + 正文整段后写胜出**；与 **§一、§二** 选型及 **`docs/01-architecture.md` §9** 对齐。

---

## 延伸阅读

- 架构延展：**`docs/01-architecture.md`**  
- 验收步骤：**`docs/02-core-goals.md`**  
- 作业原文：**`.cursor/goal.md`**
