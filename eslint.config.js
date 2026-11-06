import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist', 'node_modules', 'test-results.json'] },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node }
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, Temporal: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error'
    }
  }
]
