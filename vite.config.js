import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Adds Chrome's Prompt API origin-trial token to the page when one is set.
// Needed for Gemini Nano on a deployed domain (localhost does not need it).
function originTrial(token) {
  return {
    name: 'origin-trial',
    transformIndexHtml(html) {
      if (!token) return html;
      return html.replace('</head>', `    <meta http-equiv="origin-trial" content="${token}" />\n  </head>`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), originTrial(env.VITE_ORIGIN_TRIAL_TOKEN)],
    build: { target: 'es2022' }, // top-level await in src/backend.js
    test: { include: ['tests/**/*.test.js'] },
  };
});
