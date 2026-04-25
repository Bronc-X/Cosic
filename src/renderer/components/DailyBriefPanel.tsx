import type { DailyStationBrief } from '../../shared/contracts/bridge';

interface DailyBriefPanelProps {
  dailyBrief: DailyStationBrief | null;
  currentClock: Date;
}

const formatClock = (value: Date, timezone: string | undefined) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone
  }).format(value);

export function DailyBriefPanel({ dailyBrief, currentClock }: DailyBriefPanelProps) {
  const liveTimeLabel = formatClock(currentClock, dailyBrief?.timezone);
  const weatherLabel = dailyBrief?.weather
    ? `${dailyBrief.weather.temperatureC}° ${dailyBrief.weather.summary}`
    : '天气定位中';

  return (
    <article className="daily-brief-card panel">
      <div className="clock-weather-grid">
        <div className="clock-weather-cell is-time" aria-live="polite">
          <span>TIME</span>
          <strong>{liveTimeLabel}</strong>
        </div>

        <div className="clock-weather-cell">
          <span>REGION</span>
          <strong>{dailyBrief?.regionLabel ?? '定位中'}</strong>
        </div>

        <div className="clock-weather-cell">
          <span>WEATHER</span>
          <strong>{weatherLabel}</strong>
        </div>
      </div>
    </article>
  );
}
