#include "TooltipTracker.h"

#include <QCoreApplication>
#include <QEvent>

QPointer<TooltipTracker> TooltipTracker::s_current;

TooltipTracker::TooltipTracker(QObject* parent) : QObject(parent) {}
TooltipTracker::~TooltipTracker() {
    if (m_active && QCoreApplication::instance()) { QCoreApplication::instance()->removeEventFilter(this); }
}
QPointF TooltipTracker::anchor() const {
    return m_trigger && m_overlay ? m_trigger->mapToItem(m_overlay, QPointF(0, m_trigger->height())) : QPointF();
}
void TooltipTracker::setTrigger(QQuickItem* trigger) {
    if (m_trigger == trigger) { return; }
    dismiss();
    m_trigger = trigger;
    watchAncestors();
    emit triggerChanged();
    emit geometryChanged();
}
void TooltipTracker::setOverlay(QQuickItem* overlay) {
    if (m_overlay == overlay) { return; }
    dismiss();
    m_overlay = overlay;
    emit geometryChanged();
}
void TooltipTracker::watchAncestors() {
    for (const auto& connection : m_connections) { disconnect(connection); }
    m_connections.clear();
    for (auto* item = m_trigger.data(); item; item = item->parentItem()) {
        const auto moved = [this]() { dismiss(); emit geometryChanged(); };
        m_connections.append(connect(item, &QQuickItem::xChanged, this, moved));
        m_connections.append(connect(item, &QQuickItem::yChanged, this, moved));
        m_connections.append(connect(item, &QQuickItem::widthChanged, this, moved));
        m_connections.append(connect(item, &QQuickItem::heightChanged, this, moved));
        m_connections.append(connect(item, &QQuickItem::rotationChanged, this, moved));
        m_connections.append(connect(item, &QQuickItem::scaleChanged, this, moved));
        m_connections.append(connect(item, &QQuickItem::visibleChanged, this, moved));
        m_connections.append(connect(item, &QQuickItem::parentChanged, this, [this]() {
            dismiss(); watchAncestors(); emit geometryChanged();
        }));
        m_connections.append(connect(item, &QQuickItem::windowChanged, this, moved));
        m_connections.append(connect(item, &QObject::destroyed, this, [this]() { dismiss(); }));
    }
}
void TooltipTracker::prepare() {
    if (s_current && s_current != this) { s_current->dismiss(); }
    s_current = this;
    emit geometryChanged();
}
void TooltipTracker::setActive(bool active) {
    if (m_active == active) { return; }
    m_active = active;
    if (active) {
        prepare();
        QCoreApplication::instance()->installEventFilter(this);
    } else {
        QCoreApplication::instance()->removeEventFilter(this);
        if (s_current == this) { s_current.clear(); }
    }
    emit activeChanged();
}
void TooltipTracker::dismiss() {
    if (m_active) { emit dismissed(); }
}
bool TooltipTracker::eventFilter(QObject*, QEvent* event) {
    switch (event->type()) {
    case QEvent::MouseButtonPress:
    case QEvent::TouchBegin:
    case QEvent::Wheel:
    case QEvent::KeyPress:
    case QEvent::FocusIn:
    case QEvent::WindowDeactivate:
        dismiss();
        break;
    default: break;
    }
    return false;
}
