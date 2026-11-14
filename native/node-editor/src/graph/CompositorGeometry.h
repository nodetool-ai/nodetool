#pragma once
#include <QJsonObject>
#include <QPointF>
#include <QSizeF>
#include <QString>
#include <algorithm>
#include <array>
#include <cmath>
#include <optional>

// web/src/components/compositor/geometry.ts: the Compositor layout editor's
// gizmo math, in canvas pixels. (x, y) is the layer center, and the layer
// rotates and scales about it, as the node renders it. Pure functions with no
// state, so any thread may call them.
namespace nodetool::compositor {

struct LayerTransform {
    double x = 0;
    double y = 0;
    double scaleX = 1;
    double scaleY = 1;
    // Radians.
    double rotation = 0;
    bool operator==(const LayerTransform &) const = default;
};

enum class GizmoHandle { Move, Rotate, TopLeft, TopRight, BottomRight, BottomLeft, Top, Right, Bottom, Left };

inline constexpr double minimumScale = 0.02;
inline constexpr double maximumScale = 64;
// CompositorEditorCanvas: the hit radius of a handle and the rotate handle's
// distance beyond the top edge, in screen pixels.
inline constexpr double handleHitRadius = 11;
inline constexpr double rotateOffset = 26;

// defaultLayerTransform: contain-fit, never upscaled, centered.
inline LayerTransform defaultTransform(const QSizeF &natural, const QSizeF &canvas) {
    if (natural.isEmpty()) { return {canvas.width() / 2, canvas.height() / 2, 1, 1, 0}; }
    const auto fit = std::min({canvas.width() / natural.width(), canvas.height() / natural.height(), 1.0});
    return {canvas.width() / 2, canvas.height() / 2, fit, fit, 0};
}

inline std::optional<LayerTransform> transformFromJson(const QJsonObject &json) {
    if (!json["x"].isDouble() || !json["y"].isDouble()) { return std::nullopt; }
    return LayerTransform{json["x"].toDouble(), json["y"].toDouble(), json["scaleX"].toDouble(1), json["scaleY"].toDouble(1),
                          json["rotation"].toDouble()};
}

inline QJsonObject transformJson(const LayerTransform &t) {
    return {{"x", t.x}, {"y", t.y}, {"scaleX", t.scaleX}, {"scaleY", t.scaleY}, {"rotation", t.rotation}};
}

// layerTexelToCanvas: a layer-local texel to canvas pixels.
inline QPointF texelToCanvas(const LayerTransform &t, const QSizeF &size, const QPointF &texel) {
    const auto c = std::cos(t.rotation), s = std::sin(t.rotation);
    const auto px = (texel.x() - size.width() / 2) * t.scaleX, py = (texel.y() - size.height() / 2) * t.scaleY;
    return {c * px - s * py + t.x, s * px + c * py + t.y};
}

// canvasToLayerTexel: the inverse of texelToCanvas.
inline QPointF canvasToTexel(const LayerTransform &t, const QSizeF &size, const QPointF &point) {
    const auto c = std::cos(t.rotation), s = std::sin(t.rotation);
    const auto dx = point.x() - t.x, dy = point.y() - t.y;
    const auto rx = c * dx + s * dy, ry = -s * dx + c * dy;
    const auto sx = t.scaleX != 0 ? t.scaleX : 1, sy = t.scaleY != 0 ? t.scaleY : 1;
    return {rx / sx + size.width() / 2, ry / sy + size.height() / 2};
}

// layerCorners: top left, top right, bottom right, bottom left.
inline std::array<QPointF, 4> layerCorners(const LayerTransform &t, const QSizeF &size) {
    return {texelToCanvas(t, size, {0, 0}), texelToCanvas(t, size, {size.width(), 0}),
            texelToCanvas(t, size, {size.width(), size.height()}), texelToCanvas(t, size, {0, size.height()})};
}

inline bool pointInLayer(const LayerTransform &t, const QSizeF &size, const QPointF &point) {
    const auto local = canvasToTexel(t, size, point);
    return local.x() >= 0 && local.x() <= size.width() && local.y() >= 0 && local.y() <= size.height();
}

// The canvas position of a handle. The rotate handle sits rotateOffset screen
// pixels beyond the top edge's midpoint, away from the center.
inline QPointF handlePoint(const LayerTransform &t, const QSizeF &size, GizmoHandle handle, double viewScale) {
    const auto [tl, tr, br, bl] = layerCorners(t, size);
    const auto mid = [](const QPointF &a, const QPointF &b) { return (a + b) / 2; };
    switch (handle) {
    case GizmoHandle::TopLeft: return tl;
    case GizmoHandle::TopRight: return tr;
    case GizmoHandle::BottomRight: return br;
    case GizmoHandle::BottomLeft: return bl;
    case GizmoHandle::Top: return mid(tl, tr);
    case GizmoHandle::Right: return mid(tr, br);
    case GizmoHandle::Bottom: return mid(br, bl);
    case GizmoHandle::Left: return mid(bl, tl);
    case GizmoHandle::Rotate: {
        const auto top = mid(tl, tr);
        const auto d = top - QPointF(t.x, t.y);
        const auto length = std::hypot(d.x(), d.y());
        return top + d / (length > 0 ? length : 1) * (rotateOffset / viewScale);
    }
    case GizmoHandle::Move: break;
    }
    return {t.x, t.y};
}

// hitHandle: the rotate handle first, then corners, then edges.
inline std::optional<GizmoHandle> hitHandle(const LayerTransform &t, const QSizeF &size, const QPointF &point, double viewScale) {
    static constexpr std::array order{GizmoHandle::Rotate, GizmoHandle::TopLeft, GizmoHandle::TopRight, GizmoHandle::BottomRight,
                                      GizmoHandle::BottomLeft, GizmoHandle::Top, GizmoHandle::Right, GizmoHandle::Bottom, GizmoHandle::Left};
    for (const auto handle : order) {
        const auto d = point - handlePoint(t, size, handle, viewScale);
        if (std::hypot(d.x(), d.y()) <= handleHitRadius / viewScale) { return handle; }
    }
    return std::nullopt;
}

inline LayerTransform applyMove(LayerTransform t, const QPointF &delta) {
    t.x += delta.x();
    t.y += delta.y();
    return t;
}

// applyRotate: the center-to-pointer ray turns the layer, keeping the grab
// offset of the pointer's starting angle.
inline LayerTransform applyRotate(LayerTransform start, double startAngle, const QPointF &pointer) {
    start.rotation += std::atan2(pointer.y() - start.y, pointer.x() - start.x) - startAngle;
    return start;
}

// applyScale: the dragged handle follows the pointer, scaling about the
// center. Corners scale both axes, and uniformly when `uniform`. Edges scale one.
inline LayerTransform applyScale(LayerTransform start, const QSizeF &size, GizmoHandle handle, const QPointF &pointer, bool uniform) {
    const auto c = std::cos(start.rotation), s = std::sin(start.rotation);
    const auto dx = pointer.x() - start.x, dy = pointer.y() - start.y;
    const auto localX = c * dx + s * dy, localY = -s * dx + c * dy;
    const auto corner = handle == GizmoHandle::TopLeft || handle == GizmoHandle::TopRight || handle == GizmoHandle::BottomRight
                        || handle == GizmoHandle::BottomLeft;
    const auto affectsX = corner || handle == GizmoHandle::Left || handle == GizmoHandle::Right;
    const auto affectsY = corner || handle == GizmoHandle::Top || handle == GizmoHandle::Bottom;
    if (affectsX && size.width() > 0) { start.scaleX = std::max(minimumScale, std::abs(localX) / (size.width() / 2)); }
    if (affectsY && size.height() > 0) { start.scaleY = std::max(minimumScale, std::abs(localY) / (size.height() / 2)); }
    if (uniform && affectsX && affectsY) { start.scaleX = start.scaleY = std::max(start.scaleX, start.scaleY); }
    return start;
}

} // namespace nodetool::compositor
