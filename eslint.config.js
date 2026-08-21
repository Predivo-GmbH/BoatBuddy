import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import gateKit from '@predivo-gmbh/gate-kit/eslint'

export default defineConfig([
  // Shared fleet layout gates: a dialog panel, and a sticky or fixed panel stacking controls,
  // must contain a real scroller, so the commit control stays reachable on a short viewport.
  // This is the static half of Gate A: it fails in the pull request instead of after a staging
  // deploy. One implementation for all six products, with its own fixture suite, in
  // Predivo-GmbH/gate-kit.
  ...gateKit.configs.recommended,
  globalIgnores(['dist', 'src/test/**', 'src/components/ui/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
