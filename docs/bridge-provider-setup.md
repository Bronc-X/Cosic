# Cosic Bridge Provider Setup

This file maps each bridge capability to a real configuration entry point in `.env.local`.

## Quick start

1. Copy `.env.example` to `.env.local`.
2. Fill only the providers you actually want to enable.
3. Restart `npm run dev` after editing `.env.local`.
4. In the app, use the Bridge panel to probe each capability.

## Recommended `.env.local` shape

```dotenv
COSIC_LLM_BASE_URL=https://testvideo.site/v1
COSIC_LLM_API_KEY=your_key_here
COSIC_LLM_MODEL=gpt-5.5
COSIC_LLM_REASONING_EFFORT=xhigh

COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=
COSIC_MUSIC_COOKIE=
COSIC_MUSIC_API_KEY=

COSIC_VOICE_PROVIDER=fish-audio
COSIC_VOICE_BASE_URL=https://api.fish.audio
COSIC_VOICE_API_KEY=
COSIC_VOICE_MODEL=

COSIC_CALENDAR_PROVIDER=feishu
COSIC_CALENDAR_BASE_URL=https://open.feishu.cn/open-apis
COSIC_CALENDAR_APP_ID=
COSIC_CALENDAR_APP_SECRET=

COSIC_WEATHER_PROVIDER=openweather
COSIC_WEATHER_BASE_URL=https://api.openweathermap.org/data/2.5
COSIC_WEATHER_API_KEY=

COSIC_CAST_PROVIDER=upnp
COSIC_CAST_ENABLED=true
COSIC_CAST_DISCOVERY_TARGET=
```

## Music / NetEase Cloud Music

Mode: self-hosted bridge for personal use.

Reality check: the practical path here is a personal bridge pattern, not an official open-platform approval flow for a desktop player.

Product direction:

- Use your own NetEase playlists as the source library.
- Distill long-term listening history into mood, scene, and station signals.
- Let the desktop app talk only to your own bridge, not directly to NetEase from the renderer.

What to fill:

- `COSIC_MUSIC_PROVIDER=netease`
- `COSIC_MUSIC_BASE_URL`: your own music bridge or proxy URL
- `COSIC_MUSIC_COOKIE`: your NetEase web session cookie if your bridge uses cookie login
- `COSIC_MUSIC_API_KEY`: optional if your own bridge expects a separate token

Recommended personal flow:

1. Run your own NetEase bridge locally or on a private server.
2. Point `COSIC_MUSIC_BASE_URL` to that bridge.
3. Add either `COSIC_MUSIC_COOKIE` or the bridge token it expects.
4. Use playlists, liked songs, and lyrics as AI radio context inputs.
5. Keep this for personal use only and watch for cookie expiry or upstream changes.

Recommended minimal bridge endpoints:

- `GET /health`
- `GET /user/playlists`
- `GET /playlists/:id`
- `GET /tracks/:id/stream`
- `GET /tracks/:id/lyric`

## Voice / Fish Audio

Mode: official API.

What to do:

1. Create an account in Fish Audio.
2. Generate an API key.
3. Put the key into `COSIC_VOICE_API_KEY`.
4. Keep `COSIC_VOICE_BASE_URL=https://api.fish.audio` unless your account uses another endpoint.
5. Optional: fill `COSIC_VOICE_MODEL` once we wire model selection.

Official docs:

- https://docs.fish.audio/api-reference/introduction
- https://docs.fish.audio/api-reference/authentication

## Calendar / Feishu

Mode: official self-built app.

What to do:

1. Open the Feishu developer console.
2. Create a self-built app.
3. Copy the `App ID` into `COSIC_CALENDAR_APP_ID`.
4. Copy the `App Secret` into `COSIC_CALENDAR_APP_SECRET`.
5. Grant calendar scopes in the app console.
6. Our bridge will later use these credentials to obtain `tenant_access_token` and call calendar APIs.

Official docs:

- https://open.feishu.cn/app
- https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal
- https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/create

## Weather / OpenWeather

Mode: official API.

What to do:

1. Create an OpenWeather account.
2. Generate an API key.
3. Put the key into `COSIC_WEATHER_API_KEY`.
4. Keep `COSIC_WEATHER_BASE_URL=https://api.openweathermap.org/data/2.5` for the current weather endpoints we plan to use first.

Official docs:

- https://openweathermap.org/api
- https://openweathermap.org/appid
- https://openweathermap.org/current

## Cast / UPnP

Mode: local-network discovery.

What to do:

1. Set `COSIC_CAST_ENABLED=true`.
2. Keep player and target renderer on the same LAN.
3. Optional: fill `COSIC_CAST_DISCOVERY_TARGET` if you want to constrain discovery later.

Notes:

- UPnP does not require cloud signup or API keys.
- The next implementation step is SSDP discovery plus renderer handoff.

Reference:

- https://upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v2.0.pdf
