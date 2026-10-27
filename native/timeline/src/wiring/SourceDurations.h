#pragma once
#include <QString>
#include <optional>

namespace nt::wiring {
// Share the trim controller's probe results with transition edits. A replaced
// file must be probed again before its cached duration can authorize growth.
void rememberSourceDuration(const QString& file, const QString& version, double durationMs);
std::optional<double> knownSourceDuration(const QString& file);
}
