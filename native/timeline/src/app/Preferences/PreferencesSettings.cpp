#include "PreferencesSettings.h"
#include <algorithm>

namespace nt::app {
std::unique_ptr<QSettings> openTimelinePreferences() {
    const QString path = qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES");
    auto settings = path.isEmpty() ? std::make_unique<QSettings>("NodeTool", "Timeline")
                                  : std::make_unique<QSettings>(path, QSettings::IniFormat);
    settings->setFallbacksEnabled(false);
    return settings;
}
qint64 readCacheBudgetMb(const QSettings& settings) {
    bool ok = false;
    const qint64 value = settings.value("cacheBudgetMb", kDefaultCacheBudgetMb).toLongLong(&ok);
    return ok ? std::clamp(value, -kMaxCacheBudgetMb, kMaxCacheBudgetMb) : kDefaultCacheBudgetMb;
}
void applyCachePreferences() {
    const auto settings = openTimelinePreferences();
    const QString folder = settings->value("cacheFolder").toString();
    if (!folder.isEmpty() && !qEnvironmentVariableIsSet("NODETOOL_TIMELINE_CACHE_DIR")) {
        qputenv("NODETOOL_TIMELINE_CACHE_DIR", folder.toUtf8());
    }
    if (settings->contains("cacheBudgetMb") && !qEnvironmentVariableIsSet("NODETOOL_TIMELINE_CACHE_BUDGET_MB")) {
        qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", QByteArray::number(readCacheBudgetMb(*settings)));
    }
}
QString preferredDecodeMode() {
    const QString mode = openTimelinePreferences()->value("decoderMode", "sw").toString();
    return mode == "sw" || mode == "hw" || mode == "auto" ? mode : QStringLiteral("sw");
}
QString preferredAudioDevice() { return openTimelinePreferences()->value("audioDevice").toString(); }
}
