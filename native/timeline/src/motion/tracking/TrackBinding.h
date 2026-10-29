#pragma once

#include "preview/SceneEval.h"
#include <QJsonArray>
#include <algorithm>

namespace nt::motion {
struct TrackOffset {
    double x = 0;
    double y = 0;
    double scale = 1;
    double rotation = 0;
};

// Source samples are immutable. Filtering is computed from the recorded samples,
// never from previously rendered frames, so seeking cannot change the result.
inline QJsonObject sampleTrack(const QJsonArray& samples, double sourceMs) {
    if (samples.isEmpty()) return {};
    if (sourceMs <= samples.first().toObject().value(u"sourceMs").toDouble()) return samples.first().toObject();
    if (sourceMs >= samples.last().toObject().value(u"sourceMs").toDouble()) return samples.last().toObject();
    for (qsizetype i = 1; i < samples.size(); ++i) {
        const auto b = samples[i].toObject();
        const double end = b.value(u"sourceMs").toDouble();
        if (sourceMs > end) continue;
        const auto a = samples[i - 1].toObject();
        const double start = a.value(u"sourceMs").toDouble();
        const double t = end > start ? (sourceMs - start) / (end - start) : 0;
        QJsonObject out{{"sourceMs", sourceMs}};
        for (const auto* key : {"x", "y"}) {
            const auto av = a.value(QLatin1String(key)), bv = b.value(QLatin1String(key));
            if (av.isDouble() && bv.isDouble()) out.insert(QLatin1String(key), av.toDouble() + (bv.toDouble() - av.toDouble()) * t);
            else if (av.isDouble()) out.insert(QLatin1String(key), av);
            else if (bv.isDouble()) out.insert(QLatin1String(key), bv);
        }
        return out;
    }
    return samples.last().toObject();
}

inline QJsonObject sampleSmoothedTrack(const QJsonArray& samples, double sourceMs, double factor) {
    if (factor <= 0 || samples.isEmpty()) return sampleTrack(samples, sourceMs);
    factor = std::min(1.0, factor);
    QJsonArray filtered{samples.first()};
    for (qsizetype i = 1; i < samples.size(); ++i) {
        if (sourceMs <= samples.first().toObject().value(u"sourceMs").toDouble()) break;
        auto current = samples[i].toObject();
        const auto previous = filtered.last().toObject();
        for (const auto* key : {"x", "y"}) {
            const auto a = previous.value(QLatin1String(key)), b = current.value(QLatin1String(key));
            if (a.isDouble() && b.isDouble()) current.insert(QLatin1String(key), a.toDouble() * factor + b.toDouble() * (1 - factor));
            else if (a.isDouble()) current.insert(QLatin1String(key), a);
        }
        filtered.append(current);
        if (current.value(u"sourceMs").toDouble() >= sourceMs) break;
    }
    return sampleTrack(filtered, sourceMs);
}

inline std::optional<TrackOffset> resolveTrackBinding(
    const Clip& clip, const QJsonArray& tracks,
    const std::unordered_map<std::string, const Clip*>& owners,
    double steppedTimeMs, double width, double height) {
    const auto binding = clip.raw.value(u"trackBinding").toObject();
    const auto mode = binding.value(u"mode").toString();
    if (mode != u"position" && mode != u"position_scale") return {};
    for (const auto& value : tracks) {
        const auto track = value.toObject();
        if (track.value(u"id") != binding.value(u"trackId")) continue;
        if (track.value(u"status").toString() != u"ready") return {};
        const auto owner = owners.find(track.value(u"clipId").toString().toStdString());
        if (owner == owners.end() || track.value(u"sourceAssetId") != owner->second->raw.value(u"currentAssetId")) return {};
        const double sourceMs = clipSourceMsAt(*owner->second, steppedTimeMs);
        const auto sample = sampleSmoothedTrack(track.value(u"samples").toArray(), sourceMs, binding.value(u"smoothing").toDouble());
        if (!sample.value(u"x").isDouble() || !sample.value(u"y").isDouble()) return {};
        const auto offset = binding.value(u"offset").toObject();
        return TrackOffset{(sample.value(u"x").toDouble() - 0.5) * width + offset.value(u"x").toDouble(),
                           (sample.value(u"y").toDouble() - 0.5) * height + offset.value(u"y").toDouble(),
                           mode == u"position_scale" ? binding.value(u"scale").toDouble(1) : 1,
                           binding.value(u"rotationOffset").toDouble()};
    }
    return {};
}
} // namespace nt::motion
