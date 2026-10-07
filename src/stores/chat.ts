import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { chatStream } from '@/api/chat'
import { getMessageList } from '@/api/message'
import { useSessionStore } from './session'
import { applyChatEvent, toChatMessage } from './chatEvent'
import { mergeAgentTurns } from '@/utils/messageTurns'
import type { ChatMessage } from './chatEvent'
import { clearMessages as clearStored, loadMessages, saveMessages } from './chatStorage'

export type { ChatMessage, ToolCallInfo, ToolResponseInfo, MessageRole } from './chatEvent'

/** 流式过程中的落盘去抖间隔：避免每个 TOKEN 事件都做一次全量 JSON.stringify */
const PERSIST_DEBOUNCE_MS = 300

/** 历史消息一次拉取的条数（后端上限 200） */
const HISTORY_PAGE_SIZE = 200

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 聊天 store：
 *  - 消息按 sessionId 分组；**历史以服务端为准**（loadHistory 拉取 GET /agent/session/{id}/messages）
 *  - 服务端返回的 tool / system 消息一并按序渲染，保证内容、顺序、角色与后端一致
 *  - 本地 localStorage 仅作「服务端不可用时的降级快照」
 *  - sendMessage 走 chatStream，事件经 applyChatEvent 增量写入最后一条 assistant 消息
 *  - stop 通过 AbortController 中断生成
 */
