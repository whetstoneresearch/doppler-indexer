import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      // Ponder resolves this virtual module at build time; map it so entity
      // modules that import table definitions can be unit tested.
      'ponder:schema': path.resolve(__dirname, './ponder.schema.ts'),
    },
  },
});
