#include "ui/MonitorMiniTimeline.h"

#include <QMouseEvent>
#include <QPainter>
#include <QPainterPath>

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace {
// Geometry in logical pixels before UI scale, as in filmcraft's monitor.rs.
constexpr double kMinorTick = 3.5;
constexpr double kMajorTick = 8.0;
constexpr double kMinorGap = 12.0;
constexpr double kMajorGap = 110.0;
constexpr double kRangeTop = 8.0;
constexpr double kFlagWidth = 8.0;
constexpr double kFlagHeight = 10.0;
constexpr double kFlagShoulder = 6.5;
constexpr double kPlayheadWidth = 11.0;
constexpr double kPlayheadHeight = 9.0;
constexpr double kPlayheadShoulder = 5.0;
constexpr double kPlayheadRise = 11.0;
constexpr double kBraceArm = 4.0;
constexpr int kMaxTicks = 512;

template <typename T>
bool assign(T& field, const T& value) {
    if (field == value) { return false; }
    field = value;
    return true;
}
}

MonitorMiniTimeline::MonitorMiniTimeline(QQuickItem* parent) : QQuickPaintedItem(parent) {
    setAntialiasing(true);
    setAcceptedMouseButtons(Qt::LeftButton | Qt::RightButton);
    connect(this, &QQuickItem::widthChanged, this, &MonitorMiniTimeline::changedValue);
    connect(this, &QQuickItem::heightChanged, this, &MonitorMiniTimeline::changedValue);
}

void MonitorMiniTimeline::changedValue() {
    emit changed();
    update();
}

void MonitorMiniTimeline::setDurationMs(double v) { if (assign(m_durationMs, std::max(0.0, v))) { changedValue(); } }
void MonitorMiniTimeline::setFps(double v) { if (v > 0 && assign(m_fps, v)) { changedValue(); } }
void MonitorMiniTimeline::setTimeMs(double v) { if (assign(m_timeMs, v)) { changedValue(); } }
void MonitorMiniTimeline::setZoomStart(double v) { if (assign(m_zoomStart, std::clamp(v, 0.0, 1.0))) { changedValue(); } }
void MonitorMiniTimeline::setZoomEnd(double v) { if (assign(m_zoomEnd, std::clamp(v, 0.0, 1.0))) { changedValue(); } }
void MonitorMiniTimeline::setRangeInMs(double v) { if (assign(m_rangeInMs, v)) { changedValue(); } }
void MonitorMiniTimeline::setRangeOutMs(double v) { if (assign(m_rangeOutMs, v)) { changedValue(); } }
void MonitorMiniTimeline::setMarkers(const QVariantList& v) { if (assign(m_markers, v)) { changedValue(); } }
void MonitorMiniTimeline::setUiScale(double v) { if (v > 0 && assign(m_scale, v)) { changedValue(); } }
void MonitorMiniTimeline::setTickColor(const QColor& c) { if (assign(m_tick, c)) { changedValue(); } }
void MonitorMiniTimeline::setRangeColor(const QColor& c) { if (assign(m_range, c)) { changedValue(); } }
void MonitorMiniTimeline::setPlayheadColor(const QColor& c) { if (assign(m_playhead, c)) { changedValue(); } }
void MonitorMiniTimeline::setMarkerColor(const QColor& c) { if (assign(m_marker, c)) { changedValue(); } }

double MonitorMiniTimeline::frameMs() const { return 1000.0 / m_fps; }

// An empty or reversed zoom range shows everything.
double MonitorMiniTimeline::shownStartMs() const {
    return m_zoomStart < m_zoomEnd ? m_zoomStart * m_durationMs : 0.0;
}

double MonitorMiniTimeline::shownEndMs() const {
    return m_zoomStart < m_zoomEnd ? m_zoomEnd * m_durationMs : m_durationMs;
}

double MonitorMiniTimeline::xForTime(double ms) const {
    const double span = std::max(1.0, shownEndMs() - shownStartMs());
    return std::clamp((ms - shownStartMs()) / span, 0.0, 1.0) * width();
}

double MonitorMiniTimeline::timeAt(double x) const {
    const double fraction = std::clamp(x / std::max(1.0, width()), 0.0, 1.0);
    const double ms = shownStartMs() + fraction * (shownEndMs() - shownStartMs());
    return std::clamp(std::round(ms / frameMs()) * frameMs(), 0.0, m_durationMs);
}

