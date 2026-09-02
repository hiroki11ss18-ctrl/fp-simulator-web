import { openSync } from 'node:fs';
import { spawn } from 'node:child_process';

const out = openSync('vite.out.log', 'a');
const err = openSync('vite.err.log', 'a');

const child = spawn(process.execPath, ['scripts/dev-server.mjs'], {
  cwd: process.cwd(),
  detached: true,
  stdio: ['ignore', out, err],
  windowsHide: true,
});

child.unref();
console.log(child.pid);
