/**
 * 会话消息的 localStorage 持久化（带容量保护）。
 *
 * 背景：原实现把【整个会话的全部消息】直接 JSON.stringify 写进单个 key，
 * 工具返回内容原文入库、只增不减，会话一长必然触发
 *   Failed to execute 'setItem' on 'Storage': ... exceeded the quota
 * 更糟的是该异常发生在 SSE 事件回调里，会直接打断流式对话，
 * 且之后该会话每次写入都失败（"永久写不进去"）。
 *
 * 这里做四件事：
 *  1. 落盘前裁剪：最近 `RICH_TEXT_TAIL` 条消息保留工具文本（上限
 *     `MAX_PERSISTED_TOOL_TEXT`），更老的消息只留 `OLD_TEXT_LIMIT` 字符摘要，
 *     总消息数不超过 `MAX_PERSISTED_MESSAGES` —— 只影响落盘副本，
 *     内存中的完整数据不受影响；
 *  2. 配额兜底：写入失败时先回收孤儿会话键，再按阶梯逐级收缩重试，
 *     最终兜底清空该 key，**绝不向外抛异常**，保证流式对话不被打断；
 *  3. 返回结果给调用方，由调用方决定是否提示用户。
 */
import type { ChatMessage } from './chatEvent'

/** 最近这么多条消息保留完整工具文本，更老的降级为摘要（控制单会话体积） */
export const RICH_TEXT_TAIL = 24

/** 老消息的工具文本摘要上限 */
export const OLD_TEXT_LIMIT = 120

/**
 * 工具参数 / 返回内容落盘时的最大字符数。
 * UI 展示上限是 600（见 ToolCallPanel），这里留出余量，保证展示内容不被二次截断。
 */
export const MAX_PERSISTED_TOOL_TEXT = 800

/** 单个会话最多落盘的消息条数（内存中不限，仅影响刷新后能恢复多少） */
export const MAX_PERSISTED_MESSAGES = 200

/** 配额不足时的收缩阶梯：[保留消息条数, 工具文本上限] */
const SHRINK_LADDER: ReadonlyArray<readonly [number, number]> = [
  [80, 600],
  [40, 400],
  [10, 200],
  [2, 200]
]

/** 截断标记（与 UI 的“内容过长已截断”区分开，表示完整内容已不在本地存储里） */
export const TRUNCATED_SUFFIX = '…[已截断]'

const CHAT_KEY_PREFIX = 'ol-agent:chat:'
const SESSIONS_KEY = 'ol-agent:sessions'

export interface SaveResult {
  /** 是否成功写入（false 表示已兜底清空，本地记录不可恢复） */
  ok: boolean
  /** 实际落盘的消息条数 */
  saved: number
  /** 是否发生裁剪（截断了工具文本，或丢弃了更老的消息） */
  trimmed: boolean
  /** quota = 配额不足并已降级；other = 其它写入异常 */
  reason?: 'quota' | 'other'
}

/**
 * 已经降级过的会话及其档位。
 * 命中过配额不足后再写时直接沿用该档位，避免每次保存都把各档位重试一遍。
 */
const degradedLevel = new Map<string, readonly [number, number]>()

export function chatStorageKey(sessionId: string): string {
  return `${CHAT_KEY_PREFIX}${sessionId}`
}

export function loadMessages(sessionId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatStorageKey(sessionId))
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

/** 某条消息的工具文本上限：尾部消息给 textLimit，更老的封顶 OLD_TEXT_LIMIT */
function capFor(index: number, total: number, textLimit: number): number {
  return index >= total - RICH_TEXT_TAIL ? textLimit : Math.min(textLimit, OLD_TEXT_LIMIT)
}

function clip(text: string | undefined, max: number): string {
  const value = text ?? ''
  return value.length > max ? value.slice(0, max) + TRUNCATED_SUFFIX : value
}

/**
 * 生成落盘用的 JSON 串。
 * 浅拷贝消息与工具数组后裁剪，**不修改传入对象**（内存里的完整数据要保持原样）。
 */
function serialize(list: ChatMessage[], limit: number, textLimit: number): string {
  const slice = list.length > limit ? list.slice(list.length - limit) : list
  const persistable = slice.map((m, i) => {
    const cap = capFor(i, slice.length, textLimit)
    return {
      ...m,
      toolCalls: (m.toolCalls ?? []).map((c) => ({ ...c, arguments: clip(c.arguments, cap) })),
      toolResponses: (m.toolResponses ?? []).map((r) => ({ ...r, response: clip(r.response, cap) }))
    }
  })
  return JSON.stringify(persistable)
}

