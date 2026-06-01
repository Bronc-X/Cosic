import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { CuratedPlaylist, MusicTasteProfile } from '../../shared/contracts/bridge';

export interface CuratorMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

interface CuratorPanelProps {
  messages: CuratorMessage[];
  curation: CuratedPlaylist | null;
  tasteProfile: MusicTasteProfile | null;
  isAnalyzingTaste: boolean;
  isGenerating: boolean;
  error: string | null;
  isLibraryView: boolean;
  queueTrackCount: number;
  layoutMode: 'regular' | 'compact';
  onAnalyzeTaste: () => void;
  onSubmit: (input: string, userDisplayText?: string) => void;
}

interface RecommendedPlaylistCard {
  label: string;
  title: string;
  note: string;
  prompt: string;
}

interface AgentSessionSnapshot {
  title: string;
  detail: string;
  route: string;
  queue: string;
  memory: string;
  tone: string;
}

const trimCardText = (value: string, maxLength = 12) => {
  const compact = value.trim().replace(/\s+/g, ' ');
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
};

const getHistoryLabel = (item: { label?: string; name?: string }) => (item.label ?? item.name ?? '').trim();

const joinFacetLabels = (items: Array<{ label?: string; name?: string }>, fallback: string, limit = 3) => {
  const labels = items
    .map(getHistoryLabel)
    .filter(Boolean)
    .slice(0, limit);

  return labels.length > 0 ? labels.join('、') : fallback;
};

const buildRecommendedPlaylists = (tasteProfile: MusicTasteProfile | null): RecommendedPlaylistCard[] => {
  if (!tasteProfile) {
    return [
      {
        label: '画像',
        title: '读口味',
        note: '先看历史',
        prompt: '先看我的听歌历史，给我一组贴近我口味的歌。'
      },
      {
        label: '今天',
        title: '今日推荐',
        note: '按此刻挑',
        prompt: '结合今天的时间、天气和我的口味，给我一组现在适合听的歌。'
      },
      {
        label: '常听',
        title: '稳一点',
        note: '从常听来',
        prompt: '从我常听的歌手和专辑里，给我一组稳一点的歌。'
      },
      {
        label: '新鲜',
        title: '新一点',
        note: '不跑偏',
        prompt: '沿着我的口味往外走一点，给我一组新鲜但不陌生的歌。'
      }
    ];
  }

  const topArtists = tasteProfile.topArtists;
  const topAlbums = tasteProfile.topAlbums;
  const topYears = tasteProfile.topYears;
  const topPlaylists = tasteProfile.topPlaylists;
  const artistLine = joinFacetLabels(topArtists, tasteProfile.archetype);
  const albumLine = joinFacetLabels(topAlbums, '常回访专辑');
  const yearLine = joinFacetLabels(topYears, '常听年代');
  const playlistLine = joinFacetLabels(topPlaylists, '历史歌单');
  const leadArtist = topArtists[0]?.label.trim() || tasteProfile.archetype;
  const secondArtist = topArtists[1]?.label.trim() || topArtists[0]?.label.trim() || '相邻口味';
  const leadAlbum = topAlbums[0]?.label.trim() || '常回访专辑';
  const leadYear = topYears[0]?.label.trim() || '常听年代';
  const leadPlaylist = topPlaylists[0]?.name.trim() || '历史歌单';
  const historyContext = [
    `常听歌手：${artistLine}`,
    `常回访专辑：${albumLine}`,
    `年代分布：${yearLine}`,
    `历史歌单：${playlistLine}`
  ].join('；');

  return [
    {
      label: '歌手',
      title: `听${trimCardText(leadArtist, 8)}`,
      note: '顺着常听来',
      prompt: `看我的听歌历史，尤其是${historyContext}。从 ${leadArtist} 出发，推荐一组贴近我长期口味的歌。`
    },
    {
      label: '专辑',
      title: `像${trimCardText(leadAlbum, 8)}`,
      note: '同一股味道',
      prompt: `看我的听歌历史，尤其是${historyContext}。从我反复听的专辑 ${leadAlbum} 出发，推荐一组气质接近的歌。`
    },
    {
      label: '年代',
      title: `${trimCardText(leadYear, 7)}左右`,
      note: '按年份找',
      prompt: `看我的听歌历史，尤其是${historyContext}。围绕我常听的 ${leadYear}，结合 ${leadArtist} 和 ${secondArtist}，推荐一组有年代感但不老套的歌。`
    },
    {
      label: '新鲜',
      title: '来点新的',
      note: '别跑太远',
      prompt: `看我的听歌历史，尤其是${historyContext}。从歌单《${leadPlaylist}》往外扩一点，推荐一组新鲜但仍然像我的歌。`
    }
  ];
};

