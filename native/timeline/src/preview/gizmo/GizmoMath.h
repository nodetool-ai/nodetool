#pragma once

#include "preview/SceneEval.h"
#include <QPointF>
#include <QSizeF>
#include <QString>
#include <array>

namespace nt::gizmo {
struct Space {
    QSizeF source;
    QSizeF sequence;
    QSizeF frame;
    std::optional<Mat4> parent;
    QJsonObject crop;
};
struct Geometry {
    std::array<QPointF, 4> corners{};
    QPointF center;
    QPointF pivot;
    QPointF handle(const QString& target) const;
};
Geometry geometry(const ClipTransform& transform, const Space& space);
QPointF positionDelta(QPointF delta, const Space& space);
struct Drag {
    QString target;
    ClipTransform start;
    ClipTransform display;
    Space space;
    QPointF pointer;
    Geometry box;
    ClipTransform update(QPointF next, bool shift) const;
};
ClipTransform transformOf(const QJsonObject& clip);
QJsonObject transformJson(const ClipTransform& transform);
QJsonObject transformPatch(const QJsonObject& startClip, const ClipTransform& next, std::optional<double> atMs);
}
