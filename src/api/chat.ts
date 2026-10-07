import type { ChatReq, ChatResp } from '@/types'

export interface ChatStreamHandlers {
  /** 每个 SSE 事件（TOKEN/ANSWER/TOOL_CALL/TOOL_RESPONSE/ERROR/DONE...） */
  onEvent?: (evt: ChatResp) => void
  /** 流正常结束（收到 DONE 或服务端关闭连接） */
  onDone?: () => void
  /** 网络层/HTTP 层错误（非 SSE 事件内错误） */
  onError?: (err: Error) => void
}

export class ChatStreamError extends Error {
  code: number | undefined
  constructor(message: string, code?: number) {
    super(message)
    this.name = 'ChatStreamError'
    this.code = code
  }
}

/**
 * POST + SSE 流式对话客户端（本项目前端的核心封装）。
 *
 * 后端 /agent/chat 是 POST + text/event-stream：
 *  - 浏览器原生 EventSource 只支持 GET，必须用 fetch + ReadableStream 手工解析
 *  - 通过 AbortController 支持“停止生成”（中断请求并取消读取）
 *  - 逐行解析 data: 帧，遇到 [DONE] 或流结束即返回
 */
export async function chatStream(
  req: ChatReq,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const resp = await fetch('/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(req),
    signal
  })

  if (!resp.ok) {
    let detail = `HTTP ${resp.status} ${resp.statusText}`
    try {
      const text = await resp.text()
      if (text) detail += ` — ${text.slice(0, 500)}`
    } catch {
      /* 忽略响应体读取失败 */
    }
    const err = new ChatStreamError(detail, resp.status)
    handlers.onError?.(err)
    throw err
  }
  if (!resp.body) {
    const err = new ChatStreamError('当前浏览器不支持流式响应（resp.body 为空）')
    handlers.onError?.(err)
    throw err
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 按行切分 SSE 帧；Spring Flux 输出形如 data:{json}\n\n
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '')
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') {
          handlers.onDone?.()
          return
        }
        try {
          const evt = JSON.parse(payload) as ChatResp
          handlers.onEvent?.(evt)
        } catch {
          // 非 JSON 帧（如心跳/注释行）忽略
        }
      }
    }
    // 服务端正常关闭流
    handlers.onDone?.()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // 用户主动中断：不算错误，由调用方决定收尾方式
      return
    }
    const wrapped = err instanceof Error ? err : new Error(String(err))
    handlers.onError?.(wrapped)
    throw wrapped
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}
