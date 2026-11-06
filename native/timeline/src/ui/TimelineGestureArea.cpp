#include "ui/TimelineGestureArea.h"

#include "ui/TimelineViewState.h"

#include <QNativeGestureEvent>
#include <QWheelEvent>

using nt::ui::CHROMIUM_NOTCH_PX;
using nt::ui::QT_NOTCH_ANGLE;

TimelineGestureArea::TimelineGestureArea(QQuickItem* parent) : QQuickItem(parent) {
    setAcceptedMouseButtons(Qt::NoButton);
}

void TimelineGestureArea::setViewState(TimelineViewState* view) {
    if (view == m_view) return;
    if (m_view) disconnect(m_view, nullptr, this, nullptr);
    m_view = view;
    if (m_view) {
        connect(m_view, &TimelineViewState::flushRequested, this, [this]() { polish(); });
        if (m_view->flushPending()) polish();
    }
    emit viewStateChanged();
}

void TimelineGestureArea::setRulerTop(double y) {
    if (y == m_rulerTop) return;
    m_rulerTop = y;
    emit geometryChanged();
}

void TimelineGestureArea::setRowsTop(double y) {
    if (y == m_rowsTop) return;
    m_rowsTop = y;
    emit geometryChanged();
}

void TimelineGestureArea::setLanesLeft(double x) {
    if (x == m_lanesLeft) return;
    m_lanesLeft = x;
    emit geometryChanged();
}

int TimelineGestureArea::targetAt(QPointF pos) const {
    if (pos.y() >= m_rowsTop) {
        return pos.x() < m_lanesLeft ? TimelineViewState::Headers : TimelineViewState::Lanes;
    }
    if (pos.y() >= m_rulerTop) {
        return TimelineViewState::Ruler;
    }
    return TimelineViewState::Other;
}

void TimelineGestureArea::wheelEvent(QWheelEvent* event) {
    if (!m_view) {
        event->ignore();
        return;
    }
    ++m_wheelEvents;
    emit inputCounted();
    double dx = 0.0;
    double dy = 0.0;
    if (!event->pixelDelta().isNull()) {
        dx = -event->pixelDelta().x();
        dy = -event->pixelDelta().y();
    } else {
        dx = -event->angleDelta().x() / QT_NOTCH_ANGLE * CHROMIUM_NOTCH_PX;
        dy = -event->angleDelta().y() / QT_NOTCH_ANGLE * CHROMIUM_NOTCH_PX;
    }
    const QPointF pos = event->position();
    const bool handled = m_view->wheelEvent(dx, dy, static_cast<int>(event->modifiers()), 0, pos.x() - m_lanesLeft,
                                            targetAt(pos));
    event->setAccepted(handled);
}

bool TimelineGestureArea::event(QEvent* event) {
    if (event->type() == QEvent::NativeGesture && m_view) {
        auto* gesture = static_cast<QNativeGestureEvent*>(event);
        switch (gesture->gestureType()) {
        case Qt::ZoomNativeGesture:
            ++m_gestureEvents;
            emit inputCounted();
            m_view->pinch(gesture->value(), gesture->position().x() - m_lanesLeft);
            gesture->accept();
            return true;
        case Qt::BeginNativeGesture:
        case Qt::EndNativeGesture:
            gesture->accept();
            return true;
        default: break;
        }
    }
    return QQuickItem::event(event);
}

void TimelineGestureArea::updatePolish() {
    if (m_view) m_view->flush();
}
