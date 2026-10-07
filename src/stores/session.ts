import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  createSession as apiCreateSession,
  deleteSession as apiDeleteSession,
  getSessionList as apiGetSessionList
} from '@/api/session'
import { clearMessages as clearStoredMessages } from './chatStorage'
import type { SessionAccessControl, SessionMeta } from '@/types'

const STORAGE_KEY = 'ol-agent:sessions'
const UID_KEY = 'ol-agent:uid'

/** 一次拉取的会话条数（后端上限 200；会话量不大，先单页拉全） */
const FETCH_PAGE_SIZE = 100

/**
 * 本地会话缓存（仅作为"上次已知的会话名"字典使用）。
 * 服务端 create 未落库 session_name，故服务端名字为空时用本地名字兜底显示。
 */
function loadSessions(): SessionMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SessionMeta[]) : []
  } catch {
    return []
  }
}

/**
 * 会话显示名规则：服务端名字 > 本地缓存名字 > 占位名。
 * 后端 create 未落库 session_name（现存数据多为 null），所以服务端名常为空，
 * 这里统一兜底，保证界面上永远有可读标题。
 */
export function resolveSessionName(meta: SessionMeta, cache: Map<string, string> = new Map()): string {
  if (meta.sessionName && meta.sessionName.trim()) {
    return meta.sessionName
  }
  const cached = cache.get(meta.sessionId)
  if (cached && cached.trim()) {
    return cached
  }
  return `会话 ${meta.sessionId.slice(0, 8)}`
}

/**
 * 会话 store。
 *
 * 列表数据来源：**后端 `GET /agent/session/list`**（fetchSessions 拉取），
 * 顺序/条数完全以服务端为准；本地 localStorage 只用于保存 uId 配置与"会话显示名"缓存。
 * localStorage 缓存的会话还会在首屏先渲染一次，避免请求返回前白屏。
 */
export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionMeta[]>(loadSessions())
  const activeSessionId = ref<string>('')
  const uId = ref<string>(localStorage.getItem(UID_KEY) ?? 'u1001')
  const modelName = ref<string>('deepseek-flash')
  const accessControl = ref<SessionAccessControl>('ALWAYS_ALLOW')

  /** 会话列表请求中 */
  const loading = ref(false)
  /** 会话列表请求失败信息（空串表示无错误） */
  const error = ref('')
  /** 是否已成功从服务端拉取过至少一次 */
  const loaded = ref(false)
  /** 服务端返回的会话总数（分页用） */
  const total = ref(0)

  const activeSession = computed<SessionMeta | null>(
    () => sessions.value.find((s) => s.sessionId === activeSessionId.value) ?? null
  )

  /** 只把「显示名」写进本地缓存，供离线首屏与名称兜底使用 */
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.value))
    } catch (err) {
      // 配额被会话消息占满时不能连会话列表一起写失败（否则新建的会话刷新后消失）
      console.warn('[session] 会话列表写入本地存储失败：', err)
    }
  }

  /** 会话显示名：服务端名字 > 本地缓存名字 > 占位名 */
  /** 收集本地已知的会话名（内存中的最新状态优先于 localStorage） */
  function collectNameCache(): Map<string, string> {
    const cache = new Map<string, string>()
    for (const item of [...loadSessions(), ...sessions.value]) {
      if (item?.sessionId && item.sessionName && item.sessionName.trim()) {
        cache.set(item.sessionId, item.sessionName)
      }
    }
    return cache
  }

  /** 选中态兜底：当前选中项不在列表中时，自动选中第一个（列表为空则清空） */
  function syncActiveSession() {
    const exists = sessions.value.some((s) => s.sessionId === activeSessionId.value)
    if (!exists) {
      activeSessionId.value = sessions.value[0]?.sessionId ?? ''
    }
  }

  /**
   * 从后端拉取会话列表（按更新时间倒序）。
   * 失败时保留当前列表（可能是本地缓存），只置 error，不清空展示。
   * @returns 是否成功
   */
  async function fetchSessions(): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      const cache = collectNameCache()
      const res = await apiGetSessionList({ uId: uId.value, page: 1, pageSize: FETCH_PAGE_SIZE })
      sessions.value = res.sessions.map((meta) => ({
        ...meta,
        sessionName: resolveSessionName(meta, cache)
      }))
      total.value = res.total
      loaded.value = true
      persist()
      syncActiveSession()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return false
    } finally {
      loading.value = false
    }
  }

  async function newSession(sessionName?: string): Promise<SessionMeta> {
    error.value = ''
    const meta = await apiCreateSession({
      uId: uId.value,
      sessionName,
      modelName: modelName.value,
      sessionAccessControl: accessControl.value
    })
    sessions.value.unshift(meta)
    total.value += 1
    persist()
    activeSessionId.value = meta.sessionId
    return meta
  }

  async function removeSession(sessionId: string): Promise<void> {
    await apiDeleteSession({ uId: uId.value, sessionId })
    sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId)
    total.value = Math.max(0, total.value - 1)
    persist()
    // ★ 同时删掉该会话的消息键：否则删掉的会话会在 localStorage 里长期残留
    clearStoredMessages(sessionId)
    syncActiveSession()
  }

  function selectSession(sessionId: string) {
    activeSessionId.value = sessionId
  }

  function setUId(value: string) {
    const changed = value !== uId.value
    uId.value = value
    try {
      localStorage.setItem(UID_KEY, value)
    } catch (err) {
      console.warn('[session] uId 写入本地存储失败：', err)
    }
    if (changed) {
      // 换了用户，之前的列表不再适用：清掉展示，由调用方/页面重新 fetchSessions
      sessions.value = []
      activeSessionId.value = ''
      total.value = 0
      loaded.value = false
    }
  }

  function setModelName(value: string) {
    modelName.value = value
  }

  function setAccessControl(value: SessionAccessControl) {
    accessControl.value = value
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    uId,
    modelName,
    accessControl,
    loading,
    error,
    loaded,
    total,
    fetchSessions,
    newSession,
    removeSession,
    selectSession,
    setUId,
    setModelName,
    setAccessControl
  }
})
