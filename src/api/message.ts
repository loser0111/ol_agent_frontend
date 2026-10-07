import { currentUId, describeApiError, getJson } from './client'
import type {
  BackendMessageRole,
  MessageListItem,
  MessageListResp,
  ToolCallItem,
  ToolResponseItem
} from '@/types'

/** 消息列表默认分页参数（与后端默认值保持一致） */
export const DEFAULT_MESSAGE_PAGE_SIZE = 50

/** 消息资源路径：消息属于会话的子资源 */
export function messagesUrl(sessionId: string): string {
  return `/agent/session/${encodeURIComponent(sessionId)}/messages`
}

/** 会话消息查询参数 */
export interface MessageListQuery {
  /** 用户标识；不传则取本地 uId（currentUId）。后端填了才会校验会话归属 */
  uId?: string
  /** 页码，从 1 开始（默认 1；后端语义：第 1 页 = 最近的一页） */
  page?: number
  /** 每页条数（默认 50，后端上限 200） */
  pageSize?: number
}

/** 会话消息结果 */
export interface MessageListResult {
  sessionId: string
  messages: MessageListItem[]
  total: number
  page: number
  pageSize: number
}

/**
 * 查询某个会话的消息列表：
 * GET /agent/session/{sessionId}/messages?uId=&page=&pageSize=
 *
 * 后端按消息时间【正序】返回（老的在前），第 1 页为最近的一页；
 * 会话不存在时后端返回 code=-5003，这里会抛错（messages 为空数组）。
 *
 * 归一化：content 为空给 ''，toolCalls / toolResponses 缺失给 []，
 * 保证调用方（store / 组件）拿到的结构稳定。
 * 注意：role 可能是 tool / system，归并到前端 ChatMessage 的展示口径由 store 层决定。
 */
export async function getMessageList(
  sessionId: string,
  query: MessageListQuery = {}
): Promise<MessageListResult> {
  if (!sessionId) {
    throw new Error('获取会话消息失败：缺少 sessionId')
  }
  const result = await getJson<MessageListResp>(messagesUrl(sessionId), {
    uId: query.uId ?? currentUId(),
    page: query.page,
    pageSize: query.pageSize
  })
  if (!result.ok) {
    throw new Error(describeApiError('获取会话消息', result.error))
  }
  const data = result.data
  const raw = data.messages ?? []
  return {
    sessionId,
    messages: raw.map(toMessageListItem),
    total: Number(data.total ?? raw.length ?? 0),
    page: Number(data.page ?? query.page ?? 1),
    pageSize: Number(data.pageSize ?? query.pageSize ?? DEFAULT_MESSAGE_PAGE_SIZE)
  }
}

/** 后端角色取值（用于兜底校验，避免脏数据破坏类型） */
const KNOWN_ROLES: BackendMessageRole[] = ['user', 'assistant', 'tool', 'system']

/** 服务端消息项 → 前端消息项（字段缺省兜底） */
function toMessageListItem(item: MessageListItem): MessageListItem {
  const role = String(item?.role ?? '').toLowerCase() as BackendMessageRole
  return {
    id: item?.id ?? '',
    role: KNOWN_ROLES.includes(role) ? role : 'assistant',
    content: item?.content ?? '',
    createdAt: item?.createdAt ?? null,
    toolCalls: (item?.toolCalls ?? []).map(toToolCallItem),
    toolResponses: (item?.toolResponses ?? []).map(toToolResponseItem)
  }
}

function toToolCallItem(item: ToolCallItem): ToolCallItem {
  return {
    id: item?.id ?? '',
    type: item?.type ?? 'function',
    name: item?.name ?? 'unknown',
    arguments: item?.arguments ?? ''
  }
}

function toToolResponseItem(item: ToolResponseItem): ToolResponseItem {
  return {
    id: item?.id ?? '',
    name: item?.name ?? 'unknown',
    response: item?.response ?? ''
  }
}
