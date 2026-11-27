// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#include "ui/MonitorRulerCanvas.h"

#include "ui/MonitorViewMath.h"

#include <optional>


#include <cmath>

namespace {
// GUI-thread value snapshot of validated tick bounds.
struct TickWindow { double minor, first; int count; };
std::optional<TickWindow> tickWindow(double length,double pixelsPerUnit,double origin) {
    if (!std::isfinite(length) || length<=0 || !std::isfinite(pixelsPerUnit) || pixelsPerUnit<=0 || !std::isfinite(origin)) { return std::nullopt; }
    const double minor=nt::ui::monitor::niceRulerStep(pixelsPerUnit)/5;
    if (!std::isfinite(minor) || minor<=0) { return std::nullopt; }
    const double first=std::floor(-origin/pixelsPerUnit/minor);
    const double count=std::ceil(length/pixelsPerUnit/minor)+2;
    // Bound work before any integer conversion, including extreme zoom and origin.
    if (!std::isfinite(first) || std::abs(first)>9e15 || !std::isfinite(count) || count>4096) { return std::nullopt; }
    return TickWindow{minor,first,int(count)};
}
}

MonitorRulerCanvas::MonitorRulerCanvas(QQuickItem* parent) : SceneLayerItem(parent) {
    connect(this, &QQuickItem::widthChanged, this, &MonitorRulerCanvas::touch);
    connect(this, &QQuickItem::heightChanged, this, &MonitorRulerCanvas::touch);
}

void MonitorRulerCanvas::touch() {
    requestPaint();
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
    const auto range=tickWindow(length,m_pixelsPerUnit,m_origin);
    if (!range) { return result; }
    for (int i=0;i<range->count;++i) {
        const double index=range->first+i;
        result.append(QVariantMap{{QStringLiteral("position"),index*range->minor},
                                  {QStringLiteral("major"),std::fmod(index,5)==0}});
    }
    return result;
}

void MonitorRulerCanvas::prepare() {
    const double w=width(),h=height();
    rect(QRectF(0,0,w,h),m_background);
    const double length=m_vertical?h:w, thickness=m_vertical?w:h;
    const auto range=tickWindow(length,m_pixelsPerUnit,m_origin);
    if (!range) { return; }
    for (int i=0;i<range->count;++i) {
        const double index=range->first+i,canvas=index*range->minor,at=m_origin+canvas*m_pixelsPerUnit;
        if (at<0 || at>length) { continue; }
        const bool major=std::fmod(index,5)==0;
        const double size=thickness*(major?.6:.25);
        if (m_vertical) { line({w-size,at},{w,at},m_tick); }
        else { line({at,h-size},{at,h},m_tick); }
        if (!major) { continue; }
        const QString value=QString::number(canvas,'f',0);
        label(value,m_vertical?QPointF(0,at-2):QPointF(at+2,0),m_font,m_text,m_vertical);
    }
}
