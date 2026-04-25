import type { CurationContext, DailyWeatherSnapshot } from '../../../shared/contracts/bridge';

interface OpenMeteoSearchItem {
  name?: string;
  admin1?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

interface OpenMeteoSearchPayload {
  results?: OpenMeteoSearchItem[];
}

interface OpenMeteoCurrentPayload {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
  };
}

interface NominatimReversePayload {
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

const GEOCODE_BASE_URL = 'https://geocoding-api.open-meteo.com';
const WEATHER_BASE_URL = 'https://api.open-meteo.com';
const REVERSE_GEOCODE_BASE_URL = 'https://nominatim.openstreetmap.org';
const REQUEST_TIMEOUT_MS = 4_000;

const hasValue = (value: string | undefined) => Boolean(value && value.trim());

const weatherCodeMap = new Map<number, string>([
  [0, '晴'],
  [1, '少云'],
  [2, '多云'],
  [3, '阴'],
  [45, '雾'],
  [48, '雾凇'],
  [51, '小毛毛雨'],
  [53, '毛毛雨'],
  [55, '浓毛毛雨'],
  [56, '冻毛毛雨'],
  [57, '强冻毛毛雨'],
  [61, '小雨'],
  [63, '雨'],
  [65, '大雨'],
  [66, '冻雨'],
  [67, '强冻雨'],
  [71, '小雪'],
  [73, '雪'],
  [75, '大雪'],
  [77, '米雪'],
  [80, '阵雨'],
  [81, '强阵雨'],
  [82, '暴阵雨'],
  [85, '阵雪'],
  [86, '强阵雪'],
  [95, '雷暴'],
  [96, '雷暴伴冰雹'],
  [99, '强雷暴伴冰雹']
]);

const formatLocationLabel = (item: OpenMeteoSearchItem, fallback: string) =>
  [item.name, item.admin1, item.country].filter(Boolean).join(', ') || fallback;

export class OpenWeatherAdapter {
  isConfigured() {
    return true;
  }

  async getCurrent(context: Pick<CurationContext, 'regionLabel' | 'latitude' | 'longitude'>): Promise<DailyWeatherSnapshot | null> {
    const location = await this.resolveLocation(context);
    if (!location) {
      return null;
    }

    const weather = await this.request<OpenMeteoCurrentPayload>(
      `${WEATHER_BASE_URL}/v1/forecast?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(
        location.longitude
      )}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`
    );
    const current = weather.current;

    if (!current || !Number.isFinite(current.temperature_2m ?? NaN)) {
      return null;
    }

    return {
      source: 'live',
      locationLabel: location.label,
      summary: weatherCodeMap.get(current.weather_code ?? -1) ?? '当前天气',
      temperatureC: Math.round(current.temperature_2m as number),
      feelsLikeC: Number.isFinite(current.apparent_temperature ?? NaN)
        ? Math.round(current.apparent_temperature as number)
        : null
    };
  }

  private async resolveLocation(
    context: Pick<CurationContext, 'regionLabel' | 'latitude' | 'longitude'>
  ): Promise<{ latitude: number; longitude: number; label: string } | null> {
    if (Number.isFinite(context.latitude) && Number.isFinite(context.longitude)) {
      const label = await this.reverseLocation(context.latitude as number, context.longitude as number).catch(
        () => null
      );

      return {
        latitude: context.latitude as number,
        longitude: context.longitude as number,
        label: label || context.regionLabel?.trim() || '当前位置'
      };
    }

    const regionLabel = context.regionLabel?.trim();
    if (!hasValue(regionLabel)) {
      return null;
    }

    const geocode = await this.request<OpenMeteoSearchPayload>(
      `${GEOCODE_BASE_URL}/v1/search?name=${encodeURIComponent(regionLabel as string)}&count=1&language=zh&format=json`
    );
    const first = geocode.results?.[0];

    if (!first || !Number.isFinite(first.latitude ?? NaN) || !Number.isFinite(first.longitude ?? NaN)) {
      return null;
    }

    return {
      latitude: first.latitude as number,
      longitude: first.longitude as number,
      label: formatLocationLabel(first, regionLabel as string)
    };
  }

  private async reverseLocation(latitude: number, longitude: number) {
    const result = await this.request<NominatimReversePayload>(
      `${REVERSE_GEOCODE_BASE_URL}/reverse?format=jsonv2&lat=${encodeURIComponent(
        latitude
      )}&lon=${encodeURIComponent(longitude)}&zoom=10&accept-language=zh-CN`
    );
    const address = result.address;
    const city = address?.city || address?.town || address?.village || address?.county || result.name;
    const region = [city, address?.state, address?.country].filter(Boolean).join(', ');

    return region || null;
  }

  private async request<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Cosic Player/0.1.0 local desktop weather lookup'
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`Weather request failed: ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}
