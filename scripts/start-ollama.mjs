import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const root = process.cwd();
const pidFile = path.join(root, '.ollama-local.pid');

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const listModels = async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) throw new Error(`Ollama tags check failed: HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.models) ? payload.models.map((model) => model?.name).filter(Boolean) : [];
};

const findOllamaExe = () => {
  const candidates = [
    process.env.COSIC_OLLAMA_EXE,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
    'ollama'
  ].filter(Boolean);

  return candidates.find((candidate) => candidate === 'ollama' || fs.existsSync(candidate));
};

const stopExistingOllama = () => {
  if (process.platform !== 'win32') return;
  for (const imageName of ['ollama app.exe', 'ollama.exe']) {
    try {
      execFileSync('taskkill', ['/IM', imageName, '/F', '/T'], { stdio: 'ignore' });
    } catch {
      // The process is not running.
    }
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

if (!isLocalOllama) {
  console.log('[llm:ollama] LLM base URL is not local Ollama; skipping local server startup.');
  setInterval(() => {}, 60_000);
} else {
  const baseUrl = 'http://127.0.0.1:11434';
  const model = process.env.COSIC_LLM_MODEL || 'qwen2.5:7b';
  const modelsDir = process.env.COSIC_OLLAMA_MODELS_DIR || process.env.OLLAMA_MODELS || 'D:\\Ollama\\models';
  const allowRestart = process.env.COSIC_OLLAMA_ALLOW_RESTART !== 'false';

  const verifyModel = async () => {
    if (!(await hasPort(11434))) return false;
    const models = await listModels(baseUrl);
    return models.includes(model);
  };

  let modelReady = false;
  try {
    modelReady = await verifyModel();
  } catch {
    modelReady = false;
  }

  if (modelReady) {
    console.log(`[llm:ollama] Ollama already serving ${model} on 11434.`);
    setInterval(() => {}, 60_000);
  } else {
    if (await hasPort(11434)) {
      if (!allowRestart) {
        throw new Error(
          `[llm:ollama] Ollama is listening on 11434 but cannot see ${model}. Set COSIC_OLLAMA_ALLOW_RESTART=true or stop the existing Ollama process.`
        );
      }
      console.log(`[llm:ollama] Restarting Ollama so it uses models from ${modelsDir}.`);
      stopExistingOllama();
      await sleep(1200);
    }

    const ollamaExe = findOllamaExe();
    if (!ollamaExe) {
      throw new Error('Missing Ollama executable. Install Ollama or set COSIC_OLLAMA_EXE.');
    }
    if (!fs.existsSync(modelsDir)) {
      throw new Error(`Missing Ollama models directory: ${modelsDir}`);
    }

    console.log(`[llm:ollama] Starting Ollama on 11434 with OLLAMA_MODELS=${modelsDir}.`);
    const child = spawn(ollamaExe, ['serve'], {
      cwd: root,
      env: {
        ...process.env,
        OLLAMA_MODELS: modelsDir
      },
      stdio: 'inherit',
      windowsHide: true
    });
    fs.writeFileSync(pidFile, String(child.pid ?? ''), 'utf8');

    for (let attempt = 0; attempt < 45; attempt += 1) {
      try {
        if (await verifyModel()) break;
      } catch {
        // Keep waiting while the server boots.
      }
      await sleep(1000);
    }

    if (!(await verifyModel())) {
      throw new Error(`[llm:ollama] Ollama started, but ${model} is not visible in ${modelsDir}.`);
    }

    const stop = () => {
      if (child.pid && !child.killed) child.kill();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    child.once('exit', (code) => process.exit(code ?? 0));
  }
}
