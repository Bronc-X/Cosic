import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const executable = require.resolve('electron-builder/cli.js');

const child = spawn(process.execPath, [executable, '--publish', 'never'], {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
    ELECTRON_BUILDER_BINARIES_MIRROR:
      process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
      'https://npmmirror.com/mirrors/electron-builder-binaries/'
  }
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`electron-builder exited by signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
