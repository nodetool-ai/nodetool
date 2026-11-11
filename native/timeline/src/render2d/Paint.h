#pragma once
#include <QBrush>
#include <QJsonObject>
#include <QPainter>
#include <QPainterPath>
#include <QSize>

namespace nt::render2d {
QColor cssColor(const QString& value);
QBrush fillBrush(const QJsonValue& fill, const QRectF& box);
QPainterPath svgPath(const QString& data, QSize size);
QPainterPath flattenedPath(const QPainterPath& path);
QPainterPath shapePath(const QJsonObject& style, QSize size);
void paintShape(QPainter& painter, const QJsonObject& style, QSize size);
QImage blurred(const QImage& image, double sigma);
} // namespace nt::render2d
