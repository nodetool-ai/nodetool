/** Connection state as a coloured dot with an accessible label. */

import type { ConnectionState } from "../../lib/chat-socket.js";

const LABELS: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  error: "Connection error",
  disconnected: "Disconnected",
  idle: "Idle",
};

export function ConnectionDot({ state }: { state: ConnectionState }) {
  const label = LABELS[state];
  return (
    <span
      className="connection-dot"
      data-state={state}
      role="status"
      aria-label={label}
      title={label}
    />
  );
}
