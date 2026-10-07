# ol\_agent\_frontend

ol\_agent（Spring AI 对话 Agent）的前端对话控制台。

## 技术栈

Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router

## 快速开始



```
npm install
npm run dev        # 开发服务器 http://localhost:5173，/agent/** 自动代理到后端 8080
npm run build      # 类型检查 + 构建，产物输出 dist/
npm run preview    # 预览构建产物
```

## 目录结构



```
src/
├── api/               # 接口层
│   ├── client.ts      #   统一 JSON POST + 响应码解析
│   ├── chat.ts        #   ★ POST+SSE 流式对话客户端（ReadableStream 解析 + AbortController 中断）
│   └── session.ts     #   会话创建/删除
├── stores/            # Pinia
│   ├── session.ts     #   会话列表/选中/用户/模型/访问控制
│   └── chat.ts        #   消息按会话分组、流式增量、停止生成、本地持久化
├── components/
│   ├── SessionSidebar.vue   # 会话侧栏（新建/切换/删除）
│   ├── ChatWindow.vue       # 消息列表（自动滚动）
│   ├── MessageItem.vue      # 消息气泡（代码块渲染/工具面板/错误提示）
│   ├── ToolCallPanel.vue    # TOOL_CALL / TOOL_RESPONSE 折叠面板
│   └── ChatInput.vue        # 输入框（Enter 发送 / Shift+Enter 换行 / 停止生成）
├── views/
│   ├── ChatView.vue         # 对话页
│   └── SettingsView.vue     # 设置页（uId / 模型 / 访问控制）
├── types/              # 与后端 DTO/枚举对齐的类型定义
├── router/             # 路由
├── App.vue             # 布局骨架
└── main.ts
```

## 与后端接口约定（对齐 E:\learn\ol\_agent）



| 接口                      | 方法         | 说明                                                                                 |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `/agent/session/create` | POST       | 创建会话，入参 `uId / sessionName / modelName / sessionAccessControl`                     |
| `/agent/session/delete` | POST       | 删除会话（软删），入参 `uId / sessionId`                                                      |
| `/agent/chat`           | POST + SSE | 流式对话，入参 `uId / sessionId / type=CHAT / content / modelName / sessionAccessControl` |

SSE 事件类型（`data` 字段按类型解析）：



* `TOKEN` / `ANSWER` — 回答内容增量 / 整段

* `TOOL_CALL` / `TOOL_RESPONSE` — 工具调用与结果（折叠面板展示）

* `STATUS` / `OPTIONS` / `QUESTIONNAIRE` / `PERMISSION_REQUEST` — 状态与交互类（暂未展开 UI）

* `ERROR` — 错误（气泡内红框提示）

* `DONE` — 正常结束

## 已知边界



* 后端暂无 “会话列表 / 按会话查消息” 的查询接口，会话与消息记录由前端维护在浏览器 localStorage；

  后端补 `list` 接口后，在 `src/stores/session.ts`（`fetchSessions`）与 `src/stores/chat.ts`（历史加载）接入即可。

* 生产部署：`npm run build` 后可将 `dist/` 挂到 Spring Boot 静态目录（同域无跨域问题）或由 Nginx 反代。