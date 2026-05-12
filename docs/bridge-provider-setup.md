# Cosic Bridge Provider Setup

This file maps every bridge capability to the current `.env.local` entry point.

## Quick Start

1. Copy `.env.example` to `.env.local`.
2. Fill only the providers you actually use.
3. Restart `npm run dev:all` after editing `.env.local`.
4. Probe the music bridge with `http://127.0.0.1:7878/health`.

## Recommended `.env.local`

```dotenv
COSIC_LLM_BASE_URL=https://api.openai.com/v1
COSIC_LLM_API_KEY=your_key_here
COSIC_LLM_MODEL=gpt-5.5
COSIC_LLM_PROXY_URL=

COSIC_IMAGE_BASE_URL=https://api.openai.com/v1
COSIC_IMAGE_API_KEY=
COSIC_IMAGE_MODEL=gpt-image-1.5

COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878
COSIC_MUSIC_COOKIE=MUSIC_U=<your_music_u>; __csrf=<your_csrf>
COSIC_MUSIC_API_KEY=

COSIC_VOICE_PROVIDER=cosyvoice
COSIC_VOICE_BASE_URL=http://127.0.0.1:50000
COSIC_VOICE_MODE=sft
COSIC_VOICE_SPK_ID=中文女
COSIC_VOICE_INSTRUCT_TEXT=用温柔、自然、克制的电台旁白语气朗读。

COSIC_CALENDAR_PROVIDER=feishu
COSIC_CALENDAR_BASE_URL=https://open.feishu.cn/open-apis
COSIC_CALENDAR_APP_ID=
COSIC_CALENDAR_APP_SECRET=

COSIC_WEATHER_PROVIDER=open-meteo

COSIC_CAST_PROVIDER=upnp
COSIC_CAST_ENABLED=false
COSIC_CAST_DISCOVERY_TARGET=
```

## LLM

Mode: OpenAI-compatible chat completions.

Fill:

- `COSIC_LLM_BASE_URL`
- `COSIC_LLM_API_KEY`
- `COSIC_LLM_MODEL`

The bridge also accepts `OPENAI_API_KEY` and `OPENAI_BASE_URL` as fallback values.

The LLM path powers:

- conversation versus playlist turn classification
- playlist planning
- taste analysis
- track notes
- daily station briefs

## Image Generation

Mode: OpenAI-compatible image endpoint.

Fill:

- `COSIC_IMAGE_BASE_URL`
- `COSIC_IMAGE_API_KEY`
- `COSIC_IMAGE_MODEL`

The design reference panel uses this path when enabled.

## Music / NetEase Cloud Music

Mode: local personal bridge.

The desktop app should talk to the local bridge, not directly to NetEase from the renderer.

Fill:

- `COSIC_MUSIC_PROVIDER=netease`
- `COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878`
- `COSIC_MUSIC_COOKIE=MUSIC_U=<your_music_u>; __csrf=<your_csrf>`
- `COSIC_MUSIC_API_KEY=` optional bridge token

Local bridge endpoints:

- `GET /health`
- `GET /user/playlists`
- `GET /playlists/:id`
- `GET /tracks/:id/stream`
- `GET /tracks/:id/lyrics`
- `GET /scores/:workId/:file.pdf`

Keep the cookie private and rotate it when it expires.

## Voice / CosyVoice

Mode: local FastAPI service.

Fill:

- `COSIC_VOICE_PROVIDER=cosyvoice`
- `COSIC_VOICE_BASE_URL=http://127.0.0.1:50000`
- `COSIC_VOICE_MODE=sft` or `instruct`
- `COSIC_VOICE_SPK_ID`
- `COSIC_VOICE_INSTRUCT_TEXT`

`npm run dev:all` invokes the local starter script. If you run CosyVoice yourself, keep the base URL pointed at that instance.

## Calendar / Feishu

Mode: official self-built app.

Fill:

- `COSIC_CALENDAR_PROVIDER=feishu`
- `COSIC_CALENDAR_BASE_URL=https://open.feishu.cn/open-apis`
- `COSIC_CALENDAR_APP_ID`
- `COSIC_CALENDAR_APP_SECRET`

Create a Feishu self-built app, grant the calendar scopes you need, and keep the secret in `.env.local` or GitHub Secrets.

## Weather / Open-Meteo

Mode: no-key weather provider.

Fill:

- `COSIC_WEATHER_PROVIDER=open-meteo`

No API key is required. The app requests current and forecast weather from Open-Meteo, and uses no-key reverse geocoding fallbacks for city labels.

## Cast / UPnP

Mode: local-network discovery.

Fill:

- `COSIC_CAST_PROVIDER=upnp`
- `COSIC_CAST_ENABLED=true`
- `COSIC_CAST_DISCOVERY_TARGET=` optional

UPnP does not require a cloud API key. Keep the player and target renderer on the same LAN.
