import net from 'node:net';
import { spawn } from 'node:child_process';

const port = 5173;

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

if (await hasPort(port)) {
  console.log(`[dev:renderer] Vite already listening on ${port}.`);
  setInterval(() => {}, 60_000);
} else {
  console.log(`[dev:renderer] Starting Vite on ${port}.`);
  const child = spawn('vite --host 127.0.0.1 --port 5173', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: true,
    windowsHide: false
  });

  const stop = () => {
    if (child.pid && !child.killed) child.kill();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('exit', (code) => process.exit(code ?? 0));
}
