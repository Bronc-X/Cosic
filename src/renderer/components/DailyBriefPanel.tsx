import { useEffect, useMemo, useState } from 'react';
import type { DailyStationBrief, DailyWeatherSnapshot } from '../../shared/contracts/bridge';

type WeatherSceneKind = 'clear' | 'cloud' | 'wind' | 'rain' | 'snow';

interface DailyBriefPanelProps {
  dailyBrief: DailyStationBrief | null;
  currentClock: Date;
}

interface WeatherScene {
  kind: WeatherSceneKind;
  previewExtraLabel: string;
}

const weatherScenes: WeatherScene[] = [
  {
    kind: 'clear',
    previewExtraLabel: '紫外线'
  },
  {
    kind: 'cloud',
    previewExtraLabel: '降水概率'
  },
  {
    kind: 'wind',
    previewExtraLabel: '阵风'
  },
  {
    kind: 'rain',
    previewExtraLabel: '降水概率'
  },
  {
    kind: 'snow',
    previewExtraLabel: '降雪概率'
  }
];

const formatClock = (value: Date, timezone: string | undefined) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone
  }).format(value);

const translateWeatherSummary = (value: string | undefined) => {
  const summary = (value ?? '').toLowerCase();

  if (/snow|sleet|blizzard|rime/.test(summary)) return '降雪';
  if (/thunder|storm|violent|heavy rain/.test(summary)) return '暴雨';
  if (/rain|drizzle|shower/.test(summary)) return '降雨';
  if (/fog|mist/.test(summary)) return '雾';
  if (/cloud|overcast/.test(summary)) return '多云';
  if (/clear/.test(summary)) return '晴朗';

  return value || '天气';
};

const inferWeatherKind = (weather: DailyWeatherSnapshot | null | undefined): WeatherSceneKind => {
  if (!weather) {
    return 'clear';
  }

  const summary = weather.summary.toLowerCase();
  const code = weather.weatherCode ?? -1;
  const hasActiveRain =
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99) ||
    (weather.precipitationMm ?? 0) > 0 ||
    (weather.rainMm ?? 0) > 0;

  if ((code >= 71 && code <= 86) || /snow|sleet|blizzard|rime/.test(summary) || (weather.snowfallCm ?? 0) > 0) {
    return 'snow';
  }

  if (hasActiveRain || /rain|drizzle|shower|thunder|storm/.test(summary)) {
    return 'rain';
  }

  if ((weather.windGustKmh ?? 0) >= 42 || (weather.windSpeedKmh ?? 0) >= 28 || /wind|gale|squall/.test(summary)) {
    return 'wind';
  }

  if ((code >= 1 && code <= 3) || /cloud|overcast|fog|mist/.test(summary)) {
    return 'cloud';
  }

  return 'clear';
};

const formatDegree = (value: number | null | undefined) => (Number.isFinite(value ?? NaN) ? `${value}°` : '—');

const formatPercent = (value: number | null | undefined) => (Number.isFinite(value ?? NaN) ? `${value}%` : '—');

const formatWindDirection = (degrees: number | null | undefined) => {
  if (!Number.isFinite(degrees ?? NaN)) {
    return '';
  }

  const labels = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const index = Math.round(((degrees as number) % 360) / 45) % labels.length;

  return labels[index];
};

const formatWind = (weather: DailyWeatherSnapshot | null | undefined, fallback: string) => {
  const speed = weather?.windSpeedKmh;
  if (!Number.isFinite(speed ?? NaN)) {
    return fallback;
  }

  const direction = formatWindDirection(weather?.windDirectionDeg);

  return `${direction ? `${direction}风 ` : ''}${speed} km/h`;
};

const getWeatherBackdropLabel = (kind: WeatherSceneKind) => {
  if (kind === 'clear') return 'UV';
  if (kind === 'cloud') return 'CLOUD';
  if (kind === 'wind') return 'WIND';
  if (kind === 'rain') return 'RAIN';

  return 'SNOW';
};

