<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  /** markdown 原文 */
  content: string
  /** 流式输出中（用于样式微调，比如代码块收尾留白） */
  streaming?: boolean
}>()

const html = computed(() => renderMarkdown(props.content ?? ''))
</script>

<template>
  <div v-if="html" class="markdown-body" :class="{ 'is-streaming': streaming }" v-html="html" />
</template>

<style scoped>
.markdown-body {
  word-break: break-word;
}

.markdown-body :deep(> *:first-child) {
  margin-top: 0;
}

.markdown-body :deep(> *:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 8px;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 12px 0 8px;
  line-height: 1.4;
  font-weight: 600;
}

.markdown-body :deep(h1) {
  font-size: 18px;
}
.markdown-body :deep(h2) {
  font-size: 16px;
}
.markdown-body :deep(h3) {
  font-size: 15px;
}
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  font-size: 14px;
  color: #374151;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 6px 0 8px;
  padding-left: 22px;
}

.markdown-body :deep(li) {
  margin: 2px 0;
}

.markdown-body :deep(li > ul),
.markdown-body :deep(li > ol) {
  margin: 2px 0;
}

.markdown-body :deep(a) {
  color: #2563eb;
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid #cbd5e1;
  color: var(--color-text-secondary);
  background: rgba(148, 163, 184, 0.08);
  border-radius: 0 6px 6px 0;
}

.markdown-body :deep(hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid var(--color-border);
}

.markdown-body :deep(code) {
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
}

.markdown-body :deep(pre) {
  margin: 8px 0;
  white-space: pre;
}

.markdown-body :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: inherit;
}

.markdown-body :deep(table) {
  width: 100%;
  margin: 8px 0;
  border-collapse: collapse;
  font-size: 13px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--color-border);
  padding: 5px 8px;
}

.markdown-body :deep(th) {
  background: #f8fafc;
  font-weight: 600;
  text-align: left;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}

/* 用户气泡是深色底，调整内联代码/链接的对比度 */
:global(.bubble-user) .markdown-body :deep(a) {
  color: #bfdbfe;
}

:global(.bubble-user) .markdown-body :deep(blockquote) {
  border-left-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.is-streaming :deep(pre) {
  margin-bottom: 4px;
}
</style>
