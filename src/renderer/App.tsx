import { startTransition, useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  BootstrapPayload,
  ClassicalCoverageReport,
  CuratedPlaylist,
  DailyStationBrief,
  DesignReferenceImage,
  LibraryPlaylist,
  MusicTasteProfile,
  Track,
  TrackLyrics,
  WindowState
} from '../shared/contracts/bridge';
import { CuratorPanel, type CuratorMessage } from './components/CuratorPanel';
import { DesignStudioPanel } from './components/DesignStudioPanel';
import { CosicLogoMark } from './components/CosicLogoMark';
import { CursorParticleField } from './components/CursorParticleField';
import { DailyBriefPanel } from './components/DailyBriefPanel';
import { LocationPermissionDialog } from './components/LocationPermissionDialog';
import { PlaybackDeck } from './components/PlaybackDeck';
import { QueueOverlay } from './components/QueueOverlay';
import { QueueRail } from './components/QueueRail';
import { RadioImmersion } from './components/RadioImmersion';
import { TitleBar } from './components/TitleBar';
import { useAudioPlayer } from './hooks/useAudioPlayer';

type LayoutMode = 'regular' | 'compact';
type ThemeMode = 'dark' | 'light';

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
const THEME_MODE_KEY = 'cosic-theme-mode-v1';
const TRACK_INSIGHT_PREWARM_BATCH_SIZE = 24;
const STARTUP_AI_AUTOMATION_ENABLED = false;
const LIBRARY_SWITCH_FAILURE_MESSAGE = '这张歌单暂时没有读到可播放曲目，我先保留当前队列。';

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

const NIGHT_RADIO_PROMPT = [
  '任务：为 23 点以后开放的 Cosic 沉浸式电台生成一组独立深夜随机歌单。',
  '这不是当前播放歌单的延续，不要沿用当前队列，也不要围绕当前正在播放的歌曲做相似推荐。',
  '必须更随机，但仍然适合夜晚：静、深、私密、有空间感，适合一个人慢慢听。',
  '优先从全部可用外部音源和我的长期口味里抽取，不要只在本地当前歌单里打转。',
  '编排像深夜电台：第一首要把房间降噪，中段可以有一点暗流和推进，后段留白或回到身体。',
  '避免白天感、健身感、热榜感、短视频感，也避免同一艺人扎堆。',
  '返回 15 到 50 首，宁可陌生一点，也要贴近夜晚。'
].join('\n');

const getLayoutMode = (): LayoutMode =>
  window.innerWidth <= 1380 || window.innerHeight <= 840 ? 'compact' : 'regular';

const getIsDensePlayer = () => window.innerWidth > 1380 && window.innerHeight <= 980;

const getShowDesignStudio = () => window.innerWidth >= 1560 && window.innerHeight >= 920;

const loadInitialThemeMode = (): ThemeMode => {
  const storedThemeMode = window.localStorage.getItem(THEME_MODE_KEY);
  return storedThemeMode === 'light' ? 'light' : 'dark';
};

const getRandomUnit = () => {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] ? values[0] / 0xffffffff : Math.random();
};

const chunkItems = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const pickRandomPlaylists = (playlists: LibraryPlaylist[], limit = 9) => {
  const shuffled = playlists.filter((playlist) => playlist.trackCount > 0);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(getRandomUnit() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, limit);
};

const buildPendingRegionLabel = () => 'Locating city';

