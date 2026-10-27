#include "Keyframes.h"
#include "scene/Animation.h"

#include <QSet>
#include <QUuid>
#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>
#include <vector>

namespace nt::keyframes {
namespace {
constexpr double epsilon = 1e-4;
const QStringList allProperties{"opacity",       "scale",           "offsetX",    "offsetY",  "rotation",
                                "cameraAzimuth", "cameraElevation", "cameraZoom", "cameraFov"};
QJsonObject merged(QJsonObject base, const QJsonObject& patch) {
    for (auto i = patch.begin(); i != patch.end(); ++i) {
        base.insert(i.key(), i.value());
    }
    return base;
}
QStringList strings(const QJsonValue& value) {
    QStringList result;
    for (const auto& item : value.toArray()) {
        result.append(item.toString());
    }
    return result;
}
QJsonArray array(const QStringList& list) { return QJsonArray::fromStringList(list); }
bool isAnimation(const QJsonObject& a) {
    return a["preset"] == "custom" && a["role"] == "emphasis" && a["delayMs"].toDouble() == 0 &&
           a["params"].toObject()["keyframed"] == true;
}
int animationIndex(const QJsonObject& clip) {
    const auto animations = clip["animations"].toArray();
    for (qsizetype i = 0; i < animations.size(); ++i) {
        if (isAnimation(animations[i].toObject())) {
            return static_cast<int>(i);
        }
    }
    return -1;
}
QJsonObject animation(const QJsonObject& clip) {
    const int index = animationIndex(clip);
    return index < 0 ? QJsonObject{} : clip["animations"].toArray()[index].toObject();
}
QJsonArray curves(const QJsonObject& clip) { return animation(clip)["custom"].toObject()["curves"].toArray(); }
QJsonArray keys(const QJsonObject& clip, const QString& property) {
    for (const auto& value : curves(clip)) {
        const auto curve = value.toObject();
        if (curve["property"] == property) {
            return curve["keyframes"].toArray();
        }
    }
    return {};
}
QJsonArray sorted(QJsonArray values) {
    std::vector<QJsonObject> items;
    items.reserve(static_cast<size_t>(values.size()));
    for (const auto& value : values) {
        items.push_back(value.toObject());
    }
    std::stable_sort(items.begin(), items.end(),
                     [](const auto& a, const auto& b) { return a["t"].toDouble() < b["t"].toDouble(); });
    QJsonArray result;
    for (const auto& item : items) {
        result.append(item);
    }
    return result;
}
double toT(const QJsonObject& clip, double ms) {
    const double duration = clip["durationMs"].toDouble();
    return duration <= 0 ? 0 : std::clamp(ms / duration, 0.0, 1.0);
}
bool multiply(const QString& p) {
    return QStringList{"scale", "scaleX", "scaleY", "opacity", "saturation", "contrast", "cameraZoom"}.contains(p);
}
bool replace(const QString& p) {
    return QStringList{"positionX", "positionY", "anchorX", "anchorY", "trimStart", "trimEnd", "wipeProgress"}.contains(
        p);
}
double identity(const QString& p) { return multiply(p) ? 1 : 0; }
double compose(const QString& p, double base, double value) {
    return multiply(p) ? base * value : replace(p) ? value : base + value;
}
QJsonValue inverse(const QString& p, double base, double composed) {
    if (multiply(p)) {
        return base == 0 ? QJsonValue(QJsonValue::Null) : QJsonValue(composed / base);
    }
    return replace(p) ? composed : composed - base;
}
bool has(const QJsonObject& clip, const QString& p, double ms) {
    const double t = toT(clip, ms);
    for (const auto& value : keys(clip, p)) {
        if (std::abs(value.toObject()["t"].toDouble() - t) < epsilon) {
            return true;
        }
    }
    return false;
}
double curveValue(const QJsonArray& kfs, double t) {
    if (t <= kfs.first().toObject()["t"].toDouble()) {
        return kfs.first().toObject()["value"].toDouble();
    }
    const auto last = kfs.last().toObject();
    if (t >= last["t"].toDouble()) {
        return last["value"].toDouble();
    }
    for (qsizetype i = 1; i < kfs.size(); ++i) {
        const auto b = kfs[i].toObject();
        if (t > b["t"].toDouble()) {
            continue;
        }
        const auto a = kfs[i - 1].toObject();
        const double span = b["t"].toDouble() - a["t"].toDouble();
        const double f =
            span > 0 ? nt::scene::ease(b["easing"].toString("linear").toStdString(), (t - a["t"].toDouble()) / span)
                     : 1;
        return a["value"].toDouble() + (b["value"].toDouble() - a["value"].toDouble()) * f;
    }
    return last["value"].toDouble();
}
double valueAt(const QJsonObject& clip, const QString& p, double ms) {
    auto kfs = sorted(keys(clip, p));
    if (kfs.isEmpty()) {
        return identity(p);
    }
    const auto a = animation(clip);
    if (a.contains("easing")) {
        for (qsizetype i = 0; i < kfs.size(); ++i) {
            auto kf = kfs[i].toObject();
            kf.insert("easing", a["easing"]);
            kfs[i] = kf;
        }
    }
    return curveValue(kfs, toT(clip, ms));
}
QJsonArray withCurves(const QJsonObject& clip, const QJsonArray& updated) {
    auto animations = clip["animations"].toArray();
    const int index = animationIndex(clip);
    QJsonArray live;
    for (const auto& curve : updated) {
        if (!curve.toObject()["keyframes"].toArray().isEmpty()) {
            live.append(curve);
        }
    }
    if (live.isEmpty()) {
        if (index >= 0) {
            animations.removeAt(index);
        }
        return animations;
    }
    auto next = animation(clip);
    if (!next.contains("id")) {
        next.insert("id", QUuid::createUuid().toString(QUuid::Id128));
    }
    next = merged(next, {{"role", "emphasis"},
                         {"preset", "custom"},
                         {"durationMs", clip["durationMs"]},
                         {"delayMs", 0},
                         {"enabled", true},
                         {"params", QJsonObject{{"keyframed", true}}},
                         {"custom", merged(next["custom"].toObject(), {{"curves", live}})}});
    if (index >= 0) {
        animations[index] = next;
    } else {
        animations.append(next);
    }
    return animations;
}
QJsonArray set(const QJsonObject& clip, const QString& p, double ms, double value) {
    QJsonArray others;
    QJsonArray existing;
    bool found = false;
    for (const auto& item : curves(clip)) {
        const auto c = item.toObject();
        if (c["property"] != p) {
            others.append(c);
        } else if (!found) {
            existing = c["keyframes"].toArray();
            found = true;
        }
    }
    const double t = toT(clip, ms);
    QJsonObject replacement{{"t", t}, {"value", value}};
    QJsonArray kept;
    bool replaced = false;
    for (const auto& item : existing) {
        const auto k = item.toObject();
        if (!replaced && std::abs(k["t"].toDouble() - t) < epsilon) {
            if (k.contains("easing")) {
                replacement.insert("easing", k["easing"]);
            }
            replaced = true;
        } else {
            kept.append(k);
        }
    }
    kept.append(replacement);
    others.append(QJsonObject{{"property", p}, {"keyframes", sorted(kept)}});
    return withCurves(clip, others);
}
QJsonArray setMany(QJsonObject clip, const QJsonArray& entries, double ms) {
    for (const auto& entry : entries) {
        const auto e = entry.toObject();
        clip.insert("animations", set(clip, e["property"].toString(), ms, e["value"].toDouble()));
    }
    return clip["animations"].toArray();
}
QJsonArray update(const QJsonObject& clip, const QStringList& ps, const QString& action, double ms, double toMs = 0,
                  const QString& easing = {}) {
    const double t = toT(clip, ms);
    const double target = toT(clip, toMs);
    QJsonArray result;
    for (const auto& value : curves(clip)) {
        auto curve = value.toObject();
        if (!ps.contains(curve["property"].toString())) {
            result.append(curve);
            continue;
        }
        if (action == "clear") {
            continue;
        }
        QJsonArray kept;
        const auto kfs = curve["keyframes"].toArray();
        int moving = -1;
        for (qsizetype i = 0; i < kfs.size(); ++i) {
            if (std::abs(kfs[i].toObject()["t"].toDouble() - t) < epsilon) {
                moving = static_cast<int>(i);
                break;
            }
        }
        for (qsizetype i = 0; i < kfs.size(); ++i) {
            auto k = kfs[i].toObject();
            const bool hit = std::abs(k["t"].toDouble() - t) < epsilon;
            if (action == "remove" && hit) {
                continue;
            }
            if (action == "move" && moving >= 0 && (i == moving || std::abs(k["t"].toDouble() - target) < epsilon)) {
                continue;
            }
            if (action == "easing" && hit) {
                k.insert("easing", easing);
            }
            kept.append(k);
        }
        if (action == "move" && moving >= 0) {
            auto moved = kfs[moving].toObject();
            moved.insert("t", target);
            kept.append(moved);
            kept = sorted(kept);
        }
        curve.insert("keyframes", kept);
        result.append(curve);
    }
    return withCurves(clip, result);
}
QJsonArray setEasing(const QJsonObject& clip, const QStringList& ps, double ms, const QString& easing) {
    auto a = animation(clip);
    if (!a["custom"].isObject()) {
        return clip["animations"].toArray();
    }
    QJsonArray result;
    for (const auto& value : curves(clip)) {
        auto c = value.toObject();
        QJsonArray kfs;
        for (const auto& item : c["keyframes"].toArray()) {
            auto k = item.toObject();
            if (ps.contains(c["property"].toString()) && std::abs(k["t"].toDouble() - toT(clip, ms)) < epsilon) {
                k.insert("easing", easing);
            } else if (a.contains("easing")) {
                k.insert("easing", a["easing"]);
            }
            kfs.append(k);
        }
        c.insert("keyframes", kfs);
        result.append(c);
    }
    a.remove("easing");
    a.insert("custom", merged(a["custom"].toObject(), {{"curves", result}}));
    auto animations = clip["animations"].toArray();
    animations[animationIndex(clip)] = a;
    return animations;
}
QJsonObject cameraStyle(const QJsonObject& clip) {
    if (clip["model3dStyle"].isObject()) {
        return clip["model3dStyle"].toObject();
    }
    return {{"camera",
             QJsonObject{{"mode", "orbit"}, {"azimuthDeg", 45}, {"elevationDeg", 25}, {"fovDeg", 35}, {"zoom", 1}}},
            {"animation", QJsonObject{{"loop", true}, {"speed", 1}}},
            {"lighting", "studio"},
            {"lightIntensity", 1},
            {"background", QJsonObject{{"transparent", true}}}};
}
struct Input {
    QString property;
    QString group;
    QString member;
    double defaultValue = 0;
    double min = -std::numeric_limits<double>::infinity();
    double max = std::numeric_limits<double>::infinity();
};
std::vector<Input> inputs(const QString& row) {
    if (row == "position") {
        return {{"offsetX", "position", "x"}, {"offsetY", "position", "y"}};
    }
    if (row == "scale") {
        return {{"scale", "scale", "x", 1, 0.01}, {"scale", "scale", "y", 1, 0.01}};
    }
    if (row == "rotation") {
        return {{"rotation", {}, "rotation"}};
    }
    if (row == "opacity") {
        return {{"opacity", {}, "opacity", 1, 0, 1}};
    }
    if (row == "cameraOrbit") {
        return {{"cameraAzimuth", "camera", "azimuthDeg", 45}, {"cameraElevation", "camera", "elevationDeg", 25}};
    }
    if (row == "cameraFov") {
        return {{"cameraFov", "camera", "fovDeg", 35, 1, 170}};
    }
    if (row == "cameraZoom") {
        return {{"cameraZoom", "camera", "zoom", 1, 0.05}};
    }
    return {};
}
double base(const QJsonObject& clip, const Input& i) {
    if (i.property == "opacity") {
        return clip["opacity"].toDouble(1);
    }
    const auto from = i.group == "camera" ? cameraStyle(clip)["camera"].toObject()
                      : i.group.isEmpty() ? transform(clip)
                                          : transform(clip)[i.group].toObject();
    return from[i.member].toDouble(i.defaultValue);
}
QJsonObject basePatch(const QJsonObject& clip, const Input& i, double value) {
    if (i.property == "opacity") {
        return {{"opacity", value}};
    }
    if (i.group == "camera") {
        auto style = cameraStyle(clip);
        style.insert("camera", merged(style["camera"].toObject(), {{i.member, value}}));
        // model3dStyleWithPatch always materializes the animation object.
        style.insert("animation", style["animation"].toObject());
        return {{"model3dStyle", style}};
    }
    auto t = transform(clip);
    if (i.group.isEmpty()) {
        t.insert(i.member, value);
    } else {
        t.insert(i.group, merged(t[i.group].toObject(), {{i.member, value}}));
    }
    return {{"transform", t}};
}
bool rowKeyed(const QJsonObject& clip, const QString& row) {
    for (const auto& p : properties(row)) {
        if (!keys(clip, p).isEmpty()) {
            return true;
        }
    }
    return false;
}
bool rowHas(const QJsonObject& clip, const QString& row, double ms) {
    for (const auto& p : properties(row)) {
        if (has(clip, p, ms)) {
            return true;
        }
    }
    return false;
}
QJsonValue stopwatch(const QJsonObject& clip, const QString& row, const QJsonValue& at) {
    if (at.isNull() || at.isUndefined()) {
        return QJsonValue::Null;
    }
    const auto ps = properties(row);
    if (!rowKeyed(clip, row)) {
        QJsonArray entries;
        for (const auto& p : ps) {
            entries.append(QJsonObject{
                {"property", p}, {"value", keys(clip, p).isEmpty() ? identity(p) : valueAt(clip, p, at.toDouble())}});
        }
        return QJsonObject{{"animations", setMany(clip, entries, at.toDouble())}};
    }
    auto working = clip;
    QJsonObject patch;
    const auto specs = inputs(row);
    for (size_t i = 0; i < specs.size(); ++i) {
        const auto next = basePatch(working, specs[i], inputValue(clip, row, static_cast<int>(i), at.toDouble()));
        working = merged(working, next);
        patch = merged(patch, next);
    }
    patch.insert("animations", update(working, ps, "clear", 0));
    return patch;
}
QJsonValue toggle(const QJsonObject& clip, const QString& row, const QJsonValue& at) {
    if (at.isNull() || at.isUndefined()) {
        return QJsonValue::Null;
    }
    const double ms = at.toDouble();
    const auto ps = properties(row);
    if (!rowHas(clip, row, ms)) {
        QJsonArray entries;
        for (const auto& p : ps) {
            entries.append(QJsonObject{{"property", p}, {"value", valueAt(clip, p, ms)}});
        }
        return QJsonObject{{"animations", setMany(clip, entries, ms)}};
    }
    bool remaining = false;
    for (const auto& t : times(clip, ps)) {
        if (std::abs(t.toDouble() - ms) > 0.5) {
            remaining = true;
        }
    }
    return remaining ? QJsonValue(QJsonObject{{"animations", update(clip, ps, "remove", ms)}})
                     : stopwatch(clip, row, at);
}
QJsonValue commit(const QJsonObject& clip, const QString& row, int index, double value, const QJsonValue& at) {
    const auto specs = inputs(row);
    if (!std::isfinite(value) || index < 0 || static_cast<size_t>(index) >= specs.size()) {
        return QJsonValue::Null;
    }
    const auto& input = specs[static_cast<size_t>(index)];
    const double composed = std::clamp(value, input.min, input.max);
    if (!rowKeyed(clip, row)) {
        return basePatch(clip, input, composed);
    }
    if (at.isNull() || at.isUndefined()) {
        return QJsonValue::Null;
    }
    auto working = clip;
    QJsonObject patch;
    auto kf = inverse(input.property, base(clip, input), composed);
    if (kf.isNull()) {
        const auto ts = times(clip, {input.property});
        patch = basePatch(working, input, 1);
        working = merged(working, patch);
        for (const auto& t : ts) {
            working.insert("animations", set(working, input.property, t.toDouble(), 0));
        }
        kf = composed;
    }
    QJsonArray entries;
    for (const auto& p : properties(row)) {
        entries.append(QJsonObject{
            {"property", p}, {"value", p == input.property ? kf.toDouble() : valueAt(working, p, at.toDouble())}});
    }
    patch.insert("animations", setMany(working, entries, at.toDouble()));
    return patch;
}
QJsonObject gizmo(const QJsonObject& clip, const QJsonObject& next, const QJsonValue& at) {
    if (at.isNull()) {
        return {{"transform", next}};
    }
    const auto b = transform(clip);
    auto t = next;
    QJsonArray entries;
    const double ms = at.toDouble();
    const auto push = [&](const QString& p, double value) {
        entries.append(QJsonObject{{"property", p}, {"value", value}});
    };
    if (!keys(clip, "offsetX").isEmpty() || !keys(clip, "offsetY").isEmpty()) {
        push("offsetX", valueAt(clip, "offsetX", ms) + next["position"].toObject()["x"].toDouble() -
                            b["position"].toObject()["x"].toDouble());
        push("offsetY", valueAt(clip, "offsetY", ms) + next["position"].toObject()["y"].toDouble() -
                            b["position"].toObject()["y"].toDouble());
        t.insert("position", b["position"]);
    }
    if (!keys(clip, "scale").isEmpty()) {
        const auto s = b["scale"].toObject();
        const double x = s["x"].toDouble(), y = s["y"].toDouble();
        push("scale", valueAt(clip, "scale", ms) * (x != 0   ? next["scale"].toObject()["x"].toDouble() / x
                                                    : y != 0 ? next["scale"].toObject()["y"].toDouble() / y
                                                             : 1));
        t.insert("scale", b["scale"]);
    }
    if (!keys(clip, "rotation").isEmpty()) {
        push("rotation", valueAt(clip, "rotation", ms) + next["rotation"].toDouble() - b["rotation"].toDouble());
        t.insert("rotation", b["rotation"]);
    }
    return entries.isEmpty() ? QJsonObject{{"transform", next}}
                             : QJsonObject{{"transform", t}, {"animations", setMany(clip, entries, ms)}};
}
} // namespace
QJsonObject transform(const QJsonObject& clip) {
    if (clip["transform"].isObject()) {
        return clip["transform"].toObject();
    }
    return {{"position", QJsonObject{{"x", 0}, {"y", 0}}},
            {"scale", QJsonObject{{"x", 1}, {"y", 1}}},
            {"rotation", 0},
            {"anchor", QJsonObject{{"x", 0.5}, {"y", 0.5}}}};
}
QStringList properties(const QString& row) {
    QStringList result;
    for (const auto& i : inputs(row)) {
        if (!result.contains(i.property)) {
            result.append(i.property);
        }
    }
    return result;
}
QJsonArray times(const QJsonObject& clip, const QStringList& ps) {
    QSet<double> found;
    for (const auto& item : curves(clip)) {
        const auto c = item.toObject();
        if (!ps.isEmpty() && !ps.contains(c["property"].toString())) {
            continue;
        }
        for (const auto& k : c["keyframes"].toArray()) {
            found.insert(std::floor(k.toObject()["t"].toDouble() * clip["durationMs"].toDouble() + 0.5));
        }
    }
    auto values = found.values();
    std::sort(values.begin(), values.end());
    QJsonArray result;
    for (double v : values) {
        result.append(v);
    }
    return result;
}
double inputValue(const QJsonObject& clip, const QString& row, int index, double atMs) {
    const auto specs = inputs(row);
    if (index < 0 || static_cast<size_t>(index) >= specs.size()) {
        return 0;
    }
    const auto& i = specs[static_cast<size_t>(index)];
    const double b = base(clip, i);
    return keys(clip, i.property).isEmpty() ? b : compose(i.property, b, valueAt(clip, i.property, atMs));
}
QJsonValue helper(const QString& name, const QJsonArray& a) {
    const auto c = a[0].toObject();
    const auto p = a[1].toString();
    const double ms = a[2].toDouble();
    if (name == "keyframeIdentity") {
        return identity(a[0].toString());
    }
    if (name == "isKeyframeAnimation") {
        return isAnimation(c);
    }
    if (name == "findKeyframeAnimation") {
        return animationIndex(c) < 0 ? QJsonValue(QJsonValue::Null) : QJsonValue(animation(c));
    }
    if (name == "keyframePropertiesFor") {
        auto ps = allProperties;
        if (c["mediaType"] != "model3d") {
            ps = ps.mid(0, 5);
        }
        return array(ps);
    }
    if (name == "composeKeyframeValue") {
        return compose(a[0].toString(), a[1].toDouble(), ms);
    }
    if (name == "keyframeValueForComposed") {
        return inverse(a[0].toString(), a[1].toDouble(), ms);
    }
    if (name == "keyframeTimesMs") {
        if (a.size() > 1 && a[1].isArray() && a[1].toArray().isEmpty()) {
            return QJsonArray{};
        }
        return times(c, strings(a[1]));
    }
    if (name == "keyframeValueAt") {
        return valueAt(c, p, ms);
    }
    if (name == "hasKeyframeAt") {
        return has(c, p, ms);
    }
    if (name == "isPropertyKeyframed") {
        return !keys(c, p).isEmpty();
    }
    if (name == "setKeyframe") {
        return set(c, p, ms, a[3].toDouble());
    }
    if (name == "setKeyframes") {
        return setMany(c, a[1].toArray(), ms);
    }
    if (name == "removeKeyframe") {
        return update(c, {p}, "remove", ms);
    }
    if (name == "removeKeyframes") {
        return update(c, strings(a[1]), "remove", ms);
    }
    if (name == "clearKeyframes") {
        return update(c, strings(a[1]), "clear", 0);
    }
    if (name == "moveKeyframes") {
        return update(c, strings(a[1]), "move", ms, a[3].toDouble());
    }
    if (name == "setKeyframeEasing") {
        return setEasing(c, strings(a[1]), ms, a[3].toString());
    }
    if (name == "adjacentKeyframeMs") {
        const auto ts = times(c, strings(a[1]));
        if (a[3].toInt() == 1) {
            for (const auto& t : ts) {
                if (t.toDouble() > ms + 0.5) {
                    return t;
                }
            }
        } else {
            for (auto i = ts.size(); i > 0; --i) {
                if (ts[i - 1].toDouble() < ms - 0.5) {
                    return ts[i - 1];
                }
            }
        }
        return QJsonValue::Null;
    }
    if (name == "keyframeEasingAt") {
        const auto anim = animation(c);
        for (const auto& k : keys(c, p)) {
            const auto kf = k.toObject();
            if (std::abs(kf["t"].toDouble() - toT(c, ms)) < epsilon) {
                return anim["easing"].isUndefined() ? QJsonValue(kf["easing"].toString("linear"))
                                                    : QJsonValue(anim["easing"]);
            }
        }
        return QJsonValue::Null;
    }
    if (name == "curveValueAtT") {
        return curveValue(a[0].toArray(), a[1].toDouble());
    }
    if (name == "keyframeRowFor") {
        for (const auto& value : rowSpecs()) {
            const auto row = value.toObject();
            if (properties(row["id"].toString()).contains(a[0].toString())) {
                return row["id"];
            }
        }
        return QJsonValue::Null;
    }
    if (name == "rowProperties") {
        return array(properties(a[0].toString()));
    }
    if (name == "isRowKeyframed") {
        return rowKeyed(c, p);
    }
    if (name == "rowHasKeyframeAt") {
        return rowHas(c, p, ms);
    }
    if (name == "rowKeyframeTimesMs") {
        return times(c, properties(p));
    }
    if (name == "inputValueAt") {
        return inputValue(c, p, a[2].toInt(), a[3].toDouble());
    }
    if (name == "toggleRowStopwatch") {
        return stopwatch(c, p, a[2]);
    }
    if (name == "toggleRowKeyframeAt") {
        return toggle(c, p, a[2]);
    }
    if (name == "commitInputValue") {
        return commit(c, p, a[2].toInt(), a[3].toDouble(std::numeric_limits<double>::quiet_NaN()), a[4]);
    }
    if (name == "gizmoTransformPatch") {
        return gizmo(c, a[1].toObject(), a[2]);
    }
    return QJsonValue::Null;
}
QJsonObject edit(QJsonObject document, const QJsonObject& payload) {
    auto clips = document["clips"].toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        const auto c = clips[i].toObject();
        if (c["id"] != payload["clipId"] || c["locked"].toBool()) {
            continue;
        }
        for (const auto& track : document["tracks"].toArray()) {
            if (track.toObject()["id"] == c["trackId"] && track.toObject()["locked"].toBool()) {
                return document;
            }
        }
        const auto action = payload["action"].toString();
        const auto row = payload["row"].toString();
        const auto at = payload.contains("atMs") ? payload["atMs"] : QJsonValue(QJsonValue::Null);
        QJsonValue patch;
        if (action == "input") {
            patch = commit(c, row, payload["input"].toInt(),
                           payload["value"].toDouble(std::numeric_limits<double>::quiet_NaN()), at);
        } else if (action == "stopwatch") {
            patch = stopwatch(c, row, at);
        } else if (action == "toggle") {
            patch = toggle(c, row, at);
        } else if (action == "delete") {
            patch = rowHas(c, row, at.toDouble()) ? toggle(c, row, at) : QJsonValue(QJsonValue::Null);
        } else if (action == "move" || action == "easing") {
            auto ps = properties(row);
            if (row.isEmpty()) {
                for (const auto& v : curves(c)) {
                    ps.append(v.toObject()["property"].toString());
                }
            }
            patch = QJsonObject{
                {"animations", action == "move"
                                   ? update(c, ps, "move", payload["fromMs"].toDouble(), payload["toMs"].toDouble())
                                   : setEasing(c, ps, at.toDouble(), payload["easing"].toString())}};
        } else if (action == "field") {
            const auto field = payload["field"].toString();
            const double value = payload["value"].toDouble(std::numeric_limits<double>::quiet_NaN());
            if (!std::isfinite(value)) {
                return document;
            }
            auto t = transform(c);
            if (field == "anchorX" || field == "anchorY") {
                t.insert("anchor", merged(t["anchor"].toObject(),
                                          {{field == "anchorX" ? "x" : "y", std::clamp(value, 0.0, 1.0)}}));
            } else if (QStringList{"rotationX", "rotationY", "depthPx", "perspective"}.contains(field)) {
                if (field == "perspective" && value <= 0) {
                    return document;
                }
                t.insert(field, value);
            } else {
                return document;
            }
            patch = QJsonObject{{"transform", t}};
        } else if (action == "animations") {
            patch = QJsonObject{{"animations", payload["animations"]}};
        }
        if (patch.isObject()) {
            clips[i] = merged(c, patch.toObject());
            document.insert("clips", clips);
        }
        return document;
    }
    return document;
}
QJsonArray rowSpecs() {
    return {
        QJsonObject{
            {"id", "position"},
            {"label", "Position"},
            {"inputs", QJsonArray{QJsonObject{{"label", "Position X"}, {"unit", "px"}, {"decimals", 0}, {"step", 1}},
                                  QJsonObject{{"label", "Position Y"}, {"unit", "px"}, {"decimals", 0}, {"step", 1}}}}},
        QJsonObject{
            {"id", "scale"},
            {"label", "Scale"},
            {"inputs",
             QJsonArray{
                 QJsonObject{{"label", "Scale X"}, {"unit", "×"}, {"decimals", 2}, {"step", 0.01}, {"min", 0.01}},
                 QJsonObject{{"label", "Scale Y"}, {"unit", "×"}, {"decimals", 2}, {"step", 0.01}, {"min", 0.01}}}}},
        QJsonObject{{"id", "rotation"},
                    {"label", "Rotation"},
                    {"inputs", QJsonArray{QJsonObject{{"label", "Rotation in degrees"},
                                                      {"unit", "°"},
                                                      {"decimals", 1},
                                                      {"step", 0.5},
                                                      {"displayScale", 180 / std::acos(-1.0)}}}}},
        QJsonObject{{"id", "opacity"},
                    {"label", "Opacity"},
                    {"inputs", QJsonArray{QJsonObject{{"label", "Opacity"},
                                                      {"unit", "%"},
                                                      {"decimals", 0},
                                                      {"step", 1},
                                                      {"displayScale", 100},
                                                      {"min", 0},
                                                      {"max", 100}}}}},
        QJsonObject{
            {"id", "cameraOrbit"},
            {"label", "Orbit"},
            {"inputs",
             QJsonArray{QJsonObject{{"label", "Camera azimuth"}, {"unit", "°"}, {"decimals", 1}, {"step", 1}},
                        QJsonObject{{"label", "Camera elevation"}, {"unit", "°"}, {"decimals", 1}, {"step", 1}}}}},
        QJsonObject{{"id", "cameraFov"},
                    {"label", "Field of view"},
                    {"inputs", QJsonArray{QJsonObject{{"label", "Camera field of view"},
                                                      {"unit", "°"},
                                                      {"decimals", 1},
                                                      {"step", 1},
                                                      {"min", 1},
                                                      {"max", 170}}}}},
        QJsonObject{
            {"id", "cameraZoom"},
            {"label", "Zoom"},
            {"inputs", QJsonArray{QJsonObject{
                           {"label", "Camera zoom"}, {"unit", "×"}, {"decimals", 2}, {"step", 0.01}, {"min", 0.05}}}}}};
}
} // namespace nt::keyframes
