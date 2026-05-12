import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  MediaControlBar,
  MediaController,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeRange,
  MediaVolumeRange
} from 'media-chrome/react';
import type {
  ClassicalScoreSource,
  ClassicalWorkNote,
  ScoreInstrument,
  Track,
  TrackLyrics
} from '../../shared/contracts/bridge';
import { buildLocalTrackNote } from '../../shared/track-notes';

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
  isLyricsView: boolean;
  onRequestLyrics: (trackId: string, force?: boolean) => void;
  onToggleLyricsView: () => void;
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

const buildLocalLinerNote = buildLocalTrackNote;

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

const getNarrationFailureMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (/warming up|stream ended|timed out|terminated|socket|network|fetch failed/i.test(message)) {
    return '语音模型还在预热，稍后再试。';
  }

  return '旁白暂时生成失败，稍后再试。';
};

const EMPTY_LYRIC_LINES: TrackLyrics['lines'] = [];

type ClassicalPanelTab = string;

const LYRIC_CREDIT_PATTERN =
  /^(?:作词|作曲|编曲|制作人|监制|出品|发行|Publisher|OP|SP|ISRC|键盘|吉他|Bass|鼓|录音室|录音师|混音|母带|TWA)\s*[:：]/i;

const isLyricCreditLine = (line: TrackLyrics['lines'][number]) =>
  LYRIC_CREDIT_PATTERN.test(line.text.trim());

const isRenderableLyricLine = (line: TrackLyrics['lines'][number]) => {
  const hasContent = line.text.trim().length > 0 || Boolean(line.translation?.trim());

  return hasContent && !isLyricCreditLine(line);
};

const ENGLISH_LETTER_PATTERN = /[A-Za-z]/g;
const CJK_CHARACTER_PATTERN = /[\u3400-\u9fff]/g;

const countPatternMatches = (value: string, pattern: RegExp) => value.match(pattern)?.length ?? 0;

const isEnglishDominantLyricLine = (text: string) => {
  const englishLetters = countPatternMatches(text, ENGLISH_LETTER_PATTERN);
  const cjkCharacters = countPatternMatches(text, CJK_CHARACTER_PATTERN);

  return englishLetters >= 4 && englishLetters > cjkCharacters;
};

const shouldShowLyricTranslation = (line: TrackLyrics['lines'][number]) =>
  Boolean(line.translation?.trim()) && !isEnglishDominantLyricLine(line.text);

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

const alignActiveLyricLineToTop = (
  panel: HTMLDivElement,
  activeLine: HTMLDivElement,
  behavior: ScrollBehavior = 'smooth'
) => {
  const panelRect = panel.getBoundingClientRect();
  const lineRect = activeLine.getBoundingClientRect();
  const targetTop = panel.scrollTop + lineRect.top - panelRect.top;
  const maxTop = Math.max(0, panel.scrollHeight - panel.clientHeight);

  panel.scrollTo({
    top: Math.max(0, Math.min(targetTop, maxTop)),
    behavior
  });
};

const resetLyricsScrollToStart = (panel: HTMLDivElement) => {
  panel.scrollTo({
    top: 0,
    behavior: 'auto'
  });
};

const CLASSICAL_INTRO_TAB = 'intro';

const CLASSICAL_NOTE_SECTIONS: Array<{ key: keyof ClassicalWorkNote; label: string }> = [
  { key: 'background', label: '创作背景' },
  { key: 'innerWeather', label: '作曲家的心境' },
  { key: 'listeningGuide', label: '聆听线索' },
  { key: 'emotionalThesis', label: '传递的感情' }
];

