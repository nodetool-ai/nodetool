// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#include "ui/MonitorViewState.h"
#include "ui/MonitorViewMath.h"

#include <QVariantMap>
#include <algorithm>
#include <cmath>
#include <vector>

namespace {
std::vector<MonitorViewState*>& liveInstances() {
    static std::vector<MonitorViewState*> instances;
    return instances;
}
bool positiveSize(QSizeF size) {
    return std::isfinite(size.width()) && std::isfinite(size.height()) && size.width() > 0 && size.height() > 0;
}
bool finitePoint(QPointF point) {
    return std::isfinite(point.x()) && std::isfinite(point.y());
}
bool validResolution(int value) { return value == 1 || value == 2 || value == 4 || value == 8; }
double guidePosition(bool vertical, double position, QSizeF canvas) {
    return std::clamp(std::round(position), 0.0, std::max(0.0, std::floor(vertical ? canvas.width() : canvas.height())));
}
}

MonitorViewState::MonitorViewState(QObject* parent) : QObject(parent) { liveInstances().push_back(this); }
MonitorViewState::~MonitorViewState() { std::erase(liveInstances(), this); }
MonitorViewState* MonitorViewState::current() {
    return liveInstances().empty() ? nullptr : liveInstances().back();
}

MonitorViewState* MonitorViewState::forOwner(const QObject* owner) {
    if (owner) {
        for (auto* instance : liveInstances()) {
            if (instance->m_owner == owner) { return instance; }
        }
    }
    return current();
}
void MonitorViewState::setOwner(QObject* value) {
    if (m_owner == value) { return; }
    m_owner = value;
    emit ownerChanged();
}

void MonitorViewState::setViewportSize(QSizeF value) {
    if (!positiveSize(value) || value == m_viewportSize) { return; }
    m_viewportSize = value;
    recompute();
    emit viewportSizeChanged();
}
void MonitorViewState::setCanvasSize(QSizeF value) {
    if (!positiveSize(value) || value == m_canvasSize) { return; }
    m_canvasSize = value;
    const auto previous = m_guides;
    m_guides.removeIf([value](const QVariant& guide) {
        const auto entry = guide.toMap();
        return entry.value("position").toDouble() > (entry.value("vertical").toBool() ? value.width() : value.height());
    });
    recompute();
    if (previous != m_guides) { emit guidesChanged(); }
    emit canvasSizeChanged();
}
void MonitorViewState::setDevicePixelRatio(qreal value) {
    if (!std::isfinite(value) || value <= 0 || value == m_devicePixelRatio) { return; }
    m_devicePixelRatio = value;
    recompute();
    emit devicePixelRatioChanged();
}
void MonitorViewState::setFitInset(qreal value) {
    if (!std::isfinite(value) || value < 0 || value == m_fitInset) { return; }
    m_fitInset = value;
    recompute();
    emit fitInsetChanged();
}
void MonitorViewState::setPlaybackResolution(int value) {
    if (!validResolution(value) || value == m_playbackResolution) { return; }
    m_playbackResolution = value;
    emit playbackResolutionChanged();
}
void MonitorViewState::setPausedResolution(int value) {
    if (!validResolution(value) || value == m_pausedResolution) { return; }
    m_pausedResolution = value;
    emit pausedResolutionChanged();
}
void MonitorViewState::setSafeMargins(bool value) {
    if (value == m_safeMargins) { return; }
    m_safeMargins = value;
    emit safeMarginsChanged();
}
void MonitorViewState::setRulers(bool value) {
    if (value == m_rulers) { return; }
    m_rulers = value;
    emit rulersChanged();
}
void MonitorViewState::setGuidesVisible(bool value) {
    if (value == m_guidesVisible) { return; }
    m_guidesVisible = value;
    emit guidesVisibleChanged();
}
void MonitorViewState::setGuidesLocked(bool value) {
    if (value == m_guidesLocked) { return; }
    m_guidesLocked = value;
    emit guidesLockedChanged();
}
void MonitorViewState::setTransparencyGrid(bool value) {
    if (value == m_transparencyGrid) { return; }
    m_transparencyGrid = value;
    emit transparencyGridChanged();
}
void MonitorViewState::setShowControls(bool value) {
    if (value == m_showControls) { return; }
    m_showControls = value;
    emit showControlsChanged();
}
void MonitorViewState::setDisplayMode(QString value) {
    if (value.isEmpty() || value == m_displayMode) { return; }
    m_displayMode = value;
    emit displayModeChanged();
}

QStringList MonitorViewState::applyState(const QVariantMap& state) {
    QStringList unknown;
    for (auto it = state.begin(); it != state.end(); ++it) {
        const QString& key = it.key();
        if (key == u"zoomPercent") {
            setZoomPercent(it.value().toDouble());
        } else if (key == u"guides") {
            for (const auto& guide : it.value().toList()) {
                const auto entry = guide.toMap();
                addGuide(entry.value("vertical").toBool(), entry.value("position").toDouble());
            }
        } else if (key == u"playbackResolution" || key == u"pausedResolution" || key == u"safeMargins" || key == u"rulers" ||
                   key == u"guidesVisible" || key == u"guidesLocked" || key == u"transparencyGrid" ||
                   key == u"showControls" || key == u"displayMode") {
            setProperty(key.toLatin1().constData(), it.value());
        } else {
            unknown.append(key);
        }
    }
    return unknown;
}