int MonitorMiniTimeline::markerAt(double x, double y) const {
    if (y < 0 || y > kFlagHeight * m_scale) { return -1; }
    const double half = kFlagWidth * m_scale / 2;
    for (qsizetype i = m_markers.size() - 1; i >= 0; --i) {
        const double ms = m_markers.at(i).toMap().value(QStringLiteral("timeMs")).toDouble();
        if (ms < shownStartMs() || ms > shownEndMs()) { continue; }
        if (std::abs(xForTime(ms) - x) <= half) { return static_cast<int>(i); }
    }
    return -1;
}

QVariantList MonitorMiniTimeline::tickSteps() const {
    const double span = std::max(1.0, shownEndMs() - shownStartMs());
    const double framePx = frameMs() / span * width();
    const qint64 base = std::max<qint64>(1, std::llround(m_fps));
    std::vector<qint64> steps{1, 2, 5, 10, std::max<qint64>(1, base / 2)};
    for (const qint64 seconds : {1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600}) { steps.push_back(base * seconds); }
    const auto majorIt = std::ranges::find_if(steps, [&](qint64 s) { return s * framePx >= kMajorGap * m_scale; });
    const qint64 major = majorIt != steps.end() ? *majorIt : base * 3600;
    // A step that divides the major one, so every major tick is on a minor one.
    const auto minorIt = std::ranges::find_if(steps, [&](qint64 s) { return major % s == 0 && s * framePx >= kMinorGap * m_scale; });
    return {QVariant::fromValue(minorIt != steps.end() ? *minorIt : major), QVariant::fromValue(major)};
}

void MonitorMiniTimeline::paint(QPainter* painter) {
    ++m_paintCount;
    const double w = width();
    const double h = height();
    const double s = m_scale;
    if (w <= 0 || h <= 0 || m_durationMs <= 0) {
        emit painted();
        return;
    }
    const double startMs = shownStartMs();
    const double endMs = shownEndMs();
    const auto shows = [&](double ms) { return ms >= startMs && ms <= endMs; };

    // Ticks on whole frames.
    const QVariantList steps = tickSteps();
    const qint64 minor = steps.at(0).toLongLong();
    const qint64 major = steps.at(1).toLongLong();
    QPen tickPen(m_tick);
    tickPen.setWidthF(1.0);
    tickPen.setCapStyle(Qt::FlatCap);
    painter->setPen(tickPen);
    qint64 frame = static_cast<qint64>(std::floor(startMs / frameMs())) / minor * minor;
    for (int i = 0; i < kMaxTicks; ++i, frame += minor) {
        const double ms = static_cast<double>(frame) * frameMs();
        if (ms > endMs + 0.5) { break; }
        if (ms < startMs - 0.5) { continue; }
        const double x = std::round(xForTime(ms)) + 0.5;
        const double tick = (frame % major == 0 ? kMajorTick : kMinorTick) * s;
        painter->drawLine(QPointF(x, h - tick), QPointF(x, h));
    }

    // The in/out range. Out includes its frame, so the band ends at the next boundary.
    const bool hasIn = m_rangeInMs >= 0;
    const bool hasOut = m_rangeOutMs >= 0;
    if (hasIn || hasOut) {
        const double inMs = hasIn ? m_rangeInMs : 0.0;
        const double outMs = hasOut ? m_rangeOutMs + frameMs() : m_durationMs;
        const double a = xForTime(inMs);
        const double b = std::max(a, xForTime(outMs));
        const double top = kRangeTop * s;
        painter->fillRect(QRectF(a, top, b - a, h - top), m_range);
        QPen bracePen(m_playhead);
        bracePen.setWidthF(1.0);
        painter->setPen(bracePen);
        painter->setBrush(Qt::NoBrush);
        const double mid = (top + h) / 2;
        struct Edge { bool set; double x; double direction; double ms; };
        for (const Edge edge : std::array{Edge{hasIn, a, 1.0, inMs}, Edge{hasOut, b, -1.0, outMs}}) {
            if (!edge.set || !shows(edge.ms)) { continue; }
            const auto at = [&](double offset, double y) { return QPointF(edge.x + edge.direction * offset * s, y); };
            const std::array points{at(kBraceArm, top), at(2.8, top), at(2.0, top + s), at(2.0, mid - 2 * s),
                                    at(1.4, mid - s), at(0.0, mid), at(1.4, mid + s), at(2.0, mid + 2 * s),
                                    at(2.0, h - s), at(2.8, h), at(kBraceArm, h)};
            painter->drawPolyline(points.data(), static_cast<int>(points.size()));
        }
    }

    // Marker flags: a pentagon in the marker's colour.
    painter->setPen(Qt::NoPen);
    const double half = kFlagWidth * s / 2;
    for (const QVariant& value : std::as_const(m_markers)) {
        const QVariantMap marker = value.toMap();
        const double ms = marker.value(QStringLiteral("timeMs")).toDouble();
        if (!shows(ms)) { continue; }
        const QString color = marker.value(QStringLiteral("color")).toString();
        painter->setBrush(color.isEmpty() ? m_marker : QColor(color));
        const double x = xForTime(ms);
        const std::array flag{QPointF(x - half, 0), QPointF(x + half, 0), QPointF(x + half, kFlagShoulder * s),
                              QPointF(x, kFlagHeight * s), QPointF(x - half, kFlagShoulder * s)};
        painter->drawPolygon(flag.data(), static_cast<int>(flag.size()));
    }

    // The playhead: a pentagon over a 1 px line.
    if (shows(m_timeMs)) {
        const double x = xForTime(m_timeMs);
        const double hy = h - kPlayheadRise * s;
        const double hw = kPlayheadWidth * s / 2;
        painter->setBrush(m_playhead);
        const std::array head{QPointF(x - hw, hy), QPointF(x + hw, hy), QPointF(x + hw, hy + kPlayheadShoulder * s),
                              QPointF(x, hy + kPlayheadHeight * s), QPointF(x - hw, hy + kPlayheadShoulder * s)};
        painter->drawPolygon(head.data(), static_cast<int>(head.size()));
        painter->fillRect(QRectF(x - 0.5, hy + kPlayheadHeight * s - s, 1.0, h - hy - kPlayheadHeight * s + s), m_playhead);
    }
    emit painted();
}