export function CuratorPanel({
  messages,
  curation,
  tasteProfile,
  isAnalyzingTaste,
  isGenerating,
  error,
  isLibraryView,
  queueTrackCount,
  layoutMode,
  onAnalyzeTaste,
  onSubmit
}: CuratorPanelProps) {
  const [input, setInput] = useState('');
  const [isTasteExpanded, setIsTasteExpanded] = useState(false);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = messages;
  const personalizedRecommendations = useMemo(() => buildRecommendedPlaylists(tasteProfile), [tasteProfile]);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ block: 'end' });
  }, [visibleMessages.length, isGenerating]);

  const harnessStateLabel = useMemo(() => {
    if (error) return '需要处理';
    if (isGenerating) return '正在编排';
    if (isAnalyzingTaste) return '读取口味';
    if (tasteProfile) return '口味已校准';

    return visibleMessages.length > 1 ? '会话就绪' : '歌库已接入';
  }, [error, isAnalyzingTaste, isGenerating, tasteProfile, visibleMessages.length]);
  const agentSnapshot: AgentSessionSnapshot = useMemo(() => {
    const lastMessage = [...visibleMessages].reverse().find((message) => message.text.trim().length > 0);
    const route = isLibraryView ? '资料库队列' : curation?.requestKind === 'daily' ? '今日 AI 队列' : 'AI 队列';
    const memory = tasteProfile ? tasteProfile.archetype : '未读取口味';
    const queue = curation ? `${curation.tracks.length} 首推荐在列` : `${queueTrackCount} 首当前队列`;
    const tone = isGenerating
      ? '生成中'
      : isAnalyzingTaste
        ? '读取历史'
        : tasteProfile
          ? '可细调'
          : '可对话';
    const detail = error || lastMessage?.text || '歌库已接入，可以直接描述此刻想听的状态。';

    return {
      title: harnessStateLabel,
      detail,
      route,
      queue,
      memory,
      tone
    };
  }, [
    curation,
    error,
    harnessStateLabel,
    isAnalyzingTaste,
    isGenerating,
    isLibraryView,
    queueTrackCount,
    tasteProfile,
    visibleMessages
  ]);

  const submit = (value: string, userDisplayText?: string) => {
    const trimmed = value.trim();
    if (!trimmed || isGenerating) {
      return;
    }

    onSubmit(trimmed, userDisplayText);
    setInput('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(input);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    submit(input);
  };

  return (
    <section className={`curator-panel panel${layoutMode === 'compact' ? ' is-compact-layout' : ''}`}>
      <section className="chatgpt-chat-shell is-agent-stream" aria-label="Cosic agent stream">
        <div className="agent-harness-strip" aria-label="Agent session status">
          <div className="agent-harness-main">
            <span
              className={`agent-harness-light${isGenerating || isAnalyzingTaste ? ' is-live' : ''}${
                error ? ' is-error' : ''
              }`}
              aria-hidden="true"
            />
            <div>
              <strong>{agentSnapshot.title}</strong>
              <small>{agentSnapshot.detail}</small>
            </div>
          </div>
          <div className="agent-harness-readouts">
            <span>{agentSnapshot.route}</span>
            <span>{agentSnapshot.queue}</span>
            <span>{agentSnapshot.memory}</span>
            <span>{agentSnapshot.tone}</span>
          </div>
        </div>

        <section className="agent-conversation-frame" aria-label="Agent conversation">
          <div className="chatgpt-message-list">
            {visibleMessages.map((message) => (
              <article key={message.id} className={`chatgpt-message is-${message.role}`}>
                <span className="chatgpt-avatar">{message.role === 'assistant' ? 'C' : '你'}</span>
                <div className="chatgpt-message-content">
                  <p>{message.text}</p>
                </div>
              </article>
            ))}
            {isGenerating ? (
              <article className="chatgpt-message is-assistant is-working" aria-live="polite">
                <span className="chatgpt-avatar">C</span>
                <div className="chatgpt-message-content">
                  <div className="chat-working-indicator" aria-label="Cosic 正在工作">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </article>
            ) : null}
            <div ref={historyEndRef} className="chatgpt-history-end" />
          </div>

          <form className="curator-form chatgpt-composer" onSubmit={handleSubmit}>
            <div className="composer-shell">
              <textarea
                id="curator-input"
                className="curator-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={2}
                placeholder="问 Cosic 要一组适合此刻的歌单，或直接描述你现在想听的状态"
              />

              <div className="curator-form-foot">
                <div className="composer-actions-left">
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={onAnalyzeTaste}
                    disabled={isAnalyzingTaste || isGenerating}
                  >
                    {isAnalyzingTaste ? '读取中' : tasteProfile ? '重新读口味' : '读取口味'}
                  </button>

                  {tasteProfile ? (
                    <button
                      className="ghost-action"
                      type="button"
                      onClick={() => setIsTasteExpanded((current) => !current)}
                      disabled={isAnalyzingTaste || isGenerating}
                    >
                      {isTasteExpanded ? '收起画像' : '查看画像'}
                    </button>
                  ) : null}
                </div>

                <button
                  className={isGenerating ? 'primary-action curator-submit is-working' : 'primary-action curator-submit'}
                  type="submit"
                  disabled={isGenerating || !input.trim()}
                  aria-busy={isGenerating}
                  aria-label={isGenerating ? 'Cosic 正在生成回复' : '发送'}
                >
                  {isGenerating ? (
                    <span className="curator-submit-progress" aria-hidden="true">
                      <span />
                    </span>
                  ) : (
                    '发送'
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>

        {tasteProfile && isTasteExpanded ? (
          <article className="taste-profile is-open">
            <div className="taste-profile-head">
              <div>
                <p className="panel-label">Taste Profile</p>
                <h3>{tasteProfile.archetype}</h3>
              </div>
              <span className="taste-count">{tasteProfile.stats.playlistCount} PLAYLISTS</span>
            </div>

            <p className="taste-summary">{tasteProfile.summary}</p>

            <div className="taste-facet-grid">
              <div className="taste-facet-card">
                <span className="panel-label">Top Artists</span>
                <div className="taste-chip-list">
                  {tasteProfile.topArtists.slice(0, 6).map((item) => (
                    <span key={item.label} className="taste-chip">
                      {item.label} <strong>{item.count}</strong>
                    </span>
                  ))}
                </div>
              </div>

              <div className="taste-facet-card">
                <span className="panel-label">Top Albums</span>
                <div className="taste-chip-list">
                  {tasteProfile.topAlbums.slice(0, 4).map((item) => (
                    <span key={item.label} className="taste-chip">
                      {item.label} <strong>{item.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ) : null}

        <div className="recommended-playlists agent-prompt-strip" aria-label="Agent quick prompts">
          <div className="recommended-playlists-head">
            <p className="panel-label">Quick Requests</p>
            <span>{isGenerating ? '生成中' : '快捷请求'}</span>
          </div>

          <div className="recommended-playlist-grid">
            {personalizedRecommendations.map((playlist) => (
              <button
                key={playlist.label}
                className="recommended-playlist-card"
                type="button"
                disabled={isGenerating}
                onClick={() => submit(playlist.prompt, playlist.title)}
              >
                <span>{playlist.label}</span>
                <strong>{playlist.title}</strong>
                <small>{playlist.note}</small>
              </button>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
