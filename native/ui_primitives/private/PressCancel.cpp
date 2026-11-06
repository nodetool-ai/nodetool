#include "PressCancel.h"

#include <QCoreApplication>
#include <QFocusEvent>
#include <QQuickItem>

void PressCancel::cancel(QQuickItem *item) const {
    if (item) {
        item->ungrabMouse();
        item->ungrabTouchPoints();
        // A held Space key has no pointer grab; the focus-out event clears its native press.
        QFocusEvent cancel(QEvent::FocusOut, Qt::OtherFocusReason);
        QCoreApplication::sendEvent(item, &cancel);
    }
}