void MonitorViewState::setFit() {
    m_explicitZoom.reset();
    recompute(QPointF());
}
void MonitorViewState::setZoomPercent(double percent) {
    if (!std::isfinite(percent) || percent <= 0) { return; }
    m_explicitZoom = std::clamp(percent / 100, nt::ui::monitor::kMinZoom, nt::ui::monitor::kMaxZoom);
    recompute(QPointF());
}
void MonitorViewState::zoomAt(QPointF pointer, double factor) {
    if (!finitePoint(pointer) || !std::isfinite(factor) || factor <= 0 || factor == 1 || m_pictureRect.isEmpty()) { return; }
    const auto result = nt::ui::monitor::zoomAbout(pointer, std::clamp(factor, 0.5, 2.0), m_pictureRect,
                                                 m_viewportSize, m_canvasSize, m_devicePixelRatio);
    m_explicitZoom = result.zoom;
    recompute(result.pan);
}
void MonitorViewState::zoomByWheelNotches(QPointF pointer, double notches) {
    if (!std::isfinite(notches) || notches == 0) { return; }
    zoomAt(pointer, std::exp(std::clamp(notches * std::log(1.1), std::log(0.5), std::log(2.0))));
}
void MonitorViewState::panBy(QPointF delta) {
    if (!m_explicitZoom || !finitePoint(delta)) { return; }
    recompute(m_pan + delta);
}
int MonitorViewState::addGuide(bool vertical, double position) {
    if (!std::isfinite(position)) { return -1; }
    m_guides.append(QVariantMap{{"vertical", vertical}, {"position", guidePosition(vertical, position, m_canvasSize)}});
    setGuidesVisible(true);
    emit guidesChanged();
    return static_cast<int>(m_guides.size() - 1);
}
void MonitorViewState::moveGuide(int index, double position) {
    if (m_guidesLocked || index < 0 || index >= m_guides.size() || !std::isfinite(position)) { return; }
    auto entry = m_guides.at(index).toMap();
    const double value = guidePosition(entry.value("vertical").toBool(), position, m_canvasSize);
    if (entry.value("position").toDouble() == value) { return; }
    entry.insert("position", value);
    m_guides[index] = entry;
    emit guidesChanged();
}
void MonitorViewState::removeGuide(int index) {
    if (m_guidesLocked || index < 0 || index >= m_guides.size()) { return; }
    m_guides.removeAt(index);
    emit guidesChanged();
}
void MonitorViewState::clearGuides() {
    if (m_guides.isEmpty()) { return; }
    m_guides.clear();
    emit guidesChanged();
}

void MonitorViewState::recompute(std::optional<QPointF> pan) {
    const auto oldFit = m_fit;
    const auto oldZoom = m_zoom;
    const auto oldPan = m_pan;
    const auto oldPictureRect = m_pictureRect;
    const auto oldVisibleItemRect = m_visibleItemRect;
    const auto oldVisibleCanvasRect = m_visibleCanvasRect;
    const auto oldCanPan = m_canPan;
    m_fit = !m_explicitZoom;
    m_pictureRect = nt::ui::monitor::pictureRect(m_viewportSize, m_canvasSize, m_explicitZoom,
                                               pan.value_or(m_pan), m_devicePixelRatio, m_fitInset);
    m_zoom = m_explicitZoom.value_or(m_pictureRect.isEmpty() ? 0 : m_pictureRect.width() * m_devicePixelRatio / m_canvasSize.width());
    m_pan = !m_fit && !m_pictureRect.isEmpty()
        ? m_pictureRect.center() - QPointF(m_viewportSize.width() / 2, m_viewportSize.height() / 2) : QPointF();
    const auto visible = nt::ui::monitor::visibleRegion(m_pictureRect, m_viewportSize, m_devicePixelRatio);
    m_visibleItemRect = visible.item;
    m_visibleCanvasRect = visible.canvas;
    m_canPan = !m_pictureRect.isEmpty() && (m_pictureRect.width() > m_viewportSize.width() || m_pictureRect.height() > m_viewportSize.height());
    if (m_fit != oldFit) { emit fitChanged(); }
    if (m_zoom != oldZoom) { emit zoomChanged(); }
    if (m_pan != oldPan) { emit panChanged(); }
    if (m_pictureRect != oldPictureRect) { emit pictureRectChanged(); }
    if (m_visibleItemRect != oldVisibleItemRect) { emit visibleItemRectChanged(); }
    if (m_visibleCanvasRect != oldVisibleCanvasRect) { emit visibleCanvasRectChanged(); }
    if (m_canPan != oldCanPan) { emit canPanChanged(); }
}
