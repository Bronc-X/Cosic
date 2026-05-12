import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type {
  ClassicalCoverageReport,
  ClassicalCoverageReportItem,
  CuratedPlaylist,
  MusicTasteProfile,
  Track
} from '../../shared/contracts/bridge';

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
  activeTrackId: string | null;
  playlistTitle: string;
  playlistMeta: string;
  playlistTracks: Track[];
  classicalCoverageReport: ClassicalCoverageReport | null;
  isScanningClassicalCoverage: boolean;
  layoutMode: 'regular' | 'compact';
  onAnalyzeTaste: () => void;
  onScanClassicalCoverage: () => void;
  onGenerateDaily: () => void;
  onSubmit: (input: string, userDisplayText?: string) => void;
  onSelectCuratedTrack: (index: number) => void;
  onReplayCuration: () => void;
  onRemixCuration: (instruction: string) => void;
  onRestoreLibrary: () => void;
}

interface RecommendedPlaylistCard {
  label: string;
  title: string;
  note: string;
  prompt: string;
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

const formatDuration = (duration: number) => {
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
};

const getCoverageLabel = (item: ClassicalCoverageReportItem) => {
  if (item.coverage.status === 'covered') {
    if (item.coverage.missingReason === 'needs_review') {
      return '可信来源页';
    }

    return item.coverage.hasOptionalArrangement ? '原谱+改编' : '原谱';
  }

  if (item.coverage.status === 'partial') {
    return '待核';
  }

  return item.matchStatus === 'heuristic' ? '待匹配' : '无可信谱源';
};

const getCoverageRowClassName = (item: ClassicalCoverageReportItem) =>
  `classical-coverage-row is-${item.coverage.status}`;

const getCoverageSummary = (report: ClassicalCoverageReport | null) => {
  if (!report) {
    return '未扫描';
  }

  if (report.totalClassicalTracks === 0) {
    return '未识别到古典作品';
  }

  return `${report.coveredCount} 首已找到可信谱源，${report.missingCount} 首保留空位`;
};

export function CuratorPanel({
  messages,
  curation,
  tasteProfile,
  isAnalyzingTaste,
  isGenerating,
  error,
  isLibraryView,
  activeTrackId,
  playlistTitle,
  playlistMeta,
  playlistTracks,
  classicalCoverageReport,
  isScanningClassicalCoverage,
  layoutMode,
  onAnalyzeTaste,
  onScanClassicalCoverage,
  onGenerateDaily,
  onSubmit,
  onSelectCuratedTrack,
  onReplayCuration,
  onRemixCuration,
  onRestoreLibrary
}: CuratorPanelProps) {
  const [input, setInput] = useState('');
  const [isTasteExpanded, setIsTasteExpanded] = useState(false);
  const [isCoverageExpanded, setIsCoverageExpanded] = useState(false);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = messages;
  const personalizedRecommendations = useMemo(() => buildRecommendedPlaylists(tasteProfile), [tasteProfile]);
  const visibleCoverageItems = useMemo(() => {
    if (!classicalCoverageReport) {
      return [];
    }

    const ranked = [...classicalCoverageReport.items].sort((left, right) => {
      const statusWeight = { missing: 0, partial: 1, covered: 2 } as const;
      return (
        statusWeight[left.coverage.status] - statusWeight[right.coverage.status] ||
        right.count - left.count ||
        left.track.title.localeCompare(right.track.title)
      );
    });

    return isCoverageExpanded ? ranked : ranked.slice(0, 8);
  }, [classicalCoverageReport, isCoverageExpanded]);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ block: 'end' });
  }, [visibleMessages.length, isGenerating]);

  const helperLabel = useMemo(() => {
    if (error) {
      return error;
    }

    if (isAnalyzingTaste) {
      return '读口味中';
    }

    if (isGenerating) {
      return '生成中';
    }

    if (tasteProfile) {
      return '已读口味';
    }

    return '就绪';
  }, [error, isAnalyzingTaste, isGenerating, tasteProfile]);

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
      <div className="curator-playlist-zone">
        <div className="curator-head">
          <div className="curator-titlegroup">
            <p className="panel-label">歌单</p>
            <h2>Cosic</h2>
          </div>
          <span
            className={`curator-badge${isGenerating || isAnalyzingTaste ? ' is-live' : ''}${
              error ? ' is-error' : ''
            }`}
          >
            {helperLabel}
          </span>
        </div>

        <article className="classical-coverage-panel" aria-label="古典谱源覆盖">
          <div className="classical-coverage-head">
            <div>
              <p className="panel-label">古典谱源</p>
              <strong>{getCoverageSummary(classicalCoverageReport)}</strong>
            </div>
            <div className="classical-coverage-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={onScanClassicalCoverage}
                disabled={isScanningClassicalCoverage || isGenerating}
              >
                {isScanningClassicalCoverage ? '扫描中' : '谱源覆盖'}
              </button>
              {classicalCoverageReport?.totalClassicalTracks ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setIsCoverageExpanded((value) => !value)}
                >
                  {isCoverageExpanded ? '收起' : '查看缺口'}
                </button>
              ) : null}
            </div>
          </div>
          {classicalCoverageReport ? (
            classicalCoverageReport.totalClassicalTracks > 0 ? (
              <>
                <div className="classical-coverage-metrics" aria-label="古典谱源统计">
                  <span>{classicalCoverageReport.coveredCount} 原谱已找到</span>
                  <span>{classicalCoverageReport.partialCount} 待核</span>
                  <span>{classicalCoverageReport.missingCount} 留白</span>
                </div>
                <div className="classical-coverage-list">
                  {visibleCoverageItems.map((item) => (
                    <div key={`${item.track.id}-${item.matchStatus}`} className={getCoverageRowClassName(item)}>
                      <div>
                        <strong>{item.track.classical?.note?.workTitle ?? item.track.title}</strong>
                        <span>
                          {item.track.classical?.note?.composer ?? item.track.artist}
                          {item.playlistNames.length > 0 ? ` / ${item.playlistNames.slice(0, 2).join('、')}` : ''}
                        </span>
                      </div>
                      <em>{getCoverageLabel(item)}</em>
                    </div>
                  ))}
                </div>
                {!isCoverageExpanded && classicalCoverageReport.items.length > visibleCoverageItems.length ? (
                  <p className="classical-coverage-empty">
                    还有 {classicalCoverageReport.items.length - visibleCoverageItems.length} 首在完整清单里。留白会被看见，不会被藏起来。
                  </p>
                ) : null}
              </>
            ) : (
              <p className="classical-coverage-empty">这张歌单里还没有识别到古典作品。</p>
            )
          ) : (
            <p className="classical-coverage-empty">原谱优先。改编从严。找不到可信版本时，留白比假装完整更好。</p>
          )}
        </article>

        {curation ? (
          <article className="playlist-preview">
            <div className="playlist-preview-head">
              <div>
                <p className="panel-label">{curation.requestKind === 'daily' ? '今日' : '推荐'}</p>
                <h3>{curation.title}</h3>
              </div>
              <div className="playlist-preview-meta">
                <span>{curation.tracks.length} 首</span>
              </div>
            </div>

            <p className="playlist-preview-note">{curation.note}</p>

            <div className="playlist-preview-actions">
              <button className="secondary-action" type="button" onClick={onReplayCuration} disabled={isGenerating}>
                重播
              </button>
              <button
                className="secondary-action"
                type="button"
                disabled={isGenerating}
                onClick={() => onRemixCuration('换一版，但不要重复上一版已经出现过的歌和歌手。')}
              >
                重做
              </button>
              <button
                className="ghost-action"
                type="button"
                disabled={isGenerating}
                onClick={() => onRemixCuration('更静一点，减少人声起伏和戏剧感。')}
              >
                更安静
              </button>
              <button
                className="ghost-action"
                type="button"
                disabled={isGenerating}
                onClick={() => onRemixCuration('更有推进感，但不要更吵。')}
              >
                更推进
              </button>
            </div>

            <div className="playlist-preview-list">
              {curation.tracks.map((track, index) => (
                <button
                  key={track.id}
                  className={track.id === activeTrackId ? 'playlist-track-row is-active' : 'playlist-track-row'}
                  type="button"
                  onClick={() => onSelectCuratedTrack(index)}
                >
                  <span className="playlist-track-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="playlist-track-copy">
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                  </div>
                  <span className="playlist-track-action">{track.id === activeTrackId ? '播中' : '播放'}</span>
                </button>
              ))}
            </div>

            {!isLibraryView ? (
              <button className="ghost-action" type="button" onClick={onRestoreLibrary}>
                回到歌单
              </button>
            ) : null}
          </article>
        ) : playlistTracks.length > 0 ? (
          <article className="playlist-preview is-library">
            <div className="playlist-preview-head">
              <div>
                <p className="panel-label">歌单</p>
                <h3>{playlistTitle}</h3>
              </div>
              <div className="playlist-preview-meta">
                <span>{playlistMeta}</span>
              </div>
              <button className="primary-action" type="button" onClick={onGenerateDaily} disabled={isGenerating}>
                今日推荐
              </button>
            </div>

            <div className="playlist-preview-list">
              {playlistTracks.slice(0, 50).map((track, index) => (
                <button
                  key={`${track.id}-${index}`}
                  className={track.id === activeTrackId ? 'playlist-track-row is-active' : 'playlist-track-row'}
                  type="button"
                  onClick={() => onSelectCuratedTrack(index)}
                >
                  <span className="playlist-track-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="playlist-track-copy">
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                  </div>
                  <span className="playlist-track-action">
                    {track.id === activeTrackId ? '播中' : formatDuration(track.duration)}
                  </span>
                </button>
              ))}
            </div>
          </article>
        ) : (
          <article className="playlist-preview is-empty">
            <div className="playlist-preview-head">
              <div>
                <p className="panel-label">歌单</p>
                <h3>今日歌单</h3>
              </div>
              <button className="primary-action" type="button" onClick={onGenerateDaily} disabled={isGenerating}>
                今日推荐
              </button>
            </div>
          </article>
        )}

        <div className="recommended-playlists" aria-label="推荐歌单">
          <div className="recommended-playlists-head">
            <p className="panel-label">推荐</p>
            <span>{isGenerating ? '生成中' : '歌单'}</span>
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
      </div>

      <section className="chatgpt-chat-shell" aria-label="Cosic chat">
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

        <form className="curator-form chatgpt-composer" onSubmit={handleSubmit}>
          <div className="composer-shell">
            <textarea
              id="curator-input"
              className="curator-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={2}
              placeholder="问 Cosic 要一组适合此刻的歌单"
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
    </section>
  );
}
