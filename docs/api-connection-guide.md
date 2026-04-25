# Cosic API Connection Guide

## 1. Goal

The app is now ready to move from UI-first mock mode into real provider wiring.

The correct implementation order is:

1. NetEase music bridge
2. LLM curation stability
3. Voice
4. Calendar
5. Weather
6. Cast

Music must go first because it is the source library for the whole product.

## 2. What is already wired in the app

The desktop app already supports:

- bridge readiness state for `music / voice / calendar / weather / cast`
- live LLM probe for the `brain` capability
- curated playlist generation via the local bridge
- switching the queue from base library to generated playlist

Relevant files:

- [bridge.ts](/C:/Users/Administrator/Desktop/Toni/Cosic/src/shared/contracts/bridge.ts)
- [bridge-service.ts](/C:/Users/Administrator/Desktop/Toni/Cosic/src/main/bridge/bridge-service.ts)
- [openai-compatible-llm.ts](/C:/Users/Administrator/Desktop/Toni/Cosic/src/main/bridge/adapters/openai-compatible-llm.ts)
- [bridge-provider-setup.md](/C:/Users/Administrator/Desktop/Toni/Cosic/docs/bridge-provider-setup.md)
- [final-product-architecture.md](/C:/Users/Administrator/Desktop/Toni/Cosic/docs/final-product-architecture.md)

## 3. Environment variables

### Music bridge

```dotenv
COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878
COSIC_MUSIC_COOKIE=
COSIC_MUSIC_API_KEY=
```

Use one of these auth patterns:

- `COSIC_MUSIC_COOKIE`
- `COSIC_MUSIC_API_KEY`

Do not put NetEase cookie in the renderer.

### LLM

```dotenv
COSIC_LLM_BASE_URL=https://testvideo.site/v1
COSIC_LLM_API_KEY=your_key
COSIC_LLM_MODEL=gpt-5.5
COSIC_LLM_REASONING_EFFORT=xhigh
```

## 4. NetEase bridge: what you should implement first

Run a local service first.

Recommended local address:

```txt
http://127.0.0.1:7878
```

### Minimum endpoints

- `GET /health`
- `GET /user/library`
- `GET /user/playlists`
- `GET /playlists/:id`
- `GET /tracks/:id`
- `GET /tracks/:id/lyric`
- `GET /tracks/:id/stream`

### Suggested response shapes

#### `GET /health`

```json
{
  "ok": true,
  "provider": "netease",
  "authMode": "cookie"
}
```

#### `GET /user/playlists`

```json
{
  "items": [
    {
      "id": "pl_001",
      "name": "深夜工作",
      "trackCount": 128,
      "coverUrl": "https://...",
      "updatedAt": "2026-04-22T06:00:00.000Z"
    }
  ]
}
```

#### `GET /playlists/:id`

```json
{
  "id": "pl_001",
  "name": "深夜工作",
  "description": "我的工作歌单",
  "tracks": [
    {
      "id": "t_001",
      "title": "Track Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "duration": 233,
      "year": "2024",
      "coverUrl": "https://..."
    }
  ]
}
```

#### `GET /tracks/:id/lyric`

```json
{
  "trackId": "t_001",
  "lyric": "....",
  "translatedLyric": ""
}
```

#### `GET /tracks/:id/stream`

```json
{
  "trackId": "t_001",
  "url": "https://...",
  "expiresAt": "2026-04-22T08:00:00.000Z"
}
```

## 5. What the app needs from the music bridge

The app does not need the full NetEase world first.

It needs only three things:

1. Your playlists
2. Track metadata
3. Playable stream URLs

That is enough for:

- library sync
- candidate pool building
- LLM curation
- direct playback

Lyrics are the next-highest-value extra because they improve curation and future voice features.

## 6. LLM curation contract

The current app already calls OpenAI-compatible chat completions for curation.

The model is expected to return JSON shaped like this:

```json
{
  "title": "稳定推进，保持清醒",
  "intent": "deep focus",
  "note": "前段稳态推进，中段维持专注，尾段避免疲劳塌陷。",
  "trackIds": ["t_12", "t_18", "t_44", "t_03"]
}
```

Rules:

- choose only from provided tracks
- return ordered `trackIds`
- keep `note` short

## 7. Voice / Fish Audio

Fill:

```dotenv
COSIC_VOICE_PROVIDER=fish-audio
COSIC_VOICE_BASE_URL=https://api.fish.audio
COSIC_VOICE_API_KEY=
COSIC_VOICE_MODEL=
```

Official docs:

- [Fish Audio API Introduction](https://docs.fish.audio/api-reference/introduction)

What matters for us first:

- one TTS endpoint
- one voice or model id

## 8. Calendar / Feishu

Fill:

```dotenv
COSIC_CALENDAR_PROVIDER=feishu
COSIC_CALENDAR_BASE_URL=https://open.feishu.cn/open-apis
COSIC_CALENDAR_APP_ID=
COSIC_CALENDAR_APP_SECRET=
```

Official docs:

- [Feishu tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)

What matters for us first:

- get `tenant_access_token`
- fetch today's events

## 9. Weather / OpenWeather

Fill:

```dotenv
COSIC_WEATHER_PROVIDER=openweather
COSIC_WEATHER_BASE_URL=https://api.openweathermap.org/data/2.5
COSIC_WEATHER_API_KEY=
```

Official docs:

- [OpenWeather API key guide](https://openweathermap.org/appid)

What matters for us first:

- current weather by coordinates or city

## 10. Cast / UPnP

Fill:

```dotenv
COSIC_CAST_PROVIDER=upnp
COSIC_CAST_ENABLED=true
COSIC_CAST_DISCOVERY_TARGET=
```

What matters for us first:

- discover renderer on LAN
- optional handoff later

## 11. What you should give me next

If you want me to wire the real music adapter next, send me one of these:

1. Your music bridge base URL plus auth mode
2. A sample JSON for:
   - `GET /user/playlists`
   - `GET /playlists/:id`
   - `GET /tracks/:id/stream`
3. Or the bridge repo path if it already exists locally

Once I have that, I can start replacing the mock music flow with the real bridge flow.
