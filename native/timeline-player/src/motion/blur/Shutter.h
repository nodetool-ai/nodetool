#pragma once

#include "model/TimelineTypes.h"
#include <QJsonObject>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>
#include <cmath>
#include <vector>

namespace nt::motion {
struct Shutter {
    int samples = 1;
    double angle = 180;
};

inline Shutter resolveShutter(const QJsonObject& options) {
    const auto count = options.value(u"samplesPerFrame");
    const auto angle = options.value(u"shutterAngle");
    Shutter out;
    if (count.isDouble() && std::isfinite(count.toDouble())) {
        out.samples = static_cast<int>(std::clamp(std::floor(count.toDouble()), 1.0, 32.0));
    }
    if (angle.isDouble() && std::isfinite(angle.toDouble())) {
        out.angle = std::clamp(angle.toDouble(), 0.0, 360.0);
    }
    return out;
}

inline std::vector<double> shutterTimes(double timeMs, double frameMs, Shutter shutter) {
    if (shutter.samples <= 1) return {timeMs};
    std::vector<double> times;
    times.reserve(static_cast<size_t>(shutter.samples));
    const double window = shutter.angle / 360.0 * frameMs;
    for (int i = 0; i < shutter.samples; ++i) {
        times.push_back(timeMs + (i + 0.5) / shutter.samples * window);
    }
    return times;
}
inline Shutter frameShutter(const Timeline& timeline, const std::vector<const Clip*>& expanded,
                            double timeMs, double frameMs, const QJsonObject& global = {}) {
    const auto globalShutter = resolveShutter(global);
    Shutter result{globalShutter.samples, globalShutter.samples > 1 ? globalShutter.angle : 0};
    std::unordered_set<std::string> visible;
    std::unordered_map<std::string, const Clip*> groups;
    for (const auto& track : timeline.tracks) if (track.visible) visible.insert(track.id);
    for (const auto& clip : timeline.clips) if (clip.mediaType == MediaType::Group) groups.emplace(clip.id, &clip);
    for (const auto* clip : expanded) {
        const auto value = clip->raw.value(u"motionBlur");
        if (!value.isObject() || !visible.contains(clip->trackId)) continue;
        const auto own = resolveShutter(value.toObject());
        const double end = timeMs + own.angle / 360.0 * frameMs;
        const auto overlaps = [&](const Clip& candidate) {
            return (candidate.startMs < end || (end == timeMs && candidate.startMs <= timeMs)) &&
                   candidate.endMs() > timeMs;
        };
        if (!overlaps(*clip)) continue;
        std::unordered_set<std::string> visited;
        std::string parent = clip->raw.value(u"parentId").toString().toStdString();
        bool active = true;
        while (!parent.empty() && groups.contains(parent)) {
            if (!visited.insert(parent).second || !overlaps(*groups.at(parent))) { active = false; break; }
            parent = groups.at(parent)->raw.value(u"parentId").toString().toStdString();
        }
        if (!active) continue;
        result.samples = std::max(result.samples, own.samples);
        if (own.samples > 1) result.angle = std::max(result.angle, own.angle);
    }
    return result;
}

inline double layerShutterTime(const QJsonObject& clip, double frameTimeMs, int index,
                               int sceneSamples, double frameMs, const QJsonObject& global = {}) {
    const auto own = resolveShutter(clip.value(u"motionBlur").isObject()
                                        ? clip.value(u"motionBlur").toObject() : global);
    if (sceneSamples <= 1 || own.samples <= 1) return frameTimeMs;
    return frameTimeMs + (index + 0.5) / sceneSamples * (own.angle / 360.0) * frameMs;
}

}  // namespace nt::motion
