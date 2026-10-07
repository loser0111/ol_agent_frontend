import { postJson } from './client'
import type {
  CreateSessionReq,
  CreateSessionResp,
  DeleteSessionReq,
  DeleteSessionResp,
  SessionMeta
} from '@/types'

const BASE = '/agent/session'

/** 创建会话；成功返回本地会话记录（前端用） */
export async function createSession(req: CreateSessionReq): Promise<SessionMeta> {
  const result = await postJson<CreateSessionReq, CreateSessionResp>(`${BASE}/create`, req)
  if (!result.ok) {
    throw new Error(`创建会话失败（${result.error.code}）：${result.error.message}`)
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
    throw new Error(`删除会话失败（${result.error.code}）：${result.error.message}`)
  }
}
