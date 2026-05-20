// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://helpsaveandroid.org',
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
    sessionKVBindingName: 'HSA_SESSION',
  }),

  fonts: [{
    provider: fontProviders.fontsource(),
    name: 'EB Garamond',
    weights: [400, 500, 600, 700],
    cssVariable: '--font-serif'
  }],

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [react()]
});
