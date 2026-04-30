import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

/** 同源开发：WS 直连后端端口；可通过 `VITE_WS_URL` 覆盖 */
export function getCollaborationWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined
  return fromEnv && fromEnv.trim() !== '' ? fromEnv : 'ws://localhost:1234'
}

export interface YBoard {
  ydoc: Y.Doc
  provider: WebsocketProvider
  yElements: Y.Map<unknown>
  yAiTasks: Y.Map<unknown>
  yHistory: Y.Array<unknown>
}

/** 与同房间其他 Tab 共用一份 Y.Doc */
export function createYBoard(roomId: string): YBoard {
  const ydoc = new Y.Doc()

  const yElements = ydoc.getMap<unknown>('elements')
  const yAiTasks = ydoc.getMap<unknown>('aiTasks')
  const yHistory = ydoc.getArray<unknown>('history')

  const provider = new WebsocketProvider(
    getCollaborationWsUrl(),
    roomId,
    ydoc,
  )

  return { ydoc, provider, yElements, yAiTasks, yHistory }
}

export function destroyYBoard(board: YBoard): void {
  board.provider.destroy()
  board.ydoc.destroy()
}
