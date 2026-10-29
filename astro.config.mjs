// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://dcyoung-dev.github.io',
  base: '/vynl',
  trailingSlash: 'always',
  server: { host: '127.0.0.1', port: 4321 },
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true },
  },
});
