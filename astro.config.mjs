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

  // GitHub Pages can't send headers, so the policy ships as a meta tag (KTD11).
  security: {
    csp: {
      scriptDirective: {
        // Replaces Astro's default script sources, so 'self' must be listed explicitly.
        resources: ["'self'", 'https://sdk.scdn.co'],
      },
      directives: [
        'frame-src https://sdk.scdn.co',
        'connect-src https://api.spotify.com https://accounts.spotify.com https://*.spotify.com wss://*.spotify.com',
        "img-src 'self' data: https://i.scdn.co https://*.scdn.co https://*.spotifycdn.com",
        "media-src 'self' blob: https://*.scdn.co",
      ],
    },
  },

  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true },
  },
});
