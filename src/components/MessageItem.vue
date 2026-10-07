<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/stores/chat'
import ToolCallPanel from './ToolCallPanel.vue'

const props = defineProps<{ message: ChatMessage }>()

const isUser = computed(() => props.message.role === 'user')

/**
 * 轻量渲染：把 ``` 围栏代码块抽出来，其余内容按纯文本（pre-wrap）展示。
 * 不引入 markdown 依赖，避免 XSS 风险。
 */
interface Segment {
  type: 'code' | 'text'
  content: string
}

const segments = computed<Segment[]>(() => {
  const raw = props.message.content ?? ''
  const out: Segment[] = []
  let text = ''
  let i = 0
  while (i < raw.length) {
    const start = raw.indexOf('```', i)
    if (start === -1) {
      text += raw.slice(i)
      break
    }
    text += raw.slice(i, start)
    const end = raw.indexOf('```', start + 3)
    if (end === -1) {
      text += raw.slice(start)
      break
    }
    if (text) {
      out.push({ type: 'text', content: text })
      text = ''
    }
    out.push({ type: 'code', content: raw.slice(start + 3, end) })
    i = end + 3
  }
  if (text) out.push({ type: 'text', content: text })
  return out
})
</script>

<template>
  <div class="message-row" :class="isUser ? 'user' : 'assistant'">
    <div v-if="!isUser" class="avatar assistant-avatar">AI</div>
    <div class="bubble" :class="isUser ? 'bubble-user' : 'bubble-assistant'">
      <template v-if="message.status === 'streaming' && !message.content && message.toolCalls.length === 0">
        <span class="typing">▍</span>
      </template>

      <div v-for="(seg, idx) in segments" :key="idx" class="message-content">
        <pre v-if="seg.type === 'code'">{{ seg.content }}</pre>
        <div v-else class="plain-text">{{ seg.content }}</div>
      </div>

      <!-- 工具调用折叠面板 -->
      <ToolCallPanel
        v-if="message.toolCalls.length > 0 || message.toolResponses.length > 0"
        :tool-calls="message.toolCalls"
        :tool-responses="message.toolResponses"
      />

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

.plain-text {
  white-space: pre-wrap;
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
