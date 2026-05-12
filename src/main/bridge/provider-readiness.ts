import type { BridgeCapabilityId, BridgeHealth } from '../../shared/contracts/bridge';

type ProviderCapabilityId = Exclude<BridgeCapabilityId, 'brain'>;

export interface ProviderReadiness {
  provider: string;
  status: BridgeHealth;
  summary: string;
  message: string;
  missingFields: string[];
  setupMode: 'official' | 'self-hosted' | 'local-network';
}

const hasValue = (value: string | undefined) => Boolean(value && value.trim());

const boolFromEnv = (value: string | undefined) => (value ?? '').trim().toLowerCase() === 'true';

const joinList = (items: string[]) => items.join(', ');

const createResult = (
  provider: string,
  missingFields: string[],
  options: {
    readySummary: string;
    waitingSummary: string;
    readyMessage: string;
    waitingMessage: string;
    setupMode: ProviderReadiness['setupMode'];
  }
): ProviderReadiness => ({
  provider,
  status: missingFields.length === 0 ? 'configured' : 'mock',
  summary: missingFields.length === 0 ? options.readySummary : options.waitingSummary,
  message: missingFields.length === 0
    ? options.readyMessage
    : `${options.waitingMessage} Missing ${joinList(missingFields)}.`,
  missingFields,
  setupMode: options.setupMode
});

export const getProviderReadiness = (capabilityId: ProviderCapabilityId): ProviderReadiness => {
  switch (capabilityId) {
    case 'music': {
      const provider = process.env.COSIC_MUSIC_PROVIDER?.trim() || 'netease';
      const missingFields: string[] = [];

      if (!hasValue(process.env.COSIC_MUSIC_BASE_URL)) {
        missingFields.push('COSIC_MUSIC_BASE_URL');
      }

      if (
        !hasValue(process.env.COSIC_MUSIC_COOKIE) &&
        !hasValue(process.env.COSIC_MUSIC_API_KEY)
      ) {
        missingFields.push('COSIC_MUSIC_COOKIE | COSIC_MUSIC_API_KEY');
      }

      return createResult(provider, missingFields, {
        readySummary: 'Music bridge entry is ready.',
        waitingSummary: 'Need a NetEase bridge URL and credential.',
        readyMessage:
          'Music bridge config is loaded. Next step is wiring live playlist and playback endpoints.',
        waitingMessage:
          'For personal NetEase use, point COSIC_MUSIC_BASE_URL to your own bridge or proxy, then add a cookie or bridge token.',
        setupMode: 'self-hosted'
      });
    }
    case 'voice': {
      const provider = process.env.COSIC_VOICE_PROVIDER?.trim() || 'cosyvoice';
      const missingFields: string[] = [];

      if (!hasValue(process.env.COSIC_VOICE_BASE_URL)) {
        missingFields.push('COSIC_VOICE_BASE_URL');
      }

      return createResult(provider, missingFields, {
        readySummary: 'CosyVoice entry is ready.',
        waitingSummary: 'Need a local CosyVoice FastAPI URL.',
        readyMessage:
          'CosyVoice bridge config is loaded. Track notes will prefer generated narration audio.',
        waitingMessage:
          'Start CosyVoice FastAPI locally, then set COSIC_VOICE_BASE_URL, for example http://127.0.0.1:50000.',
        setupMode: 'self-hosted'
      });
    }
    case 'calendar': {
      const provider = process.env.COSIC_CALENDAR_PROVIDER?.trim() || 'feishu';
      const missingFields: string[] = [];

      if (!hasValue(process.env.COSIC_CALENDAR_APP_ID)) {
        missingFields.push('COSIC_CALENDAR_APP_ID');
      }

      if (!hasValue(process.env.COSIC_CALENDAR_APP_SECRET)) {
        missingFields.push('COSIC_CALENDAR_APP_SECRET');
      }

      return createResult(provider, missingFields, {
        readySummary: 'Calendar app entry is ready.',
        waitingSummary: 'Need Feishu app credentials.',
        readyMessage:
          'Calendar bridge config is loaded. Next step is exchanging tenant_access_token and reading events.',
        waitingMessage:
          'Create a Feishu self-built app, then fill the app id and app secret.',
        setupMode: 'official'
      });
    }
    case 'weather': {
      const provider = process.env.COSIC_WEATHER_PROVIDER?.trim() || 'open-meteo';
      const missingFields: string[] = [];

      return createResult(provider, missingFields, {
        readySummary: 'Open-Meteo weather entry is ready.',
        waitingSummary: 'Weather context is unavailable.',
        readyMessage:
          'Weather bridge uses no-key Open-Meteo endpoints for live current weather.',
        waitingMessage:
          'Weather context uses Open-Meteo and should not require an API key.',
        setupMode: 'official'
      });
    }
    case 'cast': {
      const provider = process.env.COSIC_CAST_PROVIDER?.trim() || 'upnp';
      const missingFields = boolFromEnv(process.env.COSIC_CAST_ENABLED)
        ? []
        : ['COSIC_CAST_ENABLED=true'];

      return createResult(provider, missingFields, {
        readySummary: 'LAN cast discovery is ready.',
        waitingSummary: 'Need LAN cast discovery enabled.',
        readyMessage:
          'UPnP discovery is enabled. Next step is wiring SSDP discovery and renderer handoff.',
        waitingMessage:
          'UPnP does not need an API key. Enable local network discovery first.',
        setupMode: 'local-network'
      });
    }
  }
};
