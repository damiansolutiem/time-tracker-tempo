/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_FLAVOR?: 'production' | 'development';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
