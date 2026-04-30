import http from 'node:http'
import type { IncomingMessage } from 'node:http'
import { createRequire } from 'node:module'

import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

import { handleAiStreamPost } from './ai.js'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'

dotenv.config()

const require = createRequire(import.meta.url)
const {
  setupWSConnection,
}: {
  setupWSConnection: (ws: WebSocket, req: IncomingMessage) => void
} = require('y-websocket/bin/utils')

const app = express()

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)

app.use(express.json())

app.post('/api/ai/stream', (req, res, next) => {
  handleAiStreamPost(req, res).catch(next)
})

const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

wss.on('connection', setupWSConnection)

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

const port = Number(process.env.PORT ?? 1234)

server.listen(port, () => {
  console.log(`HTTP + Yjs websocket on http://localhost:${port}`)
})
