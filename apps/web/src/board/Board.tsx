import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import ReactFlow, {
  Background,
  Controls,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Connection,
  type ReactFlowInstance,
} from 'reactflow'

import { runAiStreaming, type AiToolbarKind } from './hooks/streamAiGeneration'
import TextNode from './nodes/TextNode'
import { useBoardSelectionStore } from './stores/selectionStore'
import { destroyYBoard, createYBoard, type YBoard } from './yjs/doc'
import {
  createTextNode,
  persistNodePosition,
  snapshotElements,
  softDeleteNodeWithEdges,
  persistNodeContent,
  createArrowEdge,
  softDeleteArrowEdge,
} from './yjs/operations'
import { isTextNode } from './yjs/schema'
import {
  elementsToReactFlow,
  mergeTextNodeCommits,
  type TextNodeData,
} from './yjs/elementsToFlow'

import 'reactflow/dist/style.css'
import './Board.css'

function attachSelection(
  nextNodes: Node<TextNodeData>[],
  curr: readonly Node<TextNodeData>[],
): Node<TextNodeData>[] {
  const selected = new Set(curr.filter((n) => n.selected).map((n) => n.id))
  return nextNodes.map((n) => ({
    ...n,
    selected: selected.has(n.id),
  }))
}

/** 新 AI 节点放在选中块右侧略偏下 */
function pickAiAnchor(selIds: string[], rfNodes: Node<TextNodeData>[]): { x: number; y: number } {
  const sel = rfNodes.filter((n) => selIds.includes(n.id))
  if (sel.length === 0) return { x: 160, y: 160 }
  let maxRight = -Infinity
  let sumCenterY = 0
  for (const n of sel) {
    const w = n.width ?? 220
    const h = n.height ?? 100
    maxRight = Math.max(maxRight, n.position.x + w)
    sumCenterY += n.position.y + h / 2
  }
  return { x: maxRight + 56, y: sumCenterY / sel.length - 40 }
}

/** 沿用 React Flow 已测量的宽高，避免每次 Y flush 时用 Y.Doc 默认值顶掉布局导致跳动 */
function carryForwardMeasuredSizes(curr: readonly Node<TextNodeData>[], fromY: Node<TextNodeData>[]): Node<TextNodeData>[] {
  const byId = new Map(curr.map((n) => [n.id, n]))
  return fromY.map((n) => {
    const prev = byId.get(n.id)
    if (
      prev &&
      typeof prev.width === 'number' &&
      typeof prev.height === 'number' &&
      prev.width >= 24 &&
      prev.height >= 24
    )
      return { ...n, width: prev.width, height: prev.height }
    return n
  })
}

