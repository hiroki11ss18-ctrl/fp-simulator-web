import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

function readArg(name) {
  const prefix = `${name}=`;
  const direct = process.argv.find(arg => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);

  const idx = process.argv.indexOf(name);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

const host = readArg('--host') || process.env.HOST || '127.0.0.1';
const rawPort = readArg('--port') || process.env.PORT || '5173';
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid dev server port: ${rawPort}`);
}

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: {
    host,
    port,
    strictPort: true,
  },
});

await server.listen();

server.printUrls();

const close = async () => {
  await server.close();
  process.exit(0);
};

process.on('SIGINT', close);
process.on('SIGTERM', close);
