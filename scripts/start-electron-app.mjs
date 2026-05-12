import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import waitOn from 'wait-on';

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

const readPort = (value, fallback) => {
  try {
    return Number(new URL(value).port || fallback);
  } catch {
    return fallback;
  }
};

readEnv();

const llmUrl = (() => {
  try {
    return new URL(process.env.COSIC_LLM_BASE_URL || 'http://127.0.0.1:11434/v1');
  } catch {
    return null;
  }
})();

const isLocalOllama =
  llmUrl &&
  ['127.0.0.1', 'localhost', '::1'].includes(llmUrl.hostname) &&
  (llmUrl.port || '11434') === '11434';

const voicePort = readPort(process.env.COSIC_VOICE_BASE_URL || 'http://127.0.0.1:50000', 50000);
const resources = ['tcp:5173', `tcp:${voicePort}`, 'file:dist-electron/electron/main.js'];

if (isLocalOllama) {
  resources.unshift('tcp:11434');
} else {
  console.log('[dev:app] LLM base URL is not local Ollama; skipping tcp:11434 wait.');
}

console.log(`[dev:app] Waiting for ${resources.join(', ')}.`);
await waitOn({
  resources
});

console.log('[dev:app] Starting Electron.');
const child = spawn('electron .', {
  cwd: root,
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
