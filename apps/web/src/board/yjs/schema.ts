/** 画布持久化单元（存入 Y.Map `elements`） */

export type TextNodeElement = {
  id: string
  kind: 'node'
  nodeType: 'text'
  x: number
  y: number
  width: number
  height: number
  content: string
  deleted: boolean
  version: number
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
  isStreaming?: boolean
  aiTaskId?: string
}

export type ArrowEdgeElement = {
  id: string
  kind: 'edge'
  edgeType: 'arrow'
  sourceId: string
  targetId: string
  deleted: boolean
  version: number
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
}

export type HistoryItem = {
  id: string
  userId: string
  action:
    | 'create_node'
    | 'update_node'
    | 'delete_node'
    | 'create_edge'
    | 'delete_edge'
    | 'ai_generate'
  before: unknown
  after: unknown
  createdAt: number
  undone?: boolean
}

export type BoardElement = TextNodeElement | ArrowEdgeElement

export type AiTask = {
  id: string
  type: 'rewrite' | 'expand' | 'summarize'
  status: 'pending' | 'streaming' | 'done' | 'error'
  selectedElementIds: string[]
  targetElementIds: string[]
  partialText: string
  errorMessage?: string
  createdBy: string
  createdAt: number
  updatedAt: number
}

export function isAiTask(el: unknown): el is AiTask {
  if (!el || typeof el !== 'object') return false
  const e = el as Partial<AiTask>
  return (
    typeof e.id === 'string' &&
    (e.type === 'rewrite' || e.type === 'expand' || e.type === 'summarize') &&
    typeof e.status === 'string' &&
    typeof e.partialText === 'string'
  )
}

export function isTextNode(el: unknown): el is TextNodeElement {
  if (!el || typeof el !== 'object') return false
  const e = el as Partial<TextNodeElement>
  return e.kind === 'node' && e.nodeType === 'text' && typeof e.id === 'string'
}

export function isArrowEdge(el: unknown): el is ArrowEdgeElement {
  if (!el || typeof el !== 'object') return false
  const e = el as Partial<ArrowEdgeElement>
  return (
    e.kind === 'edge' &&
    e.edgeType === 'arrow' &&
    typeof e.id === 'string' &&
    typeof e.sourceId === 'string' &&
    typeof e.targetId === 'string'
  )
}
