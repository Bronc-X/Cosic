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
assert.match(appSource, /<TitleBar[\s\S]*<\/TitleBar>|<TitleBar[\s\S]*\/>[\s\S]*<DailyBriefPanel[\s\S]*<section className=\{`experience-grid/, 'weather widget must render before the main experience grid');
assert.match(leftStackSource, /<QueueRail/, 'left column must keep the playlist rail in the main flow');
assert.doesNotMatch(leftStackSource, /DailyBriefPanel/, 'weather must not sit in the left column main flow');
assert.match(appSource, /left-console-stack/, 'left column must own player and playlist buttons');
assert.match(curatorSource, /chatgpt-chat-shell/, 'right-side chat must use a ChatGPT-like conversation shell');
assert.match(curatorSource, /curator-playlist-zone/, 'right panel top must be a playlist zone');
assert.doesNotMatch(curatorSource, /daily-brief-card/, 'daily brief must not remain in the right chat panel');
assert.doesNotMatch(queueRailSource, /queue-list/, 'left rail must not render full track detail list');
assert.match(queueRailSource, /playlist-button-grid/, 'left rail must render playlist buttons');
assert.match(cssSource, /grid-template-rows:\s*minmax\(0,\s*0\.56fr\)\s+minmax\(0,\s*0\.44fr\)/, 'right panel must split playlist and chat vertically');
assert.match(cssSource, /experience-grid\.mode-regular\s*\{[\s\S]*grid-template-columns:\s*minmax\(420px,\s*0\.86fr\)\s+minmax\(560px,\s*1\.14fr\)/, 'regular layout must keep player and chat balanced while weather stays secondary');
assert.match(cssSource, /left-console-stack\s*\{[\s\S]*grid-template-rows:\s*minmax\(360px,\s*0\.58fr\)\s+minmax\(230px,\s*0\.42fr\)/, 'left column must reserve enough player space without creating a giant blank deck');
assert.match(cssSource, /weather-live-card[\s\S]*position:\s*fixed[\s\S]*right:\s*24px/, 'expanded weather detail must overlay from the right instead of consuming player layout space');

console.log('layout composition smoke passed');
