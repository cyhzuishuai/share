import type { Request, Response as ExpressResponse } from 'express'

/** 与 docs 对齐：OpenAI-compatible Chat Completions + stream:true */
export type AiStreamKind = 'rewrite' | 'expand' | 'summarize'

type ChatDelta = {
  choices?: Array<{
    delta?: { content?: string | null }
    finish_reason?: string | null
  }>
}

function normalizeBase(raw: string | undefined): string {
  const t = raw?.trim() || 'https://api.minimax.io/v1'
  return t.endsWith('/') ? t.slice(0, -1) : t
}

function buildUserPrompt(kind: AiStreamKind, texts: string[]): string {
  const numbered = texts
    .map((t, i) => `【片段${i + 1}】\n${t.trim()}`)
    .join('\n\n')

  if (kind === 'rewrite') {
    return `请将下列内容改写为更简洁、更正式的中文表述。只输出改写后的正文，不要解释、不要前缀。\n\n${numbered}`
  }
  if (kind === 'expand') {
    return `基于下列内容生成 3 条延伸想法。使用中文编号「1. 2. 3.」各占一行；每条不要超过约 35 字。不要其他说明。\n\n${numbered}`
  }
  return `将下列多条内容概括为一句完整的中文概述。只输出这一句话。\n\n${numbered}`
}

function extractDelta(json: ChatDelta): string {
  const c = json.choices?.[0]?.delta?.content
  return typeof c === 'string' ? c : ''
}

async function consumeUpstreamSse(upstreamBody: ReadableStream<Uint8Array>, res: ExpressResponse): Promise<void> {
  const reader = upstreamBody.getReader()
  const dec = new TextDecoder()
  let carry = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      carry += dec.decode(value, { stream: true })
      let idx: number

      while ((idx = carry.indexOf('\n\n')) !== -1) {
        const block = carry.slice(0, idx).trimEnd()
        carry = carry.slice(idx + 2)

        const lines = block.split('\n')
        for (const lineRaw of lines) {
          const line = lineRaw.trim()
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as ChatDelta
            const delta = extractDelta(parsed)
            if (delta) res.write(delta)
          } catch {
            // 跳过无法解析的行
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function handleAiStreamPost(req: Request, res: ExpressResponse): Promise<void> {
  const key = process.env.MINIMAX_API_KEY?.trim()
  const model = process.env.MINIMAX_MODEL?.trim() || 'MiniMax-M2.5'
  const base = normalizeBase(process.env.MINIMAX_BASE_URL)

  if (!key) {
    res.status(503)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'MINIMAX_API_KEY 未配置（见 apps/server/.env）' }))
    return
  }

  const b = req.body as { type?: unknown; texts?: unknown }
  const kind = b.type as AiStreamKind | undefined
  const texts = b.texts

  const validKind = kind === 'rewrite' || kind === 'expand' || kind === 'summarize'
  if (
    !validKind ||
    !Array.isArray(texts) ||
    texts.length === 0 ||
    !texts.every((t) => typeof t === 'string' && String(t).trim().length > 0)
  ) {
    res.status(400)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: '需要 JSON：{ type: "rewrite"|"expand"|"summarize", texts: string[] }（非空）',
      }),
    )
    return
  }

  const userPrompt = buildUserPrompt(kind, texts as string[])

  const url = `${base}/chat/completions`
  let upstreamResp: globalThis.Response
  try {
    upstreamResp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_completion_tokens: 1024,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content:
              '你是白板助手，用语简洁克制，严格遵守用户输出的格式约束（不要求解释时不要说「好的」「以下是」之类套话）。',
          },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
  } catch (e) {
    res.status(502)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: `MiniMax 请求失败：${String((e as Error)?.message ?? e)}` }))
    return
  }

  if (!upstreamResp.ok || !upstreamResp.body) {
    const t = await upstreamResp.text().catch(() => '')
    const code =
      upstreamResp.status >= 400 && upstreamResp.status < 600 ? upstreamResp.status : 502
    res.status(code)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: 'MiniMax 返回错误',
        status: upstreamResp.status,
        detail: t.slice(0, 800),
      }),
    )
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Cache-Control', 'no-cache')

  await consumeUpstreamSse(upstreamResp.body, res)
  res.end()
}
