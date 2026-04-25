import type {
  BridgeCapability,
  BridgeCapabilityId,
  BridgeSnapshot,
  CapabilityProbeResult
} from '../../shared/contracts/bridge';

interface SignalStripProps {
  bridge: BridgeSnapshot;
  lastProbe: CapabilityProbeResult | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onProbe: (capabilityId: BridgeCapabilityId) => void;
}

const renderStatusLabel = (capability: BridgeCapability) => {
  if (capability.status === 'online') {
    return 'online';
  }

  if (capability.status === 'configured') {
    return 'configured';
  }

  if (capability.status === 'offline') {
    return 'offline';
  }

  return 'mock';
};

export function SignalStrip({
  bridge,
  lastProbe,
  isRefreshing,
  onRefresh,
  onProbe
}: SignalStripProps) {
  return (
    <section className="panel signal-strip">
      <div className="signal-runtime">
        <div>
          <p className="panel-label">System</p>
          <strong>{bridge.server.name}</strong>
        </div>
        <button className="ghost-action" onClick={onRefresh}>
          {isRefreshing ? 'Syncing...' : 'Sync bridge'}
        </button>
      </div>

      <div className="signal-grid">
        {bridge.capabilities.map((capability) => (
          <button
            key={capability.id}
            className={`signal-chip is-${capability.status}`}
            onClick={() => onProbe(capability.id)}
          >
            <span className="signal-chip-label">{capability.label}</span>
            <span className="signal-chip-state">{renderStatusLabel(capability)}</span>
          </button>
        ))}
      </div>

      <p className="signal-note">{lastProbe?.message ?? bridge.notes[0]}</p>
    </section>
  );
}
