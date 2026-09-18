import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Production build ko minify + chhote chunks me todta hai -> site fast load hoti hai
    minify: true,
    cssMinify: true,
    sourcemap: false, // production me source code expose nahi hoga (security + smaller build)
    rollupOptions: {
      output: {
        // Vendor libraries (react, react-dom, react-router) alag chunk me
        // -> browser cache kar leta hai, baar baar download nahi karna padta
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router-dom')) return 'router';
            if (id.includes('react') || id.includes('react-dom')) return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
