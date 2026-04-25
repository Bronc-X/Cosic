import fs from 'node:fs';
import assert from 'node:assert/strict';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const adapterSource = fs.readFileSync('src/main/bridge/adapters/local-music-bridge.ts', 'utf8');

const files = packageJson.build?.files ?? [];
const asarUnpack = packageJson.build?.asarUnpack ?? [];
const winConfig = packageJson.build?.win ?? {};
const winTargets = Array.isArray(winConfig.target) ? winConfig.target : [winConfig.target].filter(Boolean);

assert.ok(files.includes('local-bridge/**'), 'packaged app must include the local bridge script');
assert.ok(files.includes('tools/**'), 'packaged app must include bundled helper tools');
assert.ok(asarUnpack.includes('local-bridge/**'), 'local bridge must be unpacked so a child runtime can execute it');
assert.ok(asarUnpack.includes('tools/**'), 'helper tools must be unpacked so the bridge can execute them');
assert.equal(winConfig.signAndEditExecutable, false, 'default Windows package must not require winCodeSign symlink extraction');
assert.deepEqual(winTargets, ['zip'], 'default Windows package must use zip only in this environment');
assert.match(adapterSource, /ELECTRON_RUN_AS_NODE/, 'packaged bridge boot must use the Electron runtime as Node');
assert.match(adapterSource, /NODE_PATH/, 'packaged bridge boot must expose app.asar node_modules to the child runtime');
assert.doesNotMatch(adapterSource, /spawn\('node'/, 'bridge boot must not depend on a system node executable');

console.log('package config smoke passed');
