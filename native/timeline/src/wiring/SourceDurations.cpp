#include "SourceDurations.h"
#include "ui/MediaVersion.h"
#include <QHash>
#include <QMutex>
#include <QMutexLocker>

namespace nt::wiring {
namespace {
struct Duration { QString version; double ms; };
// native-rules #10: mutex does not say that it guards durations
// native-rules #14: global mutex
QMutex mutex;
// native-rules #14: global mutable cache
QHash<QString, Duration> durations;
}
void rememberSourceDuration(const QString& file, const QString& version, double durationMs) {
    QMutexLocker lock(&mutex);
    durations.insert(file, {version, durationMs});
}
std::optional<double> knownSourceDuration(const QString& file) {
    const auto version = nt::ui::mediaVersionKey(file);
    QMutexLocker lock(&mutex);
    const auto found = durations.constFind(file);
    if (found == durations.cend() || found->version != version) { return std::nullopt; }
    return found->ms;
}
}
