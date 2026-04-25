import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  MediaControlBar,
  MediaController,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeRange,
  MediaVolumeRange
} from 'media-chrome/react';
import type { Track, TrackLyrics } from '../../shared/contracts/bridge';

interface PlaybackDeckProps {
  track: Track | null;
  currentIndex: number;
  totalTracks: number;
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
  notice: string | null;
  sessionTitle: string;
  layoutMode: 'regular' | 'compact';
  isDense: boolean;
  trackInsight: string | null;
  isTrackInsightLoading: boolean;
  trackLyrics: TrackLyrics | null | undefined;
  isLyricsLoading: boolean;
  onRequestLyrics: (trackId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}

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

const buildLocalLinerNote = (track: Track) => {
  const yearCopy = track.year ? `${track.year} 年` : '';
  const tagCopy = track.tags.slice(0, 2).join('、');
  const moodCopy = track.mood || tagCopy || '当前气质';
  const albumCopy = track.album ? `《${track.album}》` : '这首歌';

  return `${track.artist} 的${albumCopy}带着${yearCopy}${moodCopy}的底色，适合先把注意力放稳，再让旋律慢慢接管房间。`;
};

const normalizeCoverUrl = (value: string) => value.replace(/^http:\/\//i, 'https://');

const findActiveLyricLineIndex = (lines: TrackLyrics['lines'], currentTime: number) => {
  if (!lines.length || !Number.isFinite(currentTime)) {
    return -1;
  }

  let activeIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (currentTime + 0.18 < lines[index].time) {
      break;
    }

    activeIndex = index;
  }

  return activeIndex;
};

function TrackSkipIcon({ direction }: { direction: 'previous' | 'next' }) {
  if (direction === 'previous') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.5 6.2H5.2v11.6h2.3V6.2Z" fill="currentColor" />
        <path d="M18.8 6.2L9.4 12l9.4 5.8V6.2Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.5 6.2h2.3v11.6h-2.3V6.2Z" fill="currentColor" />
      <path d="M5.2 6.2L14.6 12l-9.4 5.8V6.2Z" fill="currentColor" />
    </svg>
  );
}

