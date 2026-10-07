/**
 * 展示层归并：把「一轮提问」里的 agent 侧消息合并成一条。
 *
 * 背景：后端 t_message 会把 agent 为回答而循环调用工具的过程拆成多行
 * （assistant 行带 content + toolCalls，tool 行带 toolResponses，可能来回多轮），
 * 逐条渲染会导致「用户问一句 → 界面上冒出十几条消息」。
 *
 * 归并规则（纯函数，不改动入参对象）：
 *   - user / system 消息是分界线，原样保留；
 *   - 相邻的 assistant / tool 消息归为一组，合并成一条 assistant 消息：
 *     content 按时间顺序用空行拼接，toolCalls / toolResponses 依次拼接，
 *     这样 ToolCallPanel 仍能按 id / 顺序正确配对每一轮调用与结果；
 *   - 已经是单条时原样返回（幂等，可重复调用）。
 *
 * 只在「整轮已结束」的数据上调用（如历史加载），流式过程中调用会破坏
 * applyChatEvent 持有的响应式对象引用。
 */
import type { ChatMessage, MessageRole, ToolCallInfo, ToolResponseInfo } from '@/stores/chatEvent'

/** agent 侧角色：属于「模型为了回答而执行的过程」，可并入同一条卡片 */
function isAgentRole(role: MessageRole): boolean {
  return role === 'assistant' || role === 'tool'
}

function mergeGroup(group: ChatMessage[]): ChatMessage {
  const first = group[0]
  const contents: string[] = []
  const toolCalls: ToolCallInfo[] = []
  const toolResponses: ToolResponseInfo[] = []
  let status: ChatMessage['status'] = 'done'
  let error: string | undefined

  for (const msg of group) {
    if (msg.content.trim()) contents.push(msg.content)
    toolCalls.push(...msg.toolCalls)
    toolResponses.push(...msg.toolResponses)
    if (msg.status === 'streaming') {
      status = 'streaming'
    } else if (msg.status === 'error' && status !== 'streaming') {
      status = 'error'
      error = error ?? msg.error
    }
  }

  return {
    // 用首条的 id 作为卡片 key，保证同一轮刷新前后 key 稳定
    id: first.id,
    role: 'assistant',
    content: contents.join('\n\n'),
    toolCalls,
    toolResponses,
    status,
    error,
    createdAt: first.createdAt
  }
}

/**
 * 把消息列表按「一轮问答」归并：每个 user 消息后面连续的 agent 消息合成一条。
 * @returns 新数组（内部对象除合并产生的新对象外均为原引用）
 */
export function mergeAgentTurns(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  let group: ChatMessage[] = []

  const flush = () => {
    if (group.length === 0) return
    out.push(group.length === 1 ? group[0] : mergeGroup(group))
    group = []
  }

  for (const msg of messages) {
    if (isAgentRole(msg.role)) {
      group.push(msg)
    } else {
      flush()
      out.push(msg)
    }
  }
  flush()

  return out
}
