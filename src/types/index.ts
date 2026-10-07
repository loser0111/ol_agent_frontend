/**
 * 与后端对齐的类型定义
 * 对应后端包：com.wyq.agent.online_agent.domain.model.dto / enums
 */

/** 会话访问控制（SessionAccessControl） */
export type SessionAccessControl = 'ALWAYS_ASK' | 'ALWAYS_ALLOW' | 'ASK_AS_NEEDED'

/** 请求类型（RequestType） */
export type RequestType = 'CHAT' | 'CHOICE' | 'PERMISSION' | 'QUESTIONNAIRE'

/** SSE 响应类型（RespType） */
export type RespType =
  | 'TOKEN'
  | 'ANSWER'
  | 'DONE'
  | 'TOOL_CALL'
  | 'TOOL_RESPONSE'
  | 'STATUS'
  | 'OPTIONS'
  | 'QUESTIONNAIRE'
  | 'PERMISSION_REQUEST'
  | 'ERROR'

/** 统一响应码（BaseResp） */
export interface BaseResp {
  code: number | null
  message: string | null
}

export interface CreateSessionReq {
  uId?: string
  sessionName?: string
  modelName?: string
  sessionAccessControl?: SessionAccessControl
  base?: Record<string, unknown>
}

export interface CreateSessionResp {
  sessionId?: string
  baseResp?: BaseResp
}

export interface DeleteSessionReq {
  uId?: string
  sessionId?: string
  base?: Record<string, unknown>
}

export interface DeleteSessionResp {
  baseResp?: BaseResp
}

export interface ChatReq {
  uId?: string
  sessionId?: string
  subSessionId?: string
  type: RequestType
  content?: string
  choiceId?: string
  optionId?: string
  grantId?: string
  granted?: boolean
  questionnaireId?: string
  answers?: unknown[]
  modelName?: string
  sessionAccessControl?: SessionAccessControl
  base?: Record<string, unknown>
}

/** 后端 /agent/chat 的 SSE 事件体（ChatResp），type 决定 data 的解析方式 */
export interface ChatResp {
  respId: string | null
  chatId: string | null
  subChatId: string | null
  type: RespType | null
  timestamp: number
  data: unknown
  message: string | null
  baseResp: BaseResp | null
}

/** TOOL_CALL 的 data（兼容 name / toolName 两种字段命名） */
export interface ToolCallData {
  name?: string
  toolName?: string
  arguments?: string
}

/** TOOL_RESPONSE 的 data */
export interface ToolResponseData {
  name?: string
  toolName?: string
  responseData?: unknown
  response?: unknown
}

/** ERROR 的 data */
export interface ErrorData {
  code?: string | number
  message?: string
}

/**
 * 前端本地会话记录。
 * 后端目前只提供 create/delete 接口（无 list），会话列表由前端本地维护，
 * 后端补 list 接口后可在 session store 中接入 fetchSessions。
 */
export interface SessionMeta {
  sessionId: string
  sessionName: string
  modelName: string
  accessControl: SessionAccessControl
  createdAt: number
}
