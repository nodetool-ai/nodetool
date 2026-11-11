// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#pragma once
#include <QPointF>
#include <QRectF>
#include <QSizeF>
#include <optional>
namespace nt::ui::monitor {
inline constexpr double kMinZoom = 0.1, kMaxZoom = 16.0;
QRectF fitRect(QSizeF viewport, QSizeF canvas, double inset);
QRectF pictureRect(QSizeF viewport, QSizeF canvas, std::optional<double> zoom, QPointF pan, double dpr, double inset);
QPointF clampPan(QPointF pan, QSizeF picture, QSizeF viewport);
struct ZoomResult { double zoom; QPointF pan; };
ZoomResult zoomAbout(QPointF pointer, double factor, QRectF picture, QSizeF viewport, QSizeF canvas, double dpr);
double niceRulerStep(double pixelsPerUnit);
struct VisibleRegion { QRectF item; QRectF canvas; };
VisibleRegion visibleRegion(QRectF picture, QSizeF viewport, double dpr);
}
