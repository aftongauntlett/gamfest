// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintPluginAstro from 'eslint-plugin-astro';
// @ts-expect-error -- eslint-plugin-jsx-a11y ships no type declarations
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**', '.astro/**', 'node_modules/**']),
  eslintPluginAstro.configs['flat/recommended'],
  eslintPluginAstro.configs['flat/jsx-a11y-recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['**/*.{tsx,jsx}'],
    extends: [jsxA11y.flatConfigs.recommended],
  },
]);
