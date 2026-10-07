<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import ChatWindow from '@/components/ChatWindow.vue'
import ChatInput from '@/components/ChatInput.vue'

const sessionStore = useSessionStore()

const hasSession = computed(() => sessionStore.activeSessionId !== '')
</script>

<template>
  <div class="chat-view">
    <div v-if="!hasSession" class="no-session">
      <el-empty description="请先在左侧新建或选择一个会话" :image-size="110" />
    </div>
    <template v-else>
      <ChatWindow :key="sessionStore.activeSessionId" />
      <ChatInput />
    </template>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.no-session {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
