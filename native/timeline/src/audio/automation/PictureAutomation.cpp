#include "audio/automation/Automation.h"
#include "preview/layers/SceneHooks.h"
#include <algorithm>

namespace nt::automation {
namespace {
std::optional<QJsonObject> clipAutomationAnimation(const Track& track, const Clip& clip) {
    if ((track.type != TrackType::Video && track.type != TrackType::Overlay) ||
        clip.mediaType == MediaType::Group || clip.mediaType == MediaType::Audio ||
        clip.mediaType == MediaType::Midi || clip.durationMs <= 0) {
        return {};
    }
    QJsonArray curves;
    for (const auto& value : track.raw.value(u"automation").toArray()) {
        const auto lane = value.toObject();
        const auto target = lane.value(u"target").toObject();
        const auto points = lane.value(u"points").toArray();
        if (target.value(u"kind").toString() != u"clip" || lane.value(u"enabled") == false || points.empty()) {
            continue;
        }
        const auto lowerBound = [&](double timeMs) {
            return std::lower_bound(points.begin(), points.end(), timeMs,
                [](const QJsonValue& point, double time) {
                    return point.toObject().value(u"timeMs").toDouble() < time;
                }) - points.begin();
        };
        const auto first = std::max(qsizetype{0}, lowerBound(clip.startMs) - 1);
        const auto last = std::min(points.size() - 1, lowerBound(clip.endMs()));
        // Keep crossing segments intact so easing uses the original document-time span.
        QJsonArray keyframes;
        for (auto i = first; i <= last; ++i) {
            const auto point = points[i].toObject();
            const double time = point.value(u"timeMs").toDouble();
            QJsonObject keyframe{{"t", (time - clip.startMs) / clip.durationMs}, {"value", point.value(u"value")}};
            if (point.contains(u"easing")) { keyframe.insert(QStringLiteral("easing"), point.value(u"easing")); }
            keyframes.append(keyframe);
        }
        curves.append(QJsonObject{{"property", target.value(u"property")}, {"keyframes", keyframes}});
    }
    if (curves.empty()) { return {}; }
    return QJsonObject{{"id", QStringLiteral("automation:") + QString::fromStdString(track.id)},
        {"role", "emphasis"}, {"preset", "custom"}, {"durationMs", clip.durationMs},
        {"delayMs", 0}, {"enabled", true}, {"params", QJsonObject{{"trackAutomation", true}}},
        {"custom", QJsonObject{{"curves", curves}}}};
}
}
void registerPictureAutomation() {
    static const auto token = registerClipAnimationProvider(clipAutomationAnimation);
    (void)token;
}
}
