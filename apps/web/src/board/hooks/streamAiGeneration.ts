import { appendAiStreamText, finalizeAiGeneration, seedAiGeneration } from '../yjs/aiOperations'
import type { YBoard } from '../yjs/doc'
import type { AiTask } from '../yjs/schema'

export type AiToolbarKind = AiTask['type']

/** 前端流式读 text/plain，按块追加到 Y.Doc（多 Tab 实时可见） */
export async function runAiStreaming(
  board: YBoard,
  kind: AiToolbarKind,
  texts: string[],
  position: { x: number; y: number },
  selectedElementIds: string[],
): Promise<void> {
  const { nodeId, taskId } = seedAiGeneration(board, kind, selectedElementIds, position)

  try {
    const resp = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: kind, texts }),
    })

    if (!resp.ok) {
      const raw = await resp.text().catch(() => '')
      let msg = raw
      try {
        const j = JSON.parse(raw) as { error?: string }
        if (typeof j.error === 'string') msg = j.error
      } catch {
        /* 保持原文 */
      }
      throw new Error(msg || `HTTP ${resp.status}`)
    }

    const body = resp.body
    if (!body) {
      finalizeAiGeneration(board, nodeId, taskId, 'error', '响应体为空')
      return
    }

    const reader = body.getReader()
    const decoder = new TextDecoder()

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const frag = decoder.decode(value, { stream: true })
      if (frag) appendAiStreamText(board, nodeId, taskId, frag)
    }

    finalizeAiGeneration(board, nodeId, taskId, 'done')
  } catch (e) {
    finalizeAiGeneration(board, nodeId, taskId, 'error', String((e as Error)?.message ?? e))
  }
}
