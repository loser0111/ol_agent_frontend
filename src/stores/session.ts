import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { createSession as apiCreateSession, deleteSession as apiDeleteSession } from '@/api/session'
import { clearMessages as clearStoredMessages } from './chatStorage'
import type { SessionAccessControl, SessionMeta } from '@/types'

const STORAGE_KEY = 'ol-agent:sessions'
const UID_KEY = 'ol-agent:uid'

function loadSessions(): SessionMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SessionMeta[]) : []
  } catch {
    return []
  }
}

/**
 * 会话 store。
 * 后端目前只有 create/delete 接口（无 list），会话列表由前端本地持久化维护；
 * 后端补 list 接口后，可在 fetchSessions 中接入。
 */
export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionMeta[]>(loadSessions())
  const activeSessionId = ref<string>('')
  const uId = ref<string>(localStorage.getItem(UID_KEY) ?? 'u1001')
  const modelName = ref<string>('deepseek-flash')
  const accessControl = ref<SessionAccessControl>('ALWAYS_ALLOW')

  const activeSession = computed<SessionMeta | null>(
    () => sessions.value.find((s) => s.sessionId === activeSessionId.value) ?? null
  )

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.value))
    } catch (err) {
      // 配额被会话消息占满时不能连会话列表一起写失败（否则新建的会话刷新后消失）
      console.warn('[session] 会话列表写入本地存储失败：', err)
    }
  }

  async function newSession(sessionName?: string): Promise<SessionMeta> {
    const meta = await apiCreateSession({
      uId: uId.value,
      sessionName,
      modelName: modelName.value,
      sessionAccessControl: accessControl.value
    })
    sessions.value.unshift(meta)
    persist()
    activeSessionId.value = meta.sessionId
    return meta
  }

  async function removeSession(sessionId: string): Promise<void> {
    await apiDeleteSession({ uId: uId.value, sessionId })
    sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId)
    persist()
    // ★ 同时删掉该会话的消息键：否则删掉的会话会在 localStorage 里长期残留
    clearStoredMessages(sessionId)
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessions.value[0]?.sessionId ?? ''
    }
  }

  function selectSession(sessionId: string) {
    activeSessionId.value = sessionId
  }

  function setUId(value: string) {
    uId.value = value
    try {
      localStorage.setItem(UID_KEY, value)
    } catch (err) {
      console.warn('[session] uId 写入本地存储失败：', err)
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
    newSession,
    removeSession,
    selectSession,
    setUId,
    setModelName,
    setAccessControl
  }
})
