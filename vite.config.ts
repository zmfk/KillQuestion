import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 只做 Web 构建；PWA / Capacitor 属于 M4，不在 v1 范围。
// base 用 './' + HashRouter，保证丢到 GitHub Pages 子路径下也能直接用。
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
