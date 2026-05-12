import type { DesignReferenceImage, DesignReferenceRequest } from '../../../shared/contracts/bridge';

interface ImageGeneratorConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

interface ImagesGenerateResponse {
  created?: number;
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

interface ImageHttpError extends Error {
  status?: number;
}

const DEFAULT_IMAGE_MODEL = 'gpt-image-1.5';
const DEFAULT_IMAGE_TIMEOUT_MS = 90000;

const sanitizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const normalizeApiKey = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '';
};

const normalizeConfiguredModel = (value: string | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_IMAGE_MODEL;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === 'image-2' || normalized === 'gpt-image-2') {
    return 'gpt-image-1.5';
  }

  if (normalized === 'image-1' || normalized === 'gpt-image-1') {
    return 'gpt-image-1';
  }

  if (normalized === 'image-mini' || normalized === 'gpt-image-1-mini') {
    return 'gpt-image-1-mini';
  }

  return trimmed;
};

const readConfig = (): ImageGeneratorConfig | null => {
  const apiKey =
    normalizeApiKey(process.env.COSIC_IMAGE_API_KEY) ||
    normalizeApiKey(process.env.OPENAI_API_KEY);
  const baseUrl =
    process.env.COSIC_IMAGE_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    (apiKey ? 'https://api.openai.com/v1' : '');
  const model = normalizeConfiguredModel(process.env.COSIC_IMAGE_MODEL);
  const timeoutMs = Number(process.env.COSIC_IMAGE_TIMEOUT_MS || String(DEFAULT_IMAGE_TIMEOUT_MS));

  if (!apiKey || !baseUrl) {
    return null;
  }

  return {
    apiKey,
    baseUrl: sanitizeBaseUrl(baseUrl),
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_IMAGE_TIMEOUT_MS
  };
};

const normalizeMode = (mode: DesignReferenceRequest['mode']) => (mode === 'light' ? 'light' : 'dark');

const normalizeSize = (size: DesignReferenceRequest['size']) => {
  if (size === '1024x1024' || size === '1536x1024' || size === '1024x1536') {
    return size;
  }

  return '1536x1024';
};

const normalizeQuality = (quality: DesignReferenceRequest['quality']) => {
  if (quality === 'low' || quality === 'medium' || quality === 'high') {
    return quality;
  }

  return 'medium';
};

const createHttpError = (status: number, text: string) => {
  const error = new Error(`HTTP ${status}: ${text.slice(0, 200)}`) as ImageHttpError;
  error.status = status;
  return error;
};

const buildDesignPrompt = (request: DesignReferenceRequest) => {
  const mode = normalizeMode(request.mode);
  const modeDirection =
    mode === 'light'
      ? 'Light mode. Warm off-white paper background, black ink hierarchy, monochrome industrial warmth.'
      : 'Dark mode. OLED black background, white type hierarchy, monochrome industrial warmth.';

  return [
    'Create a high-craft UI design reference image for an Electron desktop app named Cosic.',
    'The product is an AI-powered personal music curator and desktop player.',
    'Design stance: Nothing-inspired industrial editorial interface.',
    'Use Doto for one hero display moment, Space Grotesk for body/UI, Space Mono for labels and data.',
    modeDirection,
    'Keep the composition asymmetrical and information-dense without clutter.',
    'The app should feel like a premium control surface, not a generic SaaS dashboard.',
    'No gradients in UI chrome, no shadows, no glassmorphism, no purple cyberpunk palette.',
    'Screen should include a player deck, queue/program list, and a design/curator console.',
    'Labels should feel like instrument panel labels in ALL CAPS monospace.',
    'One accent event only: restrained red signal or state marker.',
    'Render as a believable app UI screenshot, not a mood board.',
    `User design intent: ${request.prompt.trim()}`
  ].join(' ');
};

export class OpenAiImageGenerator {
  private readonly config = readConfig();

  isConfigured() {
    return Boolean(this.config);
  }

  getModelName() {
    return this.config?.model ?? DEFAULT_IMAGE_MODEL;
  }

  async generateDesignReference(request: DesignReferenceRequest): Promise<DesignReferenceImage> {
    if (!this.config) {
      throw new Error('Image generation env is missing. Add COSIC_IMAGE_API_KEY or OPENAI_API_KEY.');
    }

    const prompt = request.prompt.trim();
    if (!prompt) {
      throw new Error('Design prompt is required.');
    }

    const size = normalizeSize(request.size);
    const quality = normalizeQuality(request.quality);
    const mode = normalizeMode(request.mode);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          prompt: buildDesignPrompt({
            ...request,
            prompt
          }),
          size,
          quality,
          output_format: 'png'
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw createHttpError(response.status, text);
      }

      const payload = (await response.json()) as ImagesGenerateResponse;
      const imageBase64 = payload.data?.[0]?.b64_json?.trim();

      if (!imageBase64) {
        throw new Error('Image model returned no image payload.');
      }

      return {
        id: `design-reference-${Date.now()}`,
        prompt,
        revisedPrompt: payload.data?.[0]?.revised_prompt?.trim() || undefined,
        model: this.config.model,
        mimeType: 'image/png',
        imageBase64,
        size,
        quality,
        mode,
        generatedAt: new Date().toISOString()
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
