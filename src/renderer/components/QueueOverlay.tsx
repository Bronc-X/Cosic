import type { CSSProperties } from 'react';
import type { LibraryPlaylist, Track } from '../../shared/contracts/bridge';

interface QueueOverlayProps {
  isOpen: boolean;
  tracks: Track[];
  playlists: LibraryPlaylist[];
  activePlaylistId: string | null;
  activeTrackId: string | null;
  queueLabel: string;
  queueMeta: string;
  isLibraryQueue: boolean;
  isSwitchingLibrary: boolean;
  onClose: () => void;
  onSelectTrack: (index: number) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onRestoreLibrary: () => void;
}

const formatDuration = (duration: number) => {
  const minutes = Math.floor(duration / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(duration % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
};

export function QueueOverlay({
  isOpen,
  tracks,
  playlists,
  activePlaylistId,
  activeTrackId,
  queueLabel,
  queueMeta,
  isLibraryQueue,
  isSwitchingLibrary,
  onClose,
  onSelectTrack,
  onSelectPlaylist,
  onRestoreLibrary
}: QueueOverlayProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="queue-overlay" role="dialog" aria-modal="true" aria-label="Queue overlay">
      <div className="queue-overlay-backdrop" onClick={onClose} />

      <section className="queue-overlay-sheet panel">
        <div className="queue-head">
          <div>
            <p className="panel-label">Queue Overlay</p>
            <h3>{queueLabel}</h3>
            <p className="queue-meta">{queueMeta}</p>
          </div>

          <div className="queue-head-actions">
            {!isLibraryQueue ? <span className="queue-mode-pill">AI STACK</span> : null}
            {!isLibraryQueue ? (
              <button className="secondary-action" type="button" onClick={onRestoreLibrary}>
                ORIGIN
              </button>
            ) : null}
            <button className="ghost-action" type="button" onClick={onClose}>
              CLOSE
            </button>
          </div>
        </div>

        {isLibraryQueue && playlists.length > 0 ? (
          <div className="playlist-strip" aria-label="Playlist selector">
            {playlists.map((playlist) => {
              const isActive = playlist.id === activePlaylistId;

              return (
                <button
                  key={playlist.id}
                  className={isActive ? 'playlist-chip is-active' : 'playlist-chip'}
                  type="button"
                  disabled={isSwitchingLibrary}
                  onClick={() => onSelectPlaylist(playlist.id)}
                  style={
                    playlist.coverUrl
                      ? ({
                          '--playlist-cover': `url("${playlist.coverUrl}")`
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <div className="playlist-chip-copy">
                    <span>{playlist.name}</span>
                    <strong>{playlist.trackCount} TRACKS</strong>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="queue-list">
          {tracks.map((track, index) => {
            const isActive = track.id === activeTrackId;

            return (
              <button
                key={`${track.id}-${index}`}
                className={isActive ? 'queue-card is-active' : 'queue-card'}
                type="button"
                onClick={() => onSelectTrack(index)}
              >
                <span className="queue-card-index">{String(index + 1).padStart(2, '0')}</span>
                <div
                  className={track.coverUrl ? 'queue-cover has-image' : 'queue-cover'}
                  style={
                    track.coverUrl ? ({ '--queue-cover': `url("${track.coverUrl}")` } as CSSProperties) : undefined
                  }
                >
                  {!track.coverUrl ? <span>{track.title.slice(0, 1)}</span> : null}
                </div>
                <div className="queue-card-copy">
                  <strong>{track.title}</strong>
                  <span>
                    {track.artist} · {track.mood}
                  </span>
                </div>
                <span className="queue-duration">{formatDuration(track.duration)}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
