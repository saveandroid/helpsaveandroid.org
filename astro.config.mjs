// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://helpsaveandroid.org',

  fonts: [{
    provider: fontProviders.fontsource(),
    name: 'EB Garamond',
    weights: [400, 500, 600, 700],
    cssVariable: '--font-serif'
  }],

  vite: {
    plugins: [tailwindcss()]
  }
});