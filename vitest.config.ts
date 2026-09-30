import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // IndexedDB는 브라우저에만 있으므로 테스트에서는 fake-indexeddb로 흉내 낸다.
    setupFiles: ['./src/test-setup.ts'],
  },
})
