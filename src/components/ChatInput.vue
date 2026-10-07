<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Promotion, VideoPause } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'

const chatStore = useChatStore()
const sessionStore = useSessionStore()

const inputRef = ref('')
const textareaRef = ref<{ textarea: HTMLTextAreaElement } | null>(null)

async function handleSend() {
  const content = inputRef.value.trim()
  if (!content) return
  if (!sessionStore.activeSessionId) {
    ElMessage.warning('请先新建或选择一个会话')
    return
  }
  try {
    await chatStore.sendMessage(content)
    inputRef.value = ''
    await nextTick()
    textareaRef.value?.textarea?.focus()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

function handleKeydown(e: KeyboardEvent) {
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input">
    <el-input
      ref="textareaRef"
      v-model="inputRef"
      type="textarea"
      :rows="2"
      :autosize="{ minRows: 2, maxRows: 8 }"
      placeholder="输入消息，Enter 发送，Shift+Enter 换行"
      resize="none"
      :disabled="chatStore.isStreaming"
      @keydown="handleKeydown"
    />
    <div class="input-actions">
      <span class="hint">
        {{
          chatStore.isStreaming
            ? '生成中，可随时停止'
            : chatStore.historyLoading
              ? '正在加载历史消息…'
              : '模型：' + sessionStore.modelName
        }}
      </span>
      <el-button
        v-if="chatStore.isStreaming"
        type="danger"
        :icon="VideoPause"
        @click="chatStore.stop()"
      >
        停止
      </el-button>
      <el-button
        v-else
        type="primary"
        :icon="Promotion"
        :disabled="!inputRef.trim() || !sessionStore.activeSessionId || chatStore.historyLoading"
        @click="handleSend"
      >
        发送
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  border-top: 1px solid var(--color-border);
  padding: 12px 16px 14px;
  background: #ffffff;
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