export const useChatStore = defineStore('chat', () => {
  const sessionStore = useSessionStore()
  const messagesBySession = ref<Record<string, ChatMessage[]>>({})
  const isStreaming = ref(false)

  /** 正在加载历史的会话ID（空串表示没有进行中的加载） */
  const loadingSessionId = ref('')
  /** 各会话的历史加载错误信息 */
  const historyErrors = ref<Record<string, string>>({})
  /** 已成功从服务端加载过历史的会话 */
  const historyLoaded = ref<Record<string, boolean>>({})

  let abortController: AbortController | null = null
  let streamingSessionId = ''

  let persistTimer: number | null = null
  let pendingSessionId = ''
  /** 本地存储降级提示只弹一次，避免刷屏 */
  let quotaWarned = false

  const messages = computed<ChatMessage[]>(() => {
    const id = sessionStore.activeSessionId
    if (!id) return []
    if (!messagesBySession.value[id]) {
      messagesBySession.value[id] = loadMessages(id)
    }
    return messagesBySession.value[id]
  })

  /** 当前会话是否正在拉取历史（组件据此显示骨架屏） */
  const historyLoading = computed(
    () => loadingSessionId.value !== '' && loadingSessionId.value === sessionStore.activeSessionId
  )

  /** 当前会话的历史加载错误（空串表示无错误） */
  const historyError = computed(() => historyErrors.value[sessionStore.activeSessionId] ?? '')

  /** 立即落盘（关键节点用：发送、结束、出错、清空、历史加载完成） */
  function persistNow(sessionId: string) {
    const list = messagesBySession.value[sessionId]
    if (!list) return
    const result = saveMessages(sessionId, list)
    if (result.reason === 'quota' && !quotaWarned) {
      quotaWarned = true
      ElMessage.warning('浏览器本地存储空间不足，历史记录已自动精简（当前页面显示不受影响）')
    }
  }

  /** 流式过程中的落盘（去抖）：合并高频事件，减少序列化开销 */
  function schedulePersist(sessionId: string) {
    pendingSessionId = sessionId
    if (persistTimer != null) return
    persistTimer = window.setTimeout(() => {
      persistTimer = null
      flushPersist()
    }, PERSIST_DEBOUNCE_MS)
  }

  /** 把挂起的落盘立刻写掉（流结束时必须调用，避免最后一段事件丢失） */
  function flushPersist() {
    if (persistTimer != null) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    const id = pendingSessionId
    pendingSessionId = ''
    if (id) persistNow(id)
  }

  function getOrInit(sessionId: string): ChatMessage[] {
    if (!messagesBySession.value[sessionId]) {
      messagesBySession.value[sessionId] = loadMessages(sessionId)
    }
    return messagesBySession.value[sessionId]
  }

  /**
   * 拉取某会话的历史消息并渲染（服务端为准）。
   *
   * - 成功：整段替换该会话消息，并写一份本地快照（供服务端不可用时降级展示）
   * - 失败：记录错误供 UI 展示重试；若该会话尚无内容，用本地快照兜底
   * - 该会话正在流式生成时跳过，避免服务端快照覆盖内存中的实时内容
   * @param options.force 为 true 时忽略「已加载过」标记，强制重新拉取
   * @returns 是否成功
   */
  async function loadHistory(sessionId: string, options: { force?: boolean } = {}): Promise<boolean> {
    if (!sessionId) return false
    if (!options.force && historyLoaded.value[sessionId]) return true
    if (isStreaming.value && streamingSessionId === sessionId) return false

    loadingSessionId.value = sessionId
    delete historyErrors.value[sessionId]
    try {
      const res = await getMessageList(sessionId, {
        uId: sessionStore.uId,
        page: 1,
        pageSize: HISTORY_PAGE_SIZE
      })
      // 归并：一轮提问里的 assistant / tool 多行 → 一条 agent 消息（详见 utils/messageTurns）
      messagesBySession.value[sessionId] = mergeAgentTurns(res.messages.map(toChatMessage))
      historyLoaded.value[sessionId] = true
      persistNow(sessionId)
      return true
    } catch (err) {
      historyErrors.value[sessionId] = err instanceof Error ? err.message : String(err)
      // 降级：本地快照兜底（可能为空），不让界面一片空白
      if (!messagesBySession.value[sessionId]?.length) {
        messagesBySession.value[sessionId] = loadMessages(sessionId)
      }
      return false
    } finally {
      if (loadingSessionId.value === sessionId) {
        loadingSessionId.value = ''
      }
    }
  }

  /** 重新拉取当前会话历史（失败后的「重试」） */
  async function retryHistory(): Promise<boolean> {
    const sessionId = sessionStore.activeSessionId
    if (!sessionId) return false
    return loadHistory(sessionId, { force: true })
  }

  /** 丢弃某会话的内存快照（会话被删除时调用；不影响 localStorage 由外层清理） */
  function dropSession(sessionId: string) {
    if (!sessionId) return
    if (sessionId !== streamingSessionId) {
      delete messagesBySession.value[sessionId]
    }
    delete historyLoaded.value[sessionId]
    delete historyErrors.value[sessionId]
    if (loadingSessionId.value === sessionId) {
      loadingSessionId.value = ''
    }
  }

  // 切换会话：把上一会话挂起的落盘写掉并清出内存，确保新会话不会看到上一会话的消息
  watch(
    () => sessionStore.activeSessionId,
    (next, prev) => {
      if (prev && prev !== next && prev !== streamingSessionId) {
        flushPersist()
        delete messagesBySession.value[prev]
        delete historyLoaded.value[prev]
        delete historyErrors.value[prev]
      }
      if (!next) {
        loadingSessionId.value = ''
      }
    }
  )

  /** 发送一条用户消息并开始流式对话 */
  async function sendMessage(content: string): Promise<void> {
    const sessionId = sessionStore.activeSessionId
    if (!sessionId) throw new Error('请先创建或选择一个会话')
    if (isStreaming.value) throw new Error('当前已有对话在生成中')
    if (historyLoading.value) throw new Error('正在加载历史消息，请稍候')

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
    persistNow(sessionId)

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
            schedulePersist(sessionId)
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
        persistNow(sessionId)
      }
    } finally {
      // 无论正常结束 / 出错 / 中断，都把挂起的落盘写掉
      flushPersist()
      if (streamingSessionId === sessionId) {
        isStreaming.value = false
        streamingSessionId = ''
        abortController = null
      }
      // 本轮消息后端已落库（ReadyToChat/ChatWithModel 会写 t_message），
      // 下次重新进入该会话时重新拉取，展示与服务端一致（含 tool/system 行）
      delete historyLoaded.value[sessionId]
    }
  }

  function finish(sessionId: string, msg: ChatMessage) {
    if (msg.status !== 'error') {
      msg.status = 'done'
    }
    persistNow(sessionId)
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
    clearStored(target)
    delete historyLoaded.value[target]
  }

  return {
    messages,
    isStreaming,
    historyLoading,
    historyError,
    loadHistory,
    retryHistory,
    dropSession,
    sendMessage,
    stop,
    clearMessages
  }
})