void MonitorMiniTimeline::setScrubbing(bool on) {
    if (assign(m_scrubbing, on)) { emit scrubbingChanged(); }
}

void MonitorMiniTimeline::mousePressEvent(QMouseEvent* event) {
    const QPointF at = event->position();
    m_pressedMarker = markerAt(at.x(), at.y());
    m_dragged = false;
    if (event->button() == Qt::RightButton) {
        if (m_pressedMarker >= 0) { emit markerMenuRequested(m_pressedMarker, at.x(), at.y()); }
        m_pressedMarker = -1;
        event->accept();
        return;
    }
    if (event->button() != Qt::LeftButton) {
        event->ignore();
        return;
    }
    event->accept();
    setKeepMouseGrab(true);
    if (m_pressedMarker < 0) { emit seekRequested(timeAt(at.x())); }
}

void MonitorMiniTimeline::mouseMoveEvent(QMouseEvent* event) {
    if (!(event->buttons() & Qt::LeftButton) || m_pressedMarker >= 0) { return; }
    m_dragged = true;
    setScrubbing(true);
    emit scrubRequested(timeAt(event->position().x()));
}

void MonitorMiniTimeline::mouseReleaseEvent(QMouseEvent* event) {
    const int pressed = m_pressedMarker;
    m_pressedMarker = -1;
    setKeepMouseGrab(false);
    if (event->button() != Qt::LeftButton) { return; }
    if (m_scrubbing) {
        setScrubbing(false);
        emit seekRequested(timeAt(event->position().x()));
    } else if (pressed >= 0 && markerAt(event->position().x(), event->position().y()) == pressed) {
        emit markerClicked(pressed, static_cast<int>(event->modifiers()));
    }
}

void MonitorMiniTimeline::mouseDoubleClickEvent(QMouseEvent* event) {
    const int index = markerAt(event->position().x(), event->position().y());
    if (event->button() == Qt::LeftButton && index >= 0) {
        m_pressedMarker = -1;
        emit markerDoubleClicked(index);
        event->accept();
        return;
    }
    mousePressEvent(event);
}

void MonitorMiniTimeline::mouseUngrabEvent() {
    m_pressedMarker = -1;
    setKeepMouseGrab(false);
    setScrubbing(false);
}
