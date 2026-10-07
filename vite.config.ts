import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_STATIC_DEMO': JSON.stringify(mode === 'demo' ? 'true' : 'false'),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4318', '/.well-known': 'http://127.0.0.1:4318' },
  },
}));
