# GitHub Secrets And Certificates

This repository should not contain real credentials, cookies, signing certificates, provisioning profiles, or private keys.

Use `.env.local` on your own machine. Use GitHub Actions secrets for CI and release jobs.

## Required Repository Hygiene

Ignored locally:

- `.env`
- `.env.local`
- `.env.*.local`
- `certs/`
- `secrets/`
- `*.p12`
- `*.pfx`
- `*.pem`
- `*.key`
- `*.crt`
- `*.cer`
- `*.mobileprovision`
- `*.keystore`
- `*.jks`
- build output, runtime logs, pid files, screenshots, and score cache artifacts

## Recommended GitHub Secrets

AI:

- `COSIC_LLM_BASE_URL`
- `COSIC_LLM_API_KEY`
- `COSIC_LLM_MODEL`
- `COSIC_IMAGE_BASE_URL`
- `COSIC_IMAGE_API_KEY`
- `COSIC_IMAGE_MODEL`

Music bridge:

- `COSIC_MUSIC_COOKIE`
- `COSIC_MUSIC_API_KEY`

Calendar:

- `COSIC_CALENDAR_APP_ID`
- `COSIC_CALENDAR_APP_SECRET`

Windows signing, if you later enable signed builds:

- `WINDOWS_CERTIFICATE_BASE64`
- `WINDOWS_CERTIFICATE_PASSWORD`

macOS signing and notarization, if you later enable signed builds:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `MACOS_CERTIFICATE_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `MACOS_PROVISION_PROFILE_BASE64`

Android-style keystore names are ignored too, but Cosic does not currently build Android artifacts.

## How To Store A Certificate In GitHub Secrets

Convert a binary certificate to base64 locally.

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certs/windows-signing.pfx")) | Set-Clipboard
```

macOS or Linux:

```bash
base64 -i certs/macos-signing.p12 | pbcopy
```

Paste the result into a GitHub secret. In a release workflow, decode it into a temporary file and delete it after packaging.

## Current CI

The included workflow is intentionally conservative. It installs dependencies and runs checks, but does not inject production secrets or publish releases.

That keeps pull requests and normal pushes safe:

```bash
npm ci
npm run typecheck
npm run test:smoke
npm run build
```

## Manual Release Workflow

`.github/workflows/release.yml` is manually triggered through GitHub Actions.

For Windows packages it supports:

- unsigned packaging when no certificate secrets are present
- signed packaging when `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` are configured
- artifact upload from `release/**`

The workflow decodes the certificate under the runner temp directory, passes it to `electron-builder` through `CSC_LINK`, and removes the decoded file at the end of the job.

## Release Policy

Before adding a publish workflow:

1. Keep `--publish never` for local package builds.
2. Add a separate manually triggered `workflow_dispatch` release workflow.
3. Decode signing certificates only inside the job workspace.
4. Never print secret values.
5. Upload built artifacts through GitHub Releases or Actions artifacts.
6. Rotate any secret that was ever copied into a log or committed by mistake.
