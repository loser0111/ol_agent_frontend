import { describeApiError, getJson, postJson, currentUId } from './client'
import type {
  CreateSessionReq,
  CreateSessionResp,
  DeleteSessionReq,
  DeleteSessionResp,
  SessionAccessControl,
  SessionListItem,
  SessionListResp,
  SessionMeta
} from '@/types'

const BASE = '/agent/session'

/** 会话列表默认分页参数（与后端默认值保持一致） */
export const DEFAULT_SESSION_PAGE_SIZE = 20

/** 创建会话；成功返回本地会话记录（前端用） */
export async function createSession(req: CreateSessionReq): Promise<SessionMeta> {
  const result = await postJson<CreateSessionReq, CreateSessionResp>(`${BASE}/create`, req)
  if (!result.ok) {
    throw new Error(describeApiError('创建会话', result.error))
  }
  if (!result.data.sessionId) {
    throw new Error('创建会话失败：响应缺少 sessionId')
  }
  return {
    sessionId: result.data.sessionId,
    sessionName: req.sessionName ?? `会话 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    modelName: req.modelName ?? 'deepseek-flash',
    accessControl: req.sessionAccessControl ?? 'ALWAYS_ALLOW',
    createdAt: Date.now()
  }
}

/** 删除会话（后端软删，is_delete=1） */
export async function deleteSession(req: DeleteSessionReq): Promise<void> {
  const result = await postJson<DeleteSessionReq, DeleteSessionResp>(`${BASE}/delete`, req)
  if (!result.ok) {
    throw new Error(describeApiError('删除会话', result.error))
  }
}

/** 会话列表查询参数 */
export interface SessionListQuery {
  /** 用户标识；不传则取本地 uId（currentUId） */
  uId?: string
  /** 页码，从 1 开始（默认 1） */
  page?: number
  /** 每页条数（默认 20，后端上限 200） */
  pageSize?: number
}

/** 会话列表结果 */
export interface SessionListResult {
  sessions: SessionMeta[]
  total: number
  page: number
  pageSize: number
}

/**
 * 查询会话列表：GET /agent/session/list?uId=&page=&pageSize=
 *
 * 后端按会话更新时间倒序返回；无数据时返回空数组（不是错误）。
 * 这里做字段级归一（枚举/时间戳类型、缺省值），但**不改写 sessionName**：
 * 后端 create 未落库 session_name（现存数据多为 null），标题兜底/本地名称合并在 store 层做，
 * 避免把"服务端为空"和"客户端起的名字"混在一起无法区分。
 */
export async function getSessionList(query: SessionListQuery = {}): Promise<SessionListResult> {
  const result = await getJson<SessionListResp>(`${BASE}/list`, {
    uId: query.uId ?? currentUId(),
    page: query.page,
    pageSize: query.pageSize
  })
  if (!result.ok) {
    throw new Error(describeApiError('获取会话列表', result.error))
  }
  const data = result.data
  const raw = data.sessions ?? []
  return {
    sessions: raw.filter((item) => !!item?.sessionId).map(toSessionMeta),
    total: Number(data.total ?? raw.length ?? 0),
    page: Number(data.page ?? query.page ?? 1),
    pageSize: Number(data.pageSize ?? query.pageSize ?? DEFAULT_SESSION_PAGE_SIZE)
  }
}

/** 服务端会话项 → 前端 SessionMeta（sessionName 原样透传，可能为空串） */
function toSessionMeta(item: SessionListItem): SessionMeta {
  return {
    sessionId: item.sessionId,
    sessionName: item.sessionName ?? '',
    modelName: item.modelName ?? 'deepseek-flash',
    accessControl: (item.accessControl ?? 'ALWAYS_ALLOW') as SessionAccessControl,
    createdAt: Number(item.createdAt ?? item.updatedAt ?? 0),
    sessionStatus: item.sessionStatus ?? null,
    sessionType: item.sessionType ?? null,
    updatedAt: item.updatedAt ?? null
  }
}
