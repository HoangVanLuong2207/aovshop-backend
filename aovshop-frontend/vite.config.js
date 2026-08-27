import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  build: {
    // Target ES2015 for broad compatibility with older WebViews (Zalo, Messenger)
    target: 'es2015',
    // Force UTF-8 encoding on all build outputs (fixes garbled Vietnamese on Render)
    charset: 'utf8',
    // Ensure rollup doesn't mishandle unicode
    rollupOptions: {
      output: {
        compact: false,
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
