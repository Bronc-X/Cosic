# Cosic

Cosic is a desktop music player for personal AI radio. It connects to a local music bridge, reads your playlists, lets an agent decide whether the next turn is conversation or playlist curation, and gives classical tracks a score reader with warm contextual notes.

The app is built with Electron, React, Vite, TypeScript, an OpenAI-compatible LLM adapter, a local NetEase music bridge, Open-Meteo weather, and optional local CosyVoice narration.

## What It Does

- Plays a personal music library through a local bridge.
- Lets the chat agent answer naturally or generate a playlist when the request calls for it.
- Builds 15 to 50 track AI radio queues from real library candidates.
- Shows synced lyrics, album art, queue controls, and a late-night radio mode.
- Gives classical works a dedicated panel with background, composer state of mind, listening guide, emotional reading, and trusted score sources.
- Opens classical scores inside the lyrics reader when a cached PDF is available.
- Supports dark and light UI themes from the title bar.
- Uses no-key Open-Meteo weather and local CosyVoice TTS by default.

## Quick Start

Requirements:

- Node.js 22 or newer
- npm
- Windows, macOS, or Linux desktop environment

Install and run:

```bash
npm install
cp .env.example .env.local
npm run dev:all
```

On Windows PowerShell:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev:all
```

`npm run dev:all` starts the music bridge, renderer, Electron watcher, Electron app, and local helper services.

## Environment

Fill only the providers you use in `.env.local`.

Required for AI curation:

```env
COSIC_LLM_BASE_URL=https://api.openai.com/v1
COSIC_LLM_API_KEY=your_key_here
COSIC_LLM_MODEL=gpt-5.5
```

Required for the personal NetEase bridge:

```env
COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878
COSIC_MUSIC_COOKIE=MUSIC_U=<your_music_u>; __csrf=<your_csrf>
```

Optional voice narration:

```env
COSIC_VOICE_PROVIDER=cosyvoice
COSIC_VOICE_BASE_URL=http://127.0.0.1:50000
```

See [Startup Manual](docs/startup-manual.md) and [Bridge Provider Setup](docs/bridge-provider-setup.md) for the full setup.

## Scripts

```bash
npm run dev:all          # full local desktop stack
npm run dev              # app stack without starting the music bridge
npm run music:bridge     # local NetEase bridge only
npm run typecheck        # TypeScript checks
npm run test:smoke       # repository smoke suite
npm run build            # renderer and Electron build
npm run package          # electron-builder package, publish disabled
```

## Classical Scores

Cosic keeps score metadata in `src/shared/classical/`. Public-domain or otherwise trusted source pages are listed in the catalog. Direct cached PDFs are served by the local music bridge from `artifacts/scores`, which is intentionally ignored by git because those PDFs can be large and may have regional copyright constraints.

To rebuild the local score cache:

```bash
node scripts/resolve-classical-scores.mjs
```

The app still shows trusted source links when a direct embeddable PDF is not cached.

## Packaging And GitHub

No private cookie, API key, signing certificate, or app secret should be committed. Use `.env.local` locally and GitHub Actions secrets in CI. See [GitHub Secrets And Certificates](docs/github-secrets-and-certificates.md).

The repository includes a CI workflow that runs:

```bash
npm ci
npm run typecheck
npm run test:smoke
npm run build
```

## Notes

Cosic is a personal desktop workflow. Music provider cookies and source availability are your responsibility. Keep credentials private, respect provider terms, and check regional score copyright before redistributing cached score PDFs.
