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
      const provider = process.env.COSIC_VOICE_PROVIDER?.trim() || 'fish-audio';
      const missingFields: string[] = [];

      if (!hasValue(process.env.COSIC_VOICE_BASE_URL)) {
        missingFields.push('COSIC_VOICE_BASE_URL');
      }

      if (!hasValue(process.env.COSIC_VOICE_API_KEY)) {
        missingFields.push('COSIC_VOICE_API_KEY');
      }

      return createResult(provider, missingFields, {
        readySummary: 'Voice API entry is ready.',
        waitingSummary: 'Need a voice API base URL and key.',
        readyMessage:
          'Voice bridge config is loaded. Next step is wiring TTS generation and voice selection.',
        waitingMessage:
          'Set the Fish Audio API base URL and API key before enabling live voice calls.',
        setupMode: 'official'
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
      const provider = process.env.COSIC_WEATHER_PROVIDER?.trim() || 'openweather';
      const missingFields: string[] = [];

      if (!hasValue(process.env.COSIC_WEATHER_API_KEY)) {
        missingFields.push('COSIC_WEATHER_API_KEY');
      }

      return createResult(provider, missingFields, {
        readySummary: 'Weather API entry is ready.',
        waitingSummary: 'Need a weather API key.',
        readyMessage:
          'Weather bridge config is loaded. Next step is wiring live current weather and forecast calls.',
        waitingMessage:
          'Generate an OpenWeather API key and add it before enabling live weather context.',
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
