import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Mesmos cabeçalhos que o Flask manda em produção: sem isolamento
    // cross-origin o WebAssembly do Pocket-TTS roda em 1 thread só.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
})
