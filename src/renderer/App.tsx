import { startTransition, useEffect, useRef, useState } from 'react';
import type {
  BootstrapPayload,
  CuratedPlaylist,
  DailyStationBrief,
  LibraryPlaylist,
  MusicTasteProfile,
  Track,
  TrackLyrics,
  WindowState
} from '../shared/contracts/bridge';
import { CuratorPanel, type CuratorMessage } from './components/CuratorPanel';
import { CursorParticleField } from './components/CursorParticleField';
import { DailyBriefPanel } from './components/DailyBriefPanel';
import { LocationPermissionDialog } from './components/LocationPermissionDialog';
import { PlaybackDeck } from './components/PlaybackDeck';
import { QueueOverlay } from './components/QueueOverlay';
import { QueueRail } from './components/QueueRail';
import { TitleBar } from './components/TitleBar';
import { useAudioPlayer } from './hooks/useAudioPlayer';

type LayoutMode = 'regular' | 'compact';

interface ClientLocationContext {
  latitude?: number;
  longitude?: number;
  regionLabel?: string;
}

const defaultWindowState: WindowState = {
  maximized: false,
  platform: 'win32'
};

const initialMessages: CuratorMessage[] = [
  {
    id: 'intro-assistant',
    role: 'assistant',
    text: '说一句你现在的状态，我来排队列。'
  }
];

const CHAT_HISTORY_KEY = 'cosic-chat-history-v1';
const LOCATION_CHOICE_KEY = 'cosic-location-choice-v1';

const loadInitialMessages = (): CuratorMessage[] => {
  try {
    const rawHistory = window.localStorage.getItem(CHAT_HISTORY_KEY);
    if (!rawHistory) {
      return initialMessages;
    }

    const parsed = JSON.parse(rawHistory) as CuratorMessage[];
    const history = parsed.filter(
      (message) =>
        typeof message.id === 'string' &&
        (message.role === 'assistant' || message.role === 'user') &&
        typeof message.text === 'string'
    );

    return history.length > 0 ? history : initialMessages;
  } catch {
    return initialMessages;
  }
};

const DAILY_REQUEST_PROMPT = [
  '请基于我今天的真实环境做一组今日随机歌单。',
  '必须同时参考：当地时间、星期、所在地区、天气与温度、我今天的情绪猜测、以及我的长期听歌画像。',
  '不要给泛泛的“热门”“治愈”“轻音乐”，要像一个懂我历史听歌习惯的个人电台编辑。',
  '队列需要有清楚的起承转合：开场稳住，中段推进，结尾留白或收束。',
  '宁可更准，不要更满；宁可克制，不要套路。'
].join('');

void DAILY_REQUEST_PROMPT;

const buildTasteNarration = (profile: MusicTasteProfile) => {
  const leadArtist = profile.topArtists[0]?.label;

  if (leadArtist) {
    return `画像已更新：${profile.archetype}，核心锚点是 ${leadArtist}。`;
  }

  return `画像已更新：${profile.archetype}。`;
};

const DAILY_MIX_PROMPT = [
  '任务：为我生成一组只属于今天此刻的随机歌单，不要做成泛用推荐。',
  '必须同时综合这些真实上下文：',
  '1. 我所在地区、时区、当地当前时间和星期。',
  '2. 当地天气、温度、体感温度；如果天气缺失，就明确忽略，不要编造。',
  '3. 你对我今天情绪、能量、注意力状态的猜测。',
  '4. 我的长期听歌画像，包括常听艺人、年代、专辑、歌单结构和重复回访习惯。',
  '目标：从我的长期口味里，挑出最适合今天这个时间点和环境的一小段切片，而不是给所有人都成立的“热门/治愈/轻音乐”答案。',
  '编排要求：整组歌单要像一个人真的编辑过的电台时段，开场先稳住气压，中段逐步推进，后段留白或收束，不能平铺直叙。',
  '严格避免：同一艺人扎堆、重复曲目、相近版本反复出现、风格断裂、为了随机而乱跳、套模板式情绪词。',
  '优先少而准，宁可克制也不要贪多；重点是贴脸、像我、像今天。'
].join('\n');

