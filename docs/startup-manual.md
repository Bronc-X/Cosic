# Cosic Startup Manual

This manual is the boring path that should work on a fresh machine.

## 1. Install Prerequisites

Install:

- Node.js 22 or newer
- npm
- Git

Optional:

- A local CosyVoice FastAPI service if you want narration.
- `tools/yt-dlp.exe` on Windows, or set `COSIC_YTDLP_PATH` to your own binary.

## 2. Clone And Install

```bash
git clone https://github.com/Bronc-X/Cosic.git
cd Cosic
npm install
```

PowerShell is fine:

```powershell
git clone https://github.com/Bronc-X/Cosic.git
cd Cosic
npm install
```

## 3. Create Local Environment

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Then edit `.env.local`.

Minimum useful setup:

```env
COSIC_LLM_BASE_URL=https://api.openai.com/v1
COSIC_LLM_API_KEY=your_key_here
COSIC_LLM_MODEL=gpt-5.5

COSIC_MUSIC_PROVIDER=netease
COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878
COSIC_MUSIC_COOKIE=MUSIC_U=<your_music_u>; __csrf=<your_csrf>

COSIC_VOICE_PROVIDER=cosyvoice
COSIC_VOICE_BASE_URL=http://127.0.0.1:50000

COSIC_WEATHER_PROVIDER=open-meteo
```

Never commit `.env.local`.

## 4. Start The Full App

```bash
npm run dev:all
```

What starts:

- Music bridge on `http://127.0.0.1:7878`
- Vite renderer on `http://127.0.0.1:5173`
- Electron TypeScript watcher
- Electron desktop app
- Local CosyVoice starter script
- Ollama starter only when the LLM base URL points to local Ollama

If the Electron window does not appear, keep the terminal open and check whether the app is waiting for `tcp:5173`, `tcp:50000`, or `dist-electron/electron/main.js`.

## 5. Manual Service Checks

Music bridge:

```bash
curl http://127.0.0.1:7878/health
curl http://127.0.0.1:7878/user/playlists
```

Renderer:

```txt
http://127.0.0.1:5173
```

CosyVoice:

```txt
http://127.0.0.1:50000/docs
```

## 6. Common Problems

### Vite Already Listening On 5173

This is usually fine. The start script reuses the existing renderer server.

### Electron Waits Forever For 50000

`dev:app` waits for the voice service by default. Either start CosyVoice or set `COSIC_VOICE_BASE_URL` to the service you actually run.

### Music Loads Mock Or Empty Data

Check:

- `COSIC_MUSIC_BASE_URL=http://127.0.0.1:7878`
- `COSIC_MUSIC_COOKIE` contains at least `MUSIC_U` and `__csrf`
- `curl http://127.0.0.1:7878/health` returns configured music status

### AI Playlist Stops Immediately

Check:

- `COSIC_LLM_BASE_URL`
- `COSIC_LLM_API_KEY`
- `COSIC_LLM_MODEL`

The app intentionally fails visibly when the LLM environment is missing.

## 7. Verification Before Push

Run:

```bash
npm run typecheck
npm run test:smoke
npm run build
```

`npm run test:smoke` includes package config, UI copy/layout, AI contract, classical coverage, layout composition, current UI, and LLM JSON repair checks.

## 8. Packaging

```bash
npm run package
```

Packaging uses `electron-builder` with publishing disabled. Build output goes to `release/`, which is ignored by git.

For signed release builds, configure certificates through local environment variables or GitHub Secrets. Do not commit certificates.
