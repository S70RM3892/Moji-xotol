import { defineConfig } from 'vite';

// GitHub Pages などサブパス配信でも動くよう相対パスにする
export default defineConfig({ base: './' });
