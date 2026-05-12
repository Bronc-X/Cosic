import assert from 'node:assert/strict';
import fs from 'node:fs';

const playbackSource = fs.readFileSync('src/renderer/components/PlaybackDeck.tsx', 'utf8');
const curatorSource = fs.readFileSync('src/renderer/components/CuratorPanel.tsx', 'utf8');
const appSource = fs.readFileSync('src/renderer/App.tsx', 'utf8');
const bridgeSource = fs.readFileSync('src/main/bridge/bridge-service.ts', 'utf8');
const contractSource = fs.readFileSync('src/shared/contracts/bridge.ts', 'utf8');
const llmSource = fs.readFileSync('src/main/bridge/adapters/openai-compatible-llm.ts', 'utf8');
const mockAdapterSource = fs.readFileSync('src/main/bridge/adapters/mock-adapter.ts', 'utf8');
const voiceAdapterSource = fs.readFileSync('src/main/bridge/adapters/cosyvoice-adapter.ts', 'utf8');
const preloadSource = fs.readFileSync('electron/preload.ts', 'utf8');
const mainSource = fs.readFileSync('electron/main.ts', 'utf8');
const classicalCatalogSource = fs.readFileSync('src/shared/classical/catalog.ts', 'utf8');
const classicalMatcherSource = fs.readFileSync('src/shared/classical/match.ts', 'utf8');
const classicalNotesSource = fs.readFileSync('src/shared/classical/notes.ts', 'utf8');
const localTrackNotesSource = fs.readFileSync('src/shared/track-notes.ts', 'utf8');
const trackNoteSource = `${playbackSource}\n${mockAdapterSource}\n${localTrackNotesSource}`;
const userFacingEditorialSource = [
  localTrackNotesSource,
  classicalCatalogSource,
  classicalNotesSource,
  bridgeSource
].join('\n');

