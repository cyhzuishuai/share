# 实施阶段（勾选表）

详尽命令与代码片段：**`docs/03-implementation-steps.md`**  
硬性作业要求：**`goal.md`**  
架构与数据结构：**`docs/01-architecture.md`**

> 勾选完成项便于多人 / Agent 接着做；不要将长篇说明再贴回本文。

---

## 阶段 ① 基础画布

- [x] Monorepo：`apps/web`、`apps/server`（见 docs §2–§4）
- [x] Vite React TS、`reactflow`、`yjs`、`y-websocket`、`zustand`
- [x] 文本节点自定义组件：创建、编辑、拖拽、删除（可先本地状态）

## 阶段 ② 实时同步

- [x] 后端挂载 y-websocket，与 Express 同源或同端口策略定好
- [x] `createYBoard(roomId)`：`Y.Map elements` / `aiTasks`、`Y.Array history`
- [x] React Flow ← 派生自 `elements`（过滤 `deleted`）
- [ ] 双 Tab 同 `room`，操作另一方延迟不超过约 500ms（按 `goal.md`，需本机手测）

## 阶段 ③ 边与框选

- [x] `onConnect` → 写入 arrow edge（`yElements`）
- [x] 删除节点 → 关联边 soft delete
- [x] React Flow selection → 本地 `selectedNodeIds`，供 Toolbar AI 使用（`useBoardSelectionStore`）

## 阶段 ④ AI（MiniMax）

- [x] `POST /api/ai/stream`，Bearer 仅服务端（实现于 `apps/server/src/ai.ts`；密钥需手填 `.env`）
- [x] 改写 / 扩展 / 总结 Prompt（见 docs §14）
- [x] 先建空节点 + `AiTask`，chunk 写入 Yjs（多 Tab 可见增长；需在双 Tab / 密钥齐全下自测）

## 阶段 ⑤ 撤销与离线

- [x] `history` 与用户 id；Ctrl+Z（Cmd+Z）从尾部撤销**本人**上一条结构化步骤并标 `undone`（远端可见；重做 / 与别人交叉的语义见 `goal.md`，需双人手测）
- [x] Provider 链路 + 文档同步文案（连接中 / 已连接同步中… / 已同步 / 断开重连）；断网重连一致性依赖 Yjs CRDT + 服务端状态，可按 `goal` 双 Tab / 拔网线手测

## 阶段 ⑥ 文档与交付

- [ ] 根目录 `README.md`（启动双命令或 `npm run dev`）
- [ ] `docs/01`、`02`、`03` 与代码一致；**技术决策**覆盖 OT vs CRDT、流式结构、撤销
- [ ] **`apps/server/.env.example`**，`.env` 不入库  
- [ ] 自测：**并发拖拽、删除冲突、AI 双 Tab、撤销、离线**（`docs` §18）

---

## 推荐阅读顺序（新人 / Agent）

1. `.cursor/README.md`（本目录总览实际读这里）  
2. `goal.md`  
3. `docs/01-architecture.md` → `docs/02-core-goals.md` → `docs/03-implementation-steps.md`  
