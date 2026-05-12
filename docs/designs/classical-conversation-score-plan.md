# Cosic Classical Conversation And Score Plan

## Goal

Turn Cosic from a playlist command box into a warm music companion that can hold a natural conversation, decide when a playlist is actually needed, and make classical tracks feel like living works with verified staff notation and deeply written context.

## Scope

This plan covers three user-facing changes:

1. The agent can answer conversationally without always generating a playlist.
2. Classical tracks get visible five-line staff notation, with piano and violin views where a verified score exists.
3. Every classical track shown as classical gets a detailed Chinese introduction about composer context, creative background, inner weather, listening feeling, and the emotion being carried.

## Success Criteria

1. A message like "今天有点累，想聊会儿" produces a conversational reply and does not replace the queue.
2. A message like "给我一组今晚的古典" produces a curated playlist and a reply that explains the musical path.
3. A refinement like "更安静一点" still remixes the current queue because conversation history makes the intent clear.
4. A classical current track shows a dedicated classical panel with story and score controls.
5. Any track flagged as score-ready classical has a real score source, not AI-imagined notation.
6. Piano and violin score tabs are available when that arrangement/source exists; unavailable instruments show a clear empty state.
7. Classical introductions are warm, specific, and philosophical, but avoid asserting uncertain biographical facts as certainty.
8. Build/typecheck and existing smoke tests pass after implementation.

## CEO Review

### Product Value

This is worth doing because it moves Cosic from "AI picks tracks" to "AI helps me inhabit music." The strongest version is not a bigger recommendation engine. It is a player that knows when to be quiet, when to talk, and when to open a window into a piece.

The classical score feature is the hard differentiator. Lyrics are common. Album notes are common. Real notation next to the playback experience gives classical music a tactile layer: the user can see the architecture while hearing the feeling.

### Core User Path

1. User types naturally into Cosic.
2. Agent classifies the turn as conversation, playlist request, or playlist refinement.
3. Conversation turns only append chat messages.
4. Playlist turns generate or remix a queue.
5. When the active track is classical, the player shows a classical work panel.
6. The panel lets the user switch between introduction, piano score, violin score, and existing lyrics if available.

### Edge Cases

1. Ambiguous messages should choose conversation first, then gently offer music.
2. Direct commands should stay direct: "来 20 首巴赫" must generate a queue.
3. Refinements should use recent chat history: "再暗一点" after a playlist means remix.
4. Classical recordings often differ by arrangement, edition, movement, and performer; score matching must be conservative.
5. Copyrighted or unverifiable scores must not be presented as real notation.
6. Some classical works have no meaningful violin arrangement; the UI should say so rather than fake one.

### Product Decision

Use a conservative score-ready model:

- A track can be "classical-like" by title/artist/tags.
- A track becomes "score-ready classical" only after matching a verified score fixture/source.
- Classical recommendation prompts should prefer score-ready classical tracks so the promise holds in generated queues.
- Existing library tracks that look classical but have no verified score get a "matching score" empty state, not a fake sheet.

This keeps the product honest. The user asked for real scores; a fake score would be worse than no score.

## Eng Review

### What Already Exists

1. `src/renderer/App.tsx` already owns chat messages, curation state, queue state, track notes, lyrics state, and current track selection.
2. `src/renderer/components/CuratorPanel.tsx` already renders chat, playlist preview, recommendation cards, and submit actions.
3. `src/renderer/components/PlaybackDeck.tsx` already renders current track artwork, track note, lyrics view, TTS reading, and transport controls.
4. `src/shared/contracts/bridge.ts` already defines `Track`, `TrackInsight`, `CuratedPlaylist`, `CurationRequest`, and IPC API shape.
5. `src/main/bridge/bridge-service.ts` already orchestrates taste analysis, playlist generation, discovery search, hydration, track insight generation, lyrics, and bridge fallback.
6. `src/main/bridge/adapters/openai-compatible-llm.ts` already has JSON repair, curation prompts, track-note prompts, and separate chat reply support.
7. Electron IPC is centralized in `electron/main.ts` and `electron/preload.ts`, so new API surface can be added without changing many files.

