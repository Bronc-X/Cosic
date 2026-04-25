import assert from 'node:assert/strict';
import fs from 'node:fs';

const playbackSource = fs.readFileSync('src/renderer/components/PlaybackDeck.tsx', 'utf8');
const curatorSource = fs.readFileSync('src/renderer/components/CuratorPanel.tsx', 'utf8');
const appSource = fs.readFileSync('src/renderer/App.tsx', 'utf8');
const bridgeSource = fs.readFileSync('src/main/bridge/bridge-service.ts', 'utf8');

assert.doesNotMatch(playbackSource, /deck-fact-grid/, 'playback deck must not render redundant source/elapsed/duration/volume cards');
assert.doesNotMatch(playbackSource, /deck-live-pill/, 'playback deck must not render redundant idle/session pills');
assert.match(playbackSource, /speechSynthesis/, 'track note must support local TTS playback');
assert.match(playbackSource, /resumePlaybackAfterSpeech/, 'TTS must resume music after narration when it paused playback');
assert.doesNotMatch(playbackSource, /-webkit-line-clamp:\s*[123]/, 'track liner note must not be visually clamped in component styles');

assert.match(curatorSource, /visibleMessages/, 'right panel must remain a minimal chat surface');
assert.match(curatorSource, /recommended-playlist-card/, 'right panel must expose recommended playlist cards');
assert.doesNotMatch(curatorSource, /settings-rail|COSIC_LLM_BASE_URL|COSIC_LLM_API_KEY/, 'right panel must not surface setup instructions as visible copy');

assert.match(appSource, /setInterval/, 'daily clock must update without refreshing the window');
assert.match(appSource, /currentClock/, 'clock state must be separate from one-time daily brief data');

assert.doesNotMatch(
  bridgeSource,
  /mockAdapter\.generateCuratedPlaylist/,
  'AI curation must not fall back to mock playlists'
);
assert.match(bridgeSource, /LLM env is required/, 'AI curation must fail visibly when LLM config is missing');

console.log('ai/ui contract smoke passed');
