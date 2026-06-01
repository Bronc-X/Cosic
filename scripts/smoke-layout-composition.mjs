import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync('src/renderer/App.tsx', 'utf8');
const curatorSource = fs.readFileSync('src/renderer/components/CuratorPanel.tsx', 'utf8');
const queueRailSource = fs.readFileSync('src/renderer/components/QueueRail.tsx', 'utf8');
const cssSource = fs.readFileSync('src/renderer/styles/index.css', 'utf8');
const leftStackStart = appSource.indexOf('const leftConsoleStack = (');
const leftStackEnd = appSource.indexOf('  return (', leftStackStart);
const leftStackSource = appSource.slice(leftStackStart, leftStackEnd);

assert.match(appSource, /DailyBriefPanel/, 'daily brief must be composed as the weather widget');
assert.match(appSource, /<TitleBar[\s\S]*weatherControl=\{[\s\S]*<DailyBriefPanel/, 'weather widget must render inside the titlebar control slot');
assert.match(leftStackSource, /<QueueRail/, 'left column must keep the playlist rail in the main flow');
assert.doesNotMatch(leftStackSource, /DailyBriefPanel/, 'weather must not sit in the left column main flow');
assert.match(appSource, /left-console-stack/, 'left column must own player and playlist buttons');
assert.match(curatorSource, /chatgpt-chat-shell/, 'right-side chat must use a ChatGPT-like conversation shell');
assert.match(curatorSource, /is-agent-stream/, 'right panel must be a full-height agent stream');
assert.match(curatorSource, /agentSnapshot[\s\S]*agent-conversation-frame[\s\S]*chatgpt-composer[\s\S]*Quick Requests/, 'right panel must use real session state, a unified conversation frame, and bottom quick requests');
assert.doesNotMatch(curatorSource, /curator-playlist-zone|playlist-preview-list|classical-coverage-panel/, 'right panel must not keep playlist management surfaces');
assert.doesNotMatch(curatorSource, /daily-brief-card/, 'daily brief must not remain in the right chat panel');
assert.match(queueRailSource, /queue-rail-tabs[\s\S]*playlist-preview-list[\s\S]*playlist-button-grid/, 'left rail must switch between current queue and random playlists');
assert.match(cssSource, /titlebar-weather-slot[\s\S]*weather-cinema-panel[\s\S]*position:\s*relative/, 'weather control must live in the titlebar instead of a floating top-right slot');
assert.match(cssSource, /chatgpt-chat-shell\.is-agent-stream[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/, 'right panel must dedicate its main area to a unified agent conversation frame');
assert.match(cssSource, /agent-conversation-frame[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/, 'chat messages and composer must share one visual container');
assert.match(cssSource, /experience-grid\.mode-regular\s*\{[\s\S]*grid-template-columns:\s*minmax\(420px,\s*0\.86fr\)\s+minmax\(560px,\s*1\.14fr\)/, 'regular layout must keep player and chat balanced while weather stays secondary');
assert.match(cssSource, /left-console-stack\s*\{[\s\S]*grid-template-rows:\s*minmax\(360px,\s*0\.58fr\)\s+minmax\(230px,\s*0\.42fr\)/, 'left column must reserve enough player space without creating a giant blank deck');
assert.match(cssSource, /weather-live-card[\s\S]*position:\s*fixed[\s\S]*right:\s*24px/, 'expanded weather detail must overlay from the right instead of consuming player layout space');

console.log('layout composition smoke passed');
