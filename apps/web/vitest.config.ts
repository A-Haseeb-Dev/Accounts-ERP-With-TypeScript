import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    // Pure-logic helpers under src/lib need no DOM. Keep it node so the suite
    // stays fast; add jsdom only when a component test is introduced.
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});