export function Board(props: { roomId: string }) {
  const { roomId } = props

  const [board, setBoard] = useState<YBoard | null>(null)
  const [nodes, setNodes] = useState<Node<TextNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'connected' | 'disconnected' | string>('disconnected')
  const [aiBusy, setAiBusy] = useState(false)

  const selectedCount = useBoardSelectionStore((s) => s.selectedNodeIds.length)
  const selectedNodeIds = useBoardSelectionStore((s) => s.selectedNodeIds)
  const setSelectedNodeIds = useBoardSelectionStore((s) => s.setSelectedNodeIds)
  const clearSelectionUi = useBoardSelectionStore((s) => s.clearSelectionUi)

  const nodeTypes = useMemo(
    () => ({
      textNode: TextNode,
    }),
    [],
  )

  const flowInstRef = useRef<ReactFlowInstance<TextNodeData> | null>(null)
  const hasFitOnceRef = useRef(false)
  const nodesLenRef = useRef(0)
  nodesLenRef.current = nodes.length

  const triggerFitOnceIfPossible = useCallback(() => {
    const inst = flowInstRef.current
    if (!inst || nodesLenRef.current === 0 || hasFitOnceRef.current) return
    hasFitOnceRef.current = true
    requestAnimationFrame(() => {
      flowInstRef.current?.fitView({ padding: 0.28 })
    })
  }, [])

  const onRfInit = useCallback(
    (inst: ReactFlowInstance<TextNodeData>) => {
      flowInstRef.current = inst
      triggerFitOnceIfPossible()
    },
    [triggerFitOnceIfPossible],
  )

  const onRequestSelect = useCallback(
    (elementId: string, opts: { additive: boolean }) => {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      setNodes((prev) => {
        const next = prev.map((n) => {
          if (!opts.additive)
            return n.id === elementId ? { ...n, selected: true } : { ...n, selected: false }
          return n.id === elementId ? { ...n, selected: true } : n
        })
        queueMicrotask(() =>
          setSelectedNodeIds(next.filter((n) => n.selected).map((n) => n.id)),
        )
        return next
      })
    },
    [setSelectedNodeIds],
  )

  const onRequestSelectRef = useRef(onRequestSelect)
  onRequestSelectRef.current = onRequestSelect

  const flushFromY = useCallback((b: YBoard) => {
    const derived = elementsToReactFlow(snapshotElements(b.yElements))
    setNodes((curr) => {
      const sized = carryForwardMeasuredSizes(curr, derived.nodes)
      const withCb = mergeTextNodeCommits(
        sized,
        (id, c) => persistNodeContent(b, id, c),
        (id, opts) => onRequestSelectRef.current(id, opts),
      )
      return attachSelection(withCb, curr)
    })
    setEdges(derived.edges)
  }, [])

  useEffect(() => {
    if (nodes.length === 0) hasFitOnceRef.current = false
  }, [nodes.length])

  useEffect(() => {
    triggerFitOnceIfPossible()
  }, [nodes.length, triggerFitOnceIfPossible])

  useEffect(() => {
    hasFitOnceRef.current = false
    flowInstRef.current = null

    const b = createYBoard(roomId)
    setBoard(b)
    setSyncStatus('connecting')

    const onStatus = (ev: { status: string }) => setSyncStatus(ev.status)
    b.provider.on('status', onStatus)

    const flush = () => flushFromY(b)
    /** 整块文档更新都会触发（含远程同步）；observeDeep 对 Map 中非嵌套 YType 不可靠 */
    const onDocUpdate = () => flush()
    b.ydoc.on('update', onDocUpdate)
    b.provider.on('sync', flush)
    flush()

    return () => {
      b.provider.off('status', onStatus)
      b.ydoc.off('update', onDocUpdate)
      b.provider.off('sync', flush)
      destroyYBoard(b)
      clearSelectionUi()
      flowInstRef.current = null
      setBoard(null)
      setNodes([])
      setEdges([])
    }
  }, [roomId, flushFromY, clearSelectionUi])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds))
      if (!board) return
      for (const c of changes) {
        if (c.type !== 'position' || c.dragging !== false) continue
        const pos = c.position ?? c.positionAbsolute
        if (pos) persistNodePosition(board, c.id, pos)
      }
    },
    [board],
  )

  /** 受控模式下部分场景只触发 dragStop 事件，带完整 position；仅靠 onNodesChange 可能写不进 Y */
  const onNodeDragStop = useCallback(
    (_e: ReactMouseEvent, node: Node<TextNodeData>) => {
      if (!board) return
      persistNodePosition(board, node.id, node.position)
    },
    [board],
  )

  const onSelectionDragStop = useCallback(
    (_e: ReactMouseEvent, dragged: Node<TextNodeData>[]) => {
      if (!board) return
      for (const node of dragged) persistNodePosition(board, node.id, node.position)
    },
    [board],
  )

  const onEdgesChange = useCallback((chs: EdgeChange[]) => {
    setEdges((e) => applyEdgeChanges(chs, e))
  }, [])

  const handleAddNode = useCallback(() => {
    if (!board) return
    const jitter = Math.random() * 80
    createTextNode(board, '新文本块', {
      x: 120 + jitter,
      y: 140 + jitter * 0.6,
    })
  }, [board])

  const onConnect = useCallback(
    (c: Connection) => {
      if (!board || !c.source || !c.target) return
      createArrowEdge(board, c.source, c.target)
    },
    [board],
  )

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (!board) return
      for (const n of deleted) softDeleteNodeWithEdges(board, n.id)
    },
    [board],
  )

  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      if (!board) return
      for (const e of removed) softDeleteArrowEdge(board, e.id)
    },
    [board],
  )

  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodeIds(sel.map((n) => n.id))
  }, [setSelectedNodeIds])

  const handleAi = useCallback(
    async (kind: AiToolbarKind) => {
      if (!board || selectedNodeIds.length === 0 || aiBusy) return
      const texts: string[] = []
      for (const id of selectedNodeIds) {
        const raw = board.yElements.get(id)
        if (isTextNode(raw) && !raw.deleted && !raw.isStreaming) texts.push(raw.content)
      }
      if (texts.length === 0) return
      const pos = pickAiAnchor(selectedNodeIds, nodes)
      setAiBusy(true)
      try {
        await runAiStreaming(board, kind, texts, pos, [...selectedNodeIds])
      } finally {
        setAiBusy(false)
      }
    },
    [board, selectedNodeIds, aiBusy, nodes],
  )

  const aiDisabled = !board || selectedNodeIds.length === 0 || aiBusy

  return (
    <div className="board-root">
      <header className="board-toolbar">
        <div className="board-toolbar-left">
          <span className="toolbar-label">房间</span>
          <code className="toolbar-room mono">{roomId}</code>
          <span className="toolbar-hint">
            连线：右侧 → 左侧 · 空白拖选 · <kbd>Space</kbd> 平移 · AI 先框选 · 双击文本块四周留白/边线区域选中（不切进正文编辑，有高亮类似连线）→{' '}
            <kbd>Backspace</kbd> / <kbd>Delete</kbd> 移除 · <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+双击可多选并入
          </span>
        </div>
        <div className="board-toolbar-actions">
          <span className="toolbar-selection">已选节点 {selectedCount}</span>
          <div className="ai-btn-group" role="group" aria-label="AI">
            <button
              className="btn-ghost"
              disabled={aiDisabled}
              type="button"
              onClick={() => void handleAi('rewrite')}
            >
              改写
            </button>
            <button
              className="btn-ghost"
              disabled={aiDisabled}
              type="button"
              onClick={() => void handleAi('expand')}
            >
              扩展
            </button>
            <button
              className="btn-ghost"
              disabled={aiDisabled}
              type="button"
              onClick={() => void handleAi('summarize')}
            >
              总结
            </button>
          </div>
          <button className="btn-primary" disabled={!board} type="button" onClick={handleAddNode}>
            ＋ 文本块
          </button>
          <span className={`board-sync-badge board-sync-${syncStatus}`}>{syncStatus}</span>
        </div>
      </header>
      <ReactFlow
        className="board-flow"
        nodeTypes={nodeTypes}
        nodes={nodes}
        edges={edges}
        fitView={false}
        onInit={onRfInit}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStop={onSelectionDragStop}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        deleteKeyCode={['Backspace', 'Delete']}
        onSelectionChange={onSelectionChange}
        selectionOnDrag
        zoomOnDoubleClick={false}
        nodesConnectable
      >
        <Background gap={22} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
