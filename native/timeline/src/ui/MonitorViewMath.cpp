// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#include "ui/MonitorViewMath.h"

#include <algorithm>
#include <array>
#include <cmath>

namespace nt::ui::monitor {
namespace {
bool positiveSize(QSizeF size) {
    return std::isfinite(size.width()) && std::isfinite(size.height()) && size.width() > 0 && size.height() > 0;
}
bool finitePoint(QPointF point) {
    return std::isfinite(point.x()) && std::isfinite(point.y());
}
}

QRectF fitRect(QSizeF viewport, QSizeF canvas, double inset) {
    if (!positiveSize(viewport) || !positiveSize(canvas) || !std::isfinite(inset) || inset < 0) { return {}; }
    const double aspect = canvas.width() / canvas.height();
    const double width = std::min(viewport.width() - 2 * inset, (viewport.height() - 2 * inset) * aspect);
    const QSizeF size(width, width / aspect);
    if (!positiveSize(size)) { return {}; }
    return {(viewport.width() - size.width()) / 2, (viewport.height() - size.height()) / 2, size.width(), size.height()};
}

QPointF clampPan(QPointF pan, QSizeF picture, QSizeF viewport) {
    if (!finitePoint(pan) || !positiveSize(picture) || !positiveSize(viewport)) { return {}; }
    const double x = std::max(0.0, (picture.width() - viewport.width()) / 2);
    const double y = std::max(0.0, (picture.height() - viewport.height()) / 2);
    return {std::clamp(pan.x(), -x, x), std::clamp(pan.y(), -y, y)};
}

QRectF pictureRect(QSizeF viewport, QSizeF canvas, std::optional<double> zoom, QPointF pan, double dpr, double inset) {
    // The picture starts on a device pixel, so the compositor's texels stay sharp.
    const auto snapped = [dpr](QRectF rect) {
        const double ratio = std::isfinite(dpr) && dpr > 0 ? dpr : 1;
        rect.moveTopLeft({std::round(rect.x() * ratio) / ratio, std::round(rect.y() * ratio) / ratio});
        return rect;
    };
    if (!zoom) { return snapped(fitRect(viewport, canvas, inset)); }
    if (!positiveSize(viewport) || !positiveSize(canvas) || !std::isfinite(*zoom) || *zoom <= 0 ||
        !std::isfinite(dpr) || dpr <= 0 || !finitePoint(pan)) { return {}; }
    const QSizeF size = canvas * (std::clamp(*zoom, kMinZoom, kMaxZoom) / dpr);
    if (!positiveSize(size)) { return {}; }
    const QPointF centre = QPointF(viewport.width() / 2, viewport.height() / 2) + clampPan(pan, size, viewport);
    return snapped({centre - QPointF(size.width() / 2, size.height() / 2), size});
}

ZoomResult zoomAbout(QPointF pointer, double factor, QRectF picture, QSizeF viewport, QSizeF canvas, double dpr) {
    if (!positiveSize(picture.size()) || !positiveSize(viewport) || !positiveSize(canvas) || !finitePoint(picture.topLeft()) ||
        !finitePoint(pointer) || !std::isfinite(factor) || factor <= 0 || !std::isfinite(dpr) || dpr <= 0) { return {1, {}}; }
    const double current = picture.width() * dpr / canvas.width();
    if (!std::isfinite(current) || current <= 0) { return {1, {}}; }
    const double zoom = std::clamp(current * factor, kMinZoom, kMaxZoom);
    const double scale = zoom / current;
    const QPointF centre = pointer - (pointer - picture.center()) * scale;
    const QPointF pan = centre - QPointF(viewport.width() / 2, viewport.height() / 2);
    return {zoom, clampPan(pan, canvas * (zoom / dpr), viewport)};
}

double niceRulerStep(double pixelsPerUnit) {
    static constexpr std::array steps{1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0, 500.0, 1000.0, 2000.0};
    for (const double step : steps) {
        if (step * pixelsPerUnit >= 50) { return step; }
    }
    return 5000;
}

VisibleRegion visibleRegion(QRectF picture, QSizeF viewport, double dpr) {
    if (!positiveSize(picture.size()) || !positiveSize(viewport) || !finitePoint(picture.topLeft()) ||
        !std::isfinite(dpr) || dpr <= 0) { return {}; }
    const QRectF overlap = picture.intersected(QRectF(QPointF(), viewport));
    if (overlap.isEmpty()) { return {}; }
    if (overlap == picture) { return {{QPointF(), picture.size()}, {0, 0, 1, 1}}; }
    const auto snapped = [dpr](double value, double maximum) {
        if (value <= 0) { return 0.0; }
        if (value >= maximum) { return maximum; }
        return std::clamp(std::round(value * dpr) / dpr, 0.0, maximum);
    };
    const double left = snapped(overlap.left() - picture.left(), picture.width());
    const double top = snapped(overlap.top() - picture.top(), picture.height());
    const double right = snapped(overlap.right() - picture.left(), picture.width());
    const double bottom = snapped(overlap.bottom() - picture.top(), picture.height());
    return {{left, top, right - left, bottom - top},
            {left / picture.width(), top / picture.height(), (right - left) / picture.width(), (bottom - top) / picture.height()}};
}
}
