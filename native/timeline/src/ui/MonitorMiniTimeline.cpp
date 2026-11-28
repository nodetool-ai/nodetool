#include "ui/MonitorMiniTimeline.h"

#include <QMouseEvent>
#include <QPainter>
#include <QPainterPath>
#include <QQuickWindow>

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

namespace {
// Parent-owned. UI-thread geometry, render-thread paint while the UI thread is blocked.
class MiniPlayhead final : public QQuickPaintedItem {
public:
    explicit MiniPlayhead(MonitorMiniTimeline* parent) : QQuickPaintedItem(parent), owner(parent) {
        setAcceptedMouseButtons(Qt::NoButton);
        setAntialiasing(true);
    }
    void paint(QPainter* painter) override {
        const double s=owner->uiScale(), x=width()/2, h=height();
        const double hy=h-kPlayheadRise*s, hw=kPlayheadWidth*s/2;
        painter->setPen(Qt::NoPen);
        painter->setBrush(owner->playheadColor());
        const std::array head{QPointF(x-hw,hy),QPointF(x+hw,hy),QPointF(x+hw,hy+kPlayheadShoulder*s),
            QPointF(x,hy+kPlayheadHeight*s),QPointF(x-hw,hy+kPlayheadShoulder*s)};
        painter->drawPolygon(head.data(),static_cast<int>(head.size()));
        painter->fillRect(QRectF(x-0.5,hy+kPlayheadHeight*s-s,1,h-hy-kPlayheadHeight*s+s),owner->playheadColor());
    }
private:
    MonitorMiniTimeline* owner; // Borrowed parent outlives its child.
};
}

MonitorMiniTimeline::MonitorMiniTimeline(QQuickItem* parent) : QQuickPaintedItem(parent) {
    // NOLINTNEXTLINE(cppcoreguidelines-owning-memory): parented to this
    m_playheadItem=new MiniPlayhead(this);
    m_playheadItem->setObjectName(QStringLiteral("monitorMiniPlayhead"));
    setClip(true);
    setAntialiasing(true);
    setAcceptedMouseButtons(Qt::LeftButton | Qt::RightButton);
    connect(this, &QQuickItem::widthChanged, this, &MonitorMiniTimeline::changedBackdrop);
    connect(this, &QQuickItem::heightChanged, this, &MonitorMiniTimeline::changedBackdrop);
}

void MonitorMiniTimeline::positionPlayhead() {
    const QSizeF size(kPlayheadWidth*m_scale+2,height());
    if (m_playheadItem->size()!=size) { m_playheadItem->setSize(size); }
    m_playheadItem->setX(xForTime(m_timeMs)-size.width()/2);
    m_playheadItem->setVisible(m_durationMs>0 && m_timeMs>=shownStartMs() && m_timeMs<=shownEndMs());
}

void MonitorMiniTimeline::changedValue() {
    positionPlayhead();
    emit changed();
    update();
}

void MonitorMiniTimeline::changedBackdrop() {
    m_backdropDirty = true;
    m_playheadItem->update();
    changedValue();
}

void MonitorMiniTimeline::setDurationMs(double v) { if (assign(m_durationMs, std::max(0.0, v))) { changedBackdrop(); } }
void MonitorMiniTimeline::setFps(double v) { if (v > 0 && assign(m_fps, v)) { changedBackdrop(); } }
void MonitorMiniTimeline::setTimeMs(double v) { if (assign(m_timeMs, v)) { positionPlayhead(); emit changed(); } }
void MonitorMiniTimeline::setZoomStart(double v) { if (assign(m_zoomStart, std::clamp(v, 0.0, 1.0))) { changedBackdrop(); } }
void MonitorMiniTimeline::setZoomEnd(double v) { if (assign(m_zoomEnd, std::clamp(v, 0.0, 1.0))) { changedBackdrop(); } }
void MonitorMiniTimeline::setRangeInMs(double v) { if (assign(m_rangeInMs, v)) { changedBackdrop(); } }
void MonitorMiniTimeline::setRangeOutMs(double v) { if (assign(m_rangeOutMs, v)) { changedBackdrop(); } }
void MonitorMiniTimeline::setMarkers(const QVariantList& v) { if (assign(m_markers, v)) { changedBackdrop(); } }
void MonitorMiniTimeline::setUiScale(double v) { if (v > 0 && assign(m_scale, v)) { changedBackdrop(); } }
void MonitorMiniTimeline::setTickColor(const QColor& c) { if (assign(m_tick, c)) { changedBackdrop(); } }
void MonitorMiniTimeline::setRangeColor(const QColor& c) { if (assign(m_range, c)) { changedBackdrop(); } }
void MonitorMiniTimeline::setPlayheadColor(const QColor& c) { if (assign(m_playhead, c)) { changedBackdrop(); } }
void MonitorMiniTimeline::setMarkerColor(const QColor& c) { if (assign(m_marker, c)) { changedBackdrop(); } }

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

