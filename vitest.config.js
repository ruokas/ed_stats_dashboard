import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/state/**/*.js',
        'src/data/csv.js',
        'src/app/runtime/table-export.js',
        'src/app/runtime/network.js',
        'src/app/runtime/page-ui.js',
        'src/app/runtime/features/summaries-jump-navigation.js',
        'src/app/runtime/features/summaries-yearly-table.js',
        'src/app/runtime/utils/common.js',
        'src/app/runtime/runtimes/summaries/*.js',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
});
