#include "TransformGizmoController.h"
#include "edit/ClipGestureController.h"
#include "preview/FfmpegSource.h"
#include "ui/MediaVersion.h"

#include <QCoreApplication>
#include <QCursor>
#include <QHoverEvent>
#include <QFocusEvent>
#include <QImageReader>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QPainter>
#include <QPainterPath>
#include <QThreadPool>
#include <algorithm>
#include <array>
#include <cmath>
#include <numbers>

namespace {
const QStringList scaleHandles{"tl", "tr", "br", "bl", "t", "r", "b", "l"};
constexpr double handleSize = 8;
constexpr double rotationRadius = handleSize * 0.7;
constexpr double pivotSize = 8;
QColor primary(double alpha = 1) { return QColor::fromRgbF(0, 120.0 / 255, 1, alpha); }
QPolygonF polygon(const nt::gizmo::Geometry& box) {
    QPolygonF result;
    for (auto p : box.corners) { result.append(p); }
    return result;
}
Qt::CursorShape cursorFor(const QString& target, const nt::gizmo::Geometry& box) {
    if (scaleHandles.contains(target)) {
        auto axis = box.handle(target) - box.center;
        if (target.size() == 2) {
            const auto normalized = [](QPointF vector) {
                const double length = std::hypot(vector.x(), vector.y());
                return length > 0 ? vector / length : QPointF();
            };
            axis = normalized(box.handle(target.contains('r') ? "r" : "l") - box.center) +
                   normalized(box.handle(target.contains('b') ? "b" : "t") - box.center);
        }
        const int direction = (static_cast<int>(std::round(std::atan2(axis.y(), axis.x()) / (std::numbers::pi / 4))) % 4 + 4) % 4;
        constexpr std::array cursors{Qt::SizeHorCursor, Qt::SizeFDiagCursor, Qt::SizeVerCursor, Qt::SizeBDiagCursor};
        return cursors[static_cast<size_t>(direction)];
    }
    if (target == "rotate") { return Qt::OpenHandCursor; }
    return target.isEmpty() ? Qt::ArrowCursor : Qt::SizeAllCursor;
}
}
TransformGizmoController::TransformGizmoController(QQuickItem* parent) : QQuickPaintedItem(parent) {
    setAcceptedMouseButtons(Qt::LeftButton | Qt::RightButton);
    setAcceptHoverEvents(true);
    setAntialiasing(true);
    connect(this, &QQuickItem::widthChanged, this, &TransformGizmoController::refresh);
    connect(this, &QQuickItem::heightChanged, this, &TransformGizmoController::refresh);
    connect(this, &QQuickItem::activeFocusChanged, this, [this]() { update(); });
}
TransformGizmoController::~TransformGizmoController() { cancel(); }
void TransformGizmoController::setTimeline(TimelineModel* value) {
    if (m_timeline == value) { return; }
    cancel();
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = value;
    ++m_probeEpoch;
    m_dimensions.clear();
    m_probing.clear();
    if (value) {
        connect(value, &TimelineModel::beforeCommand, this, &TransformGizmoController::cancel);
        connect(value, &TimelineModel::clipsChanged, this, [this]() {
            // Another edit owns the document now. Never restore a stale gesture over it.
            if (m_drag && !m_writing && m_timeline->clipsJson() != m_lastPreview) { m_drag.reset(); clearPointerFeedback(); }
            refresh();
        });
        connect(value, &TimelineModel::documentReplaced, this, [this]() {
            m_drag.reset();
            clearPointerFeedback();
            ++m_probeEpoch;
            m_dimensions.clear();
            m_probing.clear();
        });
        connect(value, &QObject::destroyed, this, [this]() { m_drag.reset(); clearPointerFeedback(); refresh(); });
    }
    emit bindingsChanged();
    refresh();
}
void TransformGizmoController::setClock(PlaybackClock* value) {
    if (m_clock == value) { return; }
    cancel();
    if (m_clock) { disconnect(m_clock, nullptr, this, nullptr); }
    m_clock = value;
    if (value) { connect(value, &PlaybackClock::timeChanged, this, &TransformGizmoController::refresh); }
    emit bindingsChanged();
    refresh();
}
void TransformGizmoController::setSelection(const QStringList& value) {
    if (m_selection == value) { return; }
    cancel();
    m_selection = value;
    emit bindingsChanged();
    refresh();
}
void TransformGizmoController::discover() {
    QQuickItem* root = nullptr;
    for (auto* item = parentItem(); item; item = item->parentItem()) {
        if (item->property("timeline").value<TimelineModel*>() && item->property("clock").value<PlaybackClock*>()) {
            root = item;
        }
    }
    if (!root) { return; }
    setTimeline(root->property("timeline").value<TimelineModel*>());
    setClock(root->property("clock").value<PlaybackClock*>());
    for (const auto& connection : m_monitorConnections) { disconnect(connection); }
    m_monitorConnections.clear();
    QList<QQuickItem*> pending{root};
    QPointer<ClipGestureController> gestures;
    while (!pending.isEmpty()) {
        auto* item = pending.takeLast();
        if (item->objectName() == "previewCompositor") { m_monitor = item; }
        if (auto* controller = qobject_cast<ClipGestureController*>(item)) { gestures = controller; }
        pending.append(item->childItems());
    }
    if (gestures) {
        setSelection(gestures->selection());
        m_monitorConnections.append(connect(gestures, &ClipGestureController::selectionChanged, this, [this, gestures]() {
            if (gestures) { setSelection(gestures->selection()); }
        }));
    }
    for (auto* item = m_monitor.data(); item; item = item->parentItem()) {
        m_monitorConnections.append(connect(item, &QQuickItem::xChanged, this, &TransformGizmoController::refresh));
        m_monitorConnections.append(connect(item, &QQuickItem::yChanged, this, &TransformGizmoController::refresh));
        m_monitorConnections.append(connect(item, &QQuickItem::widthChanged, this, &TransformGizmoController::refresh));
        m_monitorConnections.append(connect(item, &QQuickItem::heightChanged, this, &TransformGizmoController::refresh));
    }
    refresh();
}
void TransformGizmoController::probe(const QString& path) {
    const QString version = nt::ui::mediaVersionKey(path);
    if (path.isEmpty() || m_dimensions.contains(version) || m_probing.contains(version)) { return; }
    m_probing.insert(version);
    const QPointer<TransformGizmoController> self(this);
    const quint64 epoch = m_probeEpoch;
    QThreadPool::globalInstance()->start([self, path, version, epoch]() {
        // Image headers give dimensions without decoding the picture.
        QImageReader reader(path);
        QSize size = reader.size();
        if (size.isEmpty()) {
            const auto facts = nt::probeMedia(path.toStdString());
            if (facts.opened) { size = {facts.width, facts.height}; }
        }
        QMetaObject::invokeMethod(QCoreApplication::instance(), [self, path, version, epoch, size]() {
            if (!self || self->m_probeEpoch != epoch) { return; }
            self->m_probing.remove(version);
            if (nt::ui::mediaVersionKey(path) != version) { self->refresh(); return; }
            self->m_dimensions.insert(version, size);
            self->refresh();
        });
    });
}
void TransformGizmoController::refresh() {
    const bool wasAvailable = m_available;
    const auto previousBox = m_box;
    const auto origin = m_monitor ? m_monitor->mapToItem(this, QPointF()) : QPointF();
    m_available = false;
    const auto frame = m_monitor ? m_monitor->size() : size();
    if (m_timeline && m_clock && m_selection.size() == 1 && frame.width() > 0 && frame.height() > 0 &&
        m_timeline->canvasWidth() > 0 && m_timeline->canvasHeight() > 0) {
        const auto& timeline = m_timeline->timeline();
        const auto id = m_selection.first().toStdString();
        const auto clip = std::find_if(timeline.clips.begin(), timeline.clips.end(), [&](const auto& c) { return c.id == id; });
        if (clip != timeline.clips.end() && (clip->mediaType == nt::MediaType::Video || clip->mediaType == nt::MediaType::Image)) {
            const auto layers = nt::activeLayersAt(timeline, m_clock->time());
            const auto layer = std::find_if(layers.begin(), layers.end(), [&](const auto& l) {
                return l.clipId == id && (l.kind == "video" || l.kind == "image");
            });
            if (layer != layers.end()) {
                QSize dimensions(clip->width.value_or(0), clip->height.value_or(0));
                if (dimensions.isEmpty() && !clip->mediaPath.empty()) {
                    const auto path = QString::fromStdString(clip->mediaPath);
                    const auto version = nt::ui::mediaVersionKey(path);
                    dimensions = m_dimensions.value(version);
                    probe(path);
                }
                if (!dimensions.isEmpty()) {
                    m_clipId = m_selection.first();
                    m_stored = nt::gizmo::transformOf(clip->raw);
                    m_display = layer->transform.value_or(nt::ClipTransform{});
                    m_space = {dimensions, {double(timeline.width), double(timeline.height)}, frame,
                               layer->parentMatrix, clip->raw.value("crop").toObject()};
                    m_box = nt::gizmo::geometry(m_display, m_space);
                    m_available = true;
                }
            }
        }
    }
    setActiveFocusOnTab(m_available);
    if (!m_available && hasActiveFocus() && !m_drag) { setFocus(false); }
    const bool changed = m_available != wasAvailable || m_box.corners != previousBox.corners ||
        m_box.center != previousBox.center || m_box.pivot != previousBox.pivot ||
        m_origin != origin || m_frame != frame;
    m_origin = origin;
    m_frame = frame;
    if (changed) {
        update();
        emit geometryChanged();
    }
}
bool TransformGizmoController::begin(const QString& target, QPointF pointer) {
    if (!m_available || !m_timeline || (!scaleHandles.contains(target) && target != "body" && target != "pivot" && target != "rotate")) { return false; }
    end();
    m_before = m_timeline->clipsJson();
    m_lastPreview = m_before;
    m_generation = m_timeline->documentGeneration();
    for (const auto& value : m_before) {
        if (value.toObject().value("id") == m_clipId) { m_startClip = value.toObject(); break; }
    }
    m_drag = nt::gizmo::Drag{target, m_stored, m_display, m_space, pointer, m_box};
    m_dragCursor = cursorFor(target, m_box);
    m_hover = target;
    setCursor(QCursor(m_dragCursor));
    update();
    return true;
}
void TransformGizmoController::write(const nt::ClipTransform& next) {
    if (!m_timeline || m_generation != m_timeline->documentGeneration()) { m_drag.reset(); clearPointerFeedback(); return; }
    const double rel = (m_clock ? m_clock->currentTimeMs() : 0) - m_startClip.value("startMs").toDouble();
    const auto at = rel >= 0 && rel <= m_startClip.value("durationMs").toDouble() ? std::optional<double>(rel) : std::nullopt;
    const auto patch = nt::gizmo::transformPatch(m_startClip, next, at);
    auto after = m_before;
    auto clip = m_startClip;
    for (auto it = patch.begin(); it != patch.end(); ++it) { clip.insert(it.key(), it.value()); }
    for (int i = 0; i < after.size(); ++i) {
        if (after[i].toObject().value("id") == m_startClip.value("id")) { after[i] = clip; break; }
    }
    m_lastPreview = after;
    m_writing = true;
    m_timeline->replaceClips(after);
    m_writing = false;
}
void TransformGizmoController::move(QPointF pointer, bool shift) {
    if (m_drag) { write(m_drag->update(pointer, shift)); }
}
void TransformGizmoController::end() {
    clearPointerFeedback();
    if (!m_drag) { return; }
    m_drag.reset();
    if (m_timeline && m_generation == m_timeline->documentGeneration() && m_timeline->clipsJson() == m_lastPreview) {
        m_timeline->commitEdit(tr("Transform"), m_before, m_lastPreview);
    }
}
void TransformGizmoController::cancel() {
    clearPointerFeedback();
    if (!m_drag) { return; }
    m_drag.reset();
    if (m_timeline && m_generation == m_timeline->documentGeneration() && m_timeline->clipsJson() == m_lastPreview) {
        m_timeline->replaceClips(m_before);
    }
}
void TransformGizmoController::clearPointerFeedback() {
    m_hover.clear();
    unsetCursor();
    setKeepMouseGrab(false);
    update();
}
void TransformGizmoController::action(const QString& name) {
    if (!m_available || !m_timeline) { return; }
    auto next = m_stored;
    if (name == "reset") { next = {}; }
    else if (name == "rotate180") { next.rotation += std::numbers::pi; }
    else if (name == "rotate90CW") { next.rotation += std::numbers::pi / 2; }
    else if (name == "rotate90CCW") { next.rotation -= std::numbers::pi / 2; }
    else if (name == "flipHorizontal") { next.scale.x = -next.scale.x; }
    else if (name == "flipVertical") { next.scale.y = -next.scale.y; }
    else { return; }
    if (begin("body", m_box.center)) { write(next); end(); }
}
bool TransformGizmoController::handleKey(int key, int modifiers) {
    if (key == Qt::Key_Escape && m_drag) {
        cancel();
        ungrabMouse();
        return true;
    }
    if (!m_available) { return false; }
    if (key == Qt::Key_Period) { action("reset"); return true; }
    const double step = (modifiers & Qt::ShiftModifier) != 0 ? 10 : 1;
    auto next = m_stored;
    switch (key) {
    case Qt::Key_Left: next.position.x -= step; break;
    case Qt::Key_Right: next.position.x += step; break;
    case Qt::Key_Up: next.position.y -= step; break;
    case Qt::Key_Down: next.position.y += step; break;
    default: return false;
    }
    if (begin("body", m_box.center)) { write(next); end(); }
    return true;
}
QString TransformGizmoController::targetAt(QPointF point) const {
    if (!m_available) { return {}; }
    if (QLineF(point, m_box.pivot).length() <= pivotSize + 2) { return "pivot"; }
    for (auto it = scaleHandles.crbegin(); it != scaleHandles.crend(); ++it) {
        if (QRectF(m_box.handle(*it) - QPointF(handleSize / 2, handleSize / 2), QSizeF(handleSize, handleSize)).contains(point)) { return *it; }
    }
    if (QLineF(point, m_box.handle("rotate")).length() <= rotationRadius) { return "rotate"; }
    return polygon(m_box).containsPoint(point, Qt::OddEvenFill) ? QStringLiteral("body") : QString();
}
bool TransformGizmoController::contains(const QPointF& point) const {
    const auto local = point - m_origin;
    if (m_monitor && !QRectF(QPointF(), m_frame).contains(local)) { return false; }
    return !targetAt(local).isEmpty();
}
void TransformGizmoController::paint(QPainter* painter) {
    if (!m_available) { return; }
    painter->setRenderHint(QPainter::Antialiasing);
    painter->translate(m_origin);
    QPen boxPen(primary(0.8), 1);
    boxPen.setDashPattern({4, 4});
    painter->setPen(boxPen);
    painter->setBrush(Qt::NoBrush);
    painter->drawPolygon(polygon(m_box));
    painter->setPen(QPen(primary(0.6), 1));
    painter->drawLine(m_box.handle("t"), m_box.handle("rotate"));
    painter->setPen(QPen(primary(), 1));
    painter->setBrush(Qt::white);
    painter->drawEllipse(m_box.handle("rotate"), rotationRadius, rotationRadius);
    for (const auto& target : scaleHandles) {
        const bool hovered = target == m_hover;
        painter->setPen(QPen(primary(), hovered ? 2 : 1));
        painter->setBrush(hovered ? primary(0.15) : QColor(Qt::white));
        painter->drawRect(QRectF(m_box.handle(target) - QPointF(handleSize / 2, handleSize / 2), QSizeF(handleSize, handleSize)));
    }
    painter->setPen(QPen(primary(), 1));
    painter->setBrush(Qt::white);
    painter->drawLine(m_box.pivot - QPointF(pivotSize, 0), m_box.pivot + QPointF(pivotSize, 0));
    painter->drawLine(m_box.pivot - QPointF(0, pivotSize), m_box.pivot + QPointF(0, pivotSize));
    painter->drawEllipse(m_box.pivot, 3, 3);
    if (hasActiveFocus() && m_focusVisible) {
        painter->setBrush(Qt::NoBrush);
        painter->setPen(QPen(primary(), 2));
        painter->drawRect(QRectF(QPointF(1, 1), m_space.frame - QSizeF(2, 2)));
    }
}
void TransformGizmoController::mousePressEvent(QMouseEvent* event) {
    const auto point = event->position() - m_origin;
    const auto target = targetAt(point);
    if (target.isEmpty()) { event->ignore(); return; }
    if (event->button() == Qt::RightButton) {
        emit contextMenuRequested(event->position());
        event->accept();
        return;
    }
    if (begin(target, point)) {
        m_focusVisible = false;
        forceActiveFocus(Qt::MouseFocusReason);
        setKeepMouseGrab(true);
        event->accept();
    } else { event->ignore(); }
}
void TransformGizmoController::mouseMoveEvent(QMouseEvent* event) { move(event->position() - m_origin, event->modifiers().testFlag(Qt::ShiftModifier)); event->accept(); }
void TransformGizmoController::mouseReleaseEvent(QMouseEvent* event) { end(); setKeepMouseGrab(false); event->accept(); }
void TransformGizmoController::mouseUngrabEvent() { cancel(); }
void TransformGizmoController::hoverMoveEvent(QHoverEvent* event) {
    if (m_drag) { setCursor(QCursor(m_dragCursor)); return; }
    m_hover = targetAt(event->position() - m_origin);
    setCursor(QCursor(cursorFor(m_hover, m_box)));
    update();
}
void TransformGizmoController::hoverLeaveEvent(QHoverEvent*) { if (!m_drag) { clearPointerFeedback(); } }
void TransformGizmoController::keyPressEvent(QKeyEvent* event) {
    if (handleKey(event->key(), event->modifiers().toInt())) { m_focusVisible = true; update(); event->accept(); }
    else { event->ignore(); }
}
void TransformGizmoController::focusInEvent(QFocusEvent* event) {
    m_focusVisible = event->reason() == Qt::TabFocusReason || event->reason() == Qt::BacktabFocusReason ||
                     event->reason() == Qt::ShortcutFocusReason;
    QQuickPaintedItem::focusInEvent(event);
    update();
}
