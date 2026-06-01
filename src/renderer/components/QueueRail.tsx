import { useMemo, useState, type CSSProperties } from 'react';
import type {
  ClassicalCoverageReport,
  ClassicalCoverageReportItem,
  CuratedPlaylist,
  LibraryPlaylist,
  Track
} from '../../shared/contracts/bridge';

type QueueRailTab = 'queue' | 'playlists';

interface QueueRailProps {
  playlists: LibraryPlaylist[];
  activePlaylistId: string | null;
  queueTitle: string;
  queueMeta: string;
  tracks: Track[];
  activeTrackId: string | null;
  isLibraryQueue: boolean;
  curation: CuratedPlaylist | null;
  classicalCoverageReport: ClassicalCoverageReport | null;
  isGenerating: boolean;
  isSwitchingLibrary: boolean;
  onSelectTrack: (index: number) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onReplayCuration: () => void;
  onRemixCuration: (instruction: string) => void;
  onRestoreLibrary: () => void;
}

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

export function QueueRail({
  playlists,
  activePlaylistId,
  queueTitle,
  queueMeta,
  tracks,
  activeTrackId,
  isLibraryQueue,
  curation,
  classicalCoverageReport,
  isGenerating,
  isSwitchingLibrary,
  onSelectTrack,
  onSelectPlaylist,
  onReplayCuration,
  onRemixCuration,
  onRestoreLibrary
}: QueueRailProps) {
  const [activeTab, setActiveTab] = useState<QueueRailTab>('queue');
  const randomPlaylistButtons = playlists.slice(0, 18);
  const visibleCoverageItems = useMemo(() => {
    if (!classicalCoverageReport) {
      return [];
    }

    const statusWeight = { missing: 0, partial: 1, covered: 2 } as const;
    const ranked = [...classicalCoverageReport.items].sort((left, right) => {
      return (
        statusWeight[left.coverage.status] - statusWeight[right.coverage.status] ||
        right.count - left.count ||
        left.track.title.localeCompare(right.track.title)
      );
    });

    return ranked.slice(0, 4);
  }, [classicalCoverageReport]);
  const tabTitle = activeTab === 'queue' ? queueTitle : '随机推荐歌单';
  const queueKindLabel = curation ? (curation.requestKind === 'daily' ? '今日' : '推荐') : '当前';

  return (
    <section className="queue-panel panel">
      <div className="queue-head">
        <div>
          <p className="panel-label">{activeTab === 'queue' ? 'Now Playing Queue' : 'Random Playlists'}</p>
          <h3>{tabTitle}</h3>
        </div>

        <div className="queue-rail-tabs" role="tablist" aria-label="Queue rail view">
          <button
            className={activeTab === 'queue' ? 'queue-rail-tab is-active' : 'queue-rail-tab'}
            type="button"
            role="tab"
            aria-selected={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
          >
            <span>当前</span>
            <strong>{tracks.length}</strong>
          </button>
          <button
            className={activeTab === 'playlists' ? 'queue-rail-tab is-active' : 'queue-rail-tab'}
            type="button"
            role="tab"
            aria-selected={activeTab === 'playlists'}
            onClick={() => setActiveTab('playlists')}
          >
            <span>随机</span>
            <strong>{randomPlaylistButtons.length}</strong>
          </button>
        </div>
      </div>

      <div className="queue-rail-body">
        {activeTab === 'queue' ? (
          <div className="queue-current-scroll" role="tabpanel" aria-label="Current queue">
            <article className="classical-coverage-panel queue-coverage-panel" aria-label="古典谱源覆盖">
              <div className="classical-coverage-head">
                <div>
                  <p className="panel-label">古典谱源</p>
                  <strong>{getCoverageSummary(classicalCoverageReport)}</strong>
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
                    {classicalCoverageReport.items.length > visibleCoverageItems.length ? (
                      <p className="classical-coverage-empty">
                        还有 {classicalCoverageReport.items.length - visibleCoverageItems.length} 首已折叠在后台清单里。留白会被看见，不会被藏起来。
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

            <article className={curation ? 'playlist-preview is-curated' : 'playlist-preview is-library'}>
              <div className="playlist-preview-head">
                <div>
                  <p className="panel-label">{queueKindLabel}</p>
                  <h3>{curation?.title ?? queueTitle}</h3>
                </div>
                <div className="playlist-preview-meta">
                  <span>{curation ? `${curation.tracks.length} 首` : queueMeta}</span>
                </div>
              </div>

              {curation ? <p className="playlist-preview-note">{curation.note}</p> : null}

              {curation ? (
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
              ) : null}

              {tracks.length > 0 ? (
                <div className="playlist-preview-list">
                  {tracks.slice(0, 50).map((track, index) => (
                    <button
                      key={`${track.id}-${index}`}
                      className={track.id === activeTrackId ? 'playlist-track-row is-active' : 'playlist-track-row'}
                      type="button"
                      onClick={() => onSelectTrack(index)}
                    >
                      <span className="playlist-track-index">{String(index + 1).padStart(2, '0')}</span>
                      <div className="playlist-track-copy">
                        <strong>{track.title}</strong>
                        <span>{track.artist}</span>
                      </div>
                      <span className="playlist-track-action">
                        {track.id === activeTrackId ? '播中' : curation ? '播放' : formatDuration(track.duration)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="playlist-button-empty">
                  <span>NO TRACKS</span>
                </div>
              )}

              {!isLibraryQueue ? (
                <button className="ghost-action queue-restore-button" type="button" onClick={onRestoreLibrary}>
                  回到歌单
                </button>
              ) : null}
            </article>
          </div>
        ) : randomPlaylistButtons.length > 0 ? (
          <div className="playlist-button-grid" role="tabpanel" aria-label="Random playlist selector">
            {randomPlaylistButtons.map((randomPlaylist, index) => {
              const isActive = randomPlaylist.id === activePlaylistId;

              return (
                <button
                  key={randomPlaylist.id}
                  className={isActive ? 'playlist-button is-active' : 'playlist-button'}
                  type="button"
                  disabled={isSwitchingLibrary}
                  onClick={() => onSelectPlaylist(randomPlaylist.id)}
                  style={
                    randomPlaylist.coverUrl
                      ? ({
                          '--playlist-cover': `url("${randomPlaylist.coverUrl}")`
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <small className="playlist-button-index">{String(index + 1).padStart(2, '0')}</small>
                  <span>{randomPlaylist.name}</span>
                  <strong>{randomPlaylist.trackCount} TRACKS</strong>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="playlist-button-empty" role="tabpanel">
            <span>NO PLAYLISTS</span>
          </div>
        )}
      </div>
    </section>
  );
}
