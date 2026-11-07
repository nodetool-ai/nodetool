#pragma once
#include <QRandomGenerator>
#include <algorithm>
#include <cmath>
#include <functional>
namespace nodetool::node_editor {
// The reconnect schedule of the web socket manager. The defaults are the web values.
// Source: web/src/lib/websocket/WebSocketManager.ts (getReconnectDelay, shouldReconnect) and
// RECONNECT_INTERVAL_MS in GlobalWebSocketManager.ts. Tests replace the numbers and the jitter.
struct ReconnectPolicy {
  int intervalMs = 1000;
  double decay = 1.5;
  int maxIntervalMs = 30000;
  // Consecutive attempts before giving up. The web default is unlimited, written here as 0.
  int maxAttempts = 0;
  // Returns a value in [0, 1). The delay scales by 0.5 plus half of it, so clients that dropped
  // together do not return in lockstep. Null uses the global random generator.
  std::function<double()> jitter;

  // The wait before the attempt that follows `failures` earlier attempts.
  int delayMs(int failures) const {
    const double raw = std::min(intervalMs * std::pow(decay, failures), static_cast<double>(maxIntervalMs));
    const double random = jitter ? jitter() : QRandomGenerator::global()->generateDouble();
    return static_cast<int>(std::lround(raw * (0.5 + random * 0.5)));
  }
  bool allows(int failures) const { return maxAttempts <= 0 || failures < maxAttempts; }
  // Close codes that retrying cannot fix: a rejected client, a frame it would send again, a missing
  // extension, and the custom authentication codes. The web keeps 1001 and 1011 retryable.
  static bool terminalCloseCode(int code) {
    return code == 1008 || code == 1009 || code == 1010 || code == 4000 || code == 4001 || code == 4003;
  }
};
} // namespace nodetool::node_editor
