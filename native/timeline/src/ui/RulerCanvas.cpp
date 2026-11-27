#include "ui/RulerCanvas.h"

#include "wiring/RulerProviders.h"
#include <QJsonDocument>

#include <QFontMetricsF>


#include <algorithm>
#include <cmath>

RulerCanvas::RulerCanvas(QQuickItem* parent) : SceneLayerItem(parent) {

    connect(this, &QQuickItem::widthChanged, this, &RulerCanvas::changedValue);
    connect(this, &QQuickItem::heightChanged, this, &RulerCanvas::changedValue);
}

void RulerCanvas::changedValue() {
    emit changed();
    requestPaint();
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

void RulerCanvas::setMarkerColor(const QColor& c) {
    if (c == m_marker) return;
    m_marker = c;
    changedValue();
}

void RulerCanvas::setRangeInMs(double v) {
    if (v == m_rangeInMs) return;
    m_rangeInMs = v;
    changedValue();
}

void RulerCanvas::setRangeOutMs(double v) {
    if (v == m_rangeOutMs) return;
    m_rangeOutMs = v;
    changedValue();
}

void RulerCanvas::prepare() {
    ++m_paintCount;
    const double w=width(), h=height();
    rect(QRectF(0,0,w,h),m_background);
    if (w<=0 || h<=0 || !std::isfinite(m_msPerPx) || m_msPerPx<=0) { m_labelCount=0; emit painted(); return; }
    if (m_rangeInMs>=0 || m_rangeOutMs>=0) {
        const double a=m_rangeInMs<0?0:m_rangeInMs/m_msPerPx-m_scrollLeftPx;
        const double b=m_rangeOutMs<0?w:m_rangeOutMs/m_msPerPx-m_scrollLeftPx;
        QColor band=m_marker; band.setAlphaF(.18*m_marker.alphaF());
        const double left=std::max(0.0,a);
        rect(QRectF(left,0,std::min(w,b)-left,h),band);
        for (const double x:{m_rangeInMs<0?-1:a,m_rangeOutMs<0?-1:b}) {
            if (x>=0 && x<=w) { line({x,0},{x,h},m_marker,2); }
        }
    }
    const QFontMetricsF metrics(m_font);
    m_labelCount=0;
    for (const auto& tick:typedTicks()) {
        const double x=tick.timeMs/m_msPerPx-m_scrollLeftPx;
        line({x,h},{x,h*(tick.major?.7:.84)},m_tick);
        if (tick.label.isEmpty()) { continue; }
        const double textX=m_rulerMode==u"timecode"?std::max(0.0,std::min(x+3,w-metrics.horizontalAdvance(tick.label)-3)):x+3;
        label(tick.label,{textX,h*.36},m_font,m_text); ++m_labelCount;
    }
    m_markerModel.setWindow(m_scrollLeftPx*m_msPerPx,(m_scrollLeftPx+w)*m_msPerPx);
    for (const auto& marker:m_markerModel.rows()) {
        if (marker.durationMs<=0) { continue; }
        const double x=marker.timeMs/m_msPerPx-m_scrollLeftPx;
        QColor span=marker.color.isEmpty()?m_marker:QColor(marker.color); span.setAlphaF(.45*span.alphaF());
        const double left=std::max(0.0,x),right=std::min(w,x+marker.durationMs/m_msPerPx);
        rect(QRectF(left,1,right-left,h*.34-1),span);
    }
    emit painted();
}

void RulerCanvas::setTimeline(TimelineModel* timeline) {
    if (timeline == m_timeline) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    m_markerModel.setTimeline(timeline);
    if (m_timeline) {
        m_tempoKey = tempoKey();
        m_dropFrameKey = m_timeline->timeline().raw.value("dropFrame").toBool();
        connect(m_timeline, &TimelineModel::changed, this, [self=QPointer<RulerCanvas>(this)](const ChangeSet& changes) {
            if (self && (changes.fullReplacement || changes.documentFields.contains("tempo"))) { self->timelineEdited(); }
        });
        connect(m_timeline, &TimelineModel::dropFrameChanged, this, &RulerCanvas::timelineEdited);
        connect(m_timeline, &TimelineModel::markersChanged, this, &RulerCanvas::changedValue);
        connect(m_timeline, &QObject::destroyed, this, &RulerCanvas::changedValue);
    }
    changedValue();
}

QJsonValue RulerCanvas::tempoKey() const {
    return m_timeline ? QJsonValue(m_timeline->timeline().raw.value("tempo")) : QJsonValue();
}

void RulerCanvas::timelineEdited() {
    const QJsonValue tempo = tempoKey();
    const bool dropFrame = m_timeline && m_timeline->timeline().raw.value("dropFrame").toBool();
    if (tempo == m_tempoKey && dropFrame == m_dropFrameKey) { return; }
    m_tempoKey = tempo;
    m_dropFrameKey = dropFrame;
    changedValue();
}

void RulerCanvas::setRulerMode(const QString& mode) {
    if (mode == m_rulerMode) { return; }
    m_rulerMode = mode;
    changedValue();
}

void RulerCanvas::setGridDivision(const QString& division) {
    if (division == m_gridDivision) { return; }
    m_gridDivision = division;
    changedValue();
}

std::vector<nt::wiring::RulerTick> RulerCanvas::typedTicks() const {
    std::vector<nt::wiring::RulerTick> result;
    if (width() <= 0 || !std::isfinite(m_msPerPx) || m_msPerPx <= 0 || !std::isfinite(m_scrollLeftPx)) { return result; }
    nt::wiring::RulerRequest request;
    request.msPerPx = m_msPerPx;
    request.fromMs = m_scrollLeftPx * m_msPerPx;
    request.toMs = request.fromMs + width() * m_msPerPx;
    request.fps = m_fps;
    request.gridDivision = m_gridDivision;
    if (m_timeline) { request.document = m_timeline->timeline().raw; }
    for (const auto& tick : nt::wiring::rulerTicks(m_rulerMode, request)) {
        if (!std::isfinite(tick.timeMs) || tick.timeMs < request.fromMs || tick.timeMs > request.toMs) { continue; }
        result.push_back(tick);
    }
    return result;
}

QVariantList RulerCanvas::ticks() const {
    QVariantList result;
    for (const auto& tick : typedTicks()) {
        result.append(QVariantMap{{"timeMs", tick.timeMs}, {"major", tick.major}, {"label", tick.label}});
    }
    return result;
}
