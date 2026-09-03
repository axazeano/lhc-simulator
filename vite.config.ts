import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GITHUB_PAGES=1 is set by the deploy workflow; the site then lives under /lhc-simulator/.
const base = process.env.GITHUB_PAGES ? '/lhc-simulator/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
