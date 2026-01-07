import coreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: ['node_modules/**', '.next/**', 'dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  ...coreWebVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
