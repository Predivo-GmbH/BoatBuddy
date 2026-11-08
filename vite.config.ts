import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The build's commit, sent with every error report (src/lib/server-error.ts) so a report
  // names the release it came from. 'local' outside CI.
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 12)),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'query-vendor'
          }
          if (id.includes('node_modules/recharts')) {
            return 'charts-vendor'
          }
        },
      },
    },
  },
})
