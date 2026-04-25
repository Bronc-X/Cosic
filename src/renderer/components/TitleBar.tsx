import type { WindowPlatform, WindowState } from '../../shared/contracts/bridge';

interface TitleBarProps {
  windowState: WindowState;
  statusLabel: string;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

function WindowButtons({
  platform,
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose
}: {
  platform: WindowPlatform;
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  if (platform === 'darwin') {
    return (
      <div className="window-controls window-controls-mac no-drag" aria-label="Window controls">
        <button className="window-dot window-dot-close" aria-label="Close window" onClick={onClose} />
        <button className="window-dot window-dot-minimize" aria-label="Minimize window" onClick={onMinimize} />
        <button
          className="window-dot window-dot-maximize"
          aria-label={maximized ? 'Restore window' : 'Maximize window'}
          onClick={onToggleMaximize}
        />
      </div>
    );
  }

  return (
    <div className="window-controls window-controls-win no-drag" aria-label="Window controls">
      <button className="window-button" aria-label="Minimize window" onClick={onMinimize}>
        <span className="window-glyph window-glyph-minimize" />
      </button>
      <button
        className="window-button"
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
        onClick={onToggleMaximize}
      >
        <span
          className={
            maximized ? 'window-glyph window-glyph-restore' : 'window-glyph window-glyph-maximize'
          }
        />
      </button>
      <button className="window-button window-button-close" aria-label="Close window" onClick={onClose}>
        <span className="window-glyph window-glyph-close" />
      </button>
    </div>
  );
}

export function TitleBar({
  windowState,
  statusLabel,
  onMinimize,
  onToggleMaximize,
  onClose
}: TitleBarProps) {
  const isMac = windowState.platform === 'darwin';

  return (
    <header className={isMac ? 'titlebar is-mac' : 'titlebar is-win'}>
      {isMac ? (
        <WindowButtons
          platform={windowState.platform}
          maximized={windowState.maximized}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
          onClose={onClose}
        />
      ) : null}

      <div className="titlebar-brand">
        <div className="brand-grid" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="brand-copy">
          <strong>Cosic</strong>
          <span>{statusLabel}</span>
        </div>
      </div>

      {!isMac ? (
        <WindowButtons
          platform={windowState.platform}
          maximized={windowState.maximized}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
          onClose={onClose}
        />
      ) : null}
    </header>
  );
}
