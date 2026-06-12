// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

const env = /** @type {Record<string, string | undefined>} */ (
  Reflect.get(globalThis, 'process')?.env ?? {}
);
const site =
  env.PUBLIC_SITE_URL ??
  (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'https://gamfest.org');

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [react()],
});
