import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const runtime = process.env.COSIC_COSYVOICE_RUNTIME_DIR || 'D:\\CosyVoiceRuntime';
const repo = process.env.COSIC_COSYVOICE_REPO_DIR || path.resolve(root, '..', 'CosyVoice');

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

const firstExisting = (label, candidates) => {
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error(`Missing ${label}: ${candidates.filter(Boolean).join(', ')}`);
  return found;
};

readEnv();

const port = (() => {
  try {
    return Number(new URL(process.env.COSIC_VOICE_BASE_URL || 'http://127.0.0.1:50000').port || 50000);
  } catch {
    return 50000;
  }
})();

if (await hasPort(port)) {
  console.log(`[voice:cosy] CosyVoice already listening on ${port}.`);
  setInterval(() => {}, 60_000);
} else {
  const python = firstExisting('CosyVoice python', [
    process.env.COSIC_COSYVOICE_PYTHON,
    path.join(runtime, 'env', 'python.exe'),
    path.join(runtime, 'env', 'Scripts', 'python.exe')
  ]);
  const server = firstExisting('CosyVoice server.py', [
    process.env.COSIC_COSYVOICE_SERVER,
    path.join(repo, 'runtime', 'python', 'fastapi', 'server.py')
  ]);
  const model = firstExisting('CosyVoice model', [
    process.env.COSIC_COSYVOICE_MODEL_DIR,
    path.join(runtime, 'models', 'CosyVoice-300M-SFT'),
    path.join(repo, 'pretrained_models', 'CosyVoice-300M-SFT')
  ]);
  const env = {
    ...process.env,
    HF_HOME: process.env.HF_HOME || path.join(runtime, 'hf-cache'),
    MODELSCOPE_CACHE: process.env.MODELSCOPE_CACHE || path.join(runtime, 'modelscope-cache'),
    TORCH_HOME: process.env.TORCH_HOME || path.join(runtime, 'torch-cache')
  };

  console.log(`[voice:cosy] Starting CosyVoice on ${port}.`);
  const child = spawn(python, [server, '--port', String(port), '--model_dir', model], {
    cwd: repo,
    env,
    stdio: 'inherit',
    windowsHide: false
  });
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(path.join(runtime, 'cosyvoice-server.pid'), String(child.pid ?? ''), 'utf8');

  const stop = () => {
    if (child.pid && !child.killed) child.kill();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('exit', (code) => process.exit(code ?? 0));
}