/** 该档位下是否会产生裁剪（用于回填 SaveResult.trimmed） */
function needsTrim(list: ChatMessage[], limit: number, textLimit: number): boolean {
  if (list.length > limit) return true
  return list.some((m, i) => {
    const cap = capFor(i, list.length, textLimit)
    return (
      (m.toolCalls ?? []).some((c) => (c.arguments?.length ?? 0) > cap) ||
      (m.toolResponses ?? []).some((r) => (r.response?.length ?? 0) > cap)
    )
  })
}

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  )
}

function tryWrite(key: string, list: ChatMessage[], level: readonly [number, number]): void {
  localStorage.setItem(key, serialize(list, level[0], level[1]))
}

/**
 * 回收“孤儿”会话键：会话列表里已经不存在、但消息键还留在 localStorage 的记录。
 * 这些记录在 UI 里不可达（无法导航到该会话），属于纯垃圾。
 * 会话列表读不出来时直接放弃，绝不猜着删。
 * @returns 释放的键数量
 */
function reclaimOrphanSessions(currentSessionId: string): number {
  let valid: Set<string>
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return 0
    valid = new Set(
      parsed.map((s) => (s as { sessionId?: string })?.sessionId).filter((v): v is string => !!v)
    )
  } catch {
    return 0
  }

  const orphans: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(CHAT_KEY_PREFIX)) continue
      const sessionId = key.slice(CHAT_KEY_PREFIX.length)
      if (sessionId === currentSessionId || valid.has(sessionId)) continue
      orphans.push(key)
    }
  } catch {
    return 0
  }

  let removed = 0
  for (const key of orphans) {
    try {
      localStorage.removeItem(key)
      degradedLevel.delete(key.slice(CHAT_KEY_PREFIX.length))
      removed++
    } catch {
      /* ignore */
    }
  }
  return removed
}

/**
 * 保存某会话的全部消息。**不会抛异常**。
 * 正常路径下只裁剪工具文本与超量消息；只有真的写不进去（配额满）才回收 / 逐级收缩。
 */
export function saveMessages(sessionId: string, list: ChatMessage[]): SaveResult {
  const key = chatStorageKey(sessionId)
  const cached = degradedLevel.get(sessionId)
  // 该会话之前降过级就直接沿用，避免每次保存都重复试探
  const primary: readonly [number, number] = cached ?? [MAX_PERSISTED_MESSAGES, MAX_PERSISTED_TOOL_TEXT]

  const ok = (level: readonly [number, number], reason?: 'quota' | 'other'): SaveResult => ({
    ok: true,
    saved: Math.min(list.length, level[0]),
    trimmed: needsTrim(list, level[0], level[1]) || reason === 'quota',
    reason
  })

  // ① 常规档位
  try {
    tryWrite(key, list, primary)
    return ok(primary, cached ? 'quota' : undefined)
  } catch (err) {
    if (!isQuotaError(err)) {
      console.warn('[chat] 会话消息写入本地存储失败：', err)
      return { ok: false, saved: 0, trimmed: false, reason: 'other' }
    }
  }

  // ② 先回收孤儿会话键（其它会话删掉后残留的历史记录），常常一下就腾出空间
  const reclaimed = reclaimOrphanSessions(sessionId)
  if (reclaimed > 0) {
    console.warn(`[chat] 本地存储配额不足，已回收 ${reclaimed} 个无效会话记录`)
    try {
      tryWrite(key, list, primary)
      return ok(primary, 'quota')
    } catch (err) {
      if (!isQuotaError(err)) {
        console.warn('[chat] 会话消息写入本地存储失败：', err)
        return { ok: false, saved: 0, trimmed: true, reason: 'other' }
      }
    }
  }

  // ③ 还不够：逐级收缩，尽量保住最近几轮对话
  for (const level of SHRINK_LADDER) {
    try {
      tryWrite(key, list, level)
      degradedLevel.set(sessionId, level)
      console.warn(`[chat] 本地存储配额不足，会话 ${sessionId} 已精简为最近 ${level[0]} 条消息落盘`)
      return ok(level, 'quota')
    } catch (err) {
      if (!isQuotaError(err)) {
        console.warn('[chat] 会话消息写入本地存储失败：', err)
        return { ok: false, saved: 0, trimmed: true, reason: 'other' }
      }
    }
  }

  // ④ 最后兜底：释放该会话占用的空间，保证后续对话还能继续（当前页面显示不受影响）
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  degradedLevel.set(sessionId, SHRINK_LADDER[SHRINK_LADDER.length - 1])
  console.warn(`[chat] 本地存储配额不足，会话 ${sessionId} 的本地记录已被清空`)
  return { ok: false, saved: 0, trimmed: true, reason: 'quota' }
}

/** 清空某会话的本地消息（只删 key，不写入 "[]"，多释放 2 字节） */
export function clearMessages(sessionId: string): void {
  degradedLevel.delete(sessionId)
  try {
    localStorage.removeItem(chatStorageKey(sessionId))
  } catch {
    /* ignore */
  }
}
