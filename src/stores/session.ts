import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { createSession as apiCreateSession, deleteSession as apiDeleteSession } from '@/api/session'
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.value))
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
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessions.value[0]?.sessionId ?? ''
    }
  }

  function selectSession(sessionId: string) {
    activeSessionId.value = sessionId
  }

  function setUId(value: string) {
    uId.value = value
    localStorage.setItem(UID_KEY, value)
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
