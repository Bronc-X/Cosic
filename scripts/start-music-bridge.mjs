import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();

const readEnv = () => {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
};

const hasPort = (port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
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

readEnv();

const port = (() => {
  try {
    return Number(new URL(process.env.COSIC_MUSIC_BASE_URL || 'http://127.0.0.1:7878').port || 7878);
  } catch {
    return 7878;
  }
})();

if (await hasPort(port)) {
  console.log(`[music:bridge] Music bridge already listening on ${port}.`);
  setInterval(() => {}, 60_000);
} else {
  const script = path.join(root, 'local-bridge', 'music-bridge.mjs');
  if (!fs.existsSync(script)) {
    throw new Error(`Missing music bridge script: ${script}`);
  }

  console.log(`[music:bridge] Starting music bridge on ${port}.`);
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false
  });

  fs.writeFileSync(path.join(root, '.cosic-music-bridge.pid'), String(child.pid ?? ''), 'utf8');

  const stop = () => {
    if (child.pid && !child.killed) child.kill();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('exit', (code) => process.exit(code ?? 0));
}
