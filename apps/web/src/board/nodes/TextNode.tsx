import { memo, useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import type { TextNodeData } from '../yjs/elementsToFlow'

import './TextNode.css'

function TextNodeComponent({ id, data, selected }: NodeProps<TextNodeData>) {
  const [draft, setDraft] = useState(data.content)

  useEffect(() => {
    setDraft(data.content)
  }, [data.content])

  /** 双击「框体边缘 / 留白」选中节点（不占焦正文）；Cmd/Ctrl+双击为多选并入 */
  const onShellDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('.text-node-input')) return
      e.preventDefault()
      e.stopPropagation()
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      data.onRequestSelect?.(data.elementId, {
        additive: e.metaKey || e.ctrlKey,
      })
    },
    [data.elementId, data.onRequestSelect],
  )

  return (
    <div
      role="presentation"
      className={`text-node-shell${selected ? ' is-node-selected' : ''}${data.isStreaming ? ' is-streaming' : ''}`}
      onDoubleClick={onShellDoubleClick}
    >
      <Handle className="text-node-handle" type="target" position={Position.Left} />
      <div className="text-node-inner">
        <textarea
          className="text-node-input"
          readOnly={Boolean(data.isStreaming)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (!data.isStreaming) data.onCommitContent(id, draft)
          }}
          rows={Math.min(6, Math.max(2, Math.ceil(draft.length / 36) || 2))}
          spellCheck={false}
        />
      </div>
      <Handle className="text-node-handle" type="source" position={Position.Right} />
    </div>
  )
}

export default memo(TextNodeComponent)
