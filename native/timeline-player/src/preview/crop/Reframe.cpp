#include "Reframe.h"
#include "scene/ClipScene.h"
#include <QJsonArray>
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>
namespace nt::reframe {
namespace {
constexpr double cropEpsilon = 1e-4;
const std::array<QString, 4> edges{"left", "right", "top", "bottom"};
} // namespace
bool isCropUsable(const QJsonObject& crop) {
    for (const auto& edge : edges) {
        const auto value = crop.value(edge);
        if (!value.isDouble() || !std::isfinite(value.toDouble()) || value.toDouble() < 0) {
            return false;
        }
    }
    return crop.value("left").toDouble() + crop.value("right").toDouble() < 1 - cropEpsilon &&
           crop.value("top").toDouble() + crop.value("bottom").toDouble() < 1 - cropEpsilon;
}
bool hasCrop(const QJsonObject& crop) {
    return isCropUsable(crop) &&
           std::ranges::any_of(edges, [&crop](const QString& edge) { return crop[edge].toDouble() > cropEpsilon; });
}
QJsonObject cropRectPx(const QJsonObject& crop, double w, double h) {
    if (w <= 0 || h <= 0 || !hasCrop(crop)) {
        return {{"x", 0}, {"y", 0}, {"width", w}, {"height", h}};
    }
    const double x = std::floor(crop.value("left").toDouble() * w);
    const double y = std::floor(crop.value("top").toDouble() * h);
    return {{"x", std::min(x, w - 1)},
            {"y", std::min(y, h - 1)},
            {"width",
             std::max(
                 1., std::min(std::floor((1 - crop.value("left").toDouble() - crop.value("right").toDouble()) * w + .5),
                              w - x))},
            {"height",
             std::max(
                 1., std::min(std::floor((1 - crop.value("top").toDouble() - crop.value("bottom").toDouble()) * h + .5),
                              h - y))}};
}
QJsonObject cropAt(const nt::Clip& clip, double timeMs) {
    auto crop = clip.raw.value("crop").toObject();
    const auto curves = clip.scene ? clip.scene->paramCurves : nullptr;
    if (!curves || clip.durationMs <= 0) {
        return crop;
    }
    const double t = std::clamp((timeMs - clip.startMs) / clip.durationMs, 0.0, 1.0);
    bool keyed = false;
    for (const auto& [edge, property] : {std::pair{"left", u"cropLeft"}, std::pair{"right", u"cropRight"}, std::pair{"top", u"cropTop"}, std::pair{"bottom", u"cropBottom"}}) {
        if (const auto value = curves->value(property, t)) {
            crop.insert(edge, std::clamp(*value, 0.0, 0.95));
            keyed = true;
        } else if (!crop.contains(edge)) {
            crop.insert(edge, 0);
        }
    }
    if (!keyed) {
        return clip.raw.value("crop").toObject();
    }
    // Opposite edges are keyed at their own times, so between keys they can meet. They leave 5% of the
    // picture, as the crop edit does, rather than make the crop unusable and show the whole frame.
    for (const auto& [a, b] : {std::pair{"left", "right"}, std::pair{"top", "bottom"}}) {
        const double total = crop.value(a).toDouble() + crop.value(b).toDouble();
        if (total > 0.95) {
            crop.insert(a, crop.value(a).toDouble() * 0.95 / total);
            crop.insert(b, crop.value(b).toDouble() * 0.95 / total);
        }
    }
    return crop;
}
namespace {
double clamp01(double value) { return std::clamp(value, 0., 1.); }
double number(const QJsonObject& object, const QString& key) { return object.value(key).toDouble(); }
std::vector<QJsonObject> objects(const QJsonArray& array, bool sort) {
    std::vector<QJsonObject> out;
    out.reserve(static_cast<size_t>(array.size()));
    for (const auto& value : array) {
        out.push_back(value.toObject());
    }
    if (sort) {
        std::stable_sort(out.begin(), out.end(),
                         [](const auto& a, const auto& b) { return number(a, "sourceMs") < number(b, "sourceMs"); });
    }
    return out;
}
// Automatic paths need both endpoints of an optional channel. Media tracks
// instead retain the endpoint that has the channel, as sampleMediaTrackAt does.
QJsonObject sample(const std::vector<QJsonObject>& points, double time, bool path) {
    if (points.empty()) {
        return {};
    }
    QJsonObject result;
    if (time <= number(points.front(), "sourceMs")) {
        result = points.front();
    } else if (time >= number(points.back(), "sourceMs")) {
        result = points.back();
    } else {
        for (size_t i = 1; i < points.size(); ++i) {
            const auto& b = points[i];
            if (time > number(b, "sourceMs")) {
                continue;
            }
            const auto& a = points[i - 1];
            const auto span = number(b, "sourceMs") - number(a, "sourceMs");
            const auto t = span > 0 ? (time - number(a, "sourceMs")) / span : 0;
            for (const auto& key : {"x", "y", "width", "height", "confidence", "zoom"}) {
                if (a.contains(key) && b.contains(key)) {
                    result.insert(key, number(a, key) + (number(b, key) - number(a, key)) * t);
                } else if (!path && (a.contains(key) || b.contains(key))) {
                    result.insert(key, a.contains(key) ? a.value(key) : b.value(key));
                }
            }
            break;
        }
    }
    result.insert("sourceMs", time);
    return result;
}
QJsonObject baseSample(const QJsonObject& reframe, double time, const QJsonObject& track) {
    if (reframe.value("mode") == "track" && !track.isEmpty() && track.value("id") == reframe.value("trackId") &&
        track.value("status") == "ready") {
        auto points = objects(track.value("samples").toArray(), false);
        const auto smoothing = number(reframe, "smoothing");
        if (smoothing > 0 && !points.empty()) {
            const auto factor = std::min(1., smoothing);
            std::vector<QJsonObject> filtered{points.front()};
            if (time > number(points.front(), "sourceMs")) {
                for (size_t i = 1; i < points.size(); ++i) {
                    auto next = points[i];
                    const auto& previous = filtered.back();
                    for (const auto& key : {"x", "y", "width", "height", "confidence"}) {
                        if (!previous.contains(key)) {
                            continue;
                        }
                        next.insert(key, next.contains(key)
                                             ? number(previous, key) * factor + number(next, key) * (1 - factor)
                                             : previous.value(key));
                    }
                    filtered.push_back(next);
                    if (number(next, "sourceMs") >= time) {
                        break;
                    }
                }
            }
            points = std::move(filtered);
        }
        const auto sampled = sample(points, time, false);
        if (sampled.contains("x") && sampled.contains("y")) {
            QJsonObject out{{"sourceMs", time}, {"x", sampled.value("x")}, {"y", sampled.value("y")}};
            for (const auto& key : {"width", "height", "confidence"}) {
                if (sampled.contains(key)) {
                    out.insert(key, sampled.value(key));
                }
            }
            return out;
        }
    }
    if (reframe.value("mode") == "auto") {
        const auto automatic = sample(objects(reframe.value("samples").toArray(), true), time, true);
        if (!automatic.isEmpty()) {
            return automatic;
        }
    }
    return {{"sourceMs", time}, {"x", .5}, {"y", .5}};
}
} // namespace
bool mediaTrackCanDriveReframe(const QJsonObject& track) {
    if (track.value("status") != "ready") {
        return false;
    }
    for (const auto& value : track.value("samples").toArray()) {
        const auto s = value.toObject();
        if (s.contains("x") && s.contains("y")) {
            return true;
        }
    }
    return false;
}
QJsonObject sampleReframeAt(const QJsonObject& reframe, double time, const QJsonObject& track) {
    auto automatic = baseSample(reframe, time, track);
    const auto keys = objects(reframe.value("keyframes").toArray(), true);
    std::vector<QJsonObject> corrections;
    corrections.reserve(keys.size());
    for (const auto& key : keys) {
        const auto base = baseSample(reframe, number(key, "sourceMs"), track);
        corrections.push_back({{"sourceMs", key.value("sourceMs")},
                               {"x", number(key, "x") - number(base, "x")},
                               {"y", number(key, "y") - number(base, "y")},
                               {"zoom", std::max(1., key.value("zoom").toDouble(1))}});
    }
    const auto correction = sample(corrections, time, true);
    automatic.insert("sourceMs", time);
    automatic.insert("x", clamp01(number(automatic, "x") + number(correction, "x")));
    automatic.insert("y", clamp01(number(automatic, "y") + number(correction, "y")));
    automatic.insert("zoom", correction.value("zoom").toDouble(1));
    return automatic;
}
QJsonValue resolveReframeCrop(const QJsonObject& reframe, double time, const QJsonObject& source,
                              const QJsonObject& target, const QJsonObject& track) {
    if (number(source, "width") <= 0 || number(source, "height") <= 0 || number(target, "width") <= 0 ||
        number(target, "height") <= 0) {
        return QJsonValue::Null;
    }
    const double sa = number(source, "width") / number(source, "height"),
                 ta = number(target, "width") / number(target, "height");
    double w = ta < sa ? ta / sa : 1, h = ta < sa ? 1 : sa / ta;
    const auto sampled = sampleReframeAt(reframe, time, track);
    if (reframe.contains("safeMargin")) {
        const auto available = 1 - std::clamp(number(reframe, "safeMargin"), 0., .49) * 2;
        const auto ws = number(sampled, "width") / (w * available), hs = number(sampled, "height") / (h * available);
        if (ws > 0 || hs > 0) {
            const auto scale = std::min(1., std::max(ws, hs));
            w *= scale;
            h *= scale;
        }
    }
    w /= number(sampled, "zoom");
    h /= number(sampled, "zoom");
    const auto x = std::min(1 - w / 2, std::max(w / 2, number(sampled, "x")));
    const auto y = std::min(1 - h / 2, std::max(h / 2, number(sampled, "y")));
    return QJsonObject{{"left", x - w / 2}, {"right", 1 - x - w / 2}, {"top", y - h / 2}, {"bottom", 1 - y - h / 2}};
}
bool isReframeStale(const QJsonObject& clip, const QJsonObject& track) {
    const auto r = clip.value("reframe").toObject();
    if (r.isEmpty()) {
        return false;
    }
    if (!r.value("sourceAssetId").toString().isEmpty() && r.value("sourceAssetId") != clip.value("currentAssetId")) {
        return true;
    }
    return r.value("mode") == "track" && (track.isEmpty() || track.value("status") != "ready" ||
                                          track.value("sourceAssetId") != clip.value("currentAssetId"));
}
QJsonValue renderableReframe(const QJsonObject& clip, const QJsonObject& track) {
    if (!clip.contains("reframe")) {
        return QJsonValue::Null;
    }
    auto r = clip.value("reframe").toObject();
    if (isReframeStale(clip, track)) {
        r.insert("mode", "center");
    }
    return r;
}
} // namespace nt::reframe
