<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Refresh, Setting } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useChatStore } from '@/stores/chat'

const router = useRouter()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

const creating = ref(false)

/** 首屏加载中且无任何可展示数据 → 骨架屏 */
const showSkeleton = computed(
  () => sessionStore.loading && sessionStore.sessions.length === 0
)
/** 非加载中、无数据、且无错误 → 空列表提示 */
const showEmpty = computed(
  () => !sessionStore.loading && sessionStore.sessions.length === 0 && !sessionStore.error
)

async function handleRefresh() {
  await sessionStore.fetchSessions()
}

async function handleCreate() {
  if (creating.value) return
  creating.value = true
  try {
    await sessionStore.newSession()
    ElMessage.success('会话已创建')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  } finally {
    creating.value = false
  }
}

async function handleRemove(sessionId: string) {
  try {
    await ElMessageBox.confirm(
      '删除后该会话将在服务端软删（is_delete=1），本地缓存的消息记录也会一并清除。确认删除？',
      '删除会话',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return // 用户取消
  }
  try {
    await sessionStore.removeSession(sessionId)
    // 同步丢弃该会话在内存中的消息快照（localStorage 已由 store 清理）
    chatStore.dropSession(sessionId)
    ElMessage.success('会话已删除')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

function handleSelect(sessionId: string) {
  sessionStore.selectSession(sessionId)
}

function goSettings() {
  router.push('/settings')
}

/** 会话更新时间：今天只显示时分，其余显示 月/日 时:分 */
function formatTime(ts?: number | null): string {
  if (!ts) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return sameDay ? hhmm : `${date.getMonth() + 1}/${date.getDate()} ${hhmm}`
}

onMounted(() => {
  // 进入应用即从后端拉取会话列表（失败只提示，不清空本地缓存展示）
  void sessionStore.fetchSessions()
})
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-top">
      <el-button
        class="new-session-btn"
        type="primary"
        :icon="Plus"
        :loading="creating"
        @click="handleCreate"
      >
        新建会话
      </el-button>
      <el-button
        class="refresh-btn"
        :icon="Refresh"
        :loading="sessionStore.loading"
        title="刷新会话列表"
        @click="handleRefresh"
      />
    </div>

    <div class="sidebar-list chat-scroll">
      <!-- 请求失败：保留已有列表，顶部给出提示与重试 -->
      <el-alert
        v-if="sessionStore.error"
        class="sidebar-alert"
        type="warning"
        :closable="false"
        show-icon
      >
        <template #title>会话列表加载失败</template>
        <div class="sidebar-alert-body">
          <span class="sidebar-alert-msg">{{ sessionStore.error }}</span>
          <el-button link type="primary" size="small" @click="handleRefresh">重试</el-button>
        </div>
      </el-alert>

      <!-- 加载中（首屏） -->
      <el-skeleton v-if="showSkeleton" class="sidebar-skeleton" :rows="4" animated />

      <div
        v-for="s in sessionStore.sessions"
        :key="s.sessionId"
        class="session-item"
        :class="{ active: s.sessionId === sessionStore.activeSessionId }"
        @click="handleSelect(s.sessionId)"
      >
        <div class="session-info">
          <div class="session-name" :title="s.sessionName">{{ s.sessionName }}</div>
          <div class="session-sub">
            {{ s.modelName }}
            <span v-if="formatTime(s.updatedAt)"> · {{ formatTime(s.updatedAt) }}</span>
          </div>
        </div>
        <el-button
          class="session-del"
          text
          type="danger"
          size="small"
          :icon="Delete"
          title="删除会话"
          @click.stop="handleRemove(s.sessionId)"
        />
      </div>

      <el-empty
        v-if="showEmpty"
        description="暂无会话，点击上方新建"
        :image-size="72"
      />
    </div>

    <div class="sidebar-bottom">
      <el-button text :icon="Setting" @click="goSettings">设置</el-button>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
}

.new-session-btn {
  flex: 1;
}

.refresh-btn {
  flex-shrink: 0;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.sidebar-alert {
  margin-bottom: 8px;
}

.sidebar-alert-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sidebar-alert-msg {
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.sidebar-skeleton {
  padding: 8px 4px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.session-item:hover {
  background: #f3f4f6;
}

.session-item.active {
  background: #eff6ff;
}

.session-info {
  min-width: 0;
}

.session-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.session-del {
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.session-item:hover .session-del {
  opacity: 1;
}

.sidebar-bottom {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: center;
}
</style>