export function PlaybackDeck({
  track,
  currentIndex,
  totalTracks,
  audioElement,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  error,
  notice,
  sessionTitle,
  layoutMode,
  isDense,
  trackInsight,
  isTrackInsightLoading,
  trackLyrics,
  isLyricsLoading,
  onRequestLyrics,
  onPrevious,
  onNext
}: PlaybackDeckProps) {
  const controllerRef = useRef<HTMLElement | null>(null);
  const lyricsPanelRef = useRef<HTMLDivElement | null>(null);
  const activeLyricLineRef = useRef<HTMLDivElement | null>(null);
  const resumePlaybackAfterSpeech = useRef(false);
  const [lyricMode, setLyricMode] = useState(false);
  const [isSpeakingNote, setIsSpeakingNote] = useState(false);
  const [brokenCoverTrackId, setBrokenCoverTrackId] = useState<string | null>(null);
  const lyricLines = trackLyrics?.lines ?? [];
  const activeLyricLineIndex = useMemo(
    () => findActiveLyricLineIndex(lyricLines, currentTime),
    [currentTime, lyricLines]
  );
  const activeLyricLineProgress = useMemo(() => {
    if (activeLyricLineIndex < 0) {
      return 0;
    }

    const activeLine = lyricLines[activeLyricLineIndex];
    const nextLine = lyricLines[activeLyricLineIndex + 1];
    const endTime = nextLine?.time ?? duration;
    const span = Math.max(0.8, endTime - activeLine.time);

    return Math.max(0, Math.min(((currentTime - activeLine.time) / span) * 100, 100));
  }, [activeLyricLineIndex, currentTime, duration, lyricLines]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !audioElement) {
      return;
    }

    audioElement.controls = false;
    audioElement.setAttribute('slot', 'media');

    if (audioElement.parentElement !== controller) {
      controller.appendChild(audioElement);
    }

    return () => {
      if (audioElement.parentElement === controller) {
        controller.removeChild(audioElement);
      }
    };
  }, [audioElement]);

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    []
  );

  useEffect(() => {
    if (lyricMode && track?.id && trackLyrics === undefined) {
      onRequestLyrics(track.id);
    }
  }, [lyricMode, onRequestLyrics, track?.id, trackLyrics]);

  useEffect(() => {
    if (!lyricMode) {
      return;
    }

    activeLyricLineRef.current?.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    });
  }, [activeLyricLineIndex, lyricMode]);

  if (!track) {
    return (
      <section className="playback-deck panel is-empty">
        <div className="empty-state">
          <p className="panel-label">Player</p>
          <h2>NO ACTIVE TRACK</h2>
          <p>The new playback deck will wake up here as soon as the queue resolves a playable track.</p>
        </div>
      </section>
    );
  }

  const chips = [track.mood, track.year, ...track.tags].filter(Boolean).slice(0, 4);
  const localLinerNote = buildLocalLinerNote(track);
  const linerNote = trackInsight?.trim() || (isTrackInsightLoading ? '正在整理曲目介绍。' : localLinerNote);
  const canSpeakNote = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const canReadLinerNote = canSpeakNote && Boolean(linerNote.trim());
  const shouldShowCover = Boolean(track.coverUrl && brokenCoverTrackId !== track.id);

  const finishSpeaking = () => {
    setIsSpeakingNote(false);

    if (resumePlaybackAfterSpeech.current && audioElement) {
      void audioElement.play().catch(() => {
        // Playback may be blocked by the platform if focus changed.
      });
    }

    resumePlaybackAfterSpeech.current = false;
  };

  const readLinerNote = () => {
    if (!canSpeakNote) {
      return;
    }

    if (isSpeakingNote) {
      window.speechSynthesis.cancel();
      finishSpeaking();
      return;
    }

    resumePlaybackAfterSpeech.current = Boolean(audioElement && !audioElement.paused);
    audioElement?.pause();

    const utterance = new SpeechSynthesisUtterance(linerNote);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.94;
    utterance.pitch = 0.92;
    utterance.onend = finishSpeaking;
    utterance.onerror = finishSpeaking;

    window.speechSynthesis.cancel();
    setIsSpeakingNote(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section
      className={`playback-deck panel${layoutMode === 'compact' ? ' is-compact' : ''}${isDense ? ' is-dense' : ''}${isPlaying || isBuffering ? ' is-live' : ''}`}
      style={
        {
          '--player-primary': track.theme.primary,
          '--player-secondary': track.theme.secondary,
          '--player-accent': track.theme.accent
        } as CSSProperties
      }
    >
      <div className="playback-deck-ambient" aria-hidden="true" />
      <div className="playback-deck-grain" aria-hidden="true" />

      <header className="deck-header">
        <div className="deck-header-block deck-header-copy">
          <strong>{sessionTitle}</strong>
          <span>{String(currentIndex + 1).padStart(2, '0')} / {String(totalTracks).padStart(2, '0')}</span>
        </div>
      </header>

      <div className="deck-stage">
        <div className="deck-art-stack">
          <div className="deck-art-halo" aria-hidden="true" />
          <div className="deck-art-shell">
            {shouldShowCover && track.coverUrl ? (
              <img
                src={normalizeCoverUrl(track.coverUrl)}
                alt={`${track.title} cover`}
                className="deck-artwork"
                referrerPolicy="no-referrer"
                onError={() => setBrokenCoverTrackId(track.id)}
              />
            ) : (
              <span className="deck-art-fallback">{track.title.slice(0, 1)}</span>
            )}
          </div>
        </div>

        <div className="deck-copy">
          <p className="deck-eyebrow">{track.artist}</p>
          <h2>{track.title}</h2>
          <p className="deck-album">{track.album}</p>
          <div className="deck-chip-row">
            {chips.map((chip) => (
              <span key={chip} className="deck-chip">
                {chip}
              </span>
            ))}
          </div>

        </div>

        <div className="deck-liner-note deck-header-note deck-focus-panel">
          <div className="deck-liner-note-head">
            <span>{lyricMode ? 'LYRICS' : isTrackInsightLoading && !trackInsight ? 'LINER NOTE' : 'TRACK NOTE'}</span>
            <div className="deck-note-actions">
              <button
                className={lyricMode ? 'deck-lyrics-button is-active' : 'deck-lyrics-button'}
                type="button"
                onClick={() => setLyricMode((current) => !current)}
                aria-pressed={lyricMode}
              >
                {lyricMode ? '介绍' : '歌词'}
              </button>
              {!lyricMode ? (
                <button
                  className="deck-tts-button"
                  type="button"
                  onClick={readLinerNote}
                  disabled={!canReadLinerNote}
                  aria-label={isSpeakingNote ? 'Stop reading track note' : 'Read track note'}
                >
                  {isSpeakingNote ? 'STOP' : 'READ'}
                </button>
              ) : null}
            </div>
          </div>
          {lyricMode ? (
            <div className="deck-lyrics-panel" ref={lyricsPanelRef} aria-live="polite">
              {lyricLines.length > 0 ? (
                lyricLines.map((line, index) => {
                  const isActiveLine = index === activeLyricLineIndex;

                  return (
                    <div
                      key={`${line.time}-${line.text}`}
                      ref={isActiveLine ? activeLyricLineRef : undefined}
                      className={isActiveLine ? 'deck-lyric-line is-active' : 'deck-lyric-line'}
                      style={
                        isActiveLine
                          ? ({ '--lyric-line-progress': `${activeLyricLineProgress}%` } as CSSProperties)
                          : undefined
                      }
                    >
                      <span>{line.text}</span>
                      {line.translation ? <small>{line.translation}</small> : null}
                    </div>
                  );
                })
              ) : (
                <p className="deck-lyrics-empty">{isLyricsLoading ? '正在读取歌词。' : '歌词未接入。'}</p>
              )}
            </div>
          ) : (
            <p>{linerNote}</p>
          )}
        </div>
      </div>

      <MediaController
        audio
        className="deck-controller"
        ref={(element) => {
          controllerRef.current = element as HTMLElement | null;
        }}
      >
        <div className="deck-controller-shell">
          <div className="deck-transport-row">
            <button className="deck-track-button" type="button" onClick={onPrevious} aria-label="Previous track">
              <TrackSkipIcon direction="previous" />
            </button>

            <MediaControlBar className="deck-primary-bar">
              <MediaPlayButton className="deck-play-button" />
              <MediaTimeRange className="deck-time-range" />
            </MediaControlBar>

            <button className="deck-track-button" type="button" onClick={onNext} aria-label="Next track">
              <TrackSkipIcon direction="next" />
            </button>
          </div>

          <div className="deck-secondary-row">
            <span className="deck-readout">{formatTime(currentTime)}</span>

            <MediaControlBar className="deck-volume-bar">
              <MediaMuteButton className="deck-icon-button" />
              <MediaVolumeRange className="deck-volume-range" />
            </MediaControlBar>

            <span className="deck-readout">{formatTime(duration)}</span>
          </div>
        </div>
      </MediaController>

      {notice ? <p className="notice-banner deck-banner">{notice}</p> : null}
      {error ? <p className="error-banner deck-banner">{error}</p> : null}
    </section>
  );
}
