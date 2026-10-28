#include "audio/automation/Automation.h"
#include "preview/layers/SceneHooks.h"

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
        QJsonArray keyframes{QJsonObject{{"t", 0}, {"value", automationValueAt(points, clip.startMs)}}};
        for (const auto& pointValue : points) {
            const auto point = pointValue.toObject();
            const double time = point.value(u"timeMs").toDouble();
            if (time <= clip.startMs || time >= clip.endMs()) { continue; }
            QJsonObject keyframe{{"t", (time - clip.startMs) / clip.durationMs}, {"value", point.value(u"value")}};
            if (point.contains(u"easing")) { keyframe.insert(QStringLiteral("easing"), point.value(u"easing")); }
            keyframes.append(keyframe);
        }
        QJsonObject tail{{"t", 1}, {"value", automationValueAt(points, clip.endMs())}};
        for (const auto& pointValue : points) {
            const auto point = pointValue.toObject();
            if (point.value(u"timeMs").toDouble() >= clip.endMs()) {
                if (point.contains(u"easing")) { tail.insert(QStringLiteral("easing"), point.value(u"easing")); }
                break;
            }
        }
        keyframes.append(tail);
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
