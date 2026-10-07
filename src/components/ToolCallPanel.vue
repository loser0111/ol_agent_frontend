<script setup lang="ts">
import { computed } from 'vue'
import type { ToolCallInfo, ToolResponseInfo } from '@/stores/chat'

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

function truncate(text: string, max = 600): string {
  return text.length > max ? `${text.slice(0, max)}…（内容过长已截断）` : text
}
</script>

<template>
  <div class="tool-panel">
    <el-collapse>
      <el-collapse-item
        v-for="step in steps"
        :key="step.key"
        :title="`🧰 ${step.name}`"
        :name="step.key"
      >
        <div class="tool-step">
          <div v-if="step.arguments" class="tool-block">
            <div class="tool-label">参数</div>
            <pre class="tool-pre">{{ step.arguments }}</pre>
          </div>
          <div v-if="step.response" class="tool-block">
            <div class="tool-label">返回</div>
            <pre class="tool-pre">{{ truncate(step.response) }}</pre>
          </div>
          <el-empty
            v-if="!step.arguments && !step.response"
            description="等待执行结果…"
            :image-size="36"
          />
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.tool-panel {
  margin-top: 10px;
}

.tool-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  background: #f8fafc;
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
</style>
