#pragma once
#include <QSettings>
#include <QString>
#include <memory>
#include <limits>

namespace nt::app {
inline constexpr qint64 kDefaultCacheBudgetMb = 20 * 1024;
// AssetCache multiplies MB into a signed byte count.
inline constexpr qint64 kMaxCacheBudgetMb = std::numeric_limits<qint64>::max() / (1024 * 1024);
std::unique_ptr<QSettings> openTimelinePreferences();
qint64 readCacheBudgetMb(const QSettings& settings);
void applyCachePreferences();
QString preferredDecodeMode();
QString preferredAudioDevice();
}
