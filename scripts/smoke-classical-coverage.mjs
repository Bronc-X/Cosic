import assert from 'node:assert/strict';
import fs from 'node:fs';

const catalogSource = fs.readFileSync('src/shared/classical/catalog.ts', 'utf8');
const matcherSource = fs.readFileSync('src/shared/classical/match.ts', 'utf8');
const bridgeSource = fs.readFileSync('src/main/bridge/bridge-service.ts', 'utf8');
const musicBridgeSource = fs.readFileSync('local-bridge/music-bridge.mjs', 'utf8');
const playbackSource = fs.readFileSync('src/renderer/components/PlaybackDeck.tsx', 'utf8');
const resolverSource = fs.readFileSync('scripts/resolve-classical-scores.mjs', 'utf8');

assert.match(
  catalogSource,
  /id:\s*'beethoven-moonlight-op27-no2'[\s\S]*'piano'[\s\S]*'original'[\s\S]*'preferred'/,
  'Beethoven Moonlight must be covered by its preferred original piano score'
);
assert.doesNotMatch(
  catalogSource,
  /id:\s*'beethoven-moonlight-op27-no2'[\s\S]*'violin'[\s\S]*id:\s*'debussy-clair-de-lune'/,
  'Beethoven Moonlight must not require a violin arrangement to be covered'
);
assert.match(
  catalogSource,
  /id:\s*'debussy-clair-de-lune'[\s\S]*'piano'[\s\S]*'original'[\s\S]*'preferred'/,
  'Debussy Clair de lune must be covered by its preferred original piano score'
);
assert.doesNotMatch(
  catalogSource,
  /id:\s*'debussy-clair-de-lune'[\s\S]*'violin'[\s\S]*id:\s*'mozart-eine-kleine-nachtmusik-k525'/,
  'Debussy Clair de lune must not require a violin arrangement to be covered'
);
assert.match(
  catalogSource,
  /id:\s*'chopin-nocturne-op9-no2'[\s\S]*'piano'[\s\S]*'original'[\s\S]*'preferred'[\s\S]*'violin'[\s\S]*'arrangement'[\s\S]*'optional'/,
  'Chopin Nocturne must model original piano score first and violin arrangement as optional'
);
assert.ok(
  matcherSource.includes("normalizeText([track.title, track.artist, track.album].join(' '))"),
  'catalog matching must use intrinsic track metadata'
);
assert.doesNotMatch(
  matcherSource,
  /const buildCatalogMatchText = \(track\)[\s\S]*track\.mood|const buildCatalogMatchText = \(track\)[\s\S]*track\.tags/,
  'catalog matching must not use playlist tags because they can create false score matches'
);
assert.match(
  matcherSource,
  /const hasPreferredSource = entry\.scores\.some\(isPreferredOriginalOrFullScore\)/,
  'coverage must be driven by preferred original or authoritative full-score sources'
);
assert.match(
  matcherSource,
  /score\.role === 'original' \|\| score\.role === 'authoritative_full_score'/,
  'preferred coverage must not treat optional arrangements as complete coverage'
);
assert.match(
  matcherSource,
  /isDirectScorePage/,
  'coverage must distinguish direct score pages from source listing pages'
);
assert.match(
  matcherSource,
  /status:\s*'covered'[\s\S]*hasPreferredSource/,
  'preferred score sources must mark a classical work covered'
);
assert.match(
  matcherSource,
  /missingReason:\s*'no_legal_source'/,
  'matched works without reliable legal score sources must remain explicitly missing'
);
assert.match(
  bridgeSource,
  /missingReason:\s*'no_catalog_match'/,
  'coverage report must distinguish heuristic classical-like tracks with no catalog match'
);
assert.match(
  bridgeSource,
  /getScoreManifest/,
  'bridge service must load the local score manifest for runtime score embedding'
);
assert.match(
  bridgeSource,
  /getPublicScoreUrl\(manifestScore\.localUrl\)/,
  'cached score manifest URLs must be converted to public music bridge URLs'
);
assert.ok(
  musicBridgeSource.includes("pathname.match(/^\\/scores\\/([^/]+)\\/([^/]+\\.pdf)$/i)"),
  'music bridge must expose cached PDF scores through a .pdf endpoint'
);
assert.match(
  musicBridgeSource,
  /resolveScorePdfPath[\s\S]*startsWith\(`\$\{root\}\$\{path\.sep\}`\)/,
  'cached score endpoint must guard against path traversal'
);
assert.match(
  musicBridgeSource,
  /Content-Type': 'application\/pdf'/,
  'cached score endpoint must serve PDFs with the correct content type'
);
assert.match(
  musicBridgeSource,
  /Accept-Ranges': 'bytes'/,
  'cached score endpoint must advertise byte ranges for PDF readers'
);
assert.match(
  resolverSource,
  /toScoreLocalUrl/,
  'resolver manifest must include local score URLs for the Reader'
);
assert.match(
  resolverSource,
  /isPdfBuffer/,
  'resolver must validate PDF bytes before writing cached score files'
);
assert.doesNotMatch(
  catalogSource,
  /pages:\s*\[[^\]]*https:\/\/imslp\.org\/wiki/,
  'IMSLP work pages must live in sourceUrl, not pages that the Reader tries to render'
);
assert.match(
  catalogSource,
  /id:\s*'bach-well-tempered-clavier-book-1'/,
  'user playlist Bach WTC tracks must have a catalog-level score source'
);
assert.match(
  playbackSource,
  /deck-classical-source-link/,
  'Reader must offer a source link when a trusted score source is not directly embeddable'
);
assert.match(
  playbackSource,
  /isClassicalTrack \? '谱面' : '歌词'/,
  'classical tracks must open the score reader through a score-specific control label'
);

console.log('classical coverage smoke passed');
