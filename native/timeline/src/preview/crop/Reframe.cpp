#include "Reframe.h"
#include "preview/SceneEval.h"
#include <QJsonArray>
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <vector>
namespace nt::reframe {
namespace {
constexpr double cropEpsilon = 1e-4;
const std::array<QString, 4> edges{"left", "right", "top", "bottom"};
QJsonObject noCrop() { return {{"left", 0}, {"right", 0}, {"top", 0}, {"bottom", 0}}; }
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
double cropMax(const QJsonObject& crop, const QString& edge) {
    const auto it = std::ranges::find(edges, edge);
    if (it == edges.end()) {
        return 0;
    }
    const auto index = static_cast<size_t>(it - edges.begin());
    return std::max(0., .95 - crop[edges[index ^ 1]].toDouble());
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
struct Affine {
    double a, b, c, d, e, f;
};
Affine affineForReframe(const QJsonObject& g) {
    const auto crop = g.value("crop").toObject();
    const double sw = number(g, "sourceWidth") * (1 - number(crop, "left") - number(crop, "right"));
    const double sh = number(g, "sourceHeight") * (1 - number(crop, "top") - number(crop, "bottom"));
    const double fw = number(g, "frameWidth"), fh = number(g, "frameHeight");
    const auto raw = g.value("transform").toObject();
    ClipTransform transform;
    const auto vec = [](const QJsonObject& object, const QString& key, Vec2 fallback) {
        const auto v = object.value(key).toObject();
        return v.isEmpty() ? fallback : Vec2{v.value("x").toDouble(), v.value("y").toDouble()};
    };
    transform.position = vec(raw, "position", transform.position);
    transform.scale = vec(raw, "scale", transform.scale);
    transform.anchor = vec(raw, "anchor", transform.anchor);
    transform.rotation = number(raw, "rotation");
    if (raw.contains("rotationX")) {
        transform.rotationX = number(raw, "rotationX");
    }
    if (raw.contains("rotationY")) {
        transform.rotationY = number(raw, "rotationY");
    }
    if (raw.contains("perspective")) {
        transform.perspective = number(raw, "perspective");
    }
    if (raw.contains("depthPx")) {
        transform.depthPx = number(raw, "depthPx");
    }
    std::optional<Mat4> parent;
    const auto values = g.value("parentMatrix").toArray();
    if (values.size() == 16) {
        Mat4 matrix{};
        for (qsizetype i = 0; i < 16; ++i) {
            matrix[static_cast<size_t>(i)] = static_cast<float>(values[i].toDouble());
        }
        parent = matrix;
    }
    const double rw = number(g, "sequenceWidth"), rh = number(g, "sequenceHeight");
    auto m = buildTransformMatrix(transform, containBaseScale(sw, sh, fw, fh),
                                  rw != 0 ? rw : fw, rh != 0 ? rh : fh, parent);
    const auto evaluated = g.value("drawMatrix").toArray();
    if (evaluated.size() == 16) {
        for (qsizetype i = 0; i < 16; ++i) {
            m[static_cast<size_t>(i)] = static_cast<float>(evaluated[i].toDouble());
        }
    }
    return {fw * m[0] / (sw != 0 ? sw : 1),
            -fh * m[1] / (sw != 0 ? sw : 1),
            -fw * m[4] / (sh != 0 ? sh : 1),
            fh * m[5] / (sh != 0 ? sh : 1),
            fw / 2 * (-static_cast<double>(m[0]) + static_cast<double>(m[4]) + static_cast<double>(m[12])) + fw / 2,
            fh / 2 - fh / 2 * (-static_cast<double>(m[1]) + static_cast<double>(m[5]) + static_cast<double>(m[13]))};
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
QJsonObject addReframeKeyframe(QJsonObject reframe, const QJsonObject& keyframe) {
    auto keys = objects(reframe.value("keyframes").toArray(), false);
    std::erase_if(keys, [&keyframe](const auto& key) { return key.value("sourceMs") == keyframe.value("sourceMs"); });
    keys.push_back(keyframe);
    std::stable_sort(keys.begin(), keys.end(),
                     [](const auto& a, const auto& b) { return number(a, "sourceMs") < number(b, "sourceMs"); });
    QJsonArray result;
    for (const auto& key : keys) {
        result.append(key);
    }
    reframe.insert("keyframes", result);
    return reframe;
}
QJsonObject clearReframe(QJsonObject clip) {
    clip.remove("reframe");
    return clip;
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
QJsonObject sourcePointToReframeViewport(double x, double y, const QJsonObject& g) {
    const auto a = affineForReframe(g);
    const auto crop = g.value("crop").toObject();
    const auto lx = (x - number(crop, "left")) * number(g, "sourceWidth");
    const auto ly = (y - number(crop, "top")) * number(g, "sourceHeight");
    return {{"x", a.a * lx + a.c * ly + a.e}, {"y", a.b * lx + a.d * ly + a.f}};
}
QJsonObject reframeViewportPointToSource(double x, double y, const QJsonObject& g) {
    const auto a = affineForReframe(g);
    const auto det = a.a * a.d - a.b * a.c;
    if (std::abs(det) < std::numeric_limits<double>::epsilon()) {
        return {{"x", .5}, {"y", .5}};
    }
    const auto crop = g.value("crop").toObject();
    const auto dx = x - a.e, dy = y - a.f;
    return {{"x", clamp01(number(crop, "left") + (a.d * dx - a.c * dy) / det / number(g, "sourceWidth"))},
            {"y", clamp01(number(crop, "top") + (-a.b * dx + a.a * dy) / det / number(g, "sourceHeight"))}};
}
QJsonObject edit(QJsonObject doc, const QString& action, const QJsonObject& payload) {
    auto clips = doc.value("clips").toArray();
    const auto id = payload.value("clipId").toString();
    if (id.isEmpty()) {
        return doc;
    }
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (clip.value("id").toString() != id) {
            continue;
        }
        if (clip.value("locked").toBool()) {
            return doc;
        }
        for (const auto& value : doc.value("tracks").toArray()) {
            const auto track = value.toObject();
            if (track.value("id") == clip.value("trackId") && track.value("locked").toBool()) {
                return doc;
            }
        }
        if (action == "setClipCropEdge") {
            const auto edge = payload.value("edge").toString();
            if (std::ranges::find(edges, edge) == edges.end() || !payload.value("value").isDouble()) {
                return doc;
            }
            auto crop = clip.contains("crop") ? clip.value("crop").toObject() : noCrop();
            crop.insert(edge, payload.value("value"));
            if (hasCrop(crop)) {
                clip.insert("crop", crop);
            } else {
                clip.remove("crop");
            }
        } else if (action == "setClipReframeSubject") {
            const auto mode = payload.value("mode").toString();
            if (mode != "auto" && mode != "center" && mode != "track") {
                return doc;
            }
            auto reframe = clip.value("reframe").toObject();
            reframe.insert("mode", mode);
            const auto trackId = payload.value("trackId").toString();
            if (mode == "track" && !trackId.isEmpty()) {
                reframe.insert("trackId", trackId);
            } else {
                reframe.remove("trackId");
            }
            clip.insert("reframe", reframe);
        } else if (action == "addClipReframeKeyframe") {
            for (const auto& key : {"sourceMs", "x", "y"}) {
                if (!payload.value(key).isDouble() || !std::isfinite(payload.value(key).toDouble())) {
                    return doc;
                }
            }
            QJsonObject keyframe{
                {"sourceMs", payload.value("sourceMs")}, {"x", payload.value("x")}, {"y", payload.value("y")}};
            if (payload.contains("zoom")) {
                if (!payload.value("zoom").isDouble() || !std::isfinite(payload.value("zoom").toDouble())) {
                    return doc;
                }
                keyframe.insert("zoom", payload.value("zoom"));
            }
            const auto r = clip.contains("reframe") ? clip.value("reframe").toObject() : QJsonObject{{"mode", "auto"}};
            clip.insert("reframe", addReframeKeyframe(r, keyframe));
        } else if (action == "clearClipReframe") {
            clip = clearReframe(clip);
        } else {
            return doc;
        }
        clips[i] = clip;
        doc.insert("clips", clips);
        return doc;
    }
    return doc;
}
QJsonValue evaluate(const QJsonObject& r) {
    const auto op = r.value("op").toString();
    if (op == "hasCrop") {
        return hasCrop(r.value("crop").toObject());
    }
    if (op == "isCropUsable") {
        return isCropUsable(r.value("crop").toObject());
    }
    if (op == "cropRectPx") {
        return cropRectPx(r.value("crop").toObject(), r.value("width").toDouble(), r.value("height").toDouble());
    }
    if (op == "edit") {
        return edit(r.value("doc").toObject(), r.value("action").toString(), r.value("payload").toObject());
    }
    const auto framing = r.value("reframe").toObject(), track = r.value("track").toObject();
    const auto time = r.value("sourceMs").toDouble();
    if (op == "sampleReframeAt") {
        return sampleReframeAt(framing, time, track);
    }
    if (op == "resolveReframeCrop") {
        return resolveReframeCrop(framing, time, r.value("sourceSize").toObject(), r.value("targetSize").toObject(),
                                  track);
    }
    if (op == "addReframeKeyframe") {
        return addReframeKeyframe(framing, r.value("keyframe").toObject());
    }
    if (op == "clearReframe") {
        return clearReframe(r.value("clip").toObject());
    }
    if (op == "isReframeStale") {
        return isReframeStale(r.value("clip").toObject(), track);
    }
    if (op == "renderableReframe") {
        return renderableReframe(r.value("clip").toObject(), track);
    }
    if (op == "mediaTrackCanDriveReframe") {
        return mediaTrackCanDriveReframe(track);
    }
    if (op == "sourcePointToReframeViewport") {
        return sourcePointToReframeViewport(number(r, "x"), number(r, "y"), r.value("geometry").toObject());
    }
    if (op == "reframeViewportPointToSource") {
        return reframeViewportPointToSource(number(r, "x"), number(r, "y"), r.value("geometry").toObject());
    }
    return QJsonValue::Null;
}
} // namespace nt::reframe
