// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

const env = /** @type {Record<string, string | undefined>} */ (
  Reflect.get(globalThis, 'process')?.env ?? {}
);
const DEFAULT_SITE_URL = 'https://gamfest-demo.vercel.app';
const site = (env.PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, '');

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [react()],
});