assert.doesNotMatch(playbackSource, /deck-fact-grid/, 'playback deck must not render redundant source/elapsed/duration/volume cards');
assert.doesNotMatch(playbackSource, /deck-live-pill/, 'playback deck must not render redundant idle/session pills');
assert.match(playbackSource, /generateNarrationAudio/, 'track note narration must prefer bridge-generated voice audio');
assert.doesNotMatch(playbackSource, /speechSynthesis|SpeechSynthesisUtterance/, 'track note narration must not fall back to system TTS');
assert.match(playbackSource, /resumePlaybackAfterSpeech/, 'TTS must resume music after narration when it paused playback');
assert.match(playbackSource, /narrationPrewarmKeyRef[\s\S]*generateNarrationAudio\(linerNote\)/, 'track note narration should prewarm the current CosyVoice audio');
assert.doesNotMatch(playbackSource, /-webkit-line-clamp:\s*[123]/, 'track liner note must not be visually clamped in component styles');
assert.match(contractSource, /NarrationAudio[\s\S]*generateNarrationAudio/, 'CosyVoice narration must have a bridge contract');
assert.match(preloadSource, /cosic:generate-narration-audio/, 'preload must expose narration audio IPC');
assert.match(mainSource, /generateNarrationAudio/, 'Electron main must route narration audio requests to the bridge');
assert.match(voiceAdapterSource, /CosyVoiceAdapter[\s\S]*inference_sft[\s\S]*audioBase64/, 'CosyVoice adapter must call the local FastAPI service and return wav base64');
assert.match(voiceAdapterSource, /narrationCache[\s\S]*requestNarrationAudio/, 'CosyVoice adapter must cache and coalesce repeated narration requests');

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
assert.match(contractSource, /chatHistory/, 'curation requests must carry chat history into the bridge contract');
assert.match(appSource, /chatHistory/, 'renderer chat submissions must pass conversation history into curation');
assert.match(bridgeSource, /chatHistory/, 'bridge curation must forward conversation history to the LLM adapter');
assert.match(
  bridgeSource,
  /typeof message === 'object'[\s\S]*message\.role === 'assistant'[\s\S]*typeof message\.text === 'string'/,
  'bridge must sanitize malformed chat history items before reading role/text'
);
assert.match(
  llmSource,
  /conversation[\s\S]*semanticTags[\s\S]*inferredSonicFingerprint/,
  'playlist curation must ask the LLM to analyze chat, tag candidates, and infer sonic fingerprints'
);
assert.match(
  llmSource,
  /背景锚点[\s\S]*声音细节[\s\S]*克制/,
  'track notes must require a concrete song background anchor, audible detail, and a restrained closing feeling'
);
assert.doesNotMatch(
  trackNoteSource,
  /带着[^。；\n]*底色|适合先把注意力|接管房间|不是[^。；\n]*而是|不再是|不是资料栏|进入世界的坐标|放得很稳|摊在桌面|终于能|我经历过|所以我仍然|真正动人的地方|哲学问题|无法解释的心事|可停靠的形状/,
  'local and mock track-note fallbacks must never use flattened AI essay phrases'
);
assert.doesNotMatch(
  userFacingEditorialSource,
  /不是[^。；\n]{0,36}而是|不是资料栏|进入世界的坐标|放得很稳|摊在桌面|终于能|我经历过|所以我仍然|真正动人的地方|哲学问题|无法解释的心事|可停靠的形状/,
  'user-facing editorial copy must avoid flattened AI contrast phrases'
);
assert.match(
  llmSource,
  /禁止截图式模板和 AI 反差句[\s\S]*不是……而是……[\s\S]*声音细节[\s\S]*克制/,
  'LLM track-note prompts must explicitly ban flattened AI essay phrases and require audible detail'
);
assert.doesNotMatch(
  bridgeSource,
  /shouldUseOutsideDiscovery/,
  'random playlist generation must always allow external discovery instead of waiting for explicit discovery words'
);
assert.match(
  bridgeSource,
  /Promise\.all\(\[\s*this\.getCurationTrackPool\(conversationText\),\s*this\.getDiscoveryTracks\(conversationText, tasteProfile\)/,
  'normal curation must fetch local candidates and external discovery in parallel before LLM playlist requests'
);
assert.match(
  bridgeSource,
  /tasteProfilePromise[\s\S]*buildMusicTasteProfile/,
  'taste profile LLM analysis must be coalesced so daily brief and curation do not duplicate the same call'
);
assert.match(
  llmSource,
  /generateCurationChatReply/,
  'chat replies must still have an optional LLM path for stricter reply regeneration'
);
assert.match(
  llmSource,
  /normalizeCuratedPlaylistPlan[\s\S]*readTrackReferencesField[\s\S]*trackIds\.length === 0[\s\S]*return null/,
  'LLM curation JSON must normalize common provider shapes while still requiring usable track references'
);
assert.match(
  llmSource,
  /readStringField\(value,\s*\['title',\s*'name'[\s\S]*readStringField\(value,\s*\['reply',\s*'message'/,
  'LLM curation plan copy must accept common title and reply aliases instead of failing playable results'
);
assert.match(
  bridgeSource,
  /shouldUseSeparateChatReply\(\)[\s\S]*generateCurationChatReply[\s\S]*: hydrated\.reply/,
  'bridge curation must use the main LLM reply by default and only run a second chat LLM call when explicitly enabled'
);
assert.match(
  llmSource,
  /specific artist[\s\S]*requested count[\s\S]*Adele/,
  'LLM curation must obey explicit artist and track-count requests instead of drifting into mood copy'
);
assert.match(
  bridgeSource,
  /parseSpecificArtistRequest/,
  'bridge must parse explicit artist plus requested count into a hard curation constraint'
);
assert.match(
  bridgeSource,
  /\|的\)\+\$/,
  'artist/count parser must trim a trailing 的 in phrases like Adele的十首歌'
);
assert.ok(
  bridgeSource.includes('\\\\s*首\\\\s*(?:的歌|歌曲|歌)?'),
  'artist/count parser must recognize common phrasing like Adele十首歌'
);
assert.match(
  bridgeSource,
  /getArtistFocusedTrackPool/,
  'explicit artist/count requests must use an artist-focused candidate pool'
);
assert.match(
  bridgeSource,
  /hydrateCuratedPlaylist\(result,\s*specificArtistRequest/,
  'explicit artist/count requests must hydrate without the random-station artist caps'
);
assert.match(
  bridgeSource,
  /maxPerArtist:\s*Number\.POSITIVE_INFINITY/,
  'explicit artist/count requests must not cap the playlist to one track per artist'
);

assert.match(contractSource, /AgentTurnResponse[\s\S]*kind:\s*AgentTurnKind/, 'agent turns must have a shared response contract');
assert.match(contractSource, /handleAgentTurn\(request:\s*CurationRequest\)/, 'renderer bridge API must expose natural agent turns');
assert.match(contractSource, /ClassicalWorkProfile[\s\S]*scores:\s*ClassicalScoreSource\[\]/, 'tracks must carry verified classical profile metadata');
assert.match(contractSource, /classical\?:\s*ClassicalWorkProfile/, 'Track must include optional classical metadata');
assert.match(preloadSource, /cosic:handle-agent-turn/, 'preload must expose handle-agent-turn IPC');
assert.match(mainSource, /cosic:handle-agent-turn/, 'Electron main must route handle-agent-turn IPC');
assert.match(bridgeSource, /async handleAgentTurn\(request:\s*CurationRequest\)/, 'bridge must decide whether an agent turn is conversation or playlist');
assert.match(bridgeSource, /classifyAgentTurn/, 'bridge must use an agent-turn classifier before generating playlists');
assert.match(llmSource, /classifyAgentTurn/, 'LLM adapter must support ambiguous conversation-vs-playlist classification');
assert.match(appSource, /handleAgentTurn/, 'renderer submissions must call handleAgentTurn instead of always generating a playlist');
assert.match(appSource, /result\.kind === 'conversation'[\s\S]*setMessages/, 'conversation turns must append chat without replacing the queue');
assert.match(contractSource, /ClassicalScoreRole/, 'classical score sources must model original, full-score, reduction, and arrangement roles');
assert.match(contractSource, /ClassicalScorePriority/, 'classical score sources must distinguish preferred sources from optional arrangements');
assert.match(contractSource, /ClassicalScoreCoverage/, 'classical profiles must expose score coverage state');
assert.match(contractSource, /role:\s*ClassicalScoreRole[\s\S]*priority:\s*ClassicalScorePriority/, 'classical score sources must carry role and priority in the bridge contract');
assert.match(contractSource, /getClassicalCoverageReport\(\): Promise<ClassicalCoverageReport>/, 'desktop API must expose a classical score coverage report');
assert.match(preloadSource, /cosic:get-classical-coverage-report/, 'preload must expose classical coverage IPC');
assert.match(mainSource, /cosic:get-classical-coverage-report/, 'Electron main must route classical coverage IPC');
assert.match(classicalCatalogSource, /role:\s*ClassicalScoreRole[\s\S]*priority:\s*ClassicalScorePriority/, 'classical catalog helpers must require score role and priority');
assert.match(classicalCatalogSource, /'original'[\s\S]*'preferred'/, 'classical catalog must mark original scores as preferred');
assert.match(classicalCatalogSource, /'authoritative_full_score'[\s\S]*'preferred'/, 'classical catalog must mark authoritative full scores as preferred');
assert.match(classicalCatalogSource, /'arrangement'[\s\S]*'optional'/, 'classical catalog must treat arrangements as optional');
assert.match(classicalCatalogSource, /sourceUrl/, 'classical scores must carry source URLs');
assert.match(classicalCatalogSource, /licenseLabel/, 'classical scores must carry license labels');
assert.match(classicalMatcherSource, /matchClassicalWorkProfile/, 'shared classical matcher must enrich tracks deterministically');
assert.match(classicalMatcherSource, /evaluateClassicalScoreCoverage[\s\S]*hasPreferredSource/, 'classical enrichment must evaluate preferred original or full-score coverage');
assert.match(classicalMatcherSource, /isScoreReady:\s*coverage\.hasPreferredSource/, 'isScoreReady must mean a preferred original or authoritative score exists');
assert.doesNotMatch(classicalMatcherSource, /hasCompleteClassicalScoreSet/, 'classical enrichment must not require a fixed piano plus violin score set');
assert.doesNotMatch(
  classicalMatcherSource,
  /buildFallbackProfile|isScoreReady:\s*false[\s\S]*scores:\s*\[\]/,
  'classical enrichment must not attach scoreless fallback profiles that produce fake score tabs'
);
assert.match(
  bridgeSource,
  /removeScorelessClassicalTracks[\s\S]*isClassicalLikeTrack[\s\S]*track\.classical\?\.coverage\.hasPreferredSource/,
  'curation must remove classical-like tracks unless a preferred original or full score was pre-attached'
);
assert.match(bridgeSource, /async getClassicalCoverageReport\(\): Promise<ClassicalCoverageReport>/, 'bridge must aggregate a library-wide classical coverage report');
assert.match(
  bridgeSource,
  /hydrateCuratedPlaylist\(result,\s*specificArtistRequest,\s*\{\s*requireCompleteClassicalScores/,
  'classical playlist hydration must preserve the preferred-score requirement after LLM selection'
);
assert.match(playbackSource, /preferredClassicalScore/, 'classical reader must default to the preferred score source');
assert.match(playbackSource, /scoreTabs = classicalScores\.map/, 'classical player UI must render score tabs from real score sources');
assert.match(playbackSource, /无可靠小提琴改编/, 'classical reader must mark absent violin arrangements as unreliable rather than broken');
assert.match(playbackSource, /deck-classical-panel/, 'classical tracks must render a dedicated work panel');
assert.match(curatorSource, /classical-coverage-panel/, 'right panel must expose a classical score coverage surface');

console.log('ai/ui contract smoke passed');
