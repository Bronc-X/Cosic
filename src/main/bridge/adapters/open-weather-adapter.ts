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
    relative_humidity_2m?: number;
    is_day?: number;
    precipitation?: number;
    rain?: number;
    showers?: number;
    snowfall?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    apparent_temperature_max?: number[];
    apparent_temperature_min?: number[];
    precipitation_probability_max?: number[];
    uv_index_max?: number[];
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

interface BigDataCloudReversePayload {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
}

const GEOCODE_BASE_URL = 'https://geocoding-api.open-meteo.com';
const WEATHER_BASE_URL = 'https://api.open-meteo.com';
const REVERSE_GEOCODE_BASE_URL = 'https://nominatim.openstreetmap.org';
const BIG_DATA_CLOUD_BASE_URL = 'https://api.bigdatacloud.net';
const REQUEST_TIMEOUT_MS = 4_000;

const hasValue = (value: string | undefined) => Boolean(value && value.trim());

const roundMetric = (value: number | undefined | null) =>
  Number.isFinite(value ?? NaN) ? Math.round(value as number) : null;

const weatherCodeMap = new Map<number, string>([
  [0, 'Clear'],
  [1, 'Mainly clear'],
  [2, 'Partly cloudy'],
  [3, 'Overcast'],
  [45, 'Fog'],
  [48, 'Rime fog'],
  [51, 'Light drizzle'],
  [53, 'Drizzle'],
  [55, 'Dense drizzle'],
  [56, 'Freezing drizzle'],
  [57, 'Heavy freezing drizzle'],
  [61, 'Light rain'],
  [63, 'Rain'],
  [65, 'Heavy rain'],
  [66, 'Freezing rain'],
  [67, 'Heavy freezing rain'],
  [71, 'Light snow'],
  [73, 'Snow'],
  [75, 'Heavy snow'],
  [77, 'Snow grains'],
  [80, 'Rain showers'],
  [81, 'Heavy rain showers'],
  [82, 'Violent rain showers'],
  [85, 'Snow showers'],
  [86, 'Heavy snow showers'],
  [95, 'Thunderstorm'],
  [96, 'Thunderstorm with hail'],
  [99, 'Severe thunderstorm with hail']
]);

const formatLocationLabel = (item: OpenMeteoSearchItem, fallback: string) =>
  item.name || fallback;

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
      )}&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,uv_index_max&timezone=auto&forecast_days=1`
    );
    const current = weather.current;
    const daily = weather.daily;

    if (!current || !Number.isFinite(current.temperature_2m ?? NaN)) {
      return null;
    }

    return {
      source: 'live',
      locationLabel: location.label,
      summary: weatherCodeMap.get(current.weather_code ?? -1) ?? 'Current weather',
      temperatureC: Math.round(current.temperature_2m as number),
      feelsLikeC: Number.isFinite(current.apparent_temperature ?? NaN)
        ? Math.round(current.apparent_temperature as number)
        : null,
      weatherCode: Number.isFinite(current.weather_code ?? NaN) ? (current.weather_code as number) : null,
      isDay: Number.isFinite(current.is_day ?? NaN) ? current.is_day === 1 : null,
      humidityPercent: roundMetric(current.relative_humidity_2m),
      precipitationMm: roundMetric((current.precipitation ?? 0) + (current.showers ?? 0)),
      rainMm: roundMetric(current.rain),
      snowfallCm: roundMetric(current.snowfall),
      precipitationProbabilityPercent: roundMetric(daily?.precipitation_probability_max?.[0]),
      windSpeedKmh: roundMetric(current.wind_speed_10m),
      windDirectionDeg: roundMetric(current.wind_direction_10m),
      windGustKmh: roundMetric(current.wind_gusts_10m),
      uvIndex: roundMetric(daily?.uv_index_max?.[0]),
      temperatureMaxC: roundMetric(daily?.temperature_2m_max?.[0]),
      temperatureMinC: roundMetric(daily?.temperature_2m_min?.[0]),
      feelsLikeMaxC: roundMetric(daily?.apparent_temperature_max?.[0]),
      feelsLikeMinC: roundMetric(daily?.apparent_temperature_min?.[0])
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
        label: label || context.regionLabel?.trim() || 'Current city'
      };
    }

    const regionLabel = context.regionLabel?.trim();
    if (!hasValue(regionLabel)) {
      return null;
    }

    const geocode = await this.request<OpenMeteoSearchPayload>(
      `${GEOCODE_BASE_URL}/v1/search?name=${encodeURIComponent(regionLabel as string)}&count=1&language=en&format=json`
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
    const nominatimLabel = await this.reverseLocationWithNominatim(latitude, longitude).catch(() => null);
    if (nominatimLabel) {
      return nominatimLabel;
    }

    return this.reverseLocationWithBigDataCloud(latitude, longitude).catch(() => null);
  }

  private async reverseLocationWithNominatim(latitude: number, longitude: number) {
    const result = await this.request<NominatimReversePayload>(
      `${REVERSE_GEOCODE_BASE_URL}/reverse?format=jsonv2&lat=${encodeURIComponent(
        latitude
      )}&lon=${encodeURIComponent(longitude)}&zoom=10&accept-language=en`
    );
    const address = result.address;
    const city = address?.city || address?.town || address?.village || address?.county || result.name;

    return city || null;
  }

  private async reverseLocationWithBigDataCloud(latitude: number, longitude: number) {
    const result = await this.request<BigDataCloudReversePayload>(
      `${BIG_DATA_CLOUD_BASE_URL}/data/reverse-geocode-client?latitude=${encodeURIComponent(
        latitude
      )}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`
    );
    const city = result.city || result.locality;

    return city || null;
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
