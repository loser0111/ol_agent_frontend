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

/** 会话状态（后端 SessionStatus） */
export type SessionStatus = 'READY_TO_TALK' | 'CHATTING' | 'FINISHED'

/** 会话类型（后端 SessionType） */
export type SessionType = 'COORDINATOR' | 'WORKER'

/** 消息角色：后端 MessageType 归一为小写（注意比前端 ChatMessage.role 多了 tool/system） */
export type BackendMessageRole = 'user' | 'assistant' | 'tool' | 'system'

/**
 * 前端本地会话记录。
 * 后端已提供 GET /agent/session/list（见 api/session.ts 的 getSessionList），
 * 会话列表由本地持久化 + 服务端列表合并而成；
 * sessionStatus / sessionType / updatedAt 为服务端返回的补充字段（可选，旧数据没有）。
 */
export interface SessionMeta {
  sessionId: string
  sessionName: string
  modelName: string
  accessControl: SessionAccessControl
  createdAt: number
  sessionStatus?: SessionStatus | null
  sessionType?: SessionType | null
  updatedAt?: number | null
}

/** GET /agent/session/list 的会话项 */
export interface SessionListItem {
  sessionId: string
  sessionName?: string | null
  modelName?: string | null
  accessControl?: SessionAccessControl | null
  sessionStatus?: SessionStatus | null
  sessionType?: SessionType | null
  createdAt?: number | null
  updatedAt?: number | null
}

/** GET /agent/session/list 的响应体 */
export interface SessionListResp {
  sessions?: SessionListItem[] | null
  total?: number | null
  page?: number | null
  pageSize?: number | null
  baseResp?: BaseResp
}

/** 工具调用项（assistant 消息） */
export interface ToolCallItem {
  id?: string | null
  type?: string | null
  name?: string | null
  arguments?: string | null
}

/** 工具返回项（tool 消息 / assistant 消息上的结果） */
export interface ToolResponseItem {
  id?: string | null
  name?: string | null
  response?: string | null
}

/** GET /agent/session/{sessionId}/messages 的消息项 */
export interface MessageListItem {
  id: string
  role: BackendMessageRole
  content: string
  createdAt?: number | null
  toolCalls: ToolCallItem[]
  toolResponses: ToolResponseItem[]
}

/** GET /agent/session/{sessionId}/messages 的响应体 */
export interface MessageListResp {
  messages?: MessageListItem[] | null
  total?: number | null
  page?: number | null
  pageSize?: number | null
  baseResp?: BaseResp
}

