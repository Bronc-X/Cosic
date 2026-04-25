import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { CuratedPlaylist, MusicTasteProfile, Track } from '../../shared/contracts/bridge';

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
  layoutMode: 'regular' | 'compact';
  onAnalyzeTaste: () => void;
  onGenerateDaily: () => void;
  onSubmit: (input: string) => void;
  onSelectCuratedTrack: (index: number) => void;
  onReplayCuration: () => void;
  onRemixCuration: (instruction: string) => void;
  onRestoreLibrary: () => void;
}

const recommendedPlaylists = [
  {
    label: 'Deep Work',
    title: '两小时深水区',
    note: '低惊扰、稳推进、少人声起伏',
    prompt: '我要进入两个小时的深度工作，给我更稳、更克制、推进感更清楚的一组队列。'
  },
  {
    label: 'Wind Down',
    title: '慢慢关灯',
    note: '收尾但不塌，保留一点呼吸感',
    prompt: '今晚准备慢慢收尾，不要太丧，也不要太热闹，要有一点呼吸感。'
  },
  {
    label: 'Write Mode',
    title: '写作浮力',
    note: '轻推进，不抢注意力',
    prompt: '我现在在写方案，想要轻推进但不能抢走注意力。'
  },
  {
    label: 'Surprise',
    title: '偏好侧翼',
    note: '从你的口味边缘挑一点新鲜感',
    prompt: '基于我的长期听歌习惯，直接给我一组稍微有新鲜感但仍然像我的队列。'
  }
] as const;

const formatStamp = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

const formatDuration = (duration: number) => {
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
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
  layoutMode,
  onAnalyzeTaste,
  onGenerateDaily,
  onSubmit,
  onSelectCuratedTrack,
  onReplayCuration,
  onRemixCuration,
  onRestoreLibrary
}: CuratorPanelProps) {
  const [input, setInput] = useState('');
  const [isTasteExpanded, setIsTasteExpanded] = useState(false);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = messages;

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ block: 'end' });
  }, [visibleMessages.length]);

  const helperLabel = useMemo(() => {
    if (error) {
      return error;
    }

    if (isAnalyzingTaste) {
      return 'READING TASTE';
    }

    if (isGenerating) {
      return 'CURATING NOW';
    }

    if (tasteProfile) {
      return `${tasteProfile.stats.playlistCount} PLAYLISTS READ`;
    }

    return 'READY';
  }, [error, isAnalyzingTaste, isGenerating, tasteProfile]);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isGenerating) {
      return;
    }

    onSubmit(trimmed);
    setInput('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(input);
  };

  return (
    <section className={`curator-panel panel${layoutMode === 'compact' ? ' is-compact-layout' : ''}`}>
      <div className="curator-playlist-zone">
        <div className="curator-head">
          <div className="curator-titlegroup">
            <p className="panel-label">Playlist Console</p>
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

        {curation ? (
          <article className="playlist-preview">
            <div className="playlist-preview-head">
              <div>
                <p className="panel-label">{curation.requestKind === 'daily' ? 'Daily Mix' : 'Playlist'}</p>
                <h3>{curation.title}</h3>
              </div>
              <div className="playlist-preview-meta">
                <span>{formatStamp(curation.generatedAt)}</span>
                <span>{curation.tracks.length} TRACKS</span>
                <span>{curation.model}</span>
              </div>
            </div>

            <p className="playlist-preview-note">{curation.note}</p>

            <div className="playlist-preview-actions">
              <button className="secondary-action" type="button" onClick={onReplayCuration} disabled={isGenerating}>
                REPLAY
              </button>
              <button
                className="secondary-action"
                type="button"
                disabled={isGenerating}
                onClick={() => onRemixCuration('换一版，但不要重复上一版已经出现过的歌和歌手。')}
              >
                REMIX
              </button>
              <button
                className="ghost-action"
                type="button"
                disabled={isGenerating}
                onClick={() => onRemixCuration('更静一点，减少人声起伏和戏剧感。')}
              >
                QUIETER
              </button>
              <button
                className="ghost-action"
                type="button"
                disabled={isGenerating}
                onClick={() => onRemixCuration('更有推进感，但不要更吵。')}
              >
                PUSH
              </button>
            </div>

            <div className="playlist-preview-list">
              {curation.tracks.slice(0, 8).map((track, index) => (
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
                  <span className="playlist-track-action">{track.id === activeTrackId ? 'LIVE' : 'PLAY'}</span>
                </button>
              ))}
            </div>

            {!isLibraryView ? (
              <button className="ghost-action" type="button" onClick={onRestoreLibrary}>
                BACK TO LIBRARY
              </button>
            ) : null}
          </article>
        ) : playlistTracks.length > 0 ? (
          <article className="playlist-preview is-library">
            <div className="playlist-preview-head">
              <div>
                <p className="panel-label">Playlist</p>
                <h3>{playlistTitle}</h3>
              </div>
              <div className="playlist-preview-meta">
                <span>{playlistMeta}</span>
              </div>
              <button className="primary-action" type="button" onClick={onGenerateDaily} disabled={isGenerating}>
                TODAY&apos;S MIX
              </button>
            </div>

            <div className="playlist-preview-list">
              {playlistTracks.slice(0, 14).map((track, index) => (
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
                    {track.id === activeTrackId ? 'LIVE' : formatDuration(track.duration)}
                  </span>
                </button>
              ))}
            </div>
          </article>
        ) : (
          <article className="playlist-preview is-empty">
            <div className="playlist-preview-head">
              <div>
                <p className="panel-label">Playlist</p>
                <h3>今日歌单</h3>
              </div>
              <button className="primary-action" type="button" onClick={onGenerateDaily} disabled={isGenerating}>
                TODAY&apos;S MIX
              </button>
            </div>
          </article>
        )}

        <div className="recommended-playlists" aria-label="Recommended playlists">
          <div className="recommended-playlists-head">
            <p className="panel-label">Recommended</p>
            <span>{isGenerating ? 'CURATING' : 'AI PLAYLISTS'}</span>
          </div>

          <div className="recommended-playlist-grid">
            {recommendedPlaylists.map((playlist) => (
              <button
                key={playlist.label}
                className="recommended-playlist-card"
                type="button"
                disabled={isGenerating}
                onClick={() => submit(playlist.prompt)}
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
                  {isAnalyzingTaste ? 'READING' : tasteProfile ? 'RELOAD TASTE' : 'READ TASTE'}
                </button>

                {tasteProfile ? (
                  <button
                    className="ghost-action"
                    type="button"
                    onClick={() => setIsTasteExpanded((current) => !current)}
                    disabled={isAnalyzingTaste || isGenerating}
                  >
                    {isTasteExpanded ? 'HIDE PROFILE' : 'SHOW PROFILE'}
                  </button>
                ) : null}
              </div>

              <button className="primary-action curator-submit" type="submit" disabled={isGenerating || !input.trim()}>
                SEND
              </button>
            </div>
          </div>
        </form>
      </section>
    </section>
  );
}
