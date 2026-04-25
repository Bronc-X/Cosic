import type { CSSProperties } from 'react';
import type { LibraryPlaylist } from '../../shared/contracts/bridge';

interface QueueRailProps {
  playlists: LibraryPlaylist[];
  activePlaylistId: string | null;
  isSwitchingLibrary: boolean;
  onSelectPlaylist: (playlistId: string) => void;
}

export function QueueRail({
  playlists,
  activePlaylistId,
  isSwitchingLibrary,
  onSelectPlaylist
}: QueueRailProps) {
  const randomPlaylistButtons = playlists.slice(0, 18);

  return (
    <section className="queue-panel panel">
      <div className="queue-head">
        <div>
          <p className="panel-label">Random Playlists</p>
          <h3>随机推荐歌单</h3>
        </div>
      </div>

      {randomPlaylistButtons.length > 0 ? (
        <div className="playlist-button-grid" aria-label="Random playlist selector">
          {randomPlaylistButtons.map((randomPlaylist) => {
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
                <span>{randomPlaylist.name}</span>
                <strong>{randomPlaylist.trackCount} TRACKS</strong>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="playlist-button-empty">
          <span>NO PLAYLISTS</span>
        </div>
      )}
    </section>
  );
}
