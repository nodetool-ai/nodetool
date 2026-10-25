#include "ui/RulerCanvas.h"

#include "ui/TimelineFormat.h"

#include <QFontMetricsF>
#include <QPainter>

#include <cmath>

RulerCanvas::RulerCanvas(QQuickItem* parent) : QQuickPaintedItem(parent) {
    setAntialiasing(true);
    setOpaquePainting(true);
    connect(this, &QQuickItem::widthChanged, this, [this]() { update(); });
    connect(this, &QQuickItem::heightChanged, this, [this]() { update(); });
}

void RulerCanvas::changedValue() {
    emit changed();
    update();
}

void RulerCanvas::setMsPerPx(double v) {
    if (v == m_msPerPx) return;
    m_msPerPx = v;
    changedValue();
}

void RulerCanvas::setScrollLeftPx(double v) {
    if (v == m_scrollLeftPx) return;
    m_scrollLeftPx = v;
    changedValue();
}

void RulerCanvas::setFps(double v) {
    if (v == m_fps) return;
    m_fps = v;
    changedValue();
}

void RulerCanvas::setBackground(const QColor& c) {
    if (c == m_background) return;
    m_background = c;
    setFillColor(c);
    changedValue();
}

void RulerCanvas::setTextColor(const QColor& c) {
    if (c == m_text) return;
    m_text = c;
    changedValue();
}

void RulerCanvas::setTickColor(const QColor& c) {
    if (c == m_tick) return;
    m_tick = c;
    changedValue();
}

void RulerCanvas::setFont(const QFont& f) {
    if (f == m_font) return;
    m_font = f;
    changedValue();
}

void RulerCanvas::paint(QPainter* painter) {
    ++m_paintCount;
    const double w = width();
    const double h = height();
    painter->fillRect(QRectF(0, 0, w, h), m_background);
    if (w <= 0 || h <= 0 || m_msPerPx <= 0) {
        m_labelCount = 0;
        emit painted();
        return;
    }
    const nt::ui::TickIntervals ticks = nt::ui::computeTickIntervals(m_msPerPx);
    const double visibleStartMs = m_scrollLeftPx * m_msPerPx;
    const double visibleEndMs = visibleStartMs + w * m_msPerPx;
    const double firstTickMs = std::floor(visibleStartMs / ticks.minorMs) * ticks.minorMs;

    painter->setFont(m_font);
    const QFontMetricsF metrics(m_font);
    QPen tickPen(m_tick);
    tickPen.setWidthF(1.0);
    int labels = 0;
    // The canvas strokes a 1 px line centred on the x, so it covers half a
    // pixel on each side; the same line here.
    const long long majorRounded = std::llround(ticks.majorMs);
    for (double tMs = firstTickMs; tMs <= visibleEndMs + ticks.minorMs; tMs += ticks.minorMs) {
        const bool isMajor = std::llround(tMs) % majorRounded == 0;
        const double px = tMs / m_msPerPx - m_scrollLeftPx;
        if (px < 0 || px > w) continue;
        painter->setPen(tickPen);
        painter->drawLine(QPointF(px, h), QPointF(px, isMajor ? h / 2.0 : h * 0.75));
        if (!isMajor) continue;
        painter->setPen(m_text);
        // textBaseline "top" at y = 3: the glyph box starts there.
        painter->drawText(QPointF(px + 3.0, 3.0 + metrics.ascent()),
                          nt::ui::formatRulerTimecode(tMs, ticks.majorMs, m_fps));
        ++labels;
    }
    m_labelCount = labels;
    emit painted();
}
