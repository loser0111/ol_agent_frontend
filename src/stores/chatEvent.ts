/**
 * SSE 事件 → 前端消息对象的纯更新逻辑（可单测，不依赖 pinia/vue）。
 */
import type { ChatResp, ToolCallData, ToolResponseData } from '@/types'

export type MessageRole = 'user' | 'assistant'

export interface ToolCallInfo {
  id: string
  name: string
  arguments: string
}

export interface ToolResponseInfo {
  id: string
  name: string
  response: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  toolCalls: ToolCallInfo[]
  toolResponses: ToolResponseInfo[]
  status: 'streaming' | 'done' | 'error'
  error?: string
  createdAt: number
}

export function asText(data: unknown): string {
  if (data == null) return ''
  if (typeof data === 'string') return data
  if (typeof data === 'object') {
    const obj = data as { content?: unknown; text?: unknown; data?: unknown }
    const v = obj.content ?? obj.text ?? obj.data
    return v == null ? JSON.stringify(data) : String(v)
  }
  return String(data)
}

function errorCode(evt: ChatResp): number | null {
  const code = evt.baseResp?.code
  return code == null ? null : Number(code)
}

/**
 * 按一个 SSE 事件增量更新最后一条 assistant 消息。
 *
 * 注意后端当前实现（ChatApplication）：整个对话同步跑完后
 * `Flux.just(resp)` 只返回【单个】最终事件——
 *   - 成功：type=DONE，整段回答在 data 字段
 *   - 校验失败：type=null，错误在 baseResp
 * 因此必须处理 DONE 的 data 与 type=null 的错误兜底，
 * 否则会出现“后端有数据、前端不显示”。
 */
export function applyChatEvent(msg: ChatMessage, evt: ChatResp): void {
  switch (evt.type) {
    case 'TOKEN':
      msg.content += asText(evt.data)
      break

    case 'ANSWER':
      msg.content = asText(evt.data)
      break

    case 'DONE': {
      const code = errorCode(evt)
      if (code != null && code !== 0) {
        msg.status = 'error'
        msg.error = evt.baseResp?.message ?? '对话结束但返回异常'
      } else if (!msg.content) {
        // ★ 整段回答在 DONE 事件的 data 里（后端当前单事件返回）
        msg.content = asText(evt.data)
      }
      break
    }

    case 'TOOL_CALL': {
      const d = (evt.data ?? {}) as ToolCallData
      msg.toolCalls.push({
        id: evt.respId ?? `${Date.now()}-${msg.toolCalls.length}`,
        name: d.name ?? d.toolName ?? 'unknown',
        arguments: d.arguments ?? ''
      })
      break
    }

    case 'TOOL_RESPONSE': {
      const d = (evt.data ?? {}) as ToolResponseData
      const response = d.responseData ?? d.response
      msg.toolResponses.push({
        id: evt.respId ?? `${Date.now()}-${msg.toolResponses.length}`,
        name: d.name ?? d.toolName ?? 'unknown',
        response: response == null ? '' : typeof response === 'string' ? response : JSON.stringify(response)
      })
      break
    }

    case 'ERROR': {
      const d = (evt.data ?? {}) as { code?: string | number; message?: string }
      msg.status = 'error'
      msg.error = d.message ?? evt.message ?? evt.baseResp?.message ?? '对话出错'
      break
    }

    case 'STATUS':
    case 'OPTIONS':
    case 'QUESTIONNAIRE':
    case 'PERMISSION_REQUEST':
      // 交互类事件暂未展开 UI（可后续扩展为选择题/问卷/授权弹窗）
      break

    default: {
      // type 为 null 的兜底：参数校验等错误封装在 baseResp
      const code = errorCode(evt)
      if (evt.type == null && code != null && code !== 0) {
        msg.status = 'error'
        msg.error = evt.baseResp?.message ?? `请求失败（${code}）`
      }
      break
    }
  }
}
