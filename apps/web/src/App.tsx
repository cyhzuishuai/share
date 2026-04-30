import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'

import { Board } from './board/Board'

function BoardPage() {
  const { roomId = 'demo' } = useParams<{ roomId: string }>()
  return <Board roomId={roomId} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/board/demo" replace />} />
        <Route path="/board/:roomId" element={<BoardPage />} />
      </Routes>
    </BrowserRouter>
  )
}
