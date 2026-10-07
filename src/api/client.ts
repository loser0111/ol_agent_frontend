import type { BaseResp } from '@/types'

export interface ApiError {
  code: number
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

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

/** 通用 JSON POST，返回解析后的 ApiResult */
export async function postJson<TReq, TResp extends { baseResp?: BaseResp | null }>(
  url: string,
  req: TReq
): Promise<ApiResult<TResp>> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  })
  if (!resp.ok) {
    return { ok: false, error: { code: resp.status, message: `HTTP ${resp.status} ${resp.statusText}` } }
  }
  const body = (await resp.json()) as TResp
  return parseResp<TResp>(body)
}
