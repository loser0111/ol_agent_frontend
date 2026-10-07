<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolCallInfo, ToolResponseInfo } from '@/stores/chat'
import { MAX_PERSISTED_TOOL_TEXT } from '@/stores/chatStorage'

const props = defineProps<{
  toolCalls: ToolCallInfo[]
  toolResponses: ToolResponseInfo[]
}>()

/** 合并工具调用与响应，同一名称/顺序配对展示 */
interface ToolStep {
  key: string
  name: string
  arguments?: string
  response?: string
}

const steps = computed<ToolStep[]>(() => {
  const out: ToolStep[] = []
  const calls = [...props.toolCalls]
  const responses = [...props.toolResponses]

  // 优先按 id 配对；id 不一致时按顺序兜底
  const usedResp = new Set<number>()
  for (const call of calls) {
    const idx = responses.findIndex((r, i) => !usedResp.has(i) && (r.id === call.id || r.name === call.name))
    if (idx >= 0) {
      usedResp.add(idx)
      out.push({ key: `${call.id}-${idx}`, name: call.name, arguments: call.arguments, response: responses[idx].response })
    } else {
      out.push({ key: call.id, name: call.name, arguments: call.arguments })
    }
  }
  responses.forEach((r, i) => {
    if (!usedResp.has(i)) {
      out.push({ key: `resp-${r.id}-${i}`, name: r.name, response: r.response })
    }
  })
  return out
})

/** 折叠时的汇总：调用次数 / 涉及的工具（超过 4 个只列前 4 个） */
const summary = computed(() => {
  if (steps.value.length === 0) return ''
  const counter = new Map<string, number>()
  for (const step of steps.value) {
    counter.set(step.name, (counter.get(step.name) ?? 0) + 1)
  }
  const names = [...counter.entries()].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
  const shown = names.slice(0, 4).join('、')
  return names.length > 4 ? `${shown} 等 ${names.length} 个工具` : shown
})

/** 还没有返回结果的调用（流式进行中） */
const pendingCount = computed(() => steps.value.filter((step) => step.response == null).length)

/** 默认折叠：工具过程只占一行，需要时再展开看参数与返回 */
const opened = ref<string[]>([])

/** 返回内容展示上限；参数用落盘上限，保证刷新前后看到的内容一致 */
const RESPONSE_DISPLAY_MAX = 600
const ARGUMENT_DISPLAY_MAX = MAX_PERSISTED_TOOL_TEXT

function truncate(text: string, max = RESPONSE_DISPLAY_MAX): string {
  return text.length > max ? `${text.slice(0, max)}…（内容过长已截断）` : text
}
</script>

<template>
  <div class="tool-panel">
    <el-collapse v-model="opened" class="tool-collapse">
      <el-collapse-item name="tools">
        <template #title>
          <span class="tool-head">
            <span class="tool-head-title">🧰 工具调用 · {{ steps.length }} 次</span>
            <span v-if="pendingCount > 0" class="tool-chip pending">执行中…</span>
            <span class="tool-head-summary">{{ summary }}</span>
          </span>
        </template>

        <div class="tool-steps">
          <div v-for="step in steps" :key="step.key" class="tool-step">
            <div class="tool-step-head">
              <span class="tool-step-name">{{ step.name }}</span>
              <span v-if="step.response == null" class="tool-chip pending">等待执行结果…</span>
              <span v-else class="tool-chip done">{{ step.response.length }} 字</span>
            </div>
            <div v-if="step.arguments" class="tool-block">
              <div class="tool-label">参数</div>
              <pre class="tool-pre">{{ truncate(step.arguments, ARGUMENT_DISPLAY_MAX) }}</pre>
            </div>
            <div v-if="step.response" class="tool-block">
              <div class="tool-label">返回</div>
              <pre class="tool-pre">{{ truncate(step.response) }}</pre>
            </div>
            <div v-if="!step.arguments && step.response == null" class="tool-empty">暂无参数与返回</div>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.tool-panel {
  margin: 0 0 10px;
}

.tool-collapse {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
}

.tool-collapse :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 36px;
  padding: 6px 10px;
  border-bottom: none;
  background: transparent;
  font-size: 12px;
  line-height: 1.6;
}

.tool-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
  background: transparent;
}

.tool-collapse :deep(.el-collapse-item__content) {
  padding: 0 10px 10px;
  font-size: 12px;
}

.tool-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.tool-head-title {
  font-weight: 600;
  color: var(--color-text);
}

.tool-head-summary {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.tool-chip {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.5;
}

.tool-chip.pending {
  background: #fef3c7;
  color: #92400e;
}

.tool-chip.done {
  background: #e2e8f0;
  color: #475569;
  font-variant-numeric: tabular-nums;
}

.tool-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-step {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-step-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-step-name {
  font-weight: 500;
  color: var(--color-text);
}

.tool-block {
  min-width: 0;
}

.tool-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.tool-pre {
  margin: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 320px;
  overflow-y: auto;
}

.tool-empty {
  color: var(--color-text-secondary);
}
</style>
