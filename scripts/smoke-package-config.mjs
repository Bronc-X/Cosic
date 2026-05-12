import fs from 'node:fs';
import assert from 'node:assert/strict';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const adapterSource = fs.readFileSync('src/main/bridge/adapters/local-music-bridge.ts', 'utf8');
const electronAppLauncherSource = fs.readFileSync('scripts/start-electron-app.mjs', 'utf8');
const readmeSource = fs.readFileSync('README.md', 'utf8');
const startupManualSource = fs.readFileSync('docs/startup-manual.md', 'utf8');
const githubSecretsSource = fs.readFileSync('docs/github-secrets-and-certificates.md', 'utf8');
const gitignoreSource = fs.readFileSync('.gitignore', 'utf8');
const ciWorkflowSource = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const releaseWorkflowSource = fs.readFileSync('.github/workflows/release.yml', 'utf8');

const files = packageJson.build?.files ?? [];
const asarUnpack = packageJson.build?.asarUnpack ?? [];
const winConfig = packageJson.build?.win ?? {};
const winTargets = Array.isArray(winConfig.target) ? winConfig.target : [winConfig.target].filter(Boolean);
const scripts = packageJson.scripts ?? {};

assert.ok(files.includes('local-bridge/**'), 'packaged app must include the local bridge script');
assert.ok(files.includes('tools/**'), 'packaged app must include bundled helper tools');
assert.ok(asarUnpack.includes('local-bridge/**'), 'local bridge must be unpacked so a child runtime can execute it');
assert.ok(asarUnpack.includes('tools/**'), 'helper tools must be unpacked so the bridge can execute them');
assert.equal(winConfig.signAndEditExecutable, false, 'default Windows package must not require winCodeSign symlink extraction');
assert.deepEqual(winTargets, ['zip'], 'default Windows package must use zip only in this environment');
assert.match(adapterSource, /ELECTRON_RUN_AS_NODE/, 'packaged bridge boot must use the Electron runtime as Node');
assert.match(adapterSource, /REQUEST_TIMEOUT_MS = 12_000/, 'music bridge requests must allow upstream fallback checks enough time to finish');
assert.match(adapterSource, /NODE_PATH/, 'packaged bridge boot must expose app.asar node_modules to the child runtime');
assert.doesNotMatch(adapterSource, /spawn\('node'/, 'bridge boot must not depend on a system node executable');
assert.match(scripts['test:llm-json-repair'] ?? '', /build:electron[\s\S]*smoke-llm-json-repair/, 'LLM JSON repair smoke must rebuild electron output before checking parser behavior');
assert.match(scripts['test:smoke'] ?? '', /test:llm-json-repair/, 'aggregate smoke command must include LLM JSON repair coverage');
assert.match(scripts.verify ?? '', /typecheck[\s\S]*test:smoke/, 'verify command must gate typecheck and smoke tests together');
assert.match(scripts.dev ?? '', /llm:ollama[\s\S]*voice:cosy[\s\S]*dev:renderer[\s\S]*dev:electron[\s\S]*dev:app/, 'default dev must start local Ollama, CosyVoice, and the Cosic dev stack');
assert.match(scripts['dev:all'] ?? '', /music:bridge[\s\S]*npm:dev/, 'dev:all must start the music bridge and the default Cosic dev stack');
assert.match(scripts['llm:ollama'] ?? '', /start-ollama\.mjs/, 'llm:ollama must use the local Ollama launcher');
assert.match(scripts['voice:cosy'] ?? '', /start-cosyvoice\.mjs/, 'voice:cosy must use the local CosyVoice launcher');
assert.match(scripts['music:bridge'] ?? '', /start-music-bridge\.mjs/, 'music:bridge must use the local music bridge launcher');
assert.match(scripts['dev:renderer'] ?? '', /start-vite-renderer\.mjs/, 'dev renderer must tolerate an already-running Vite port');
assert.match(scripts['dev:app'] ?? '', /start-electron-app\.mjs/, 'Electron app startup must use the env-aware launcher');
assert.match(
  electronAppLauncherSource,
  /skipping tcp:11434 wait/,
  'Electron app startup must not wait for local Ollama when the LLM base URL is remote'
);
assert.match(
  electronAppLauncherSource,
  /resources\.unshift\('tcp:11434'\)/,
  'Electron app startup must still wait for local Ollama when configured'
);
assert.ok(fs.existsSync('scripts/start-ollama.mjs'), 'Ollama launcher must exist for one-command dev startup');
assert.ok(fs.existsSync('scripts/start-cosyvoice.mjs'), 'CosyVoice launcher must exist for one-command dev startup');
assert.ok(fs.existsSync('scripts/start-music-bridge.mjs'), 'music bridge launcher must exist for one-command dev startup');
assert.ok(fs.existsSync('scripts/start-vite-renderer.mjs'), 'Vite renderer launcher must exist for one-command dev startup');
assert.ok(fs.existsSync('scripts/start-electron-app.mjs'), 'Electron app launcher must exist for one-command dev startup');
assert.match(readmeSource, /npm run dev:all/, 'README must document the one-command startup path');
assert.match(readmeSource, /Classical Scores[\s\S]*resolve-classical-scores\.mjs/, 'README must explain classical score caching');
assert.match(startupManualSource, /Copy-Item \.env\.example \.env\.local/, 'startup manual must include Windows PowerShell setup');
assert.match(startupManualSource, /npm run typecheck[\s\S]*npm run test:smoke[\s\S]*npm run build/, 'startup manual must include the verification path');
assert.match(githubSecretsSource, /WINDOWS_CERTIFICATE_BASE64[\s\S]*MACOS_CERTIFICATE_BASE64/, 'certificate guide must define signing secret names');
assert.match(githubSecretsSource, /Never print secret values|Never commit/, 'certificate guide must make secret handling explicit');
assert.match(gitignoreSource, /\*\.p12[\s\S]*\*\.pfx[\s\S]*\*\.pem[\s\S]*\*\.key/, 'gitignore must exclude private signing material');
assert.match(gitignoreSource, /\.env\.local[\s\S]*\.env\.\*\.local/, 'gitignore must exclude local environment files');
assert.match(ciWorkflowSource, /npm ci[\s\S]*npm run typecheck[\s\S]*npm run test:smoke[\s\S]*npm run build/, 'GitHub CI must verify install, typecheck, smoke, and build');
assert.match(releaseWorkflowSource, /workflow_dispatch[\s\S]*WINDOWS_CERTIFICATE_BASE64[\s\S]*CSC_LINK[\s\S]*upload-artifact/, 'release workflow must support secret-backed Windows packaging artifacts');

console.log('package config smoke passed');
