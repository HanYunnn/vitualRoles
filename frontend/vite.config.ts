import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,   // 允許 cloudflare / ngrok 通道網域存取
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      // FastAPI serves generated/B-roll media under /assets (see api.py StaticFiles mounts)
      '/assets': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
})
