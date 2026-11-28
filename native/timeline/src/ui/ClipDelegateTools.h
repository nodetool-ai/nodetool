#pragma once

#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

// GUI thread only. Stateless helpers borrow items for the duration of a call.
// Dynamic plugin properties and methods stay at this boundary, outside AOT QML.
class ClipDelegateTools : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    using QObject::QObject;
    Q_INVOKABLE QQuickItem* slotHit(QQuickItem* body, QQuickItem* area, double x, double y, int button) const;
    Q_INVOKABLE void beginFade(QQuickItem* target, double sceneX) const;
    Q_INVOKABLE void moveFade(QQuickItem* target, double sceneX) const;
    Q_INVOKABLE void finishFade(QQuickItem* target) const;
    Q_INVOKABLE QPointF localPoint(QQuickItem* area, QQuickItem* target, double x, double y) const;
    Q_INVOKABLE double sceneX(QQuickItem* area, double x, double y) const;
    Q_INVOKABLE double sceneY(QQuickItem* area, double x, double y) const;
    Q_INVOKABLE QQuickItem* ownerOf(QQuickItem* area, const QString& identity) const;
    Q_INVOKABLE bool focusNext(QQuickItem* content, QQuickItem* region, QQuickItem* current, bool forward) const;
    Q_INVOKABLE void focusTrackResize(QQuickItem* headers, const QString& id) const;
};
