import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { CapabilityProbeResult, NarrationAudio } from '../../../shared/contracts/bridge';

interface CosyVoiceConfig {
  baseUrl: string;
  mode: 'sft' | 'instruct';
  speakerId: string;
  instructText: string;
  timeoutMs: number;
}

const DEFAULT_SAMPLE_RATE_HZ = 22050;
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TEXT_CHARS = 260;
const MAX_CACHE_ENTRIES = 12;
const PROBE_TIMEOUT_MS = 5_000;
const STARTUP_WAIT_TIMEOUT_MS = 90_000;
const STARTUP_POLL_INTERVAL_MS = 1_000;
const DEFAULT_SPEAKER_ID = '\u4e2d\u6587\u5973';
const DEFAULT_INSTRUCT_TEXT = '\u7528\u6e29\u67d4\u3001\u81ea\u7136\u3001\u514b\u5236\u7684\u7535\u53f0\u65c1\u767d\u8bed\u6c14\u6717\u8bfb\u3002';

const trimSlash = (value: string) => value.replace(/\/+$/, '');
let cosyVoiceStartupPromise: Promise<void> | null = null;

const readTimeoutMs = () => {
  const timeoutMs = Number(process.env.COSIC_VOICE_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
};

const readMaxTextChars = () => {
  const maxChars = Number(process.env.COSIC_VOICE_MAX_TEXT_CHARS || DEFAULT_MAX_TEXT_CHARS);
  return Number.isFinite(maxChars) && maxChars > 0 ? maxChars : DEFAULT_MAX_TEXT_CHARS;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('CosyVoice request timed out.');
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isCosyVoiceStreamInterrupted = (error: unknown) =>
  error instanceof TypeError && /terminated|fetch failed|socket|network/i.test(error.message);

const createCosyVoiceStreamError = () =>
  new Error(
    'CosyVoice stream ended before audio was fully generated. The local voice model may still be warming up; try again in a moment.'
  );

const canAutoStartCosyVoice = (baseUrl: string) => {
  try {
    const url = new URL(baseUrl);
    return ['127.0.0.1', 'localhost', '0.0.0.0', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};

const isServerReachable = async (baseUrl: string) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/docs`, { method: 'GET' }, PROBE_TIMEOUT_MS);
    return response.ok;
  } catch {
    return false;
  }
};

const startCosyVoiceProcess = () => {
  const root = process.cwd();
  const scriptPath = path.join(root, 'scripts', 'start-cosyvoice.mjs');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Missing CosyVoice bootstrap script: ${scriptPath}`);
  }

  const child = spawn('node', [scriptPath], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
};

const ensureCosyVoiceServer = async (baseUrl: string) => {
  if (await isServerReachable(baseUrl)) {
    return;
  }

  if (!canAutoStartCosyVoice(baseUrl)) {
    return;
  }

  if (!cosyVoiceStartupPromise) {
    cosyVoiceStartupPromise = (async () => {
      startCosyVoiceProcess();

      const startedAt = Date.now();
      while (Date.now() - startedAt < STARTUP_WAIT_TIMEOUT_MS) {
        if (await isServerReachable(baseUrl)) {
          return;
        }

        await sleep(STARTUP_POLL_INTERVAL_MS);
      }

      throw new Error('CosyVoice server did not become reachable after auto-start.');
    })().finally(() => {
      cosyVoiceStartupPromise = null;
    });
  }

  await cosyVoiceStartupPromise;
};

const createWavHeader = (dataLength: number, sampleRateHz: number) => {
  const header = Buffer.alloc(44);
  const byteRate = sampleRateHz * 2;
  const blockAlign = 2;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
};

const asWavBuffer = (audio: Buffer, sampleRateHz: number) => {
  if (audio.subarray(0, 4).toString('ascii') === 'RIFF') {
    return audio;
  }

  return Buffer.concat([createWavHeader(audio.length, sampleRateHz), audio]);
};

export class CosyVoiceAdapter {
  private readonly config: CosyVoiceConfig | null;

  private readonly maxTextChars = readMaxTextChars();

  private readonly narrationCache = new Map<string, Promise<NarrationAudio>>();

  constructor() {
    const baseUrl = process.env.COSIC_VOICE_BASE_URL?.trim();
    this.config = baseUrl
      ? {
          baseUrl: trimSlash(baseUrl),
          mode: process.env.COSIC_VOICE_MODE === 'instruct' ? 'instruct' : 'sft',
          speakerId: process.env.COSIC_VOICE_SPK_ID?.trim() || DEFAULT_SPEAKER_ID,
          instructText: process.env.COSIC_VOICE_INSTRUCT_TEXT?.trim() || DEFAULT_INSTRUCT_TEXT,
          timeoutMs: readTimeoutMs()
        }
      : null;
  }

  isConfigured() {
    return Boolean(this.config);
  }

  getProviderLabel() {
    return this.config ? `CosyVoice ${this.config.mode}` : 'CosyVoice';
  }

  async probe(): Promise<CapabilityProbeResult> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();

    if (!this.config) {
      return {
        capabilityId: 'voice',
        status: 'mock',
        latencyMs: 0,
        message: 'Set COSIC_VOICE_BASE_URL to a local CosyVoice FastAPI server.',
        checkedAt
      };
    }

    try {
      const response = await fetchWithTimeout(`${this.config.baseUrl}/docs`, { method: 'GET' }, PROBE_TIMEOUT_MS);
      return {
        capabilityId: 'voice',
        status: response.ok ? 'online' : 'configured',
        latencyMs: Date.now() - startedAt,
        message: response.ok
          ? 'CosyVoice server is reachable.'
          : `CosyVoice config is loaded, server returned HTTP ${response.status}.`,
        checkedAt
      };
    } catch {
      return {
        capabilityId: 'voice',
        status: 'configured',
        latencyMs: Date.now() - startedAt,
        message: 'CosyVoice config is loaded, but the local server is not reachable yet.',
        checkedAt
      };
    }
  }

  async generateNarrationAudio(text: string): Promise<NarrationAudio> {
    if (!this.config) {
      throw new Error('CosyVoice env is missing. Add COSIC_VOICE_BASE_URL.');
    }

    await ensureCosyVoiceServer(this.config.baseUrl);

    const trimmedText = text.replace(/\s+/g, ' ').trim().slice(0, this.maxTextChars);
    if (!trimmedText) {
      throw new Error('Narration text is empty.');
    }

    const cacheKey = [
      this.config.baseUrl,
      this.config.mode,
      this.config.speakerId,
      this.config.mode === 'instruct' ? this.config.instructText : '',
      trimmedText
    ].join('\n');
    const cached = this.narrationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = this.requestNarrationAudio(trimmedText).catch((error) => {
      this.narrationCache.delete(cacheKey);
      throw error;
    });
    this.narrationCache.set(cacheKey, request);

    while (this.narrationCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = this.narrationCache.keys().next().value;
      if (!oldestKey) {
        break;
      }

      this.narrationCache.delete(oldestKey);
    }

    return request;
  }

  private async requestNarrationAudio(trimmedText: string): Promise<NarrationAudio> {
    if (!this.config) {
      throw new Error('CosyVoice env is missing. Add COSIC_VOICE_BASE_URL.');
    }

    const endpoint =
      this.config.mode === 'instruct'
        ? `${this.config.baseUrl}/inference_instruct`
        : `${this.config.baseUrl}/inference_sft`;
    const form = new FormData();
    form.set('tts_text', trimmedText);
    form.set('spk_id', this.config.speakerId);
    if (this.config.mode === 'instruct') {
      form.set('instruct_text', this.config.instructText);
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          body: form
        },
        this.config.timeoutMs
      );
    } catch (error) {
      if (isCosyVoiceStreamInterrupted(error)) {
        throw createCosyVoiceStreamError();
      }

      throw error;
    }

    if (!response.ok) {
      throw new Error(`CosyVoice request failed with HTTP ${response.status}.`);
    }

    let pcmBuffer: Buffer;
    try {
      pcmBuffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (isCosyVoiceStreamInterrupted(error)) {
        throw createCosyVoiceStreamError();
      }

      throw error;
    }
    if (pcmBuffer.length === 0) {
      throw new Error('CosyVoice returned empty audio.');
    }

    const wavBuffer = asWavBuffer(pcmBuffer, DEFAULT_SAMPLE_RATE_HZ);

    return {
      source: 'live',
      provider: this.getProviderLabel(),
      mimeType: 'audio/wav',
      audioBase64: wavBuffer.toString('base64'),
      sampleRateHz: DEFAULT_SAMPLE_RATE_HZ,
      generatedAt: new Date().toISOString()
    };
  }
}
