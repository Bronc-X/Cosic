interface LocationPermissionDialogProps {
  isRequesting: boolean;
  onAllow: () => void;
  onSkip: () => void;
}

export function LocationPermissionDialog({
  isRequesting,
  onAllow,
  onSkip
}: LocationPermissionDialogProps) {
  return (
    <div className="location-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="location-title">
      <div className="location-permission-card panel">
        <p className="panel-label">Location</p>
        <h2 id="location-title">允许 Cosic 获取当前位置？</h2>
        <p>用于显示真实地区和无 API 天气，不会保存精确坐标。</p>
        <div className="location-permission-actions">
          <button className="secondary-action" type="button" onClick={onSkip} disabled={isRequesting}>
            稍后
          </button>
          <button className="primary-action" type="button" onClick={onAllow} disabled={isRequesting}>
            {isRequesting ? '定位中' : '允许定位'}
          </button>
        </div>
      </div>
    </div>
  );
}