const getSceneExtra = (scene: WeatherScene, weather: DailyWeatherSnapshot | null) => {
  if (!weather) {
    return {
      label: scene.previewExtraLabel,
      value: '待更新'
    };
  }

  if (scene.kind === 'clear') {
    return {
      label: '紫外线',
      value: Number.isFinite(weather.uvIndex ?? NaN) ? String(weather.uvIndex) : '—'
    };
  }

  if (scene.kind === 'cloud') {
    return {
      label: '降水概率',
      value: Number.isFinite(weather.precipitationProbabilityPercent ?? NaN)
        ? `${weather.precipitationProbabilityPercent}%`
        : '—'
    };
  }

  if (scene.kind === 'wind') {
    return {
      label: '阵风',
      value: Number.isFinite(weather.windGustKmh ?? NaN)
        ? `${weather.windGustKmh} km/h`
        : Number.isFinite(weather.windSpeedKmh ?? NaN)
          ? `${weather.windSpeedKmh} km/h`
          : '—'
    };
  }

  if (scene.kind === 'snow') {
    return {
      label: '降雪',
      value: Number.isFinite(weather.snowfallCm ?? NaN) ? `${weather.snowfallCm} cm` : '—'
    };
  }

  return {
    label: '降水概率',
    value: Number.isFinite(weather.precipitationProbabilityPercent ?? NaN)
      ? `${weather.precipitationProbabilityPercent}%`
      : Number.isFinite(weather.precipitationMm ?? NaN)
        ? `${weather.precipitationMm} mm`
        : '—'
  };
};

function WeatherSceneArtwork({ kind }: { kind: WeatherSceneKind }) {
  return (
    <div className="weather-scene-art" aria-hidden="true">
      {kind === 'clear' ? (
        <>
          <span className="weather-sun" />
          <span className="weather-sun-rays" />
          <span className="weather-mountain mountain-a" />
          <span className="weather-mountain mountain-b" />
          <span className="weather-lake" />
          <span className="weather-cloud sunny-cloud-a" />
          <span className="weather-cloud sunny-cloud-b" />
        </>
      ) : null}

      {kind === 'cloud' ? (
        <>
          <span className="weather-cloud overcast-cloud-a" />
          <span className="weather-cloud overcast-cloud-b" />
          <span className="weather-cloud overcast-cloud-c" />
          <span className="weather-mountain mountain-a" />
          <span className="weather-mountain mountain-b" />
          <span className="weather-lake" />
        </>
      ) : null}

      {kind === 'wind' ? (
        <>
          <span className="weather-cloud wind-cloud-a" />
          <span className="weather-cloud wind-cloud-b" />
          <span className="weather-tree">
            <span />
          </span>
          <span className="weather-wind-line line-a" />
          <span className="weather-wind-line line-b" />
          <span className="weather-wind-line line-c" />
          <span className="weather-leaf leaf-a" />
          <span className="weather-leaf leaf-b" />
        </>
      ) : null}

      {kind === 'rain' ? (
        <>
          <span className="weather-storm-cloud" />
          <span className="weather-lightning" />
          <span className="weather-rain rain-a" />
          <span className="weather-rain rain-b" />
          <span className="weather-rain rain-c" />
          <span className="weather-cityline" />
          <span className="weather-puddle puddle-a" />
          <span className="weather-puddle puddle-b" />
          <span className="weather-puddle puddle-c" />
        </>
      ) : null}

      {kind === 'snow' ? (
        <>
          <span className="weather-moon" />
          <span className="weather-snow snow-a" />
          <span className="weather-snow snow-b" />
          <span className="weather-snow snow-c" />
          <span className="weather-pine pine-a" />
          <span className="weather-pine pine-b" />
          <span className="weather-cabin" />
          <span className="weather-snowdrift" />
        </>
      ) : null}
    </div>
  );
}

