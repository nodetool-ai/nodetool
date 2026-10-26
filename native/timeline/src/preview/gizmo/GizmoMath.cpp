#include "GizmoMath.h"
#include "scene/Animation.h"

#include <QJsonArray>
#include <QLineF>
#include <algorithm>
#include <cmath>
#include <numbers>
#include <vector>

namespace nt::gizmo {
namespace {
QPointF unit(QPointF p) { const auto length = std::hypot(p.x(), p.y()); return p / (length == 0 ? 1 : length); }
double dot(QPointF a, QPointF b) { return QPointF::dotProduct(a, b); }
QString opposite(const QString& target) {
    if (target == "tl") { return "br"; }
    if (target == "tr") { return "bl"; }
    if (target == "br") { return "tl"; }
    if (target == "bl") { return "tr"; }
    if (target == "t") { return "b"; }
    if (target == "b") { return "t"; }
    if (target == "r") { return "l"; }
    return "r";
}
ClipTransform twoDimensional(ClipTransform transform) {
    // The web captures only the four 2D fields for pointer gestures.
    transform.rotationX.reset();
    transform.rotationY.reset();
    transform.perspective.reset();
    transform.depthPx.reset();
    return transform;
}
ClipTransform toDisplay(const ClipTransform& next, const ClipTransform& start, ClipTransform display) {
    display.position.x += next.position.x - start.position.x;
    display.position.y += next.position.y - start.position.y;
    display.scale.x *= start.scale.x == 0 ? 1 : next.scale.x / start.scale.x;
    display.scale.y *= start.scale.y == 0 ? 1 : next.scale.y / start.scale.y;
    display.rotation += next.rotation - start.rotation;
    display.anchor.x += next.anchor.x - start.anchor.x;
    display.anchor.y += next.anchor.y - start.anchor.y;
    return twoDimensional(display);
}
QJsonObject keyframeAnimation(const QJsonObject& clip) {
    for (const auto& value : clip.value("animations").toArray()) {
        const auto a = value.toObject();
        if (a.value("preset") == "custom" && a.value("role") == "emphasis" &&
            a.value("delayMs").toDouble() == 0 && a.value("params").toObject().value("keyframed") == true) {
            return a;
        }
    }
    return {};
}
QJsonArray keyframes(const QJsonObject& animation, const QString& property) {
    for (const auto& curve : animation.value("custom").toObject().value("curves").toArray()) {
        if (curve.toObject().value("property") == property) { return curve.toObject().value("keyframes").toArray(); }
    }
    return {};
}
double valueAt(const QJsonObject& animation, const QString& property, double t) {
    const auto keys = keyframes(animation, property);
    if (keys.isEmpty()) { return property == "scale" ? 1 : 0; }
    std::vector<QJsonObject> sorted;
    sorted.reserve(static_cast<size_t>(keys.size()));
    for (const auto& k : keys) { sorted.push_back(k.toObject()); }
    std::stable_sort(sorted.begin(), sorted.end(), [](const auto& a, const auto& b) { return a.value("t").toDouble() < b.value("t").toDouble(); });
    if (t <= sorted.front().value("t").toDouble()) { return sorted.front().value("value").toDouble(); }
    if (t >= sorted.back().value("t").toDouble()) { return sorted.back().value("value").toDouble(); }
    for (size_t i = 1; i < sorted.size(); ++i) {
        const auto& a = sorted[i - 1];
        const auto& b = sorted[i];
        const double end = b.value("t").toDouble();
        if (t > end) { continue; }
        const double begin = a.value("t").toDouble();
        const QString easing = animation.contains("easing") ? animation.value("easing").toString() : b.value("easing").toString("linear");
        const double f = end > begin ? scene::ease(easing.toStdString(), (t - begin) / (end - begin)) : 1;
        return a.value("value").toDouble() + (b.value("value").toDouble() - a.value("value").toDouble()) * f;
    }
    return sorted.back().value("value").toDouble();
}
void setKey(QJsonObject& animation, const QString& property, double value, double t) {
    auto custom = animation.value("custom").toObject();
    QJsonArray curves;
    QJsonArray kept;
    QJsonObject replaced;
    bool found = false;
    for (const auto& curve : custom.value("curves").toArray()) {
        const auto c = curve.toObject();
        if (c.value("property") != property) {
            if (!c.value("keyframes").toArray().isEmpty()) { curves.append(c); }
            continue;
        }
        if (found) { continue; }
        found = true;
        for (const auto& key : c.value("keyframes").toArray()) {
            if (replaced.isEmpty() && std::abs(key.toObject().value("t").toDouble() - t) < 1e-4) { replaced = key.toObject(); }
            else { kept.append(key); }
        }
    }
    QJsonObject next{{"t", t}, {"value", value}};
    if (replaced.contains("easing")) { next.insert("easing", replaced.value("easing")); }
    kept.append(next);
    std::vector<QJsonValue> sorted;
    sorted.reserve(static_cast<size_t>(kept.size()));
    for (const auto& key : kept) { sorted.push_back(key); }
    std::stable_sort(sorted.begin(), sorted.end(), [](const auto& a, const auto& b) { return a.toObject().value("t").toDouble() < b.toObject().value("t").toDouble(); });
    QJsonArray keys;
    for (const auto& key : sorted) { keys.append(key); }
    curves.append(QJsonObject{{"property", property}, {"keyframes", keys}});
    custom.insert("curves", curves);
    animation.insert("custom", custom);
}
}

QPointF Geometry::handle(const QString& target) const {
    if (target == "tl") { return corners[0]; }
    if (target == "tr") { return corners[1]; }
    if (target == "br") { return corners[2]; }
    if (target == "bl") { return corners[3]; }
    if (target == "t") { return (corners[0] + corners[1]) / 2; }
    if (target == "r") { return (corners[1] + corners[2]) / 2; }
    if (target == "b") { return (corners[2] + corners[3]) / 2; }
    if (target == "l") { return (corners[3] + corners[0]) / 2; }
    if (target == "pivot") { return pivot; }
    if (target == "rotate") {
        const auto top = handle("t");
        return top + unit(top - center) * 24;
    }
    return center;
}
Geometry geometry(const ClipTransform& transform, const Space& space) {
    const double cropW = 1 - space.crop.value("left").toDouble() - space.crop.value("right").toDouble();
    const double cropH = 1 - space.crop.value("top").toDouble() - space.crop.value("bottom").toDouble();
    const auto base = containBaseScale(space.source.width() * cropW, space.source.height() * cropH,
                                      space.sequence.width(), space.sequence.height());
    const auto m = buildTransformMatrix(transform, base, space.sequence.width(), space.sequence.height(), space.parent);
    const auto at = [&](double x, double y) {
        return QPointF((m[0] * x + m[4] * y + m[12] + 1) * space.frame.width() / 2,
                       (1 - (m[1] * x + m[5] * y + m[13])) * space.frame.height() / 2);
    };
    return {{at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)}, at(0, 0), at((transform.anchor.x - 0.5) * 2, (transform.anchor.y - 0.5) * 2)};
}
QPointF positionDelta(QPointF delta, const Space& space) {
    double x = 2 * delta.x() / space.frame.width();
    double y = -2 * delta.y() / space.frame.height();
    if (space.parent) {
        const auto& m = *space.parent;
        const double det = double(m[0]) * m[5] - double(m[1]) * m[4];
        if (std::abs(det) > 1e-9) {
            const double localX = (m[5] * x - m[4] * y) / det;
            y = (-m[1] * x + m[0] * y) / det;
            x = localX;
        }
    }
    return {x * space.sequence.width() / 2, -y * space.sequence.height() / 2};
}
ClipTransform Drag::update(QPointF next, bool shift) const {
    auto candidate = twoDimensional(start);
    if (target == "body") {
        const auto delta = positionDelta(next - pointer, space);
        candidate.position = {start.position.x + delta.x(), start.position.y + delta.y()};
        return candidate;
    }
    if (target == "rotate") {
        const auto a = pointer - box.pivot;
        const auto b = next - box.pivot;
        candidate.rotation -= std::atan2(b.y(), b.x()) - std::atan2(a.y(), a.x());
        if (shift) {
            constexpr double snap = std::numbers::pi / 12;
            // JavaScript Math.round rounds half toward +infinity.
            candidate.rotation = std::floor(candidate.rotation / snap + 0.5) * snap;
        }
        return candidate;
    }
    const auto u = unit(box.corners[1] - box.corners[0]);
    const auto v = unit(box.corners[3] - box.corners[0]);
    if (target == "pivot") {
        const double width = QLineF(box.corners[0], box.corners[1]).length();
        const double height = QLineF(box.corners[0], box.corners[3]).length();
        const auto rel = next - box.corners[0];
        const auto snap = [](double value, double size) {
            for (double anchor : {0.0, 0.5, 1.0}) {
                if (std::abs(value - anchor) * size < 12) { return anchor; }
            }
            return std::clamp(value, 0.0, 1.0);
        };
        candidate.anchor = {snap(dot(rel, u) / (width == 0 ? 1 : width), width),
                            snap(1 - dot(rel, v) / (height == 0 ? 1 : height), height)};
        const auto changed = geometry(toDisplay(candidate, start, display), space);
        const auto delta = positionDelta(box.center - changed.center, space);
        candidate.position = {start.position.x + delta.x(), start.position.y + delta.y()};
        return candidate;
    }
    const auto fixed = box.handle(opposite(target));
    const auto relStart = box.handle(target) - fixed;
    const auto rel = next - fixed;
    const bool scaleX = target != "t" && target != "b";
    const bool scaleY = target != "l" && target != "r";
    const double projU = dot(relStart, u);
    const double projV = dot(relStart, v);
    double factorU = scaleX ? dot(rel, u) / (projU == 0 ? 1 : projU) : 1;
    double factorV = scaleY ? dot(rel, v) / (projV == 0 ? 1 : projV) : 1;
    if (target.size() == 2 && shift) { factorU = factorV = std::abs(factorU) > std::abs(factorV) ? factorU : factorV; }
    const auto clamp = [](double f) { return (f < 0 ? -1 : 1) * std::max(0.01, std::abs(f)); };
    if (scaleX) { candidate.scale.x *= clamp(factorU); }
    if (scaleY) { candidate.scale.y *= clamp(factorV); }
    const auto changed = geometry(toDisplay(candidate, start, display), space);
    const auto delta = positionDelta(fixed - changed.handle(opposite(target)), space);
    candidate.position = {start.position.x + delta.x(), start.position.y + delta.y()};
    return candidate;
}
ClipTransform transformOf(const QJsonObject& clip) {
    const auto t = clip.value("transform").toObject();
    const auto point = [&](const char* name, Vec2 fallback) {
        const auto value = t.value(QLatin1String(name)).toObject();
        return Vec2{value.value("x").toDouble(fallback.x), value.value("y").toDouble(fallback.y)};
    };
    ClipTransform result;
    result.position = point("position", {0, 0});
    result.scale = point("scale", {1, 1});
    result.anchor = point("anchor", {0.5, 0.5});
    result.rotation = t.value("rotation").toDouble();
    if (t.contains("rotationX")) { result.rotationX = t.value("rotationX").toDouble(); }
    if (t.contains("rotationY")) { result.rotationY = t.value("rotationY").toDouble(); }
    if (t.contains("perspective")) { result.perspective = t.value("perspective").toDouble(); }
    if (t.contains("depthPx")) { result.depthPx = t.value("depthPx").toDouble(); }
    return result;
}
QJsonObject transformJson(const ClipTransform& t) {
    QJsonObject result{{"position", QJsonObject{{"x", t.position.x}, {"y", t.position.y}}},
                       {"scale", QJsonObject{{"x", t.scale.x}, {"y", t.scale.y}}},
                       {"anchor", QJsonObject{{"x", t.anchor.x}, {"y", t.anchor.y}}}, {"rotation", t.rotation}};
    if (t.rotationX) { result.insert("rotationX", *t.rotationX); }
    if (t.rotationY) { result.insert("rotationY", *t.rotationY); }
    if (t.perspective) { result.insert("perspective", *t.perspective); }
    if (t.depthPx) { result.insert("depthPx", *t.depthPx); }
    return result;
}
QJsonObject transformPatch(const QJsonObject& startClip, const ClipTransform& next, std::optional<double> atMs) {
    QJsonObject patch{{"transform", transformJson(next)}};
    if (!atMs) { return patch; }
    auto animation = keyframeAnimation(startClip);
    if (animation.isEmpty()) { return patch; }
    const auto base = transformOf(startClip);
    auto transform = next;
    const double duration = startClip.value("durationMs").toDouble();
    const double t = duration <= 0 ? 0 : std::clamp(*atMs / duration, 0.0, 1.0);
    const auto keyed = [&](const QString& p) { return !keyframes(animation, p).isEmpty(); };
    std::vector<std::pair<QString, double>> entries;
    if (keyed("offsetX") || keyed("offsetY")) {
        entries.emplace_back("offsetX", valueAt(animation, "offsetX", t) + next.position.x - base.position.x);
        entries.emplace_back("offsetY", valueAt(animation, "offsetY", t) + next.position.y - base.position.y);
        transform.position = base.position;
    }
    if (keyed("scale")) {
        const double ratio = base.scale.x != 0 ? next.scale.x / base.scale.x : base.scale.y != 0 ? next.scale.y / base.scale.y : 1;
        entries.emplace_back("scale", valueAt(animation, "scale", t) * ratio);
        transform.scale = base.scale;
    }
    if (keyed("rotation")) {
        entries.emplace_back("rotation", valueAt(animation, "rotation", t) + next.rotation - base.rotation);
        transform.rotation = base.rotation;
    }
    if (entries.empty()) { return patch; }
    const auto existing = animation;
    for (const auto& [property, value] : entries) { setKey(animation, property, value, t); }
    animation.insert("role", "emphasis");
    animation.insert("preset", "custom");
    animation.insert("durationMs", duration);
    animation.insert("delayMs", 0);
    animation.insert("enabled", true);
    animation.insert("params", QJsonObject{{"keyframed", true}});
    QJsonArray animations;
    bool replaced = false;
    for (const auto& a : startClip.value("animations").toArray()) {
        if (!replaced && a.toObject() == existing) { animations.append(animation); replaced = true; }
        else { animations.append(a); }
    }
    patch.insert("transform", transformJson(transform));
    patch.insert("animations", animations);
    return patch;
}
}
