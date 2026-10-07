/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 基地址；留空（默认）则用相对路径走 Vite dev proxy */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
