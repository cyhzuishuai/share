import { create } from 'zustand'

/** 仅存本地 UI（不入 Y.Doc），供阶段④ Toolbar / AI 读取 */
type BoardUiState = {
  selectedNodeIds: string[]
  setSelectedNodeIds: (ids: string[]) => void
  clearSelectionUi: () => void
}

export const useBoardSelectionStore = create<BoardUiState>((set) => ({
  selectedNodeIds: [],
  setSelectedNodeIds: (selectedNodeIds) => set({ selectedNodeIds }),
  clearSelectionUi: () => set({ selectedNodeIds: [] }),
}))