void MonitorMiniTimeline::rebuildBackdrop(double dpr) {
    const double w = width();
    const double h = height();
    const double s = m_scale;
    const QSize pixelSize(std::max(1, static_cast<int>(std::ceil(w * dpr))),
                          std::max(1, static_cast<int>(std::ceil(h * dpr))));
    if (m_backdrop.size() != pixelSize || m_backdrop.format() != QImage::Format_ARGB32_Premultiplied) {
        m_backdrop = QImage(pixelSize, QImage::Format_ARGB32_Premultiplied);
    }
    m_backdrop.setDevicePixelRatio(dpr);
    m_backdrop.fill(Qt::transparent);

    QPainter bp(&m_backdrop);
    bp.setRenderHint(QPainter::Antialiasing, true);

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
    bp.setPen(tickPen);
    qint64 frame = static_cast<qint64>(std::floor(startMs / frameMs())) / minor * minor;
    for (int i = 0; i < kMaxTicks; ++i, frame += minor) {
        const double ms = static_cast<double>(frame) * frameMs();
        if (ms > endMs + 0.5) { break; }
        if (ms < startMs - 0.5) { continue; }
        const double x = std::round(xForTime(ms)) + 0.5;
        const double tick = (frame % major == 0 ? kMajorTick : kMinorTick) * s;
        bp.drawLine(QPointF(x, h - tick), QPointF(x, h));
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
        bp.fillRect(QRectF(a, top, b - a, h - top), m_range);
        QPen bracePen(m_playhead);
        bracePen.setWidthF(1.0);
        bp.setPen(bracePen);
        bp.setBrush(Qt::NoBrush);
        const double mid = (top + h) / 2;
        struct Edge { bool set; double x; double direction; double ms; };
        for (const Edge edge : std::array{Edge{hasIn, a, 1.0, inMs}, Edge{hasOut, b, -1.0, outMs}}) {
            if (!edge.set || !shows(edge.ms)) { continue; }
            const auto at = [&](double offset, double y) { return QPointF(edge.x + edge.direction * offset * s, y); };
            const std::array points{at(kBraceArm, top), at(2.8, top), at(2.0, top + s), at(2.0, mid - 2 * s),
                                    at(1.4, mid - s), at(0.0, mid), at(1.4, mid + s), at(2.0, mid + 2 * s),
                                    at(2.0, h - s), at(2.8, h), at(kBraceArm, h)};
            bp.drawPolyline(points.data(), static_cast<int>(points.size()));
        }
    }

    // Marker flags: a pentagon in the marker's colour.
    bp.setPen(Qt::NoPen);
    const double half = kFlagWidth * s / 2;
    for (const QVariant& value : std::as_const(m_markers)) {
        const QVariantMap marker = value.toMap();
        const double ms = marker.value(QStringLiteral("timeMs")).toDouble();
        if (!shows(ms)) { continue; }
        const QString color = marker.value(QStringLiteral("color")).toString();
        bp.setBrush(color.isEmpty() ? m_marker : QColor(color));
        const double x = xForTime(ms);
        const std::array flag{QPointF(x - half, 0), QPointF(x + half, 0), QPointF(x + half, kFlagShoulder * s),
                              QPointF(x, kFlagHeight * s), QPointF(x - half, kFlagShoulder * s)};
        bp.drawPolygon(flag.data(), static_cast<int>(flag.size()));
    }

    m_backdropDpr = dpr;
    m_backdropDirty = false;
}

void MonitorMiniTimeline::paint(QPainter* painter) {
    ++m_paintCount;
    const double w = width();
    const double h = height();
    if (w <= 0 || h <= 0 || m_durationMs <= 0) {
        emit painted();
        return;
    }
    const double dpr = window() ? window()->effectiveDevicePixelRatio() : 1.0;
    const QSize pixelSize(std::max(1, static_cast<int>(std::ceil(w * dpr))),
                          std::max(1, static_cast<int>(std::ceil(h * dpr))));
    if (m_backdropDirty || m_backdrop.size() != pixelSize || std::abs(m_backdropDpr - dpr) > 1e-6) {
        rebuildBackdrop(dpr);
    }
    painter->drawImage(QPointF(0, 0), m_backdrop);

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
