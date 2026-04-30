import type * as Y from 'yjs'

import { getClientUserId } from '../utils/userId'
import type { YBoard } from './doc'
import type {
  ArrowEdgeElement,
  HistoryItem,
  TextNodeElement,
} from './schema'
import { isArrowEdge, isTextNode } from './schema'

export function snapshotElements(yElements: Y.Map<unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>()
  yElements.forEach((value, key) => {
    out.set(key, value)
  })
  return out
}

export function pushHistory(board: YBoard, item: HistoryItem): void {
  board.yHistory.push([item])
}

export function createArrowEdge(
  board: YBoard,
  sourceId: string,
  targetId: string,
): ArrowEdgeElement | null {
  if (!sourceId || !targetId || sourceId === targetId) return null

  const snap = snapshotElements(board.yElements)
  const src = snap.get(sourceId)
  const tgt = snap.get(targetId)
  if (!isTextNode(src) || src.deleted || !isTextNode(tgt) || tgt.deleted) return null

  for (const val of snap.values()) {
    if (
      isArrowEdge(val) &&
      !val.deleted &&
      val.sourceId === sourceId &&
      val.targetId === targetId
    )
      return null
  }

  const userId = getClientUserId()
  const now = Date.now()
  const edge: ArrowEdgeElement = {
    id: crypto.randomUUID(),
    kind: 'edge',
    edgeType: 'arrow',
    sourceId,
    targetId,
    deleted: false,
    version: 1,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  }

  const h: HistoryItem = {
    id: crypto.randomUUID(),
    userId,
    action: 'create_edge',
    before: null,
    after: { ...edge },
    createdAt: now,
    undone: false,
  }

  board.ydoc.transact(() => {
    board.yElements.set(edge.id, { ...edge })
    pushHistory(board, h)
  }, userId)

  return edge
}

/** 单条箭头 soft delete（如用户选中边按 Delete） */
export function softDeleteArrowEdge(board: YBoard, edgeId: string): void {
  const raw = board.yElements.get(edgeId)
  if (!isArrowEdge(raw) || raw.deleted) return
  board.ydoc.transact(() => {
    softDeleteElement(board, edgeId, raw)
  }, getClientUserId())
}

/** 创建文本节点 */
export function createTextNode(
  board: YBoard,
  content: string,
  position: { x: number; y: number },
): TextNodeElement {
  const userId = getClientUserId()
  const now = Date.now()
  const node: TextNodeElement = {
    id: crypto.randomUUID(),
    kind: 'node',
    nodeType: 'text',
    x: position.x,
    y: position.y,
    width: 220,
    height: 100,
    content,
    deleted: false,
    version: 1,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  }

  const h: HistoryItem = {
    id: crypto.randomUUID(),
    userId,
    action: 'create_node',
    before: null,
    after: { ...node },
    createdAt: now,
    undone: false,
  }

  board.ydoc.transact(() => {
    board.yElements.set(node.id, { ...node })
    pushHistory(board, h)
  }, userId)

  return node
}

export function persistNodePosition(board: YBoard, id: string, pos: { x: number; y: number }): void {
  const userId = getClientUserId()
  const raw = board.yElements.get(id)

  if (!isTextNode(raw) || raw.deleted) return

  const x = typeof pos.x === 'number' ? pos.x : Number(pos.x)
  const y = typeof pos.y === 'number' ? pos.y : Number(pos.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  const rx = typeof raw.x === 'number' ? raw.x : Number(raw.x)
  const ry = typeof raw.y === 'number' ? raw.y : Number(raw.y)
  if (Number.isFinite(rx) && Number.isFinite(ry) && rx === x && ry === y) return

  const next: TextNodeElement = {
    ...raw,
    x,
    y,
    version: raw.version + 1,
    updatedBy: userId,
    updatedAt: Date.now(),
  }

  const h: HistoryItem = {
    id: crypto.randomUUID(),
    userId,
    action: 'update_node',
    before: { ...raw },
    after: { ...next },
    createdAt: Date.now(),
    undone: false,
  }

  board.ydoc.transact(() => {
    board.yElements.set(id, { ...next })
    pushHistory(board, h)
  }, userId)
}

/** 仅在失焦提交，减少 Yjs transaction 频次 */
export function persistNodeContent(board: YBoard, id: string, content: string): void {
  const userId = getClientUserId()
  const raw = board.yElements.get(id)
  if (!isTextNode(raw) || raw.deleted) return
  if (raw.isStreaming) return
  if (raw.content === content) return

  const next: TextNodeElement = {
    ...raw,
    content,
    version: raw.version + 1,
    updatedBy: userId,
    updatedAt: Date.now(),
  }

  const h: HistoryItem = {
    id: crypto.randomUUID(),
    userId,
    action: 'update_node',
    before: { ...raw },
    after: { ...next },
    createdAt: Date.now(),
    undone: false,
  }

  board.ydoc.transact(() => {
    board.yElements.set(id, { ...next })
    pushHistory(board, h)
  }, userId)
}

function softDeleteElement(
  board: YBoard,
  id: string,
  el: TextNodeElement | ArrowEdgeElement,
): void {
  const userId = getClientUserId()
  const now = Date.now()
  const deleted: TextNodeElement | ArrowEdgeElement = {
    ...el,
    deleted: true,
    version: el.version + 1,
    updatedBy: userId,
    updatedAt: now,
  }

  const h: HistoryItem = {
    id: crypto.randomUUID(),
    userId,
    action: el.kind === 'node' ? 'delete_node' : 'delete_edge',
    before: { ...el },
    after: { ...deleted },
    createdAt: now,
    undone: false,
  }

  board.yElements.set(id, { ...deleted })
  pushHistory(board, h)
}

/** 文本节点删除 + 相关箭头 soft delete（delete wins） */
export function softDeleteNodeWithEdges(board: YBoard, nodeId: string): void {
  const raw = board.yElements.get(nodeId)
  if (!isTextNode(raw) || raw.deleted) return

  board.ydoc.transact(() => {
    softDeleteElement(board, nodeId, raw)
    board.yElements.forEach((val, edgeId) => {
      if (isArrowEdge(val) && !val.deleted) {
        if (val.sourceId === nodeId || val.targetId === nodeId)
          softDeleteElement(board, edgeId, val)
      }
    })
  }, getClientUserId())
}
