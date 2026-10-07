import type { BaseResp } from '@/types'

/**
 * 后端 API 基地址。
 *
 * 开发期默认空串 → 走相对路径，由 Vite dev server 的 proxy 转发到后端
 * （见 vite.config.ts：'/agent' → http://localhost:8080），因此不存在跨域问题；
 * 如需直连（后端已开 CORS 或生产同域以外部署），可在 .env.local 中设置
 * VITE_API_BASE_URL=http://localhost:8080。
 */
export const API_BASE_URL: string = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** 本地保存用户标识的 key（与 stores/session.ts 保持一致） */
const UID_STORAGE_KEY = 'ol-agent:uid'

/** 本地保存鉴权 token 的 key（后端当前未启用鉴权，预留） */
const TOKEN_STORAGE_KEY = 'ol-agent:token'

export interface ApiError {
  code: number
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

/** 查询参数：会跳过 undefined / null / 空串 */
export type QueryParams = Record<string, string | number | boolean | null | undefined>

/** baseURL + path + query 统一拼接（path 已是绝对 URL 时原样返回） */
export function resolveUrl(path: string, query?: QueryParams): string {
  const base = /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
  if (!query) return base
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    search.append(key, String(value))
  }
  const qs = search.toString()
  if (!qs) return base
  return `${base}${base.includes('?') ? '&' : '?'}${qs}`
}

/** 读取本地 uId：后端无鉴权，用户身份靠 uId 传递；未设置时用默认值 */
export function currentUId(): string {
  try {
    return localStorage.getItem(UID_STORAGE_KEY) ?? 'u1001'
  } catch {
    return 'u1001'
  }
}

/** 读取本地 token；后端尚未启用鉴权，无 token 时返回 null（即不带 Authorization 头） */
export function currentToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

/** 统一请求头：JSON Content-Type + 可选 Authorization */
export function buildHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  const token = currentToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/** 统一的错误提示文案，如 `获取会话列表失败（-5003）：invalid session info` */
export function describeApiError(scene: string, error: ApiError): string {
  return `${scene}失败（${error.code}）：${error.message}`
}

/**
 * 统一解析后端 JSON 响应：
 * 成功约定 code=0；错误信息优先取 baseResp，兼容顶层 code 的返回结构。
 */
export function parseResp<T>(body: T & { baseResp?: BaseResp | null }): ApiResult<T> {
  const br = body?.baseResp
  const code = (br?.code ?? (body as T & { code?: number }).code ?? 0) as number
  if (code !== 0) {
    return {
      ok: false,
      error: { code: Number(code), message: br?.message ?? '请求失败' }
    }
  }
  return { ok: true, data: body }
}

/**
 * 统一请求出口：网络异常、HTTP 非 2xx、响应解析失败都收敛为 ApiResult 的 error，
 * 调用方只需判 result.ok，无需再包 try/catch。
 */
async function requestJson<TResp extends { baseResp?: BaseResp | null }>(
  method: 'GET' | 'POST',
  path: string,
  options: { query?: QueryParams; body?: unknown } = {}
): Promise<ApiResult<TResp>> {
  const url = resolveUrl(path, options.query)
  let resp: Response
  try {
    resp = await fetch(url, {
      method,
      headers: buildHeaders(),
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: -1, message: `网络异常：${message}` } }
  }
  if (!resp.ok) {
    return { ok: false, error: { code: resp.status, message: `HTTP ${resp.status} ${resp.statusText}` } }
  }
  try {
    const body = (await resp.json()) as TResp
    return parseResp<TResp>(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: -1, message: `响应解析失败：${message}` } }
  }
}

/** 通用 JSON POST，返回解析后的 ApiResult */
export async function postJson<TReq, TResp extends { baseResp?: BaseResp | null }>(
  url: string,
  req: TReq
): Promise<ApiResult<TResp>> {
  return requestJson<TResp>('POST', url, { body: req })
}

/** 通用 JSON GET（query 参数自动拼接、自动跳过空值），返回解析后的 ApiResult */
export async function getJson<TResp extends { baseResp?: BaseResp | null }>(
  url: string,
  query?: QueryParams
): Promise<ApiResult<TResp>> {
  return requestJson<TResp>('GET', url, { query })
}
