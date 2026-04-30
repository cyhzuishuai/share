const KEY = 'collab-ai-whiteboard:userId'

export function getClientUserId(): string {
  try {
    const existing = sessionStorage.getItem(KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(KEY, id)
    return id
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}`
  }
}
