// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#include "ui/MonitorRulerCanvas.h"

#include "ui/MonitorViewMath.h"

#include <QFontMetricsF>
#include <QPainter>

#include <cmath>

MonitorRulerCanvas::MonitorRulerCanvas(QQuickItem* parent) : QQuickPaintedItem(parent) {
    setAntialiasing(false);
    connect(this, &QQuickItem::widthChanged, this, &MonitorRulerCanvas::touch);
    connect(this, &QQuickItem::heightChanged, this, &MonitorRulerCanvas::touch);
}

void MonitorRulerCanvas::touch() {
    update();
    emit changed();
}

void MonitorRulerCanvas::setVertical(bool value) {
    if (m_vertical == value) { return; }
    m_vertical = value;
    touch();
}
void MonitorRulerCanvas::setOrigin(double value) {
    if (m_origin == value) { return; }
    m_origin = value;
    touch();
}
void MonitorRulerCanvas::setPixelsPerUnit(double value) {
    if (m_pixelsPerUnit == value) { return; }
    m_pixelsPerUnit = value;
    touch();
}
void MonitorRulerCanvas::setBackground(const QColor& value) {
    if (m_background == value) { return; }
    m_background = value;
    touch();
}
void MonitorRulerCanvas::setTextColor(const QColor& value) {
    if (m_text == value) { return; }
    m_text = value;
    touch();
}
void MonitorRulerCanvas::setTickColor(const QColor& value) {
    if (m_tick == value) { return; }
    m_tick = value;
    touch();
}
void MonitorRulerCanvas::setFont(const QFont& value) {
    if (m_font == value) { return; }
    m_font = value;
    touch();
}

QVariantList MonitorRulerCanvas::ticks() const {
    QVariantList result;
    const double length = m_vertical ? height() : width();
    if (!std::isfinite(m_pixelsPerUnit) || m_pixelsPerUnit <= 0 || !std::isfinite(m_origin) || length <= 0) {
        return result;
    }
    const double step = nt::ui::monitor::niceRulerStep(m_pixelsPerUnit);
    const double minor = step / 5.0;
    const auto first = static_cast<long long>(std::floor(-m_origin / m_pixelsPerUnit / minor));
    const auto last = static_cast<long long>(std::ceil((length - m_origin) / m_pixelsPerUnit / minor));
    for (long long i = first; i <= last; ++i) {
        result.append(QVariantMap{{QStringLiteral("position"), double(i) * minor},
                                  {QStringLiteral("major"), i % 5 == 0}});
    }
    return result;
}

void MonitorRulerCanvas::paint(QPainter* painter) {
    const double w = width();
    const double h = height();
    painter->fillRect(QRectF(0, 0, w, h), m_background);
    const double thickness = m_vertical ? w : h;
    painter->setFont(m_font);
    const QFontMetricsF metrics(m_font);
    for (const auto& value : ticks()) {
        const auto tick = value.toMap();
        const double canvas = tick.value(QStringLiteral("position")).toDouble();
        const bool major = tick.value(QStringLiteral("major")).toBool();
        const double at = m_origin + canvas * m_pixelsPerUnit;
        const double size = thickness * (major ? 0.6 : 0.25);
        painter->setPen(m_tick);
        if (m_vertical) {
            painter->drawLine(QPointF(w - size, at), QPointF(w, at));
        } else {
            painter->drawLine(QPointF(at, h - size), QPointF(at, h));
        }
        if (!major) { continue; }
        const QString label = QString::number(std::llround(canvas));
        painter->setPen(m_text);
        if (m_vertical) {
            painter->save();
            painter->translate(metrics.ascent(), at - 2.0);
            painter->rotate(-90);
            painter->drawText(QPointF(0, 0), label);
            painter->restore();
        } else {
            painter->drawText(QPointF(at + 2.0, metrics.ascent()), label);
        }
    }
}