const getScorePageKind = (page: string) => {
  const cleanPage = page.split(/[?#]/)[0]?.toLowerCase() ?? '';

  if (cleanPage.endsWith('.pdf')) {
    return 'pdf';
  }

  return 'image';
};

const hasRenderableScorePage = (score: ClassicalScoreSource) => score.pages.some((page) => getScorePageKind(page));

const getScoreTabId = (score: ClassicalScoreSource, index: number) =>
  `score-${score.priority ?? 'optional'}-${score.role ?? 'arrangement'}-${score.instrument}-${index}`;

const getInstrumentLabel = (instrument: ScoreInstrument) => {
  switch (instrument) {
    case 'piano':
      return '钢琴';
    case 'violin':
      return '小提琴';
    case 'orchestra':
      return '总谱';
    case 'voice':
      return '声乐';
    default:
      return '谱面';
  }
};

const getScoreRoleLabel = (score: ClassicalScoreSource) => {
  if (score.priority === 'preferred') {
    if (score.role === 'authoritative_full_score') {
      return '权威总谱';
    }

    return '原谱';
  }

  if (score.role === 'reduction') {
    return '缩谱';
  }

  if (score.role === 'arrangement') {
    return '改编谱';
  }

  return '谱面';
};

const getScoreTabLabel = (score: ClassicalScoreSource) => {
  const roleLabel = getScoreRoleLabel(score);
  if (score.role === 'authoritative_full_score') {
    return roleLabel;
  }

  return `${getInstrumentLabel(score.instrument)}${roleLabel}`;
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
  isLyricsView,
  onRequestLyrics,
  onToggleLyricsView,
  onPrevious,
  onNext
}: PlaybackDeckProps) {
  const controllerRef = useRef<HTMLElement | null>(null);
  const lyricsPanelRef = useRef<HTMLDivElement | null>(null);
  const activeLyricLineRef = useRef<HTMLDivElement | null>(null);
  const resumePlaybackAfterSpeech = useRef(false);
  const speechRunId = useRef(0);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationPrewarmKeyRef = useRef<string | null>(null);
  const [isSpeakingNote, setIsSpeakingNote] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [brokenCoverKey, setBrokenCoverKey] = useState<string | null>(null);
  const [classicalTab, setClassicalTab] = useState<ClassicalPanelTab>(CLASSICAL_INTRO_TAB);
  const lyricLines = trackLyrics?.lines ?? EMPTY_LYRIC_LINES;
  const lyricDisplayLines = useMemo(() => lyricLines.filter(isRenderableLyricLine), [lyricLines]);
  const lyricSyncSecond = Math.floor(currentTime);
  const activeLyricLineIndex = useMemo(
    () => findActiveLyricLineIndex(lyricDisplayLines, currentTime),
    [currentTime, lyricDisplayLines]
  );
  const activeLyricLineProgress = useMemo(() => {
    if (activeLyricLineIndex < 0) {
      return 0;
    }

    const activeLine = lyricDisplayLines[activeLyricLineIndex];
    const nextLine = lyricDisplayLines[activeLyricLineIndex + 1];
    const endTime = nextLine?.time ?? duration;
    const span = Math.max(0.8, endTime - activeLine.time);

    return Math.max(0, Math.min(((currentTime - activeLine.time) / span) * 100, 100));
  }, [activeLyricLineIndex, currentTime, duration, lyricDisplayLines]);
  const controlledMediaDuration = Number.isFinite(duration) && duration > 0 ? duration : undefined;
  const controlledMediaCurrentTime = Math.max(
    0,
    Math.min(Number.isFinite(currentTime) ? currentTime : 0, controlledMediaDuration ?? currentTime)
  );
  const controlledMediaSeekable = controlledMediaDuration ? [0, controlledMediaDuration] : undefined;
  const chips = track ? [track.mood, track.year, ...track.tags].filter(Boolean).slice(0, 4) : [];
  const localLinerNote = track ? buildLocalLinerNote(track) : '';
  const linerNote = trackInsight?.trim() || (isTrackInsightLoading ? '正在整理曲目介绍。' : localLinerNote);
  const canSpeakNote = typeof window !== 'undefined' && Boolean(window.cosic?.generateNarrationAudio);
  const canReadLinerNote = canSpeakNote && !isTrackInsightLoading && Boolean(linerNote.trim());
  const coverKey = track?.coverUrl ? `${track.id}:${track.coverUrl}` : '';
  const shouldShowCover = Boolean(track?.coverUrl && brokenCoverKey !== coverKey);
  const classicalProfile = track?.classical;
  const isClassicalTrack = Boolean(classicalProfile?.isClassical);
  const classicalScores = classicalProfile?.scores ?? [];
  const preferredClassicalScore =
    classicalScores.find((score) => score.priority === 'preferred') ??
    classicalScores[0];
  const optionalViolinArrangement = classicalScores.find(
    (score) => score.instrument === 'violin' && score.priority === 'optional' && score.role === 'arrangement'
  );
  const scoreTabs = classicalScores.map((score, index) => ({
    id: getScoreTabId(score, index),
    label: getScoreTabLabel(score),
    score
  }));
  const activeScoreTab = scoreTabs.find((tab) => tab.id === classicalTab);
  const activeScore =
    classicalTab === 'intro'
      ? undefined
      : activeScoreTab?.score ?? preferredClassicalScore;
  const classicalActionLabel = isClassicalTrack ? '谱面' : '歌词';
  const classicalActionAria = isClassicalTrack ? '打开谱面阅读' : '打开歌词';

  const classicalTitle =
    typeof classicalProfile?.note === 'object'
      ? classicalProfile.note.workTitle || track?.title
      : track?.title;
  const classicalComposer =
    typeof classicalProfile?.note === 'object'
      ? classicalProfile.note.composer || track?.artist
      : track?.artist;

  useEffect(() => {
    setClassicalTab(CLASSICAL_INTRO_TAB);
  }, [track?.id]);

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
      speechRunId.current += 1;
      narrationAudioRef.current?.pause();
      narrationAudioRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (isLyricsView && track?.id && trackLyrics === undefined) {
      onRequestLyrics(track.id);
    }
  }, [isLyricsView, onRequestLyrics, track?.id, trackLyrics]);

  useEffect(() => {
    if (!isLyricsView) {
      return;
    }

    const syncActiveLine = (behavior: ScrollBehavior) => {
      const panel = lyricsPanelRef.current;

      if (!panel) {
        return;
      }

      if (activeLyricLineIndex < 0) {
        resetLyricsScrollToStart(panel);
        return;
      }

      const activeLine = activeLyricLineRef.current;

      if (activeLine) {
        alignActiveLyricLineToTop(panel, activeLine, behavior);
      }
    };

    const frame = window.requestAnimationFrame(() => {
      syncActiveLine('auto');
    });
    const lateFrame = window.setTimeout(() => {
      syncActiveLine(activeLyricLineIndex < 0 ? 'auto' : 'smooth');
    }, 120);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(lateFrame);
    };
  }, [activeLyricLineIndex, isLyricsView, lyricDisplayLines.length, lyricSyncSecond, track?.id, trackLyrics]);

  useEffect(() => {
    if (!track || !canReadLinerNote || isSpeakingNote) {
      return;
    }

    const prewarmKey = `${track.id}:${linerNote}`;
    if (narrationPrewarmKeyRef.current === prewarmKey) {
      return;
    }

    const timeout = window.setTimeout(() => {
      narrationPrewarmKeyRef.current = prewarmKey;
      void window.cosic.generateNarrationAudio(linerNote).catch(() => {
        if (narrationPrewarmKeyRef.current === prewarmKey) {
          narrationPrewarmKeyRef.current = null;
        }
      });
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [canReadLinerNote, isSpeakingNote, linerNote, track?.id, track]);

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

  const stopNarrationAudio = () => {
    if (!narrationAudioRef.current) {
      return;
    }

    narrationAudioRef.current.pause();
    narrationAudioRef.current.removeAttribute('src');
    narrationAudioRef.current.load();
    narrationAudioRef.current = null;
  };

  const finishSpeaking = () => {
    stopNarrationAudio();
    setIsSpeakingNote(false);

    if (resumePlaybackAfterSpeech.current && audioElement) {
      void audioElement.play().catch(() => {
        // Playback may be blocked by the platform if focus changed.
      });
    }

    resumePlaybackAfterSpeech.current = false;
  };

  const readLinerNote = () => {
    if (!canReadLinerNote) {
      return;
    }

    if (isSpeakingNote) {
      speechRunId.current += 1;
      stopNarrationAudio();
      finishSpeaking();
      return;
    }

    setNarrationError(null);
    resumePlaybackAfterSpeech.current = Boolean(audioElement && !audioElement.paused);
    audioElement?.pause();

    const runId = speechRunId.current + 1;
    speechRunId.current = runId;

    setIsSpeakingNote(true);
    void window.cosic
      .generateNarrationAudio(linerNote)
      .then((narration) => {
        if (runId !== speechRunId.current) {
          return;
        }

        const narrationAudio = new Audio(`data:${narration.mimeType};base64,${narration.audioBase64}`);
        narrationAudioRef.current = narrationAudio;
        narrationAudio.onended = () => {
          if (runId === speechRunId.current) {
            finishSpeaking();
          }
        };
        narrationAudio.onerror = () => {
          if (runId === speechRunId.current) {
            setNarrationError('CosyVoice audio could not be played.');
            finishSpeaking();
          }
        };
        void narrationAudio.play().catch(() => {
          if (runId === speechRunId.current) {
            setNarrationError('CosyVoice audio could not be played.');
            finishSpeaking();
          }
        });
      })
      .catch((err) => {
        if (runId === speechRunId.current) {
          setNarrationError(getNarrationFailureMessage(err));
          finishSpeaking();
        }
      });
  };

  const coverElement = shouldShowCover && track.coverUrl ? (
    <img
      src={normalizeCoverUrl(track.coverUrl)}
      alt={`${track.title} cover`}
      className="deck-artwork"
      referrerPolicy="no-referrer"
      onError={() => setBrokenCoverKey(coverKey)}
    />
  ) : (
    <span className="deck-art-fallback">{track.title.slice(0, 1)}</span>
  );

  const lyricsContent =
    lyricDisplayLines.length > 0 ? (
      lyricDisplayLines.map((line, index) => {
        const isActiveLine = index === activeLyricLineIndex;
        const shouldRenderTranslation = shouldShowLyricTranslation(line);

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
            {shouldRenderTranslation ? <small>{line.translation}</small> : null}
          </div>
        );
      })
    ) : (
      <div className="deck-lyrics-empty">
        <span>{isLyricsLoading ? '正在读取歌词。' : '歌词未接入。'}</span>
        {!isLyricsLoading ? (
          <button
            className="deck-lyrics-retry"
            type="button"
            onClick={() => onRequestLyrics(track.id, true)}
          >
            重新读取
          </button>
        ) : null}
      </div>
    );

  const classicalIntroContent =
    typeof classicalProfile?.note === 'object' ? (
      <>
        <div className="deck-classical-work-title">
          <span>{classicalComposer}</span>
          <strong>{classicalTitle}</strong>
          {classicalProfile.note.period ? <small>{classicalProfile.note.period}</small> : null}
        </div>
        <div className="deck-classical-note-grid">
          {CLASSICAL_NOTE_SECTIONS.map(({ key, label }) => {
            const sectionText = classicalProfile.note && typeof classicalProfile.note === 'object'
              ? classicalProfile.note[key]
              : undefined;

            return sectionText ? (
              <section key={key} className="deck-classical-note-section">
                <span>{label}</span>
                <p>{sectionText}</p>
              </section>
            ) : null;
          })}
        </div>
      </>
    ) : (
      <>
        <div className="deck-classical-work-title">
          <span>{classicalComposer}</span>
          <strong>{classicalTitle}</strong>
        </div>
        <p className="deck-classical-note-fallback">{classicalProfile?.note || linerNote}</p>
      </>
    );

  const renderClassicalScore = (score: ClassicalScoreSource, mode: 'compact' | 'reader' = 'compact') => (
    <>
        <div
          className={
            mode === 'reader'
              ? 'deck-classical-score-meta deck-classical-reader-meta'
              : 'deck-classical-score-meta'
          }
        >
          <small className="deck-classical-score-role">{getScoreRoleLabel(score)}</small>
          <strong>{score.title || getScoreTabLabel(score)}</strong>
          <span>
            {[score.sourceLabel, score.licenseLabel].filter(Boolean).join(' / ') || '已验证公共版权谱源'}
          </span>
        </div>
        {hasRenderableScorePage(score) ? (
          <div className="deck-classical-score-pages">
            {score.pages.map((page, pageIndex) => {
              const pageKind = getScorePageKind(page);

              return (
                <figure key={`${page}-${pageIndex}`} className="deck-classical-score-page">
                  {pageKind === 'pdf' ? (
                    <object data={page} type="application/pdf" title={`${score.title || getScoreTabLabel(score)} page ${pageIndex + 1}`}>
                      <a href={page} target="_blank" rel="noreferrer">打开谱源</a>
                    </object>
                  ) : (
                    <img src={page} alt={`${score.title || getScoreTabLabel(score)} score page ${pageIndex + 1}`} />
                  )}
                </figure>
              );
            })}
          </div>
        ) : (
          <div className="deck-classical-score-prompt">
            <span>{score.priority === 'preferred' ? '已确认权威谱源' : '谱源待打开'}</span>
            <p>这首已经匹配到可信来源页，但还没有整理成可直接嵌入阅读的 PDF 页面。先打开原始谱源，Cosic 不把网页误装成谱面。</p>
            {score.sourceUrl ? (
              <a className="deck-classical-source-link" href={score.sourceUrl} target="_blank" rel="noreferrer">
                打开谱源
              </a>
            ) : null}
          </div>
        )}
    </>
  );

  const classicalReaderScore =
    classicalTab === CLASSICAL_INTRO_TAB
      ? preferredClassicalScore
      : activeScore;

  const classicalLyricsContent = (
    <div className="deck-classical-reader">
      <aside className="deck-classical-reader-sidebar">
        <div className="deck-classical-reader-kicker">谱面阅读</div>
        {classicalIntroContent}
        <div className="deck-classical-reader-tabs" role="tablist" aria-label="Classical score reader tabs">
          {scoreTabs.map((tab) => {
            const isActiveTab = classicalReaderScore === tab.score;

            return (
              <button
                key={tab.id}
                className={isActiveTab ? 'deck-classical-tab is-active' : 'deck-classical-tab'}
                type="button"
                role="tab"
                aria-selected={isActiveTab}
                onClick={() => setClassicalTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
          {!optionalViolinArrangement ? <span className="deck-classical-arrangement-note">无可靠小提琴改编</span> : null}
        </div>
      </aside>

      <section className="deck-classical-reader-score" aria-label={`${classicalTitle} staff notation`}>
        {classicalReaderScore ? (
          renderClassicalScore(classicalReaderScore, 'reader')
        ) : (
          <div className="deck-classical-score-prompt">
            <span>未收录可信谱源</span>
            <p>识别到古典作品，但还没有找到可验证的公共版权谱源。Cosic 会留白，不用不可靠的谱面填满它。</p>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <section
      className={`playback-deck panel${layoutMode === 'compact' ? ' is-compact' : ''}${isDense ? ' is-dense' : ''}${isLyricsView ? ' is-lyrics-view' : ''}${isPlaying || isBuffering ? ' is-live' : ''}`}
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
        {isLyricsView ? (
          <button
            className="deck-lyrics-button deck-lyrics-back-button deck-lyrics-header-back"
            type="button"
            onClick={onToggleLyricsView}
            aria-label="返回播放器介绍"
          >
            返回播放
          </button>
        ) : null}
      </header>

      {isLyricsView && isClassicalTrack ? (
        <div className="deck-stage deck-lyrics-stage deck-classical-lyrics-stage">
          {classicalLyricsContent}
        </div>
      ) : isLyricsView ? (
        <div className="deck-stage deck-lyrics-stage">
          <div className="deck-lyrics-shell">
            <div className="deck-lyrics-trackbar">
              <div className="deck-lyrics-cover-shell">{coverElement}</div>
              <div className="deck-lyrics-track-copy">
                <span>{track.artist}</span>
                <strong>{track.title}</strong>
                {track.album ? <small>{track.album}</small> : null}
              </div>
            </div>

            <div
              className="deck-lyrics-panel deck-lyrics-scroll deck-lyrics-view-panel is-karaoke-scale"
              ref={lyricsPanelRef}
              aria-live="polite"
            >
              {lyricsContent}
            </div>
          </div>
        </div>
      ) : (
      <div className="deck-stage">
        <div className="deck-art-stack">
          <div className="deck-art-halo" aria-hidden="true" />
          <div className="deck-art-shell">{coverElement}</div>
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

        <div className={`deck-liner-note deck-header-note deck-focus-panel${isClassicalTrack ? ' deck-classical-panel' : ''}`}>
          <div className="deck-liner-note-head">
            <span>
              {isClassicalTrack
                ? '古典作品'
                : isTrackInsightLoading && !trackInsight
                  ? 'LINER NOTE'
                  : 'TRACK NOTE'}
            </span>
            <div className="deck-note-actions">
              {!isLyricsView ? (
                <button
                  className="deck-lyrics-button"
                  type="button"
                  onClick={onToggleLyricsView}
                  aria-pressed={isLyricsView}
                  aria-label={classicalActionAria}
                >
                  {classicalActionLabel}
                </button>
              ) : null}
              {!isLyricsView ? (
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
          {isClassicalTrack ? (
            <>
              <div id="deck-classical-panel-content" className="deck-classical-content" role="tabpanel">
                {classicalIntroContent}
                <div className="deck-classical-score-prompt deck-classical-score-invite">
                  <span>{preferredClassicalScore ? getScoreTabLabel(preferredClassicalScore) : '谱面留白'}</span>
                  <p>
                    {preferredClassicalScore
                      ? hasRenderableScorePage(preferredClassicalScore)
                        ? '进入沉浸阅读，展开原谱或权威总谱。'
                        : '已找到可信来源页，进入 Reader 后可打开谱源；可嵌入谱页会继续补齐。'
                      : '这首暂未放入可验证谱面，先留白。'}
                  </p>
                  <div className="deck-classical-score-actions">
                    <button className="deck-lyrics-button" type="button" onClick={onToggleLyricsView}>
                      打开谱面
                    </button>
                    {!optionalViolinArrangement ? <span className="deck-classical-arrangement-note">小提琴改编暂缺</span> : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p>{linerNote}</p>
          )}
          {narrationError ? <small className="deck-tts-error">{narrationError}</small> : null}
        </div>
      </div>
      )}

      <MediaController
        audio
        className="deck-controller"
        ref={(element) => {
          controllerRef.current = element as HTMLElement | null;
        }}
      >
        <div className={isLyricsView ? 'deck-controller-shell deck-mini-player' : 'deck-controller-shell'}>
          <div className="deck-transport-row">
            <button className="deck-track-button" type="button" onClick={onPrevious} aria-label="Previous track">
              <TrackSkipIcon direction="previous" />
            </button>

            <MediaControlBar className="deck-primary-bar">
              <MediaPlayButton className="deck-play-button" mediaPaused={!isPlaying} />
              <MediaTimeRange
                className="deck-time-range"
                mediaPaused={!isPlaying}
                mediaCurrentTime={controlledMediaCurrentTime}
                mediaDuration={controlledMediaDuration}
                mediaSeekable={controlledMediaSeekable}
              />
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
