import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync('src/renderer/App.tsx', 'utf8');
const curatorSource = fs.readFileSync('src/renderer/components/CuratorPanel.tsx', 'utf8');
const playbackSource = fs.readFileSync('src/renderer/components/PlaybackDeck.tsx', 'utf8');
const llmSource = fs.readFileSync('src/main/bridge/adapters/openai-compatible-llm.ts', 'utf8');
const cssSource = fs.readFileSync('src/renderer/styles/index.css', 'utf8');

assert.match(appSource, /generateTrackInsight/, 'renderer must request a per-track liner note');
assert.match(playbackSource, /trackInsight/, 'playback deck must accept track insight copy');
assert.match(playbackSource, /deck-liner-note/, 'playback deck must render a dedicated track liner note');
assert.match(curatorSource, /visibleMessages/, 'chat console must limit visible narration');
assert.doesNotMatch(
  llmSource,
  /Mention only the factors|mechanically list every factor/,
  'curation prompt must not encourage visible reasoning-style factor narration'
);
assert.match(cssSource, /is-dense/, 'playback deck must have a dense mode for short windows');
assert.match(cssSource, /max-height:\s*980px/, 'short-window CSS must protect the player from overlap');

console.log('ui copy/layout smoke passed');
