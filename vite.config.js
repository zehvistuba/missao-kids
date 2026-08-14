import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'

const appVersion = (process.env.VITE_APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 40)

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/]react(?:-dom)?[\\/]/, priority: 20 },
            { name: 'supabase-vendor', test: /node_modules[\\/]@supabase[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icon.png', 'icon.svg', 'favicon.svg'],
      manifest: {
        name: 'RotinUp',
        short_name: 'RotinUp',
        description: 'Transforme a rotina dos seus filhos em uma aventura épica!',
        theme_color: '#FF6B35',
        background_color: '#0F0F1A',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        categories: ['education', 'lifestyle', 'kids'],
        lang: 'pt-BR',
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
})