const getLayoutMode = (): LayoutMode =>
  window.innerWidth <= 1180 || window.innerHeight <= 780 ? 'compact' : 'regular';

const getIsDensePlayer = () => window.innerWidth > 1180 && window.innerHeight <= 980;

const pickRandomPlaylists = (playlists: LibraryPlaylist[], limit = 9) => {
  const seed = Date.now();

  return [...playlists]
    .sort((left, right) => {
      const leftScore = Math.sin(seed + Number(left.id.replace(/\D/g, '').slice(-6) || left.name.length));
      const rightScore = Math.sin(seed + Number(right.id.replace(/\D/g, '').slice(-6) || right.name.length));
      return leftScore - rightScore;
    })
    .slice(0, limit);
};

const requestClientLocation = () =>
  new Promise<ClientLocationContext>((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({
        regionLabel: '定位不可用'
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          regionLabel: '当前位置',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () =>
        resolve({
          regionLabel: '定位未授权'
        }),
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 1000 * 60 * 30
      }
    );
  });

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [windowState, setWindowState] = useState<WindowState>(defaultWindowState);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => getLayoutMode());
  const [isDensePlayer, setIsDensePlayer] = useState(() => getIsDensePlayer());
  const [bootError, setBootError] = useState<string | null>(null);
  const [messages, setMessages] = useState<CuratorMessage[]>(() => loadInitialMessages());
  const [curation, setCuration] = useState<CuratedPlaylist | null>(null);
  const [curationError, setCurationError] = useState<string | null>(null);
  const [isGeneratingCuration, setIsGeneratingCuration] = useState(false);
  const [tasteProfile, setTasteProfile] = useState<MusicTasteProfile | null>(null);
  const [dailyBrief, setDailyBrief] = useState<DailyStationBrief | null>(null);
  const [isAnalyzingTaste, setIsAnalyzingTaste] = useState(false);
  const [isSwitchingLibrary, setIsSwitchingLibrary] = useState(false);
  const [isQueueOverlayOpen, setIsQueueOverlayOpen] = useState(false);
  const [queueTracks, setQueueTracks] = useState<Track[]>([]);
  const [randomPlaylists, setRandomPlaylists] = useState<LibraryPlaylist[]>([]);
  const [clientLocation, setClientLocation] = useState<ClientLocationContext | null>(null);
  const [isLocationPromptVisible, setIsLocationPromptVisible] = useState(() => {
    const locationChoice = window.localStorage.getItem(LOCATION_CHOICE_KEY);
    return locationChoice !== 'allowed' && locationChoice !== 'skipped';
  });
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [queueToken, setQueueToken] = useState('library-seed');
  const [autoplayQueueToken, setAutoplayQueueToken] = useState<string | null>(null);
  const [trackInsights, setTrackInsights] = useState<Record<string, string>>({});
  const [loadingTrackInsightId, setLoadingTrackInsightId] = useState<string | null>(null);
  const [trackLyrics, setTrackLyrics] = useState<Record<string, TrackLyrics | null>>({});
  const [loadingLyricsTrackId, setLoadingLyricsTrackId] = useState<string | null>(null);
  const [currentClock, setCurrentClock] = useState(() => new Date());
  const hasAutoAnalyzedTaste = useRef(false);
  const hasAutoGeneratedDaily = useRef(false);

  const libraryTracks = bootstrap?.tracks ?? [];
  const activeTracks = queueTracks.length > 0 ? queueTracks : libraryTracks;
  const {
    currentTrack,
    currentIndex,
    audioElement,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    error,
    notice,
    playTrack,
    nextTrack,
    previousTrack,
  } = useAudioPlayer(activeTracks, queueToken);

  const buildClientContext = (requestKind: 'manual' | 'daily') => {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    const timezone = resolved.timeZone || 'Asia/Shanghai';

    return {
      requestKind,
      locale: navigator.language || resolved.locale || 'zh-CN',
      timezone,
      localTimeIso: new Date().toISOString(),
      regionLabel: clientLocation?.regionLabel ?? '等待定位',
      latitude: clientLocation?.latitude,
      longitude: clientLocation?.longitude
    };
  };

  async function analyzeTaste(shouldAnnounce = true) {
    if (isAnalyzingTaste) {
      return;
    }

    setIsAnalyzingTaste(true);
    setCurationError(null);

    try {
      const profile = await window.cosic.analyzeMusicTaste();
      setTasteProfile(profile);

      if (shouldAnnounce) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-taste-${Date.now()}`,
            role: 'assistant',
            text: buildTasteNarration(profile)
          }
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '读取听歌画像失败。';
      setCurationError(message);

      if (shouldAnnounce) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-taste-error-${Date.now()}`,
            role: 'assistant',
            text: message
          }
        ]);
      }
    } finally {
      setIsAnalyzingTaste(false);
    }
  }

  async function refreshDailyBrief() {
    try {
      const brief = await window.cosic.getDailyStationBrief(buildClientContext('daily'));
      setDailyBrief(brief);
    } catch {
      // Daily brief is additive. Keep the UI usable even if it fails.
    }
  }

  async function requestAndApplyLocation() {
    setIsRequestingLocation(true);

    try {
      const location = await requestClientLocation();
      setClientLocation(location);
      window.localStorage.setItem(LOCATION_CHOICE_KEY, location.latitude ? 'allowed' : 'denied');
    } finally {
      setIsRequestingLocation(false);
      setIsLocationPromptVisible(false);
    }
  }

  async function requestTrackLyrics(trackId: string) {
    if (trackLyrics[trackId] !== undefined || loadingLyricsTrackId === trackId) {
      return;
    }

    setLoadingLyricsTrackId(trackId);

    try {
      const lyrics = await window.cosic.getTrackLyrics(trackId);
      setTrackLyrics((current) => ({
        ...current,
        [trackId]: lyrics
      }));
    } catch {
      setTrackLyrics((current) => ({
        ...current,
        [trackId]: null
      }));
    } finally {
      setLoadingLyricsTrackId((current) => (current === trackId ? null : current));
    }
  }

  function skipLocationRequest() {
    setClientLocation({
      regionLabel: '定位未授权'
    });
    window.localStorage.setItem(LOCATION_CHOICE_KEY, 'skipped');
    setIsLocationPromptVisible(false);
  }

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      try {
        const [payload, state] = await Promise.all([
          window.cosic.getBootstrap(),
          window.cosic.getWindowState()
        ]);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setBootstrap(payload);
          setWindowState(state);
          setQueueTracks(payload.tracks);
          setRandomPlaylists(pickRandomPlaylists(payload.playlists));
          setQueueToken('library-bootstrap');
          setLayoutMode(getLayoutMode());
          setIsDensePlayer(getIsDensePlayer());
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setBootError('本地 bridge 启动失败，请检查音乐 bridge 和 .env.local 配置。');
      }
    };

    void hydrate();
    const unsubscribe = window.cosic.onWindowStateChange((state) => {
      startTransition(() => {
        setWindowState(state);
      });
    });
    const handleResize = () => {
      setLayoutMode(getLayoutMode());
      setIsDensePlayer(getIsDensePlayer());
    };

    window.addEventListener('resize', handleResize);
    const clockTimer = window.setInterval(() => {
      setCurrentClock(new Date());
    }, 1000);

    return () => {
      isMounted = false;
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      window.clearInterval(clockTimer);
    };
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem(LOCATION_CHOICE_KEY) !== 'allowed' || clientLocation?.latitude) {
      return;
    }

    void requestAndApplyLocation();
  }, [clientLocation?.latitude]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-80)));
  }, [messages]);

  useEffect(() => {
    if (!bootstrap) {
      return;
    }

    void refreshDailyBrief();

    setMessages((current) => {
      if (current.length !== 1 || current[0]?.id !== 'intro-assistant') {
        return current;
      }

      return [
        {
          id: 'intro-assistant',
          role: 'assistant',
          text:
            bootstrap.libraryContext.source === 'live'
              ? '歌库已接入。'
              : '演示歌库已就绪。'
        }
      ];
    });
  }, [bootstrap]);

  useEffect(() => {
    if (!bootstrap || !clientLocation) {
      return;
    }

    void refreshDailyBrief();
  }, [bootstrap, clientLocation]);

  useEffect(() => {
    if (!currentTrack?.id || trackInsights[currentTrack.id]) {
      return;
    }

    let isCancelled = false;
    const trackId = currentTrack.id;
    setLoadingTrackInsightId(trackId);

    void window.cosic
      .generateTrackInsight(trackId)
      .then((insight) => {
        if (isCancelled || !insight.text.trim()) {
          return;
        }

        setTrackInsights((current) => ({
          ...current,
          [trackId]: insight.text.trim()
        }));
      })
      .catch(() => {
        // The playback deck has a local liner-note fallback.
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingTrackInsightId((current) => (current === trackId ? null : current));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentTrack?.id, trackInsights]);

  useEffect(() => {
    if (!bootstrap || bootstrap.libraryContext.source !== 'live' || hasAutoAnalyzedTaste.current) {
      return;
    }

    hasAutoAnalyzedTaste.current = true;
    void analyzeTaste(false);
  }, [bootstrap]);

  useEffect(() => {
    if (!bootstrap || !dailyBrief || hasAutoGeneratedDaily.current) {
      return;
    }

    hasAutoGeneratedDaily.current = true;
    void generateDailyMix(false);
  }, [bootstrap, dailyBrief]);

  useEffect(() => {
    if (!autoplayQueueToken || autoplayQueueToken !== queueToken || activeTracks.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      playTrack(0);
      setAutoplayQueueToken((current) => (current === queueToken ? null : current));
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeTracks.length, autoplayQueueToken, playTrack, queueToken]);

  const generateCuration = async (
    input: string,
    options?: {
      requestKind?: 'manual' | 'daily';
      appendUserMessage?: boolean;
      appendAssistantMessage?: boolean;
      userDisplayText?: string;
    }
  ) => {
    const prompt = input.trim();
    const requestKind = options?.requestKind ?? 'manual';
    const appendUserMessage = options?.appendUserMessage ?? true;
    const appendAssistantMessage = options?.appendAssistantMessage ?? true;

    if (!prompt) {
      return;
    }

    if (appendUserMessage) {
      setMessages((current) => [
        ...current,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          text: options?.userDisplayText ?? prompt
        }
      ]);
    }

    setIsGeneratingCuration(true);
    setCurationError(null);

    try {
      const result = await window.cosic.generateCuratedPlaylist({
        input: prompt,
        context: buildClientContext(requestKind)
      });

      setCuration(result);
      setQueueTracks(result.tracks);
      setQueueToken(result.id);
      setAutoplayQueueToken(result.id);
      if (result.dailyBrief) {
        setDailyBrief(result.dailyBrief);
      }
      if (appendAssistantMessage) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: result.reply
          }
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成歌单失败。';
      setCurationError(message);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          text: message
        }
      ]);
    } finally {
      setIsGeneratingCuration(false);
    }
  };

  const generateDailyMix = async (appendUserMessage = true) => {
    await refreshDailyBrief();
    await generateCuration(DAILY_MIX_PROMPT, {
      requestKind: 'daily',
      appendUserMessage,
      appendAssistantMessage: appendUserMessage,
      userDisplayText: '给我今天的随机歌单。'
    });
  };

  const replayCurationFromStart = () => {
    if (!curation) {
      return;
    }

    const replayToken = `${curation.id}-replay-${Date.now()}`;
    setQueueTracks(curation.tracks);
    setQueueToken(replayToken);
    setAutoplayQueueToken(replayToken);
  };

  const remixCuration = (instruction: string) => {
    if (!curation) {
      return;
    }

    void generateCuration(`${curation.prompt}\n${instruction}`, {
      requestKind: curation.requestKind,
      appendUserMessage: true,
      userDisplayText: instruction
    });
  };

  const restoreLibrary = () => {
    setCuration(null);
    setCurationError(null);
    setAutoplayQueueToken(null);
    setQueueTracks(libraryTracks);
    setQueueToken(`library-${Date.now()}`);
    setMessages((current) => [
      ...current,
        {
          id: `assistant-reset-${Date.now()}`,
          role: 'assistant',
          text: '已回到原始歌单。'
        }
      ]);
  };

  const switchLibrary = async (playlistId: string) => {
    if (!bootstrap || isSwitchingLibrary) {
      return;
    }

    if (playlistId === bootstrap.activePlaylistId && !curation) {
      const replayToken = `library-${playlistId}-${Date.now()}`;
      setQueueTracks(activeTracks);
      setQueueToken(replayToken);
      setAutoplayQueueToken(replayToken);
      return;
    }

    setIsSwitchingLibrary(true);
    setCuration(null);
    setCurationError(null);
    setAutoplayQueueToken(null);

    try {
      const result = await window.cosic.loadLibraryPlaylist(playlistId);

      setBootstrap((current) =>
        current
          ? {
              ...current,
              tracks: result.tracks,
              libraryContext: result.libraryContext,
              activePlaylistId: result.activePlaylistId
            }
          : current
      );
      setQueueTracks(result.tracks);
      const playlistToken = `library-${playlistId}-${Date.now()}`;
      setQueueToken(playlistToken);
      setAutoplayQueueToken(playlistToken);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-library-${Date.now()}`,
          role: 'assistant',
          text: '已切到这张歌单。'
        }
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '切换歌单失败。';
      setCurationError(message);
    } finally {
      setIsSwitchingLibrary(false);
    }
  };

  if (bootError) {
    return (
      <main className="loading-screen">
        <p className="panel-label">Bridge</p>
        <h1>CONNECT FAIL</h1>
        <p>{bootError}</p>
      </main>
    );
  }

  if (!bootstrap) {
    return (
      <main className="loading-screen">
        <p className="panel-label">Loading</p>
        <h1>Cosic</h1>
        <p>正在装载播放器。</p>
      </main>
    );
  }

  const libraryContext = bootstrap.libraryContext;
  const sessionTitle = curation?.title ?? libraryContext.title;
  const queueMeta = curation
    ? `${curation.tracks.length} TRACKS`
    : `${bootstrap.playlists.length} PLAYLISTS`;
  const titlebarLabel = libraryContext.source === 'live' ? 'YOUR LIBRARY' : 'DEMO LIBRARY';
  const currentTrackInsight = currentTrack ? trackInsights[currentTrack.id] ?? null : null;
  const isTrackInsightLoading = Boolean(currentTrack && loadingTrackInsightId === currentTrack.id);
  const currentTrackLyrics = currentTrack ? trackLyrics[currentTrack.id] : undefined;
  const isLyricsLoading = Boolean(currentTrack && loadingLyricsTrackId === currentTrack.id);

  const leftConsoleStack = (
    <>
      <PlaybackDeck
        track={currentTrack}
        currentIndex={currentIndex}
        totalTracks={activeTracks.length}
        audioElement={audioElement}
        isPlaying={isPlaying}
        isBuffering={isBuffering}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        error={error}
        notice={notice}
        sessionTitle={sessionTitle}
        layoutMode={layoutMode}
        isDense={isDensePlayer}
        trackInsight={currentTrackInsight}
        isTrackInsightLoading={isTrackInsightLoading}
        trackLyrics={currentTrackLyrics}
        isLyricsLoading={isLyricsLoading}
        onRequestLyrics={(trackId) => void requestTrackLyrics(trackId)}
        onPrevious={previousTrack}
        onNext={nextTrack}
      />

      <DailyBriefPanel
        dailyBrief={dailyBrief}
        currentClock={currentClock}
      />

      <QueueRail
        playlists={randomPlaylists.length > 0 ? randomPlaylists : bootstrap.playlists}
        activePlaylistId={bootstrap.activePlaylistId}
        isSwitchingLibrary={isSwitchingLibrary}
        onSelectPlaylist={switchLibrary}
      />
    </>
  );

  return (
    <main className={`app-shell mode-${layoutMode}`}>
      <CursorParticleField />
      <div className="shell-grid">
        <TitleBar
          windowState={windowState}
          statusLabel={titlebarLabel}
          onMinimize={() => void window.cosic.minimizeWindow()}
          onToggleMaximize={() => void window.cosic.toggleMaximizeWindow()}
          onClose={() => void window.cosic.closeWindow()}
        />

        <section className={`experience-grid mode-${layoutMode}`}>
          {layoutMode === 'regular' ? (
            <>
              <div className="left-console-stack">{leftConsoleStack}</div>
              <CuratorPanel
                messages={messages}
                curation={curation}
                tasteProfile={tasteProfile}
                isAnalyzingTaste={isAnalyzingTaste}
                isGenerating={isGeneratingCuration}
                error={curationError}
                isLibraryView={!curation}
                activeTrackId={currentTrack?.id ?? null}
                playlistTitle={sessionTitle}
                playlistMeta={queueMeta}
                playlistTracks={!curation ? activeTracks : []}
                layoutMode={layoutMode}
                onAnalyzeTaste={() => void analyzeTaste()}
                onGenerateDaily={() => void generateDailyMix(true)}
                onSubmit={(value) => void generateCuration(value)}
                onSelectCuratedTrack={playTrack}
                onReplayCuration={replayCurationFromStart}
                onRemixCuration={remixCuration}
                onRestoreLibrary={restoreLibrary}
              />
            </>
          ) : (
            <>
              <div className="compact-player-stack left-console-stack">{leftConsoleStack}</div>
              <CuratorPanel
                messages={messages}
                curation={curation}
                tasteProfile={tasteProfile}
                isAnalyzingTaste={isAnalyzingTaste}
                isGenerating={isGeneratingCuration}
                error={curationError}
                isLibraryView={!curation}
                activeTrackId={currentTrack?.id ?? null}
                playlistTitle={sessionTitle}
                playlistMeta={queueMeta}
                playlistTracks={!curation ? activeTracks : []}
                layoutMode={layoutMode}
                onAnalyzeTaste={() => void analyzeTaste()}
                onGenerateDaily={() => void generateDailyMix(true)}
                onSubmit={(value) => void generateCuration(value)}
                onSelectCuratedTrack={playTrack}
                onReplayCuration={replayCurationFromStart}
                onRemixCuration={remixCuration}
                onRestoreLibrary={restoreLibrary}
              />
            </>
          )}
        </section>

        <QueueOverlay
          isOpen={isQueueOverlayOpen}
          tracks={activeTracks}
          playlists={bootstrap.playlists}
          activePlaylistId={bootstrap.activePlaylistId}
          activeTrackId={currentTrack?.id ?? null}
          queueLabel={sessionTitle}
          queueMeta={queueMeta}
          isLibraryQueue={!curation}
          isSwitchingLibrary={isSwitchingLibrary}
          onClose={() => setIsQueueOverlayOpen(false)}
          onSelectTrack={(index) => {
            playTrack(index);
            setIsQueueOverlayOpen(false);
          }}
          onSelectPlaylist={switchLibrary}
          onRestoreLibrary={restoreLibrary}
        />
        {isLocationPromptVisible && !clientLocation?.latitude ? (
          <LocationPermissionDialog
            isRequesting={isRequestingLocation}
            onAllow={() => void requestAndApplyLocation()}
            onSkip={skipLocationRequest}
          />
        ) : null}
      </div>
    </main>
  );
}
