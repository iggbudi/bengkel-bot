import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    deps: {
      optimizer: {
        ssr: {
          enabled: false,
        },
      },
    },
  },
})