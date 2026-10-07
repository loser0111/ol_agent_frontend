<script setup lang="ts">
import { useRoute } from 'vue-router'
import SessionSidebar from '@/components/SessionSidebar.vue'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const sessionStore = useSessionStore()
</script>

<template>
  <el-container class="app-shell">
    <el-aside class="app-sidebar" width="280px">
      <SessionSidebar />
    </el-aside>
    <el-container class="app-main" direction="vertical">
      <el-header class="app-header">
        <div class="app-title">
          <span class="logo-dot" />
          <span>ol_agent 对话控制台</span>
        </div>
        <div class="app-header-right">
          <el-tag size="small" type="info" effect="plain">
            {{ sessionStore.uId }}
          </el-tag>
          <el-tag size="small" type="primary" effect="plain">
            {{ sessionStore.modelName }}
          </el-tag>
        </div>
      </el-header>
      <el-main class="app-content">
        <router-view v-slot="{ Component }">
          <component :is="Component" :key="route.path" />
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  height: 100%;
}

.app-sidebar {
  border-right: 1px solid var(--color-border);
  background: #ffffff;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.app-main {
  height: 100%;
  min-width: 0;
}

.app-header {
  height: var(--app-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border-bottom: 1px solid var(--color-border);
  padding: 0 20px;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.logo-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #06b6d4);
}

.app-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-content {
  padding: 0;
  overflow: hidden;
  background: var(--color-bg);
}
</style>
