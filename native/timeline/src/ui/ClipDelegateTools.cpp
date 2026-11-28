#include "ClipDelegateTools.h"

#include <QThread>
#include <cmath>
#include <vector>

namespace {
QQuickItem* trimTarget(QQuickItem& item, QQuickItem& area, QPointF point, int button) {
    if (!item.isVisible() || !item.isEnabled()) { return nullptr; }
    const auto acceptedButtons = Qt::MouseButtons::fromInt(item.property("acceptedButtons").toInt());
    if (item.property("takesTrimPress").toBool() && button != Qt::NoButton
        && acceptedButtons.testFlag(static_cast<Qt::MouseButton>(button))
        && item.contains(item.mapFromItem(&area, point))) { return &item; }
    for (auto* child : item.childItems()) {
        if (auto* target = trimTarget(*child, area, point, button)) { return target; }
    }
    return nullptr;
}
struct Position {
    double row = 0;
    double start = 0;
    QString id;
    int edge = -1;
};
Position position(QQuickItem& item, QQuickItem& region) {
    const bool clip = item.property("previousClipId").isValid();
    const auto* body = clip ? &item : item.parentItem()->property("body").value<QObject*>();
    if (!body) { return {}; }
    return {item.mapToItem(&region, QPointF()).y(), body->property("startMs").toDouble(),
        body->property("clipId").toString(), clip ? -1 : item.property("edge").toString() == "in" ? 0 : 1};
}
int compare(const Position& a, const Position& b) {
    if (std::abs(a.row-b.row) > 1) { return a.row < b.row ? -1 : 1; }
    if (a.start != b.start) { return a.start < b.start ? -1 : 1; }
    const int id = QString::localeAwareCompare(a.id, b.id);
    return id ? id : a.edge-b.edge;
}
}
QQuickItem* ClipDelegateTools::slotHit(QQuickItem* body, QQuickItem* area, double x, double y, int button) const {
    Q_ASSERT(QThread::currentThread() == thread());
    if (!body || !area) { return nullptr; }
    for (auto* item : body->childItems()) {
        if (item->property("slot").toString() == "clipBody") {
            if (auto* target = trimTarget(*item, *area, {x,y}, button)) { return target; }
        }
    }
    return nullptr;
}
void ClipDelegateTools::beginFade(QQuickItem* target, double x) const {
    if (target) { QMetaObject::invokeMethod(target, "beginForwardedFade", Qt::DirectConnection, Q_ARG(double, x)); }
}
void ClipDelegateTools::moveFade(QQuickItem* target, double x) const {
    if (target) { QMetaObject::invokeMethod(target, "previewForwardedFade", Qt::DirectConnection, Q_ARG(double, x)); }
}
void ClipDelegateTools::finishFade(QQuickItem* target) const {
    if (target) { QMetaObject::invokeMethod(target, "finishForwardedFade", Qt::DirectConnection); }
}
double ClipDelegateTools::sceneX(QQuickItem* area, double x, double y) const { return area ? area->mapToScene(QPointF(x,y)).x() : 0; }
double ClipDelegateTools::sceneY(QQuickItem* area, double x, double y) const { return area ? area->mapToScene(QPointF(x,y)).y() : 0; }
QQuickItem* ClipDelegateTools::ownerOf(QQuickItem* area, const QString& identity) const {
    while (area && !area->property(identity.toUtf8().constData()).isValid()) { area = area->parentItem(); }
    return area;
}
bool ClipDelegateTools::focusNext(QQuickItem* content, QQuickItem* region, QQuickItem* current, bool forward) const {
    if (!content || !region || !current) { return false; }
    const auto here = position(*current, *region);
    const int direction = forward ? 1 : -1;
    QQuickItem* next = nullptr;
    Position nextPosition;
    std::vector<QQuickItem*> pending{content};
    while (!pending.empty()) {
        auto* item = pending.back(); pending.pop_back();
        if (!item->isVisible()) { continue; }
        if (item->objectName().startsWith("fadeGrip-")
            || (item->property("previousClipId").isValid() && item->activeFocusOnTab())) {
            const auto at = position(*item, *region);
            if (!(direction < 0 && at.id == here.id && at.edge == -1)
                && compare(at, here)*direction > 0 && (!next || compare(at, nextPosition)*direction < 0)) {
                next = item; nextPosition = at;
            }
        }
        const auto children = item->childItems();
        pending.insert(pending.end(), children.begin(), children.end());
    }
    if (!next) { return false; }
    next->forceActiveFocus(Qt::TabFocusReason);
    return true;
}
void ClipDelegateTools::focusTrackResize(QQuickItem* headers, const QString& id) const {
    if (!headers) { return; }
    std::vector<QQuickItem*> pending{headers};
    while (!pending.empty()) {
        auto* item = pending.back(); pending.pop_back();
        if (item->isVisible() && item->property("trackId").toString() == id) {
            auto* handle = item->property("resizeHandle").value<QQuickItem*>();
            if (handle) { handle->forceActiveFocus(); return; }
        }
        const auto children = item->childItems();
        pending.insert(pending.end(), children.begin(), children.end());
    }
}

QPointF ClipDelegateTools::localPoint(QQuickItem* area, QQuickItem* target, double x, double y) const {
    return area ? area->mapToItem(target,QPointF(x,y)) : QPointF();
}
