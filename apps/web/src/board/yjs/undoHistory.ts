import { getClientUserId } from '../utils/userId'
import type { YBoard } from './doc'
import type { HistoryItem } from './schema'
import { isArrowEdge, isTextNode } from './schema'

/** 反向扫描 history 条目数上限（避免极端长房间卡主线程） */
const MAX_HISTORY_SCAN = 4000

/** pushHistory 曾使用 push([item])，读盘时两种都兼容 */
export function coerceHistoryRow(raw: unknown): HistoryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const direct = raw as Partial<HistoryItem>
  if (typeof direct.userId === 'string' && typeof direct.action === 'string' && typeof direct.id === 'string')
    return raw as HistoryItem
  if (Array.isArray(raw) && raw.length >= 1) return coerceHistoryRow(raw[0])
  return null
}

function aiGenerateAfter(raw: unknown): { taskId: string; nodeId: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const taskId = a.taskId
  const nodeId = a.nodeId
  if (typeof taskId === 'string' && typeof nodeId === 'string') return { taskId, nodeId }
  return null
}

/** 原地替换一条 history：`undone: true` */
export function markHistoryUndone(board: YBoard, index: number, item: HistoryItem): void {
  const hist = board.yHistory
  const next = JSON.parse(JSON.stringify({ ...item, undone: true })) as HistoryItem
  hist.delete(index, 1)
  hist.insert(index, [next])
}

function applyInverse(board: YBoard, entry: HistoryItem): boolean {
  switch (entry.action) {
    case 'create_node': {
      const after = entry.after
      if (!isTextNode(after)) return false
      board.yElements.delete(after.id)
      return true
    }
    case 'create_edge': {
      const after = entry.after
      if (!isArrowEdge(after)) return false
      board.yElements.delete(after.id)
      return true
    }
    case 'update_node': {
      const before = entry.before
      if (!isTextNode(before)) return false
      board.yElements.set(before.id, { ...before })
      return true
    }
    case 'delete_node': {
      const before = entry.before
      if (!isTextNode(before)) return false
      board.yElements.set(before.id, { ...before, deleted: false })
      return true
    }
    case 'delete_edge': {
      const before = entry.before
      if (!isArrowEdge(before)) return false
      board.yElements.set(before.id, { ...before, deleted: false })
      return true
    }
    case 'ai_generate': {
      const p = aiGenerateAfter(entry.after)
      if (!p) return false
      board.yAiTasks.delete(p.taskId)
      board.yElements.delete(p.nodeId)
      return true
    }
    default:
      return false
  }
}

/**
 * Ctrl+Z：从末尾向前找第一条「本人且未 undone」的 history，执行结构化逆操作并标 undone（多 Tab 可见）。
 */
export function undoMyLastCommittedStep(board: YBoard): boolean {
  const me = getClientUserId()
  const origin = me
  const hist = board.yHistory
  const tail = hist.length - 1
  const floor = Math.max(0, tail - MAX_HISTORY_SCAN)

  let targetIndex = -1
  let entry: HistoryItem | null = null

  for (let i = tail; i >= floor; i--) {
    const raw = coerceHistoryRow(hist.get(i))
    if (!raw || raw.userId !== me || raw.undone) continue
    targetIndex = i
    entry = raw
    break
  }

  if (targetIndex < 0 || !entry) return false

  return Boolean(
    board.ydoc.transact(() => {
      const applied = applyInverse(board, entry)
      if (!applied) return false
      markHistoryUndone(board, targetIndex, entry)
      return true
    }, origin),
  )
}