export function DailyBriefPanel({ dailyBrief, currentClock }: DailyBriefPanelProps) {
  const liveTimeLabel = formatClock(currentClock, dailyBrief?.timezone);
  const weather = dailyBrief?.weather ?? null;
  const realWeatherKind = useMemo(() => inferWeatherKind(weather), [weather]);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const closeWeatherDetails = (event?: { preventDefault: () => void; stopPropagation: () => void }) => {
    event?.preventDefault();
    event?.stopPropagation();
    setIsDetailsOpen(false);
  };
  const stopWeatherDismissPointer = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    if (!isDetailsOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setIsDetailsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDetailsOpen]);

  const activeScene = weatherScenes.find((scene) => scene.kind === realWeatherKind) ?? weatherScenes[0];
  const weatherSummaryLabel = weather ? translateWeatherSummary(weather.summary) : '等待定位';
  const extra = getSceneExtra(activeScene, weather);
  const regionLabel = weather?.locationLabel || dailyBrief?.regionLabel || 'Locating city';
  const weatherLabel = weather
    ? `${weather.temperatureC}° ${translateWeatherSummary(weather.summary)}`
    : dailyBrief
      ? 'Weather unavailable'
      : 'Locating weather';

  return (
    <aside className={`daily-brief-card weather-cinema-panel is-${realWeatherKind} ${isDetailsOpen ? 'is-open' : ''}`}>
      <button
        className="weather-mini-trigger no-drag"
        type="button"
        aria-expanded={isDetailsOpen}
        onClick={() => setIsDetailsOpen((value) => !value)}
      >
        <span className="weather-mini-label">WEATHER</span>
        <strong>{weatherLabel}</strong>
        <small>{regionLabel}</small>
      </button>

      {isDetailsOpen ? (
        <>
          <button
            className="weather-detail-backdrop no-drag"
            type="button"
            aria-label="关闭天气卡片"
            onPointerDown={stopWeatherDismissPointer}
            onClick={closeWeatherDetails}
          />
          <section
            className={`weather-cinema-card weather-live-card no-drag is-${realWeatherKind} is-live-weather is-detail-open`}
            aria-label="Weather"
            role="dialog"
          >
            <WeatherSceneArtwork kind={realWeatherKind} />

            <button
              className="weather-close-button no-drag"
              type="button"
              aria-label="关闭天气卡片"
              onPointerDown={stopWeatherDismissPointer}
              onClick={closeWeatherDetails}
            >
              ×
            </button>

            <span className="weather-card-live-pill">
              <span>{weather ? 'LIVE' : 'WAIT'}</span>
              {getWeatherBackdropLabel(realWeatherKind)}
            </span>

            <span className={`weather-metric-tray weather-detail-popover ${isDetailsOpen ? 'is-open' : ''}`} aria-hidden={!isDetailsOpen}>
              <span>
                <small>最高</small>
                {formatDegree(weather?.temperatureMaxC)}
              </span>
              <span>
                <small>最低</small>
                {formatDegree(weather?.temperatureMinC)}
              </span>
              <span>
                <small>体感</small>
                {formatDegree(weather?.feelsLikeC)}
              </span>
              <span>
                <small>湿度</small>
                {formatPercent(weather?.humidityPercent)}
              </span>
              <span>
                <small>{extra.label}</small>
                {extra.value}
              </span>
              <span>
                <small>风向风力</small>
                {formatWind(weather, '—')}
              </span>
            </span>

            <span className="weather-card-temp">
              {formatDegree(weather?.temperatureC)}
              <small>C</small>
            </span>
            <strong>{weatherSummaryLabel}</strong>
            <span className="weather-card-summary">{weather ? weather.summary : '—'}</span>

            <span className="weather-air-pill">
              <span>WX</span>
              {weather ? `${regionLabel} · ${getWeatherBackdropLabel(realWeatherKind)}` : '—'}
            </span>

            <span className="weather-live-clock" aria-live="polite">
              {liveTimeLabel}
            </span>
          </section>
        </>
      ) : null}
    </aside>
  );
}
