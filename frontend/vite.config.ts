import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 优化开发服务器性能
    hmr: {
      overlay: true,
    },
    watch: {
      // 忽略不需要监听的目录，减少CPU占用
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      // 使用轮询模式的备选方案（某些环境下文件监听可能不工作）
      // usePolling: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // 添加超时配置，避免长时间等待
        timeout: 30000,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30000,
      },
    },
  },
  // 构建优化
  build: {
    // 启用源码映射以便调试（生产环境可关闭）
    sourcemap: false,
    // 代码分割优化
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@radix-ui') || id.includes('framer-motion')) {
              return 'ui-vendor';
            }
            if (id.includes('recharts')) {
              return 'chart-vendor';
            }
          }
        },
      },
    },
    // 块大小警告限制
    chunkSizeWarningLimit: 1000,
  },
})
