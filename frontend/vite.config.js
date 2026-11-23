import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Must match the served location of build.outDir inside the Django static
  // tree (static_src/assets -> /static/assets/), otherwise runtime asset URLs
  // such as the pdf.js worker resolve to a 404.
  base: '/static/assets/',
  build: {
    outDir: path.resolve(__dirname, '../static_src/assets'),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'index-[hash].js',
        chunkFileNames: 'index-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.css')) {
            return 'index-[hash].css';
          }
          return '[name]-[hash][extname]';
        },
      },
    },
  },
})