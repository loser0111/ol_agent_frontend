<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSessionStore } from '@/stores/session'
import { useChatStore } from '@/stores/chat'
import type { SessionAccessControl } from '@/types'

const sessionStore = useSessionStore()
const chatStore = useChatStore()

const form = reactive({
  uId: sessionStore.uId,
  modelName: sessionStore.modelName,
  accessControl: sessionStore.accessControl
})

const saving = ref(false)

const MODEL_PRESETS = ['deepseek-flash', 'deepseek-chat', 'deepseek-reasoner', 'glm-4.5', 'gpt-4o']

const ACCESS_OPTIONS: { value: SessionAccessControl; label: string; desc: string }[] = [
  { value: 'ALWAYS_ALLOW', label: '总是允许', desc: '工具调用无需询问直接执行' },
  { value: 'ASK_AS_NEEDED', label: '按需询问', desc: '高权限操作时询问' },
  { value: 'ALWAYS_ASK', label: '总是询问', desc: '每次工具调用都确认' }
]

function handleSave() {
  if (!form.uId.trim()) {
    ElMessage.warning('uId 不能为空')
    return
  }
  const uidChanged = form.uId.trim() !== sessionStore.uId
  sessionStore.setUId(form.uId.trim())
  sessionStore.setModelName(form.modelName.trim() || 'deepseek-flash')
  sessionStore.setAccessControl(form.accessControl)
  ElMessage.success('设置已保存，后续对话将使用新配置')
  if (uidChanged) {
    // 换了用户：重新拉取该 uId 的会话列表
    void sessionStore.fetchSessions()
  }
}

async function handleClearMessages() {
  try {
    await ElMessageBox.confirm('将清空当前会话在浏览器中的本地消息记录（不影响服务端数据），确认？', '清空消息', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  chatStore.clearMessages()
  ElMessage.success('当前会话消息已清空')
}
</script>

<template>
  <div class="settings-page chat-scroll">
    <el-card class="settings-card" shadow="never">
      <template #header>
        <span class="card-title">对话设置</span>
      </template>

      <el-form label-width="110px" label-position="left">
        <el-form-item label="用户 ID (uId)">
          <el-input v-model="form.uId" placeholder="例如 u1001" clearable />
        </el-form-item>

        <el-form-item label="模型">
          <el-select
            v-model="form.modelName"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入模型名"
            style="width: 320px"
          >
            <el-option
              v-for="m in MODEL_PRESETS"
              :key="m"
              :label="m"
              :value="m"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="访问控制">
          <el-radio-group v-model="form.accessControl">
            <el-radio
              v-for="opt in ACCESS_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
              <span class="opt-desc">{{ opt.desc }}</span>
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">保存设置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card danger-card" shadow="never">
      <template #header>
        <span class="card-title">本地数据</span>
      </template>
      <p class="danger-tip">
        会话列表已接入后端接口（GET /agent/session/list），仅"会话显示名"会缓存在浏览器
        localStorage 作为兜底；会话消息仍保存在本地（后端已有查询接口，展示接入进行中）。
        删除会话会调用后端软删接口，本地记录随之移除。
      </p>
      <el-button type="danger" plain @click="handleClearMessages">清空当前会话消息</el-button>
    </el-card>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  background: var(--color-bg);
}

.settings-card {
  max-width: 720px;
  margin-bottom: 16px;
}

.card-title {
  font-weight: 600;
}

.opt-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-left: 6px;
}

.danger-tip {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin: 0 0 12px;
}
</style>