### Proposed Data Model

Add shared types in `src/shared/contracts/bridge.ts`:

```ts
export type AgentTurnKind = 'conversation' | 'playlist' | 'refinement';

export interface AgentTurnResponse {
  kind: AgentTurnKind;
  reply: string;
  playlist?: CuratedPlaylist;
}

export type ScoreInstrument = 'piano' | 'violin';

export interface ClassicalScoreSource {
  instrument: ScoreInstrument;
  title: string;
  format: 'svg' | 'pdf' | 'musicxml';
  pages: string[];
  sourceLabel: string;
  sourceUrl?: string;
  licenseLabel: string;
}

export interface ClassicalWorkNote {
  composer: string;
  workTitle: string;
  period: string;
  background: string;
  innerWeather: string;
  listeningGuide: string;
  emotionalThesis: string;
  sources: string[];
}

export interface ClassicalWorkProfile {
  isClassical: boolean;
  isScoreReady: boolean;
  note?: ClassicalWorkNote;
  scores: ClassicalScoreSource[];
}
```

Then add `classical?: ClassicalWorkProfile` to `Track`.

### Proposed Files

1. `src/shared/classical/catalog.ts`
   - Curated score/work fixtures.
   - Starts small but real: Bach, Mozart, Beethoven, Chopin, Debussy, Tchaikovsky, Vivaldi where public-domain score sources are easy to verify.
   - Uses stable matching keys: composer aliases, work title aliases, opus/catalog numbers, instrument coverage.

2. `src/shared/classical/match.ts`
   - Deterministic matcher from `Track` to `ClassicalWorkProfile`.
   - No network dependency in renderer.
   - Keeps "classical-like" and "score-ready" separate.

3. `src/shared/classical/notes.ts`
   - Local warm fallback introductions for known works.
   - LLM can improve prose later, but fallback must be good enough offline.

4. `src/main/bridge/adapters/openai-compatible-llm.ts`
   - Add `classifyAgentTurn(...)`.
   - Add or update classical intro prompt.
   - Tighten curation prompt so classical requests prefer score-ready candidates.

5. `src/main/bridge/bridge-service.ts`
   - Add `handleAgentTurn(request)`.
   - Reuse existing `generateCuratedPlaylist(...)` for playlist/refinement turns.
   - Add classical metadata enrichment when tracks enter bootstrap, catalog, search, hydration, and curated results.

6. `electron/main.ts` and `electron/preload.ts`
   - Add IPC for `cosic:handle-agent-turn`.

7. `src/renderer/App.tsx`
   - Replace direct `generateCuratedPlaylist` submit path with `handleAgentTurn`.
   - If response is conversation, append assistant message only.
   - If response includes playlist, update curation/queue exactly as today.

8. `src/renderer/components/CuratorPanel.tsx`
   - Rename visible mental model from rigid playlist generation toward conversation.
   - Keep existing quick recommendation cards.
   - Show working state text that fits both chat and playlist.

9. `src/renderer/components/PlaybackDeck.tsx`
   - Add classical work panel inside the current deck.
   - Add tabs/buttons for `Intro`, `Piano`, `Violin`, `Lyrics`.
   - Render score pages as images/SVG/PDF embeds from verified source paths.

10. `src/renderer/styles/index.css`
    - Add responsive styles for classical panel and score viewport.
    - Keep within existing dark, compact player language.

11. `scripts/smoke-ai-ui-contract.mjs` and `scripts/smoke-current-ui-requirements.mjs`
    - Add checks for agent turn contract and classical UI copy.

### Data Flow

```text
User text
  |
  v
App.handleAgentSubmit
  |
  v
window.cosic.handleAgentTurn({ input, context, chatHistory })
  |
  v
BridgeService.handleAgentTurn
  |
  +--> classifyAgentTurn
  |       |
  |       +--> conversation -> reply only
  |
  +--> playlist/refinement -> existing generateCuratedPlaylist
          |
          v
      enrich tracks with ClassicalWorkProfile
          |
          v
      return AgentTurnResponse
  |
  v
Renderer updates chat only OR chat + queue
```

### Agent Turn Rules

Use a hybrid classifier:

1. Deterministic fast path for obvious playlist commands:
   - "来几首", "给我一组", "推荐", "歌单", "古典", "巴赫", "肖邦", "莫扎特", count + artist.
2. Deterministic refinement path when curation exists and the input is short:
   - "更安静", "再暗一点", "换一版", "不要这么重".
3. LLM classification for ambiguous conversational language.
4. Fallback to conversation if classification fails.

The important bias is humane: when unclear, talk first; when explicit, act.

### Score Source Strategy

Use local fixtures first. A fixture may point to bundled assets, stable public-domain score pages, or later cached score renders. Sources considered during implementation:

1. OpenScore for public-domain works in MuseScore/MusicXML/PDF-style formats.
2. IMSLP/public-domain score PDFs where licensing and edition are acceptable.
3. Open Opus for classical metadata only, not score pages.

Implementation should avoid live scraping in the first pass. Network score lookup sounds attractive, but it makes availability, copyright, and UI performance worse. The first ship should be a verified seed catalog plus a clean extension point.

### Classical Introduction Style

Each classical introduction should have four visible movements:

1. `Background`: when and why the piece can be understood historically.
2. `Inner Weather`: composer mood or creative pressure, phrased carefully when uncertain.
3. `Listening Guide`: what the user can listen for.
4. `Emotional Thesis`: the philosophical feeling the piece carries.

Tone target: warm, reflective, specific, never encyclopedia-flat.

### Tests And Verification

1. `npm run typecheck`
2. `npm run test:smoke`
3. `npm run build`
4. Manual desktop QA:
   - Chat-only message does not change queue.
   - Direct playlist request changes queue.
   - Refinement remixes current curation.
   - Classical track shows intro and score tabs.
   - Non-classical track does not show classical panel.
   - Missing piano/violin score shows clear empty state.
   - Compact layout has no text overlap.

### Failure Modes

1. LLM classifier times out.
   - Handling: fallback to deterministic classifier, then conversation.
   - User sees: normal assistant reply.

2. Score fixture does not match a classical track.
   - Handling: do not mark `isScoreReady`.
   - User sees: "正在匹配真实谱源" or no score tab depending on context.

3. Score asset fails to load.
   - Handling: per-page error state with retry/open-source action later.
   - User sees: clear score unavailable message.

4. Playlist generation selects classical tracks without score.
   - Handling: for classical requests, candidate pool prefers score-ready tracks; fallback note says score coverage is limited.
   - User sees: honest limitation rather than fake completeness.

5. Classical introduction hallucinates facts.
   - Handling: local verified fixtures first; LLM prose must use source fields and uncertainty language.
   - User sees: grounded, careful writing.

### NOT In Scope

1. Full internet-scale score search in v1.
   - Rationale: too much copyright and availability risk for the first ship.

2. Auto-generating sheet music from audio.
   - Rationale: that would not be "真实谱子".

3. Supporting every instrument beyond piano and violin.
   - Rationale: user explicitly asked for piano and violin.

4. Rebuilding the whole player layout.
   - Rationale: existing deck and lyrics view already provide the right surface.

5. Fixing every historical mojibake string in the app.
   - Rationale: implementation should fix strings touched by this feature, not turn into a full copy rewrite.

### Parallelization

Sequential implementation is safest because the API contract, bridge service, and renderer all depend on the new `Track.classical` shape. After the shared contract lands, UI styling and catalog fixtures can be worked in parallel, but the first implementation should stay in one lane to avoid merge conflicts in the already-dirty worktree.

## Implementation Checklist

1. Add shared agent/classical contracts.
2. Add classical catalog, matcher, and fallback prose.
3. Enrich tracks with classical metadata in bridge service.
4. Add agent turn classifier and `handleAgentTurn`.
5. Wire IPC/preload API.
6. Update App submit flow.
7. Update CuratorPanel copy/states.
8. Add PlaybackDeck classical panel and score tabs.
9. Add CSS for score viewport and compact layout.
10. Add smoke coverage.
11. Run typecheck, smoke, build, and manual QA.

## Approval Gate

Implementation should pause here until the product and technical plan is approved.