const requestClientLocation = () =>
  new Promise<ClientLocationContext>((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({
          regionLabel: 'Location unavailable'
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        resolve({
          regionLabel: buildPendingRegionLabel(),
          latitude,
          longitude
        });
      },
      () =>
        resolve({
          regionLabel: 'Location denied'
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadInitialThemeMode());
  const [isDensePlayer, setIsDensePlayer] = useState(() => getIsDensePlayer());
  const [showDesignStudio, setShowDesignStudio] = useState(() => getShowDesignStudio());
  const [bootError, setBootError] = useState<string | null>(null);
  const [messages, setMessages] = useState<CuratorMessage[]>(() => loadInitialMessages());
  const [curation, setCuration] = useState<CuratedPlaylist | null>(null);
  const [curationError, setCurationError] = useState<string | null>(null);
  const [isGeneratingCuration, setIsGeneratingCuration] = useState(false);
  const [designReference, setDesignReference] = useState<DesignReferenceImage | null>(null);
  const [designReferenceError, setDesignReferenceError] = useState<string | null>(null);
  const [isGeneratingDesignReference, setIsGeneratingDesignReference] = useState(false);
  const [tasteProfile, setTasteProfile] = useState<MusicTasteProfile | null>(null);
  const [dailyBrief, setDailyBrief] = useState<DailyStationBrief | null>(null);
  const [isAnalyzingTaste, setIsAnalyzingTaste] = useState(false);
  const [classicalCoverageReport, setClassicalCoverageReport] = useState<ClassicalCoverageReport | null>(null);
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
  const [isLyricsView, setIsLyricsView] = useState(false);
  const [isRadioOpen, setIsRadioOpen] = useState(false);
  const [isPreparingRadio, setIsPreparingRadio] = useState(false);
  const [currentClock, setCurrentClock] = useState(() => new Date());
  const hasAutoAnalyzedTaste = useRef(false);
  const hasAutoGeneratedDaily = useRef(false);
  const requestedTrackInsightIds = useRef(new Set<string>());
  const lastInsightQueueIds = useRef('');
  const curationRequestToken = useRef(0);
  const librarySwitchRequestToken = useRef(0);
  const dailyBriefRequestToken = useRef(0);

  const libraryTracks = bootstrap?.tracks ?? [];
  const activeTracks = curation ? queueTracks : queueTracks.length > 0 ? queueTracks : libraryTracks;
  const activeTrackIds = activeTracks.map((track) => track.id).join('|');
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

  async function scanClassicalCoverage() {
    setCurationError(null);

    try {
      const report = await window.cosic.getClassicalCoverageReport();
      setClassicalCoverageReport(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : '古典谱源扫描失败。';
      setCurationError(message);
    }
  }

  async function refreshDailyBrief() {
    const requestToken = dailyBriefRequestToken.current + 1;
    dailyBriefRequestToken.current = requestToken;

    try {
      const brief = await window.cosic.getDailyStationBrief(buildClientContext('daily'));
      if (dailyBriefRequestToken.current === requestToken) {
        setDailyBrief(brief);
      }
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

  async function requestTrackLyrics(trackId: string, force = false) {
    if (!force && (trackLyrics[trackId] !== undefined || loadingLyricsTrackId === trackId)) {
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

  async function prewarmPlaylistTrackInsights(trackIds: string[], shouldIgnore: () => boolean) {
    if (trackIds.length === 0) {
      return;
    }

    const uniqueTrackIds = [...new Set(trackIds)].filter(Boolean);

    for (const batch of chunkItems(uniqueTrackIds, TRACK_INSIGHT_PREWARM_BATCH_SIZE)) {
      if (shouldIgnore()) {
        return;
      }

      setLoadingTrackInsightId(batch[0] ?? null);

      try {
        const insights = await window.cosic.generatePlaylistTrackInsights(batch);
        if (shouldIgnore()) {
          return;
        }

        const usableInsights = insights
          .map((insight) => ({
            ...insight,
            text: insight.text.trim()
          }))
          .filter((insight) => insight.text.length > 0);
        const completedTrackInsightIds = new Set(usableInsights.map((insight) => insight.trackId));

        if (usableInsights.length > 0) {
          setTrackInsights((current) => {
            const next = { ...current };

            for (const insight of usableInsights) {
              next[insight.trackId] = insight.text;
            }

            return next;
          });
        }

        for (const trackId of batch) {
          if (!completedTrackInsightIds.has(trackId)) {
            requestedTrackInsightIds.current.delete(trackId);
          }
        }
      } catch {
        if (!shouldIgnore()) {
          batch.forEach((trackId) => requestedTrackInsightIds.current.delete(trackId));
        }
        // The playback deck keeps a local note visible while the batch prewarm retries on later queues.
      }
    }

    if (!shouldIgnore()) {
      setLoadingTrackInsightId(null);
    }
  }

  const toggleRadioPlayback = () => {
    if (!currentTrack) {
      return;
    }

    if (!audioElement || audioElement.paused) {
      playTrack(currentIndex);
      return;
    }

    audioElement.pause();
  };

  const openRadioMode = () => {
    if (!isRadioUnlocked) {
      return;
    }

    setIsRadioOpen(true);
    void generateNightRadio();
  };

  const getIsRadioUnlocked = () => {
    const hour = currentClock.getHours();
    return hour >= 23 || hour < 5;
  };

  const isRadioUnlocked = getIsRadioUnlocked();

  const toggleThemeMode = () => {
    setThemeMode((current) => {
      const nextThemeMode = current === 'light' ? 'dark' : 'light';
      window.localStorage.setItem(THEME_MODE_KEY, nextThemeMode);
      return nextThemeMode;
    });
  };

  const themeClassName = `theme-${themeMode}`;

  useEffect(() => {
    if (!isRadioUnlocked && isRadioOpen) {
      setIsRadioOpen(false);
    }
  }, [isRadioOpen, isRadioUnlocked]);

  useEffect(() => {
    if (!isRadioOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsRadioOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRadioOpen]);

  function skipLocationRequest() {
    setClientLocation({
      regionLabel: 'Location denied'
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
          setShowDesignStudio(getShowDesignStudio());
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setBootError('本地 bridge 启动失败，请检查音乐 bridge 和 .env.local 配置。');
      }
    };

    void hydrate();
    const unsubscribe =
      typeof window.cosic?.onWindowStateChange === 'function'
        ? window.cosic.onWindowStateChange((state) => {
            startTransition(() => {
              setWindowState(state);
            });
          })
        : () => undefined;
    const handleResize = () => {
      setLayoutMode(getLayoutMode());
      setIsDensePlayer(getIsDensePlayer());
      setShowDesignStudio(getShowDesignStudio());
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
    void scanClassicalCoverage();

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
    if (!STARTUP_AI_AUTOMATION_ENABLED) {
      return;
    }

    if (lastInsightQueueIds.current !== activeTrackIds) {
      requestedTrackInsightIds.current.clear();
      lastInsightQueueIds.current = activeTrackIds;
    }

    const missingTrackIds = activeTracks
      .map((track) => track.id)
      .filter((trackId) => !trackInsights[trackId] && !requestedTrackInsightIds.current.has(trackId));

    if (missingTrackIds.length === 0) {
      return;
    }

    let isCancelled = false;
    missingTrackIds.forEach((trackId) => requestedTrackInsightIds.current.add(trackId));
    void prewarmPlaylistTrackInsights(missingTrackIds, () => isCancelled);

    return () => {
      isCancelled = true;
    };
  }, [activeTrackIds]);

  useEffect(() => {
    if (
      !STARTUP_AI_AUTOMATION_ENABLED ||
      !bootstrap ||
      bootstrap.libraryContext.source !== 'live' ||
      hasAutoAnalyzedTaste.current
    ) {
      return;
    }

    hasAutoAnalyzedTaste.current = true;
    void analyzeTaste(false);
  }, [bootstrap]);

  useEffect(() => {
    if (!STARTUP_AI_AUTOMATION_ENABLED || !bootstrap || !dailyBrief || hasAutoGeneratedDaily.current) {
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

    const submittedAt = Date.now();
    const requestToken = curationRequestToken.current + 1;
    curationRequestToken.current = requestToken;
    const userMessage: CuratorMessage = {
      id: `user-${submittedAt}`,
      role: 'user',
      text: options?.userDisplayText ?? prompt
    };
    const chatHistory = (appendUserMessage ? [...messages, userMessage] : messages)
      .slice(-24)
      .map((message) => ({
        role: message.role,
        text: message.text
      }));

    if (appendUserMessage) {
      setMessages((current) => [...current, userMessage]);
    }

    setIsGeneratingCuration(true);
    setCurationError(null);

    try {
      if (requestKind === 'daily') {
        void refreshDailyBrief();
      }

      const result = await window.cosic.handleAgentTurn({
        input: prompt,
        context: {
          ...buildClientContext(requestKind),
          mode: curation ? 'curation' : undefined
        },
        chatHistory
      });

      if (curationRequestToken.current !== requestToken) {
        return;
      }

      if (result.kind === 'conversation' || !result.playlist) {
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
        return;
      }

      const playlist = result.playlist;

      setCuration(playlist);
      setQueueTracks(playlist.tracks);
      setQueueToken(playlist.id);
      setAutoplayQueueToken(playlist.id);
      if (playlist.dailyBrief) {
        setDailyBrief(playlist.dailyBrief);
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
      if (curationRequestToken.current !== requestToken) {
        return;
      }

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
      if (curationRequestToken.current === requestToken) {
        setIsGeneratingCuration(false);
      }
    }
  };

  const generateDailyMix = async (appendUserMessage = true) => {
    await generateCuration(DAILY_MIX_PROMPT, {
      requestKind: 'daily',
      appendUserMessage,
      appendAssistantMessage: appendUserMessage,
      userDisplayText: '给我今天的随机歌单。'
    });
  };

  const generateNightRadio = async () => {
    if (isPreparingRadio || isGeneratingCuration) {
      return;
    }

    setIsPreparingRadio(true);

    try {
      const radioSeed = new Date().toISOString();
      await generateCuration(`${NIGHT_RADIO_PROMPT}\n随机种子：${radioSeed}`, {
        requestKind: 'daily',
        appendUserMessage: false,
        appendAssistantMessage: false
      });
    } finally {
      setIsPreparingRadio(false);
    }
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

    const requestToken = librarySwitchRequestToken.current + 1;
    librarySwitchRequestToken.current = requestToken;
    setIsSwitchingLibrary(true);
    setCurationError(null);

    try {
      const result = await window.cosic.loadLibraryPlaylist(playlistId);

      if (librarySwitchRequestToken.current !== requestToken) {
        return;
      }

      setCuration(null);
      setAutoplayQueueToken(null);
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
    } catch {
      if (librarySwitchRequestToken.current !== requestToken) {
        return;
      }

      setCurationError(null);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-library-error-${Date.now()}`,
          role: 'assistant',
          text: LIBRARY_SWITCH_FAILURE_MESSAGE
        }
      ]);
    } finally {
      if (librarySwitchRequestToken.current === requestToken) {
        setIsSwitchingLibrary(false);
      }
    }
  };

  const generateDesignReference = async (request: {
    prompt: string;
    mode: 'dark' | 'light';
    size: '1024x1024' | '1536x1024' | '1024x1536';
    quality: 'low' | 'medium' | 'high';
  }) => {
    if (isGeneratingDesignReference) {
      return;
    }

    setIsGeneratingDesignReference(true);
    setDesignReferenceError(null);

    try {
      const result = await window.cosic.generateDesignReference(request);
      setDesignReference(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Design reference generation failed.';
      setDesignReferenceError(message);
    } finally {
      setIsGeneratingDesignReference(false);
    }
  };

  if (bootError) {
    return (
      <main className={`loading-screen ${themeClassName}`}>
        <p className="panel-label">Bridge</p>
        <h1>CONNECT FAIL</h1>
        <p>{bootError}</p>
      </main>
    );
  }

  if (!bootstrap) {
    return (
      <main className={`loading-screen is-booting ${themeClassName}`} aria-label="Loading Cosic">
        <CosicLogoMark className="loading-logo-mark" />
        <p className="loading-status" aria-live="polite">Loading player</p>
      </main>
    );
  }

  const libraryContext = bootstrap.libraryContext;
  const sessionTitle = curation?.title ?? libraryContext.title;
  const queueMeta = `${activeTracks.length} TRACKS`;
  const shouldShowDesignStudio = layoutMode === 'regular' && showDesignStudio;
  const currentTrackInsight = currentTrack ? trackInsights[currentTrack.id] ?? null : null;
  const isTrackInsightLoading = Boolean(currentTrack && loadingTrackInsightId === currentTrack.id);
  const currentTrackLyrics = currentTrack ? trackLyrics[currentTrack.id] : undefined;
  const isLyricsLoading = Boolean(currentTrack && loadingLyricsTrackId === currentTrack.id);
  const shellThemeStyle = currentTrack
    ? ({
        '--player-primary': currentTrack.theme.primary,
        '--player-secondary': currentTrack.theme.secondary,
        '--player-accent': currentTrack.theme.accent
      } as CSSProperties)
    : undefined;

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
        isLyricsView={isLyricsView}
        onRequestLyrics={(trackId, force) => void requestTrackLyrics(trackId, force)}
        onToggleLyricsView={() => setIsLyricsView((current) => !current)}
        onPrevious={previousTrack}
        onNext={nextTrack}
      />

      {!isLyricsView ? (
        <QueueRail
          playlists={randomPlaylists.length > 0 ? randomPlaylists : bootstrap.playlists}
          activePlaylistId={bootstrap.activePlaylistId}
          queueTitle={sessionTitle}
          queueMeta={queueMeta}
          tracks={activeTracks}
          activeTrackId={currentTrack?.id ?? null}
          isLibraryQueue={!curation}
          curation={curation}
          classicalCoverageReport={classicalCoverageReport}
          isGenerating={isGeneratingCuration}
          isSwitchingLibrary={isSwitchingLibrary}
          onSelectTrack={playTrack}
          onSelectPlaylist={switchLibrary}
          onReplayCuration={replayCurationFromStart}
          onRemixCuration={remixCuration}
          onRestoreLibrary={restoreLibrary}
        />
      ) : null}
    </>
  );

  return (
    <main className={`app-shell mode-${layoutMode} ${themeClassName}`} style={shellThemeStyle}>
      <div className="cosic-chroma-field" aria-hidden="true" />
      <CursorParticleField />
      <div className="shell-grid">
        <TitleBar
          windowState={windowState}
          isRadioUnlocked={isRadioUnlocked}
          themeMode={themeMode}
          weatherControl={
            !isLyricsView ? (
              <DailyBriefPanel
                dailyBrief={dailyBrief}
                currentClock={currentClock}
              />
            ) : null
          }
          onToggleTheme={toggleThemeMode}
          onOpenRadioMode={openRadioMode}
          onMinimize={() => void window.cosic.minimizeWindow()}
          onToggleMaximize={() => void window.cosic.toggleMaximizeWindow()}
          onClose={() => void window.cosic.closeWindow()}
        />

        <section className={`experience-grid mode-${layoutMode}`}>
          {layoutMode === 'regular' ? (
            <>
              <div className={isLyricsView ? 'left-console-stack is-lyrics-mode' : 'left-console-stack'}>{leftConsoleStack}</div>
              <div className={shouldShowDesignStudio ? 'right-console-stack' : 'right-console-stack is-chat-only'}>
                {shouldShowDesignStudio ? (
                  <DesignStudioPanel
                    image={designReference}
                    isGenerating={isGeneratingDesignReference}
                    error={designReferenceError}
                    onGenerate={generateDesignReference}
                  />
                ) : null}
                <CuratorPanel
                  messages={messages}
                  curation={curation}
                  tasteProfile={tasteProfile}
                  isAnalyzingTaste={isAnalyzingTaste}
                  isGenerating={isGeneratingCuration}
                  error={curationError}
                  isLibraryView={!curation}
                  queueTrackCount={activeTracks.length}
                  layoutMode={layoutMode}
                  onAnalyzeTaste={() => void analyzeTaste()}
                  onSubmit={(value, userDisplayText) => void generateCuration(value, { userDisplayText })}
                />
              </div>
            </>
          ) : (
            <>
              <div className={isLyricsView ? 'compact-player-stack left-console-stack is-lyrics-mode' : 'compact-player-stack left-console-stack'}>{leftConsoleStack}</div>
              <div className="right-console-stack">
                <CuratorPanel
                  messages={messages}
                  curation={curation}
                  tasteProfile={tasteProfile}
                  isAnalyzingTaste={isAnalyzingTaste}
                  isGenerating={isGeneratingCuration}
                  error={curationError}
                  isLibraryView={!curation}
                  queueTrackCount={activeTracks.length}
                  layoutMode={layoutMode}
                  onAnalyzeTaste={() => void analyzeTaste()}
                  onSubmit={(value, userDisplayText) => void generateCuration(value, { userDisplayText })}
                />
              </div>
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
      <RadioImmersion
        isOpen={isRadioOpen}
        track={currentTrack}
        currentIndex={currentIndex}
        totalTracks={activeTracks.length}
        isPlaying={isPlaying}
        isBuffering={isBuffering}
        currentTime={currentTime}
        duration={duration}
        currentClock={currentClock}
        trackInsight={currentTrackInsight}
        isTrackInsightLoading={isTrackInsightLoading}
        trackLyrics={currentTrackLyrics}
        isLyricsLoading={isLyricsLoading}
        isPreparingRadio={isPreparingRadio}
        onRequestLyrics={(trackId, force) => void requestTrackLyrics(trackId, force)}
        onClose={() => setIsRadioOpen(false)}
        onPrevious={previousTrack}
        onNext={nextTrack}
        onTogglePlayback={toggleRadioPlayback}
      />
    </main>
  );
}
