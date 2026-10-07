import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { chatStream } from '@/api/chat'
import { useSessionStore } from './session'
import { applyChatEvent } from './chatEvent'
import type { ChatMessage } from './chatEvent'

export type { ChatMessage, ToolCallInfo, ToolResponseInfo, MessageRole } from './chatEvent'

function loadMessages(sessionId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatKey(sessionId))
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

function chatKey(sessionId: string): string {
  return `ol-agent:chat:${sessionId}`
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 聊天 store：
 *  - 消息按 sessionId 分组，本地持久化（后端暂无按会话查消息的接口）
 *  - sendMessage 走 chatStream，事件经 applyChatEvent 增量写入最后一条 assistant 消息
 *  - stop 通过 AbortController 中断生成
 */
export const useChatStore = defineStore('chat', () => {
  const sessionStore = useSessionStore()
  const messagesBySession = ref<Record<string, ChatMessage[]>>({})
  const isStreaming = ref(false)

  let abortController: AbortController | null = null
  let streamingSessionId = ''

  const messages = computed<ChatMessage[]>(() => {
    const id = sessionStore.activeSessionId
    if (!id) return []
    if (!messagesBySession.value[id]) {
      messagesBySession.value[id] = loadMessages(id)
    }
    return messagesBySession.value[id]
  })

  function persist(sessionId: string) {
    const list = messagesBySession.value[sessionId]
    if (list) {
      localStorage.setItem(chatKey(sessionId), JSON.stringify(list))
    }
  }

  function getOrInit(sessionId: string): ChatMessage[] {
    if (!messagesBySession.value[sessionId]) {
      messagesBySession.value[sessionId] = loadMessages(sessionId)
    }
    return messagesBySession.value[sessionId]
  }

  /** 发送一条用户消息并开始流式对话 */
  async function sendMessage(content: string): Promise<void> {
    const sessionId = sessionStore.activeSessionId
    if (!sessionId) throw new Error('请先创建或选择一个会话')
    if (isStreaming.value) throw new Error('当前已有对话在生成中')

    const trimmed = content.trim()
    if (!trimmed) return

    const list = getOrInit(sessionId)
    // ★ 必须用 reactive() 创建：push 进响应式数组后，流式回调 mutate 的引用
    //   要与数组里存的是同一个代理，否则组件收不到变更通知（切会话才显示）。
    const userMsg = reactive<ChatMessage>({
      id: uid(),
      role: 'user',
      content: trimmed,
      toolCalls: [],
      toolResponses: [],
      status: 'done',
      createdAt: Date.now()
    })
    const assistantMsg = reactive<ChatMessage>({
      id: uid(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      toolResponses: [],
      status: 'streaming',
      createdAt: Date.now()
    })
    list.push(userMsg, assistantMsg)
    persist(sessionId)

    isStreaming.value = true
    streamingSessionId = sessionId
    abortController = new AbortController()

    try {
      await chatStream(
        {
          uId: sessionStore.uId,
          sessionId,
          type: 'CHAT',
          content: trimmed,
          modelName: sessionStore.modelName,
          sessionAccessControl: sessionStore.accessControl
        },
        {
          onEvent: (evt) => {
            applyChatEvent(assistantMsg, evt)
            persist(sessionId)
          },
          onDone: () => finish(sessionId, assistantMsg)
        },
        abortController.signal
      )
    } catch (err) {
      // 主动中断（stop）不算错误；其余网络错误标记到消息上
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        assistantMsg.status = 'error'
        assistantMsg.error = err instanceof Error ? err.message : String(err)
        persist(sessionId)
      }
    } finally {
      if (streamingSessionId === sessionId) {
        isStreaming.value = false
        streamingSessionId = ''
        abortController = null
      }
    }
  }

  function finish(sessionId: string, msg: ChatMessage) {
    if (msg.status !== 'error') {
      msg.status = 'done'
    }
    persist(sessionId)
  }

  /** 中断当前生成（AbortController） */
  function stop() {
    abortController?.abort()
  }

  /** 清空某会话的全部本地消息 */
  function clearMessages(sessionId?: string) {
    const target = sessionId ?? sessionStore.activeSessionId
    if (!target) return
    messagesBySession.value[target] = []
    persist(target)
  }

  return {
    messages,
    isStreaming,
    sendMessage,
    stop,
    clearMessages
  }
})
