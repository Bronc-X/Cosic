# Cosic API Connection Guide

Cosic is wired around a main-process bridge. The renderer never receives provider secrets directly.

## Current Provider Order

1. Local music bridge
2. OpenAI-compatible LLM
3. Local CosyVoice narration
4. Open-Meteo weather
5. Feishu calendar
6. UPnP cast

Music comes first because the library is the candidate pool for AI radio.

## Already Wired

The desktop app supports:

- provider readiness checks
- live NetEase playlist loading through the local bridge
- playable stream resolution
- synced lyrics
- cached classical score PDFs through the bridge
- AI conversation versus playlist classification
- AI playlist generation from real candidates
- batch track-note prewarming
- local narration audio generation
- Open-Meteo weather and reverse geocoded city labels

Relevant files:

- `src/shared/contracts/bridge.ts`
- `src/main/bridge/bridge-service.ts`
- `src/main/bridge/adapters/local-music-bridge.ts`
- `src/main/bridge/adapters/openai-compatible-llm.ts`
- `src/main/bridge/adapters/cosyvoice-adapter.ts`
- `local-bridge/music-bridge.mjs`
- `docs/bridge-provider-setup.md`

## Music Bridge

Environment:

```dotenv
COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878
COSIC_MUSIC_COOKIE=MUSIC_U=<your_music_u>; __csrf=<your_csrf>
COSIC_MUSIC_API_KEY=
```

Implemented local endpoints:

- `GET /health`
- `GET /user/playlists`
- `GET /playlists/:id`
- `GET /check/music?id=:id`
- `GET /search/tracks?q=:query`
- `GET /search/playlists?q=:query`
- `GET /artwork?url=:encodedUrl`
- `GET /artwork/fallback?seed=:seed`
- `GET /scores/:workId/:file.pdf`
- `GET /tracks/:id/stream`
- `GET /tracks/:id/lyrics`
- `GET /tracks/:id/audio`

The app needs:

1. playlists
2. track metadata
3. playable stream URLs
4. lyrics when available
5. cached score PDFs for classical works

## LLM

Environment:

```dotenv
COSIC_LLM_BASE_URL=https://api.openai.com/v1
COSIC_LLM_API_KEY=your_key
COSIC_LLM_MODEL=gpt-5.5
COSIC_LLM_PROXY_URL=
```

The adapter expects OpenAI-compatible chat completions.

Playlist planning returns normalized JSON. The bridge accepts common aliases but ultimately needs:

```json
{
  "title": "Stable forward motion",
  "reply": "I kept the opening steady and let the middle breathe.",
  "trackIds": ["track_12", "track_18", "track_44"]
}
```

Rules:

- choose from provided candidates whenever possible
- return 15 to 50 tracks for normal radio requests
- keep conversation replies separate from playlist intent
- do not return source-less invented tracks when hydration fails

## Image Generation

Environment:

```dotenv
COSIC_IMAGE_BASE_URL=https://api.openai.com/v1
COSIC_IMAGE_API_KEY=your_key
COSIC_IMAGE_MODEL=gpt-image-1.5
```

The image adapter is used by the design reference panel.

## Voice / CosyVoice

Environment:

```dotenv
COSIC_VOICE_PROVIDER=cosyvoice
COSIC_VOICE_BASE_URL=http://127.0.0.1:50000
COSIC_VOICE_MODE=sft
COSIC_VOICE_SPK_ID=中文女
COSIC_VOICE_INSTRUCT_TEXT=用温柔、自然、克制的电台旁白语气朗读。
```

Cosic expects a local CosyVoice FastAPI server. Generated raw PCM is wrapped as WAV before playback.

## Weather / Open-Meteo

Environment:

```dotenv
COSIC_WEATHER_PROVIDER=open-meteo
```

No weather API key is needed. The adapter requests current weather and forecast metrics from Open-Meteo.

## Calendar / Feishu

Environment:

```dotenv
COSIC_CALENDAR_PROVIDER=feishu
COSIC_CALENDAR_BASE_URL=https://open.feishu.cn/open-apis
COSIC_CALENDAR_APP_ID=
COSIC_CALENDAR_APP_SECRET=
```

Use a Feishu self-built app and store the app secret outside git.

## Cast / UPnP

Environment:

```dotenv
COSIC_CAST_PROVIDER=upnp
COSIC_CAST_ENABLED=false
COSIC_CAST_DISCOVERY_TARGET=
```

UPnP is local-network only and does not need a cloud key.
