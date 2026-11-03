import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  test: {
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@plugins': path.resolve(__dirname, 'src/plugins'),
      '../src/lib/matrix/client.js': path.resolve(__dirname, 'src/lib/matrix/client.js'),
      '../src/lib/matrix/proxy.js': path.resolve(__dirname, 'src/lib/matrix/proxy.js'),
      '../src/lib/auth/tokenStore.js': path.resolve(__dirname, 'src/lib/auth/tokenStore.js'),
      '../src/plugins/auth.js': path.resolve(__dirname, 'src/plugins/auth.js'),
      '../src/db.js': path.resolve(__dirname, 'src/db.js'),
    },
  },
})