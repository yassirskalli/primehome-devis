import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.API_TARGET || 'http://backend:8001'

export default defineConfig({
  plugins: [react()],
  base: '/devis',
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify(process.env.API_BASE ?? '/devis/api'),
  },
  server: {
    host: '0.0.0.0',
    port: 3001,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
