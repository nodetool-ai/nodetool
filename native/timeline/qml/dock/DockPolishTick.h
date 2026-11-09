#pragma once

#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

// Combines many requests into one tick in the window's polish step. The
// polish step runs before the frame syncs, so a tick never lags a frame.
class DockPolishTick : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
public:
    using QQuickItem::QQuickItem;
    Q_INVOKABLE void request() {
        if (window()) polish();
        else emit tick();
    }
signals:
    void tick();
protected:
    void updatePolish() override { emit tick(); }
};
