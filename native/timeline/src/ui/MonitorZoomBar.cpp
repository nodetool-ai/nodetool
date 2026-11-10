#include "ui/MonitorZoomBar.h"

#include <QCursor>
#include <QHoverEvent>
#include <QMouseEvent>
#include <QPainter>

#include <algorithm>

namespace {
// Logical pixels before UI scale, as in filmcraft's monitor.rs.
constexpr double kMinThumbWidth = 34.0;
constexpr double kHandleRadius = 4.5;
constexpr double kHandleStroke = 1.5;

template <typename T>
bool assign(T& field, const T& value) {
    if (field == value) { return false; }
    field = value;
    return true;
}
}

MonitorZoomBar::MonitorZoomBar(QQuickItem* parent) : QQuickPaintedItem(parent) {
    setAntialiasing(true);
    setAcceptedMouseButtons(Qt::LeftButton);
    setAcceptHoverEvents(true);
    connect(this, &QQuickItem::widthChanged, this, &MonitorZoomBar::changedValue);
    connect(this, &QQuickItem::heightChanged, this, &MonitorZoomBar::changedValue);
}

void MonitorZoomBar::changedValue() {
    emit changed();
    update();
}

void MonitorZoomBar::setStart(double v) { if (assign(m_start, std::clamp(v, 0.0, 1.0))) { changedValue(); } }
void MonitorZoomBar::setEnd(double v) { if (assign(m_end, std::clamp(v, 0.0, 1.0))) { changedValue(); } }
void MonitorZoomBar::setMinSpan(double v) { if (assign(m_minSpan, std::clamp(v, 0.0, 1.0))) { changedValue(); } }
void MonitorZoomBar::setUiScale(double v) { if (v > 0 && assign(m_scale, v)) { changedValue(); } }
void MonitorZoomBar::setTrackColor(const QColor& c) { if (assign(m_track, c)) { changedValue(); } }
void MonitorZoomBar::setThumbColor(const QColor& c) { if (assign(m_thumb, c)) { changedValue(); } }
void MonitorZoomBar::setThumbHoverColor(const QColor& c) { if (assign(m_thumbHover, c)) { changedValue(); } }
void MonitorZoomBar::setHandleFill(const QColor& c) { if (assign(m_handleFill, c)) { changedValue(); } }
void MonitorZoomBar::setHandleStroke(const QColor& c) { if (assign(m_handleStroke, c)) { changedValue(); } }

QRectF MonitorZoomBar::thumbRect() const {
    const double w = width();
    const double span = m_start < m_end ? m_end - m_start : 1.0;
    const double thumb = std::clamp(span * w, std::min(kMinThumbWidth * m_scale, w), w);
    const double travel = std::max(0.0, w - thumb);
    const double range = std::max(0.0, 1.0 - span);
    const double left = range > 0 ? std::clamp(m_start / range, 0.0, 1.0) * travel : 0.0;
    return {left, 0, thumb, height()};
}

double MonitorZoomBar::perPixel() const {
    const QRectF thumb = thumbRect();
    const double travel = std::max(0.0, width() - thumb.width());
    const double span = m_start < m_end ? m_end - m_start : 1.0;
    return travel > 0.5 ? (1.0 - span) / travel : 0.0;
}

// The start that brings the thumb's middle under `x`.
double MonitorZoomBar::jump(double x) const {
    const double span = m_start < m_end ? m_end - m_start : 1.0;
    return std::clamp((x - thumbRect().width() / 2) * perPixel(), 0.0, std::max(0.0, 1.0 - span));
}

MonitorZoomBar::Part MonitorZoomBar::partAt(double x) const {
    const QRectF thumb = thumbRect();
    if (x < thumb.left() || x > thumb.right()) { return Part::Beside; }
    // Each handle owns a square at its end of the thumb.
    if (x <= thumb.left() + thumb.height()) { return Part::Left; }
    if (x >= thumb.right() - thumb.height()) { return Part::Right; }
    return Part::Middle;
}

void MonitorZoomBar::edit(double start, double end) {
    end = std::min(end, 1.0);
    start = std::max(start, 0.0);
    // A range that covers everything is no zoom.
    if (start <= 0 && end >= 1) { start = 0; end = 1; }
    emit rangeEdited(start, end);
}

void MonitorZoomBar::paint(QPainter* painter) {
    const double h = height();
    if (width() <= 0 || h <= 0) { return; }
    painter->setPen(Qt::NoPen);
    painter->setBrush(m_track);
    painter->drawRoundedRect(QRectF(0, 0, width(), h), h / 2, h / 2);
    const QRectF thumb = thumbRect();
    painter->setBrush(m_hover ? m_thumbHover : m_thumb);
    painter->drawRoundedRect(thumb, h / 2, h / 2);
    QPen stroke(m_handleStroke);
    stroke.setWidthF(kHandleStroke * m_scale);
    painter->setPen(stroke);
    painter->setBrush(m_handleFill);
    const double r = kHandleRadius * m_scale;
    for (const double x : {thumb.left() + h / 2, thumb.right() - h / 2}) {
        painter->drawEllipse(QPointF(x, thumb.center().y()), r, r);
    }
}

void MonitorZoomBar::mousePressEvent(QMouseEvent* event) {
    if (event->button() != Qt::LeftButton) {
        event->ignore();
        return;
    }
    event->accept();
    setKeepMouseGrab(true);
    const double x = event->position().x();
    m_grab = partAt(x);
    m_grabX = x;
    m_lastX = x;
    m_grabStart = m_start < m_end ? m_start : 0.0;
    if (m_grab == Part::Beside && perPixel() > 0) {
        const double span = m_start < m_end ? m_end - m_start : 1.0;
        m_grabStart = jump(x);
        edit(m_grabStart, m_grabStart + span);
    }
}

void MonitorZoomBar::mouseMoveEvent(QMouseEvent* event) {
    if (!(event->buttons() & Qt::LeftButton)) { return; }
    const double x = event->position().x();
    const double s = m_start < m_end ? m_start : 0.0;
    const double e = m_start < m_end ? m_end : 1.0;
    switch (m_grab) {
    case Part::Beside:
    case Part::Middle: {
        // Scroll, the thumb staying under the pointer.
        const double span = e - s;
        const double ns = std::clamp(m_grabStart + (x - m_grabX) * perPixel(), 0.0, std::max(0.0, 1.0 - span));
        edit(ns, ns + span);
        break;
    }
    case Part::Left:
    case Part::Right: {
        // Zoom, the other end staying where it is.
        const double dx = (x - m_lastX) / std::max(1.0, width());
        if (m_grab == Part::Left) {
            edit(std::clamp(s + dx, 0.0, std::max(0.0, e - m_minSpan)), e);
        } else {
            edit(s, std::clamp(e + dx, std::min(1.0, s + m_minSpan), 1.0));
        }
        break;
    }
    }
    m_lastX = x;
}

void MonitorZoomBar::mouseReleaseEvent(QMouseEvent*) { setKeepMouseGrab(false); }

void MonitorZoomBar::hoverMoveEvent(QHoverEvent* event) {
    const Part part = partAt(event->position().x());
    setCursor(part == Part::Left || part == Part::Right ? Qt::SizeHorCursor : Qt::ArrowCursor);
    if (assign(m_hover, part != Part::Beside)) { update(); }
}

void MonitorZoomBar::hoverLeaveEvent(QHoverEvent*) {
    if (assign(m_hover, false)) { update(); }
}
