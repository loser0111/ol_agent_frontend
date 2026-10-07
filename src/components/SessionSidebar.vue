<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Setting } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const sessionStore = useSessionStore()

const creating = ref(false)

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
    await ElMessageBox.confirm('删除后该会话的本地消息记录也将保留在浏览器中，确认删除？', '删除会话', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return // 用户取消
  }
  try {
    await sessionStore.removeSession(sessionId)
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
    </div>

    <div class="sidebar-list chat-scroll">
      <div
        v-for="s in sessionStore.sessions"
        :key="s.sessionId"
        class="session-item"
        :class="{ active: s.sessionId === sessionStore.activeSessionId }"
        @click="handleSelect(s.sessionId)"
      >
        <div class="session-info">
          <div class="session-name">{{ s.sessionName }}</div>
          <div class="session-sub">{{ s.modelName }}</div>
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
        v-if="sessionStore.sessions.length === 0"
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
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
}

.new-session-btn {
  width: 100%;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
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
