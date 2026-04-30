import { getClientUserId } from '../utils/userId'
import type { YBoard } from './doc'
import { pushHistory } from './operations'
import type { AiTask, HistoryItem, TextNodeElement } from './schema'
import { isAiTask, isTextNode } from './schema'

/** 占位节点 + 任务，history 记一条 ai_generate 供阶段⑤撤销 */
export function seedAiGeneration(
  board: YBoard,
  kind: AiTask['type'],
  selectedElementIds: string[],
  position: { x: number; y: number },
): { nodeId: string; taskId: string } {
  const userId = getClientUserId()
  const now = Date.now()
  const taskId = crypto.randomUUID()
  const nodeId = crypto.randomUUID()

  const task: AiTask = {
    id: taskId,
    type: kind,
    status: 'streaming',
    selectedElementIds: [...selectedElementIds],
    targetElementIds: [nodeId],
    partialText: '',
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }

  const node: TextNodeElement = {
    id: nodeId,
    kind: 'node',
    nodeType: 'text',
    x: position.x,
    y: position.y,
    width: 280,
    height: 120,
    content: '🤖 生成中…',
    deleted: false,
    version: 1,
    createdBy: userId,
    createdAt: now,
    updatedBy: 'ai-stream',
    updatedAt: now,
    isStreaming: true,
    aiTaskId: taskId,
  }

  const h: HistoryItem = {
    id: crypto.randomUUID(),
    userId,
    action: 'ai_generate',
    before: null,
    after: { taskId, nodeId, type: kind, selectedElementIds },
    createdAt: now,
    undone: false,
  }

  board.ydoc.transact(() => {
    board.yAiTasks.set(taskId, { ...task })
    board.yElements.set(nodeId, { ...node })
    pushHistory(board, h)
  }, userId)

  return { nodeId, taskId }
}

/** 流式追加：不改变 version（只在 finalize 递增） */
export function appendAiStreamText(board: YBoard, nodeId: string, taskId: string, fragment: string): void {
  if (!fragment) return
  board.ydoc.transact(() => {
    const rawNode = board.yElements.get(nodeId)
    const rawTask = board.yAiTasks.get(taskId)

    if (!isTextNode(rawNode) || rawNode.deleted) return
    if (!rawTask || !isAiTask(rawTask)) return

    const prev = rawNode.content
    const nextContent = prev === '🤖 生成中…' ? fragment : prev + fragment

    board.yElements.set(nodeId, {
      ...rawNode,
      content: nextContent,
      updatedBy: 'ai-stream',
      updatedAt: Date.now(),
    })

    board.yAiTasks.set(taskId, {
      ...rawTask,
      partialText: rawTask.partialText + fragment,
      updatedAt: Date.now(),
    })
  }, 'ai-stream')
}

export function finalizeAiGeneration(
  board: YBoard,
  nodeId: string,
  taskId: string,
  outcome: 'done' | 'error',
  errorMessage?: string,
): void {
  const userId = getClientUserId()
  board.ydoc.transact(() => {
    const rawNode = board.yElements.get(nodeId)
    const rawTask = board.yAiTasks.get(taskId)

    if (!rawTask || !isAiTask(rawTask)) return

    if (!isTextNode(rawNode) || rawNode.deleted) {
      board.yAiTasks.set(taskId, {
        ...rawTask,
        status: 'error',
        errorMessage: errorMessage ?? rawTask.errorMessage,
        updatedAt: Date.now(),
      })
      return
    }

    const nextTask: AiTask = {
      ...rawTask,
      status: outcome === 'done' ? 'done' : 'error',
      ...(outcome === 'error'
        ? { errorMessage: errorMessage ?? rawTask.errorMessage ?? '未知错误' }
        : {}),
      updatedAt: Date.now(),
    }

    let content = rawNode.content
    if (outcome === 'done') {
      if (content === '🤖 生成中…') content = ''
    } else {
      content = `${content}\n\n【生成失败】${errorMessage ?? '请检查服务端 MINIMAX_API_KEY / 额度 / 网络'}\n`
    }

    board.yAiTasks.set(taskId, nextTask)

    board.yElements.set(nodeId, {
      ...rawNode,
      content,
      isStreaming: false,
      version: rawNode.version + 1,
      updatedBy: userId,
      updatedAt: Date.now(),
    })
  }, userId)
}
