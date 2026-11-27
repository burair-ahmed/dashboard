import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/tv': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
      },
      '/ws/tv': {
        target: 'ws://127.0.0.1:4001',
        ws: true,
      },
      '/api/levels': {
        target: 'http://127.0.0.1:7860',
        changeOrigin: true,
      },
      '/api/symbols': {
        target: 'http://127.0.0.1:7860',
        changeOrigin: true,
      },
      '/api/gex-pro-plan': {
        target: 'http://127.0.0.1:7860',
        changeOrigin: true,
      },
      '/ws/gex': {
        target: 'ws://127.0.0.1:7860',
        ws: true,
      },
    },
  },
});
