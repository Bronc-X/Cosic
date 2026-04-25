import type {
  BridgeCapabilityId,
  BridgeSnapshot,
  CapabilityProbeResult
} from '../../shared/contracts/bridge';

interface BridgePanelProps {
  bridge: BridgeSnapshot;
  lastProbe: CapabilityProbeResult | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onProbe: (capabilityId: BridgeCapabilityId) => void;
}

export function BridgePanel({
  bridge,
  lastProbe,
  isRefreshing,
  onRefresh,
  onProbe
}: BridgePanelProps) {
  return (
    <section className="panel side-panel bridge-panel">
      <div className="panel-head">
        <h3>Bridge</h3>
        <button className="ghost-button" onClick={onRefresh}>
          {isRefreshing ? '...' : 'Sync'}
        </button>
      </div>

      <div className="bridge-runtime">
        <span>{bridge.server.runtime}</span>
        <span>{bridge.server.status}</span>
      </div>

      <div className="bridge-list">
        {bridge.capabilities.map((capability) => (
          <article key={capability.id} className="bridge-item">
            <div className="bridge-item-copy">
              <strong>{capability.label}</strong>
              <span>{capability.provider}</span>
            </div>
            <button className="ghost-button ghost-button-small" onClick={() => onProbe(capability.id)}>
              {capability.status}
            </button>
          </article>
        ))}
      </div>

      <div className="device-list">
        {bridge.devices.map((device) => (
          <div key={device.id} className="device-item">
            <strong>{device.name}</strong>
            <span>{device.status}</span>
          </div>
        ))}
      </div>

      {lastProbe ? <p className="bridge-note">{lastProbe.message}</p> : null}
    </section>
  );
}
