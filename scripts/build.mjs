import react from '@vitejs/plugin-react';
import { build } from 'vite';

await build({
  configFile: false,
  // GitHub Pages serves this app below its repository name.
  base: process.env.GITHUB_ACTIONS ? '/fp-simulator-web/' : '/',
  plugins: [react()],
});
