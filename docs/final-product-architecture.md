# Cosic Final Product Architecture

## 1. Final product in one sentence

Cosic is a desktop player with an AI chat and curation surface: it reads your NetEase music library, understands your long-term taste plus current mood or work context, and generates the most suitable playlist for this moment.

## 2. What the product is

The final form is not a generic music player.

It is:

- a player
- an AI chat interface
- a curator
- a personal taste engine

The core experience is:

1. You open the app.
2. The app already knows your NetEase playlists, liked songs, and long-term taste signals.
3. You say something like:
   - "我现在要进入深度工作"
   - "今晚想松一点，但不要太丧"
   - "给我一个 40 分钟的收尾歌单"
4. The model combines:
   - your NetEase library
   - your historical taste
   - your current instruction
   - optional environment context
5. It returns a curated playlist for this exact moment.
6. The playlist becomes immediately playable in the player.

## 3. Success standard

When the product is complete, the shortest closed loop should be:

1. User opens the desktop app.
2. User sees two primary surfaces:
   - player
   - AI chat / curation panel
3. User can import or sync personal NetEase playlists.
4. User can describe mood, task, or scene in natural language.
5. The model generates a custom playlist from the user's own library.
6. The generated playlist can be previewed, refined, saved, and played immediately.

## 4. Clarifying "direct connection"

In this project, "direct connection" means:

- the frontend talks straight to NetEase APIs
- or the renderer process carries NetEase cookie or secret directly

This is not the recommended path.

Why:

- secrets leak too easily into the renderer
- provider behavior may change
- login, cookie, and anti-abuse flows are harder to control
- it makes the desktop app tightly coupled to one provider

So the right structure is:

- frontend only talks to our local bridge
- our local bridge talks to NetEase
- the model talks to our bridge outputs, not to NetEase directly

That is why I kept saying "bridge" instead of "直连".

## 5. Correct final architecture

### Frontend

The frontend should have only two main areas:

- Player surface
  - current track
  - queue
  - transport controls
  - generated playlist playback
- AI curation surface
  - chat input
  - curation suggestions
  - mood / work / phase prompts
  - generated playlists
  - refine / regenerate / save actions

### Local bridge

The bridge is the product brainstem.

It is responsible for:

- syncing NetEase playlists
- reading tracks, metadata, and lyrics
- normalizing music data into one internal format
- sending compact context to the LLM
- converting model output into playable queue data

### LLM layer

The LLM should not search the whole internet for songs.

Its main role is:

- understand the user's instruction
- understand long-term music taste
- classify scene, intensity, pacing, emotional direction
- choose the best subset from the user's own library
- sequence the playlist like a curator
- optionally explain the curation briefly

### Music source

NetEase is the source of truth for:

- playlists
- liked songs
- track metadata
- lyrics
- stream resolution

## 6. Final data flow

1. NetEase bridge pulls the user's playlists and liked songs.
2. Bridge stores normalized music metadata locally.
3. Bridge computes taste profile features.
4. User sends a chat prompt.
5. App sends prompt plus taste profile plus candidate tracks to LLM.
6. LLM returns:
   - playlist title
   - playlist intent
   - ordered track ids
   - optional short curator note
7. Frontend renders the generated playlist.
8. Player starts playback from the returned queue.

## 7. What the LLM should generate

The LLM output should not just be "recommend 3 songs".

It should generate a structured curation result:

- playlist name
- scene
- energy curve
- ordered tracks
- why this set fits now
- optional next-step suggestion

Example:

- name: "深夜收束，不坠落"
- scene: "end-of-day cooldown"
- curve: "high focus -> soften -> gentle landing"
- tracks: `[track_12, track_98, track_23, ...]`
- note: "先稳住注意力，再慢慢把情绪放下来"

## 8. Recommended internal modules

### Music ingestion

- `syncUserLibrary()`
- `fetchUserPlaylists()`
- `fetchPlaylistTracks(playlistId)`
- `resolveTrackStream(trackId)`
- `fetchTrackLyrics(trackId)`

### Taste engine

- `buildTasteProfile()`
- `extractMoodTags()`
- `extractArtistAffinity()`
- `extractEraPreference()`
- `extractEnergyPattern()`

### Curation engine

- `buildCurationPrompt()`
- `generatePlaylistFromPrompt()`
- `validateTrackIds()`
- `hydrateGeneratedPlaylist()`

### Player

- `playGeneratedPlaylist()`
- `replaceQueue()`
- `saveGeneratedPlaylist()`

## 9. Minimal API contract for the next phase

### Music bridge

- `GET /health`
- `GET /user/library`
- `GET /user/playlists`
- `GET /playlists/:id`
- `GET /tracks/:id`
- `GET /tracks/:id/lyric`
- `GET /tracks/:id/stream`

### Curation endpoints

- `POST /curation/generate`
- `POST /curation/refine`
- `POST /curation/save`

### Suggested request for `POST /curation/generate`

```json
{
  "input": "我现在要做两个小时的深度工作，不要太炸，但也别太平。",
  "context": {
    "mode": "focus",
    "durationMinutes": 120
  }
}
```

### Suggested response

```json
{
  "title": "稳定推进，保持清醒",
  "intent": "deep focus",
  "note": "前段稳态推进，中段维持专注，尾段避免疲劳塌陷。",
  "trackIds": ["t_12", "t_18", "t_44", "t_03"]
}
```

## 10. Product decision for this project

The app should not be built as:

- a direct NetEase client in the renderer
- a generic chatbot with music attached
- a recommendation feed for public music discovery

The app should be built as:

- a desktop player
- a private AI curator
- a NetEase-backed personal music operating surface

## 11. Next implementation order

1. Add the AI chat / curation panel to the current player UI.
2. Define normalized music types for library, playlist, and generated playlist.
3. Implement music bridge contract for NetEase-backed library sync.
4. Add curation API contract and mock responses.
5. Switch from mock generated playlists to live LLM curation.
6. Add save / replay / refine loop.
