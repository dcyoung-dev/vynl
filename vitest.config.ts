/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';
import astroConfig from './astro.config.mjs';

export default getViteConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Vitest resets import.meta.env.BASE_URL to '/', so mirror Astro's base for code that builds URLs.
    env: { BASE_URL: `${astroConfig.base}/` },
  },
});
