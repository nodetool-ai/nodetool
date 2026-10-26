#pragma once
#include <QJsonObject>
#include <optional>

namespace nt::edit::transitions {
// End trim for transition growth, including source curves. The shared trim
// still refuses those curves, so this port owns only the outgoing handle.
std::optional<QJsonObject> extendHandle(const QJsonObject& clip, double missingMs, std::optional<double> sourceCapMs = std::nullopt);
}
