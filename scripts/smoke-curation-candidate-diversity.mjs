import assert from 'node:assert/strict';

import bridgeServiceModule from '../dist-electron/src/main/bridge/bridge-service.js';

const { diversifyCurationCandidates } = bridgeServiceModule;

const makeTrack = (id) => ({
  id,
  title: `Track ${id}`,
  artist: `Artist ${id}`,
  album: `Album ${id}`,
  duration: 180,
  year: '2024',
  coverUrl: '',
  source: '',
  mood: 'neutral',
  tags: []
});

assert.equal(
  typeof diversifyCurationCandidates,
  'function',
  'bridge service must expose curation candidate diversification'
);

const tracks = Array.from({ length: 12 }, (_, index) => makeTrack(String(index + 1)));
const randomValues = [0.99, 0.01, 0.87, 0.12, 0.74, 0.23, 0.61, 0.34, 0.52, 0.45, 0.4, 0.3];
const diversified = diversifyCurationCandidates(tracks, () => randomValues.shift() ?? 0.5);

assert.equal(diversified.length, tracks.length, 'diversification must not drop candidates');
assert.deepEqual(
  new Set(diversified.map((track) => track.id)),
  new Set(tracks.map((track) => track.id)),
  'diversification must preserve the candidate set'
);
assert.notEqual(
  diversified[0]?.id,
  tracks[0]?.id,
  'LLM candidate aliases must not pin the same library track to track-1 every time'
);

console.log('curation candidate diversity smoke passed');
