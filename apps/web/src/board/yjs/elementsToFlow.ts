import { MarkerType } from 'reactflow'
import type { Edge, Node } from 'reactflow'

import { isArrowEdge, isTextNode } from './schema'

export type TextNodeData = {
  elementId: string
  content: string
  isStreaming?: boolean
  onCommitContent: (id: string, next: string) => void
  /** 双击框体边缘时选中文本节点（不聚焦正文） */
  onRequestSelect: (elementId: string, opts: { additive: boolean }) => void
}

/** 单一来源：`Y.Map(elements)` → React Flow props */
export function elementsToReactFlow(snapshot: Map<string, unknown>): {
  nodes: Node<TextNodeData>[]
  edges: Edge[]
} {
  const nodes: Node<TextNodeData>[] = []
  const edges: Edge[] = []

  for (const el of snapshot.values()) {
    if (!isTextNode(el) || el.deleted) continue
    const x = typeof el.x === 'number' ? el.x : Number(el.x)
    const y = typeof el.y === 'number' ? el.y : Number(el.y)
    nodes.push({
      id: el.id,
      type: 'textNode',
      position: {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
      },
      width: el.width,
      height: el.height,
      draggable: true,
      selectable: true,
      deletable: true,
      data: {
        elementId: el.id,
        content: el.content,
        isStreaming: Boolean(el.isStreaming),
        /** Board 挂载时填入 */
        onCommitContent: () => {},
        onRequestSelect: () => {},
      },
    })
  }

  for (const el of snapshot.values()) {
    if (!isArrowEdge(el) || el.deleted) continue
    edges.push({
      id: el.id,
      source: el.sourceId,
      target: el.targetId,
      type: 'smoothstep',
      deletable: true,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    })
  }

  return { nodes, edges }
}

/** 在每帧挂载 commit / 选中回调，避免把函数塞进 Yjs */
export function mergeTextNodeCommits(
  nodes: Node<TextNodeData>[],
  onCommitContent: (id: string, next: string) => void,
  onRequestSelect: (elementId: string, opts: { additive: boolean }) => void,
): Node<TextNodeData>[] {
  return nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      onCommitContent,
      onRequestSelect,
    },
  }))
}
