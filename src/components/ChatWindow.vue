<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'
import MessageItem from './MessageItem.vue'

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const listRef = ref<HTMLElement | null>(null)

/** 视口是否贴着底部（用户往上翻历史时为 false，此时不强行拽回底部） */
const atBottom = ref(true)
/** 上一次提问是否已滚出视口上方（长回答场景下才需要「回到提问」） */
const questionAbove = ref(false)
/** 刚刚跳过去的下标，用于闪一下高亮帮助定位（-1 表示无） */
const highlightIndex = ref(-1)
/** 贴底判定的容差 */
const BOTTOM_TOLERANCE = 40
/** 跳转后提问距离容器顶部的留白 */
const JUMP_OFFSET = 12

/** 上一次用户提问在列表中的下标（-1 表示该会话还没有用户提问） */
const lastUserIndex = computed(() => {
  const list = chatStore.messages
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].role === 'user') return i
  }
  return -1
})

/** 只有「存在提问」且「提问已完全滚出视口上方」时才提供回到提问按钮 */
const showJumpToQuestion = computed(() => lastUserIndex.value >= 0 && questionAbove.value)

/** 取某个下标消息的 DOM 锚点（锚点由模板里的 .msg-anchor 提供） */
function anchorOf(index: number): HTMLElement | null {
  const el = listRef.value
  if (!el || index < 0) return null
  return el.querySelector<HTMLElement>('[data-msg-index="' + index + '"]')
}

/** 按真实滚动位置刷新状态：滚动、流式增量、消息变化后都要调用 */
function syncScrollState() {
  const el = listRef.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_TOLERANCE
  const anchor = anchorOf(lastUserIndex.value)
  // 提问的底部落在容器顶部之上 → 已经看不到了，可以给个「回到提问」
  questionAbove.value = anchor
    ? anchor.getBoundingClientRect().bottom <= el.getBoundingClientRect().top + 2
    : false
}

function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  const el = listRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior })
  atBottom.value = true
  syncScrollState()
}

/** 回到上一次提问：把提问滚到视口顶部，并闪一下帮助定位 */
function scrollToLastQuestion() {
  const el = listRef.value
  const index = lastUserIndex.value
  const anchor = anchorOf(index)
  if (!el || !anchor) return
  const delta = anchor.getBoundingClientRect().top - el.getBoundingClientRect().top
  el.scrollTo({ top: Math.max(el.scrollTop + delta - JUMP_OFFSET, 0), behavior: 'smooth' })
  highlightIndex.value = index
  window.setTimeout(() => {
    if (highlightIndex.value === index) highlightIndex.value = -1
  }, 1600)
}

const emptyText = computed(() =>
  chatStore.historyError ? '消息加载失败，请点击上方重试' : '该会话暂无消息，发送消息即可与模型交互'
)

/** 首屏「加载中且无内容」才显示骨架屏，避免已有快照时闪一下 */
const showSkeleton = computed(() => chatStore.historyLoading && chatStore.messages.length === 0)

// 历史加载完成 / 流式增量 / 新消息，任一变化都在贴底状态下滚到底部
watch(
  () => chatStore.messages.map((m) => `${m.id}:${m.content.length}:${m.status}`).join('|'),
  async () => {
    await nextTick()
    if (atBottom.value) scrollToBottom()
    // 增量导致高度变化后，重新判断「回到提问 / 回到最新」是否该露面
    syncScrollState()
  },
  { flush: 'post', immediate: true }
)

onMounted(async () => {
  const sessionId = sessionStore.activeSessionId
  if (!sessionId) return
  // 选中会话即按 sessionId 拉取真实历史（失败时展示错误 + 重试，不清空已有快照）
  await chatStore.loadHistory(sessionId)
  await nextTick()
  scrollToBottom()
  syncScrollState()
})
</script>

<template>
  <div class="chat-window-wrap">
    <div ref="listRef" class="chat-window chat-scroll" @scroll.passive="syncScrollState">
      <!-- 加载失败：保留已有（本地快照）内容，顶部提示并可重试 -->
      <el-alert
        v-if="chatStore.historyError"
        class="history-alert"
        type="warning"
        :closable="false"
        show-icon
      >
        <template #title>消息加载失败</template>
        <div class="history-alert-body">
          <span class="history-alert-msg">{{ chatStore.historyError }}</span>
          <el-button
            link
            type="primary"
            size="small"
            :loading="chatStore.historyLoading"
            @click="chatStore.retryHistory()"
          >
            重试
          </el-button>
        </div>
      </el-alert>

      <div v-if="showSkeleton" class="history-skeleton">
        <el-skeleton :rows="6" animated />
        <div class="history-loading-tip">正在加载历史消息…</div>
      </div>

      <div v-else-if="chatStore.messages.length === 0" class="chat-empty">
        <el-empty :description="emptyText" :image-size="96" />
      </div>

      <template v-else>
        <!-- 每行包一层锚点：供「回到上一次提问」定位（data-msg-index 与下标对应） -->
        <div
          v-for="(m, i) in chatStore.messages"
          :key="m.id"
          class="msg-anchor"
          :class="{ highlight: highlightIndex === i }"
          :data-msg-index="i"
        >
          <MessageItem :message="m" />
        </div>
      </template>

      <div v-if="chatStore.isStreaming" class="streaming-tip">
        <span class="dot" /> 正在生成…
      </div>
    </div>

    <!-- 大模型回答很长时：一键回到上一次提问 / 回到最新 -->
    <div class="scroll-actions">
      <transition name="fade">
        <el-button
          v-if="showJumpToQuestion"
          class="action-btn"
          size="small"
          :icon="ArrowUp"
          title="回到上一次提问"
          @click="scrollToLastQuestion"
        >
          回到提问
        </el-button>
      </transition>
      <transition name="fade">
        <el-button
          v-if="!atBottom"
          class="action-btn"
          size="small"
          :icon="ArrowDown"
          title="回到最新消息"
          @click="scrollToBottom('smooth')"
        >
          回到最新
        </el-button>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.chat-window-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-window {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
}

.history-alert {
  margin-bottom: 12px;
}

.history-alert-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.history-alert-msg {
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.history-skeleton {
  padding: 8px 4px;
}

.history-loading-tip {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
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

.scroll-actions {
  position: absolute;
  right: 24px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 2;
}

.action-btn {
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.16);
}

/* 跳转定位后闪一下提问气泡，确认「就是这一条」 */
.msg-anchor.highlight :deep(.bubble) {
  animation: anchor-flash 1.6s ease;
}

@keyframes anchor-flash {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(13, 148, 136, 0);
  }
  30% {
    box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.45);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
