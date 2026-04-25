import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync('src/renderer/App.tsx', 'utf8');
const curatorSource = fs.readFileSync('src/renderer/components/CuratorPanel.tsx', 'utf8');
const queueRailSource = fs.readFileSync('src/renderer/components/QueueRail.tsx', 'utf8');
const cssSource = fs.readFileSync('src/renderer/styles/index.css', 'utf8');

assert.match(appSource, /DailyBriefPanel/, 'daily brief must be composed in the left column');
assert.match(appSource, /left-console-stack/, 'left column must own player, clock, and playlist buttons');
assert.match(curatorSource, /chatgpt-chat-shell/, 'right-side chat must use a ChatGPT-like conversation shell');
assert.match(curatorSource, /curator-playlist-zone/, 'right panel top must be a playlist zone');
assert.doesNotMatch(curatorSource, /daily-brief-card/, 'daily brief must not remain in the right chat panel');
assert.doesNotMatch(queueRailSource, /queue-list/, 'left rail must not render full track detail list');
assert.match(queueRailSource, /playlist-button-grid/, 'left rail must render playlist buttons');
assert.match(cssSource, /grid-template-rows:\s*minmax\(0,\s*0\.56fr\)\s+minmax\(0,\s*0\.44fr\)/, 'right panel must split playlist and chat vertically');

console.log('layout composition smoke passed');
