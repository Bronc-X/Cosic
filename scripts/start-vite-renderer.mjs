import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const root = process.cwd();
const defaultPort = 5173;
const maxPort = 5199;
const rendererSignature = '<title>Cosic Player</title>';
const markerPath = path.join(root, '.tmp', 'cosic-renderer-url.json');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const hasPort = (portToCheck) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: portToCheck });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });

const hasCosicRenderer = async (portToCheck) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`http://127.0.0.1:${portToCheck}`, {
      signal: controller.signal
    });
    const html = await response.text();

    return html.includes(rendererSignature);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const writeRendererMarker = (portToWrite) => {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        port: portToWrite,
        url: `http://127.0.0.1:${portToWrite}`,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
};

const findRendererPort = async () => {
  for (let candidate = defaultPort; candidate <= maxPort; candidate += 1) {
    if (await hasCosicRenderer(candidate)) {
      return { port: candidate, isAlreadyRunning: true };
    }

    if (!(await hasPort(candidate))) {
      return { port: candidate, isAlreadyRunning: false };
    }
  }

  throw new Error(`No available Vite port between ${defaultPort} and ${maxPort}.`);
};

const { port, isAlreadyRunning } = await findRendererPort();
writeRendererMarker(port);

if (isAlreadyRunning) {
  console.log(`[dev:renderer] Cosic Vite already listening on ${port}.`);
  setInterval(() => {}, 60_000);
} else {
  if (port !== defaultPort) {
    console.log(`[dev:renderer] Port ${defaultPort} is occupied by another app; starting Cosic Vite on ${port}.`);
  } else {
    console.log(`[dev:renderer] Starting Vite on ${port}.`);
  }

  const child = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
    windowsHide: false
  });

  const stop = () => {
    if (child.pid && !child.killed) child.kill();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('exit', (code) => process.exit(code ?? 0));
}
