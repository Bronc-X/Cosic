import type { ReactNode } from 'react';
import type { WindowPlatform, WindowState } from '../../shared/contracts/bridge';
import { CosicLogoMark } from './CosicLogoMark';

type ThemeMode = 'dark' | 'light';

interface TitleBarProps {
  windowState: WindowState;
  isRadioUnlocked: boolean;
  themeMode: ThemeMode;
  weatherControl?: ReactNode;
  onToggleTheme: () => void;
  onOpenRadioMode: () => void;
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
  isRadioUnlocked,
  themeMode,
  weatherControl,
  onToggleTheme,
  onOpenRadioMode,
  onMinimize,
  onToggleMaximize,
  onClose
}: TitleBarProps) {
  const isMac = windowState.platform === 'darwin';
  const themeLabel = themeMode === 'light' ? '浅色' : '深色';
  const nextThemeLabel = themeMode === 'light' ? '深色' : '浅色';
  const radioButton = (
    <button
      className={`radio-entry-button no-drag${isRadioUnlocked ? '' : ' is-locked'}`}
      type="button"
      onClick={onOpenRadioMode}
      disabled={!isRadioUnlocked}
    >
      <span>RADIO</span>
      <strong>{isRadioUnlocked ? '电台' : '23点后开放'}</strong>
    </button>
  );

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
        <CosicLogoMark className="brand-logo-mark" />
      </div>

      <div className="titlebar-actions">
        {weatherControl ? <div className="titlebar-weather-slot">{weatherControl}</div> : null}
        <button
          className={`theme-toggle-button no-drag is-${themeMode}`}
          type="button"
          onClick={onToggleTheme}
          aria-label={`切换到${nextThemeLabel}界面`}
          title={`切换到${nextThemeLabel}界面`}
        >
          <span className="theme-toggle-orbit" aria-hidden="true" />
          <strong>{themeLabel}</strong>
        </button>
        {radioButton}
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
