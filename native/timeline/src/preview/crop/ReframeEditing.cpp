#include "ReframeEditing.h"
#include "preview/SceneEval.h"
#include "scene/ClipScene.h"
#include <QJsonArray>
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <vector>
namespace nt::reframe {
namespace {
const std::array<QString, 4> edges{"left", "right", "top", "bottom"};
QJsonObject noCrop() { return {{"left", 0}, {"right", 0}, {"top", 0}, {"bottom", 0}}; }
} // namespace
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
QJsonObject addReframeKeyframe(QJsonObject reframe, const QJsonObject& keyframe) {
    const auto existing = reframe.value("keyframes").toArray();
    std::vector<QJsonObject> keys;
    keys.reserve(static_cast<std::size_t>(existing.size()) + 1);
    for (const auto& value : existing) {
        keys.push_back(value.toObject());
    }
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
