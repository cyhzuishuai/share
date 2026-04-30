# 实现步骤

按 **阶段依赖**从前到后实施；与前文 **「五阶段汇总」** 一致。

---

## 五阶段路线图

### 第一阶段：基础画布

1. Monorepo：`apps/web`、`apps/server`  
2. Vite React TS + React Flow 跑通静态节点拖移  
3. 自定义文本节点组件（内容可编辑可先 `textarea`/`contentEditable` 简化）

### 第二阶段：实时同步

1. 后端挂载 **y-websocket**（常与 Express 共用 HTTP server）  
2. 封装 `createYBoard(roomId)`：`yElements`、`yAiTasks`、`yHistory`  
3. 画布读写全部走 **`ydoc.transact`**  

### 第三阶段：边与框选

1. `onConnect` 写 arrow edge  
2. 删节点时级联标记边 deleted  
3. `onSelectionChange` → 本地 state 供 Toolbar

### 第四阶段：AI

1. 实现 **`POST /api/ai/stream`**（`type` + `texts[]`），转发 MiniMax `stream`  
2. 前端 `fetch`/SSE 读本 API，逐段 `transact` 更新节点 `content`  
3. Prompt 三套：改写 / 扩展 / 总结（参考 `docs/01-architecture.md`）

### 第五阶段：撤销与离线

1. **每次结构化变更 append `history`**（含 AI 占位建议记 `ai_generate`）  
2. Ctrl+Z 逆操作 + `undone = true`  
3. Provider 状态文案 + **断线重连**手测脚本

---

## Monorepo 结构建议

```txt
├── apps/web/          # Vite + React Flow + Yjs
├── apps/server/       # Express + y-websocket + AI 代理
├── docs/
├── package.json       # workspaces + 并行 dev script
└── README.md
```

---

## Web 初始化（命令备忘）

```bash
cd apps && npm create vite@latest web -- --template react-ts
cd web && npm install reactflow yjs y-websocket zustand
```

### 推荐的 `src/board` 划分

```txt
board/Board.tsx
board/Toolbar.tsx
board/nodes/TextNode.tsx
board/hooks/useYBoard.ts
board/hooks/useBoardActions.ts
board/hooks/useAiStream.ts
board/yjs/doc.ts
board/yjs/schema.ts
board/yjs/operations.ts
```

---

## Server 初始化（命令备忘）

```bash
cd apps/server
npm init -y
npm install express cors dotenv y-websocket ws
npm install -D typescript tsx @types/node @types/express cors
```

建议文件：`src/index.ts`、`src/yws.ts`、`src/ai.ts`、`.env.example`。

---

## 关键代码约定

### Yjs Provider

```ts
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export function createYBoard(roomId: string) {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider("ws://localhost:1234", roomId, ydoc);
  return {
    ydoc,
    provider,
    yElements: ydoc.getMap("elements"),
    yAiTasks: ydoc.getMap("aiTasks"),
    yHistory: ydoc.getArray("history"),
  };
}
```

### elements → React Flow（示意）

跳过 `deleted`；`kind === "node"` → RF node；`kind === "edge"` → RF edge（source/target ← sourceId/targetId）。

---

## 冲突与离线：手测 checklist

复制到 PR / README「测试」节：

```txt
□ 实时：双 Tab /board/demo 创建与拖动 < 体感 500ms 级同步
□ 并发移动：同时对同一节点拖，停下后两端一致（或符合 LWW 规则一致）
□ 删除冲突：A 删同时 B 移，结果为删除优先、边清理
□ AI 流式：A 触发，B 见节点持续增长
□ 撤销：仅发起方 Ctrl+Z 撤销自己的一步，远端可见结构性变化
□ 离线：B 断网期间 A 多步编辑，B 恢复后画布一致
```

---

## GitHub 提交清单

```txt
□ 完整可运行源码
□ README.md（如何起双端口、演示 URL）
□ docs/01-architecture.md / 02-core-goals.md / 03-implementation-steps.md
□ apps/server/.env.example（无真实密钥）
```

---

## NPM scripts 建议（根）

```json
{
  "scripts": {
    "dev:server": "npm run dev --workspace=@app/server",
    "dev:web": "npm run dev --workspace=@app/web",
    "dev": "concurrently npm:dev:*"
  }
}
```

（实际 `workspace` 名以初始化后 `package.json` `name` 为准；或直接 `npm run dev -w apps/web` 等写法。）
