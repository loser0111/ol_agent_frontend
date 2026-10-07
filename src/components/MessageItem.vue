<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatMessage } from '@/stores/chat'
import MarkdownBody from './MarkdownBody.vue'
import ToolCallPanel from './ToolCallPanel.vue'

const props = defineProps<{ message: ChatMessage }>()

const isUser = computed(() => props.message.role === 'user')
const isTool = computed(() => props.message.role === 'tool')
const isSystem = computed(() => props.message.role === 'system')
/** 非用户消息的左侧头像文案：工具消息用「工具」区分 */
const leftAvatar = computed(() => (isTool.value ? '工具' : 'AI'))

/** 系统提示词默认折叠（内容可能很长，避免每次进入会话都刷屏） */
const systemExpanded = ref(false)

/** 是否处于流式输出中：交给 MarkdownBody 做样式微调 */
const isStreaming = computed(() => props.message.status === 'streaming')
</script>

<template>
  <!-- 系统消息：折叠条，保持与后端消息顺序一致但不干扰阅读 -->
  <div v-if="isSystem" class="system-row">
    <div class="system-head" @click="systemExpanded = !systemExpanded">
      <el-icon><InfoFilled /></el-icon>
      <span class="system-title">系统提示词</span>
      <span class="system-meta">{{ message.content.length }} 字</span>
      <el-button link type="primary" size="small">
        {{ systemExpanded ? '收起' : '展开' }}
      </el-button>
    </div>
    <pre v-show="systemExpanded" class="system-body">{{ message.content }}</pre>
  </div>

  <div v-else class="message-row" :class="isUser ? 'user' : 'assistant'">
    <div v-if="!isUser" class="avatar" :class="isTool ? 'tool-avatar' : 'assistant-avatar'">
      {{ leftAvatar }}
    </div>
    <div
      class="bubble"
      :class="isUser ? 'bubble-user' : isTool ? 'bubble-tool' : 'bubble-assistant'"
    >
      <template v-if="message.status === 'streaming' && !message.content && message.toolCalls.length === 0">
        <span class="typing">▍</span>
      </template>

      <!-- 工具调用 / 工具返回：折叠成一行汇总（默认收起），放在正文之前，形成「过程 → 结论」 -->
      <ToolCallPanel
        v-if="message.toolCalls.length > 0 || message.toolResponses.length > 0"
        :tool-calls="message.toolCalls"
        :tool-responses="message.toolResponses"
      />

      <!-- Markdown 渲染（内容在 renderMarkdown 中整体转义，可安全 v-html） -->
      <div v-if="message.content" class="message-content">
        <MarkdownBody :content="message.content" :streaming="isStreaming" />
      </div>

      <!-- 错误提示 -->
      <div v-if="message.status === 'error'" class="error-box">
        <el-icon><CircleClose /></el-icon>
        <span>{{ message.error }}</span>
      </div>
    </div>
    <div v-if="isUser" class="avatar user-avatar">我</div>
  </div>
</template>

<style scoped>
.message-row {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  align-items: flex-start;
}

.message-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  user-select: none;
}

.assistant-avatar {
  background: linear-gradient(135deg, #2563eb, #06b6d4);
  color: #fff;
}

.user-avatar {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.tool-avatar {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  font-size: 11px;
}

.bubble-tool {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-top-left-radius: 4px;
  color: var(--color-text);
}

/* 系统提示词折叠条 */
.system-row {
  margin: 4px 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #fafafa;
  overflow: hidden;
}

.system-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-secondary);
  user-select: none;
}

.system-title {
  font-weight: 500;
}

.system-meta {
  flex: 1;
}

.system-body {
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--color-border);
  background: #ffffff;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}

.bubble {
  max-width: min(760px, 82%);
  border-radius: 12px;
  padding: 10px 14px;
  line-height: 1.7;
  word-break: break-word;
}

.bubble-user {
  background: var(--color-bubble-user);
  color: var(--color-bubble-user-text);
  border-top-right-radius: 4px;
}

.bubble-assistant {
  background: var(--color-bubble-assistant);
  border: 1px solid var(--color-border);
  border-top-left-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.typing {
  animation: blink 1s step-start infinite;
  color: #94a3b8;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.error-box {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
  border: 1px solid #fecaca;
}
</style>
