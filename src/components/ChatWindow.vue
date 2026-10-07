<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageItem from './MessageItem.vue'

const chatStore = useChatStore()
const listRef = ref<HTMLElement | null>(null)

// 内容变化（流式增量）时自动滚到底部
watch(
  () => chatStore.messages.map((m) => `${m.id}:${m.content.length}:${m.status}`).join('|'),
  async () => {
    await nextTick()
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  },
  { flush: 'post' }
)
</script>

<template>
  <div ref="listRef" class="chat-window chat-scroll">
    <div v-if="chatStore.messages.length === 0" class="chat-empty">
      <el-empty description="开始对话吧，发送消息即可与模型交互" :image-size="96" />
    </div>
    <MessageItem
      v-for="m in chatStore.messages"
      :key="m.id"
      :message="m"
    />
    <div v-if="chatStore.isStreaming" class="streaming-tip">
      <span class="dot" /> 正在生成…
    </div>
  </div>
</template>

<style scoped>
.chat-window {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
}

.chat-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.streaming-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  padding: 8px 12px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #2563eb;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
</style>
