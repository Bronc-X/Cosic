import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Track, TrackLyrics } from '../../shared/contracts/bridge';
import { buildLocalTrackNote } from '../../shared/track-notes';

interface RadioImmersionProps {
  isOpen: boolean;
  track: Track | null;
  currentIndex: number;
  totalTracks: number;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  currentClock: Date;
  trackInsight: string | null;
  isTrackInsightLoading: boolean;
  trackLyrics: TrackLyrics | null | undefined;
  isLyricsLoading: boolean;
  isPreparingRadio: boolean;
  onRequestLyrics: (trackId: string, force?: boolean) => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlayback: () => void;
}

type LyricLine = TrackLyrics['lines'][number];

const LYRIC_CREDIT_PATTERN =
  /^(?:作词|作曲|编曲|制作人|监制|出品|发行|Publisher|OP|SP|ISRC|键盘|吉他|Bass|鼓|录音室|录音师|混音|母带|TWA)\s*[:：]/i;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${remainder}`;
};

const normalizeCoverUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
      return value;
    }
  } catch {
    return value;
  }

  return value.replace(/^http:\/\//i, 'https://');
};

const isRenderableLyricLine = (line: TrackLyrics['lines'][number]) =>
  line.text.trim().length > 0 && !LYRIC_CREDIT_PATTERN.test(line.text.trim());

const compactRadioLyricLines = (lines: LyricLine[]) => {
  const compacted: LyricLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];
    const currentText = current.text.trim();
    const nextText = next?.text.trim() ?? '';

    if (currentText.length > 0 && currentText.length <= 2 && nextText.length > 0 && nextText.length <= 14) {
      compacted.push({
        ...current,
        text: `${currentText} ${nextText}`
      });
      index += 1;
      continue;
    }

    compacted.push({
      ...current,
      text: currentText
    });
  }

  return compacted;
};

const findActiveLyricLineIndex = (lines: TrackLyrics['lines'], currentTime: number) => {
  if (!lines.length || !Number.isFinite(currentTime)) {
    return -1;
  }

  let activeIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (currentTime < lines[index].time) {
      break;
    }

    activeIndex = index;
  }

  return activeIndex;
};

function RadioControlIcon({ type }: { type: 'previous' | 'play' | 'pause' | 'next' }) {
  if (type === 'previous') {
    return (
      <svg className="radio-control-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.2 5.8h2.2v12.4H6.2V5.8Z" fill="currentColor" />
        <path d="M18.4 5.9 10 12l8.4 6.1V5.9Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'next') {
    return (
      <svg className="radio-control-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.6 5.8h2.2v12.4h-2.2V5.8Z" fill="currentColor" />
        <path d="M5.6 5.9 14 12l-8.4 6.1V5.9Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'pause') {
    return (
      <svg className="radio-control-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.2 5.6h3.2v12.8H7.2V5.6Z" fill="currentColor" />
        <path d="M13.6 5.6h3.2v12.8h-3.2V5.6Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg className="radio-control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.4 18.2 12 8 18.6V5.4Z" fill="currentColor" />
    </svg>
  );
}

export function RadioImmersion({
  isOpen,
  track,
  currentIndex,
  totalTracks,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  currentClock,
  trackInsight,
  isTrackInsightLoading,
  trackLyrics,
  isLyricsLoading,
  isPreparingRadio,
  onRequestLyrics,
  onClose,
  onPrevious,
  onNext,
  onTogglePlayback
}: RadioImmersionProps) {
  const lyricsPanelRef = useRef<HTMLDivElement | null>(null);
  const activeLyricLineRef = useRef<HTMLParagraphElement | null>(null);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [brokenCoverKey, setBrokenCoverKey] = useState<string | null>(null);
  const displayTrack = track;

  const lyricDisplayLines = useMemo(
    () => compactRadioLyricLines((trackLyrics?.lines ?? []).filter(isRenderableLyricLine)),
    [trackLyrics]
  );
  const activeLyricLineIndex = useMemo(
    () => findActiveLyricLineIndex(lyricDisplayLines, currentTime),
    [currentTime, lyricDisplayLines]
  );

  useEffect(() => {
    setBrokenCoverKey(null);
  }, [track?.id]);

  useEffect(() => {
    if (isLyricsOpen && track?.id && trackLyrics === undefined) {
      onRequestLyrics(track.id);
    }
  }, [isLyricsOpen, onRequestLyrics, track?.id, trackLyrics]);

  useEffect(() => {
    if (!isLyricsOpen) {
      return;
    }

    const panel = lyricsPanelRef.current;
    const activeLine = activeLyricLineRef.current;

    if (!panel) {
      return;
    }

    if (!activeLine) {
      panel.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const lineRect = activeLine.getBoundingClientRect();
    panel.scrollTo({
      top: Math.max(0, panel.scrollTop + lineRect.top - panelRect.top - 18),
      behavior: 'smooth'
    });
  }, [activeLyricLineIndex, currentTime, isLyricsOpen, lyricDisplayLines.length, track?.id]);

  if (!isOpen) {
    return null;
  }

  const coverKey = displayTrack?.coverUrl ? `${displayTrack.id}:${displayTrack.coverUrl}` : '';
  const shouldShowCover = Boolean(displayTrack?.coverUrl && brokenCoverKey !== coverKey);
  const title = displayTrack?.title ?? '深夜电台';
  const titleClassName =
    title.length > 32 ? 'is-long-title' : title.length > 20 ? 'is-medium-title' : undefined;
  const note = displayTrack
    ? trackInsight?.trim() ||
      (isTrackInsightLoading ? '曲目背景正在从唱片背后慢慢浮上来。' : buildLocalTrackNote(displayTrack))
    : '等一首歌开始，电台会把它背后的时间、声音和记忆慢慢展开。';
  const progress =
    Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min((currentTime / duration) * 100, 100)) : 0;
  const timeLabel = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(currentClock);

  const coverElement = shouldShowCover && displayTrack?.coverUrl ? (
    <img
      src={normalizeCoverUrl(displayTrack.coverUrl)}
      alt={`${displayTrack.title} cover`}
      className="radio-cover-artwork"
      referrerPolicy="no-referrer"
      onError={() => setBrokenCoverKey(coverKey)}
    />
  ) : (
    <span>{displayTrack?.title.trim().slice(0, 1) || 'C'}</span>
  );

  const lyricsContent =
    lyricDisplayLines.length > 0 ? (
      lyricDisplayLines.map((line, index) => {
        const isActiveLine = index === activeLyricLineIndex;
        const distance = activeLyricLineIndex < 0 ? index : Math.abs(index - activeLyricLineIndex);
        const lineClassName = [
          'radio-lyric-line',
          isActiveLine ? 'is-active' : '',
          distance > 3 ? 'is-distant' : '',
          activeLyricLineIndex >= 0 && index < activeLyricLineIndex ? 'is-past' : ''
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <p
            key={`${line.time}-${line.text}`}
            ref={isActiveLine ? activeLyricLineRef : undefined}
            className={lineClassName}
          >
            {line.text}
          </p>
        );
      })
    ) : (
      <div className="radio-lyrics-empty">
        <span>{isLyricsLoading ? '正在读取歌词。' : '歌词未接入。'}</span>
        {!isLyricsLoading && track ? (
          <button type="button" onClick={() => onRequestLyrics(track.id, true)}>
            重试
          </button>
        ) : null}
      </div>
    );

  return (
    <section
      className={`radio-immersion${isPlaying || isBuffering ? ' is-live' : ''}${isPreparingRadio ? ' is-tuning' : ''}`}
      style={
        {
          '--radio-primary': displayTrack?.theme.primary ?? '#f4f1ea',
          '--radio-secondary': displayTrack?.theme.secondary ?? '#08090d',
          '--radio-accent': displayTrack?.theme.accent ?? '#9ec9ff',
          '--radio-progress': `${progress}%`
        } as CSSProperties
      }
      aria-label="Cosic midnight radio"
    >
      <div className="radio-wave-field" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="radio-topbar">
        <span>AFTER 23:00</span>
        <strong>Cosic Radio</strong>
        <div className="radio-topbar-actions">
          <time>{timeLabel}</time>
          <button className="radio-close-button" type="button" onClick={onClose}>
            退出
          </button>
        </div>
      </div>

      <div className="radio-stage">
        <div className={`radio-left-panel${isLyricsOpen ? ' is-lyrics-open' : ''}`}>
          <button
            className="radio-signal-visual"
            type="button"
            onClick={() => setIsLyricsOpen(true)}
            disabled={!displayTrack}
            aria-label="打开电台歌词"
          >
            <div className={shouldShowCover ? 'radio-signal-core has-cover' : 'radio-signal-core'}>
              {coverElement}
            </div>
          </button>

          <div className="radio-lyrics-panel">
            <div className="radio-lyrics-head">
              <span>LYRICS</span>
              <button type="button" onClick={() => setIsLyricsOpen(false)}>
                COVER
              </button>
            </div>
            <div className="radio-lyrics-scroll" ref={lyricsPanelRef} aria-live="polite">
              {lyricsContent}
            </div>
          </div>
        </div>

        <div className="radio-copy">
          <p className="radio-kicker">
            {String(isPreparingRadio ? 0 : currentIndex + 1).padStart(2, '0')} /{' '}
            {String(isPreparingRadio ? 0 : totalTracks).padStart(2, '0')}
          </p>
          <h1 className={titleClassName}>{title}</h1>
          <p className="radio-artist">
            {displayTrack ? `${displayTrack.artist} / ${displayTrack.album}` : '等待播放'}
          </p>
          <p className="radio-note">{note}</p>
        </div>
      </div>

      <div className="radio-footer">
        <div className="radio-progress-track" aria-hidden="true">
          <span />
        </div>
        <div className="radio-controls">
          <button type="button" onClick={onPrevious} aria-label="Previous track" disabled={!track}>
            <RadioControlIcon type="previous" />
          </button>
          <button
            type="button"
            className="radio-play-button"
            onClick={onTogglePlayback}
            disabled={!track}
          >
            <RadioControlIcon type={isPlaying || isBuffering ? 'pause' : 'play'} />
          </button>
          <button type="button" onClick={onNext} aria-label="Next track" disabled={!track}>
            <RadioControlIcon type="next" />
          </button>
        </div>
        <div className="radio-time-row">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </section>
  );
}
