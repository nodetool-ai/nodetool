#include "CompositorLayoutEditor.h"
#include <QMouseEvent>
#include <QPainter>
#include <QPainterPath>
#include <QtMath>

namespace nodetool::node_editor {
using namespace compositor;

namespace {
QJsonObject propertyCommand(const QString &id, const QString &name, const QJsonValue &value) {
    return {{"op", "setProperty"}, {"id", id}, {"name", name}, {"value", value}};
}
double round2(double value) { return std::round(value * 100) / 100; }
} // namespace

CompositorLayoutEditor::CompositorLayoutEditor(QObject *parent) : QObject(parent) {}

void CompositorLayoutEditor::setNode(const QJsonObject &node, const QHash<QString, CardMediaItem> &sources) {
    // Layer keys (image_N) keep their numbers when another layer is deleted, so the
    // selection follows its key rather than its position.
    const auto selectedKey = keys_.value(selected_);
    node_ = node;
    nodeId_ = node["id"].toString();
    keys_ = compositorLayerKeys(node);
    if (selected_ >= 0) { selected_ = int(keys_.indexOf(selectedKey)); }
    layers_ = compositorLayers(node);
    sources_ = sources;
    canvas_ = compositorCanvasSize(node, sources);
    if (drag_ && drag_->layer >= keys_.size()) { drag_.reset(); }
    if (opacityDraft_ && opacityDraft_->first >= keys_.size()) { opacityDraft_.reset(); }
    emit changed();
}

QVector<CompositorLayer> CompositorLayoutEditor::displayLayers() const {
    auto layers = layers_;
    if (drag_ && drag_->current && drag_->layer < layers.size()) { layers[drag_->layer].transform = transformJson(*drag_->current); }
    if (opacityDraft_ && opacityDraft_->first < layers.size()) { layers[opacityDraft_->first].opacity = opacityDraft_->second; }
    return layers;
}

QSizeF CompositorLayoutEditor::layerSize(int index) const {
    const auto source = sources_.constFind(keys_.value(index));
    if (source == sources_.cend() || source->state != CardMediaState::Ready) { return {}; }
    if (source->natural.isValid()) { return QSizeF(source->natural); }
    return QSizeF(source->image.size());
}

LayerTransform CompositorLayoutEditor::layerTransform(int index) const {
    const auto layers = displayLayers();
    const auto fallback = defaultTransform(layerSize(index), canvas_);
    if (index < 0 || index >= layers.size() || !layers[index].transform) { return fallback; }
    return transformFromJson(*layers[index].transform).value_or(fallback);
}

QVariantMap CompositorLayoutEditor::transformFields() const {
    if (selected_ < 0) { return {}; }
    const auto t = layerTransform(selected_);
    return {{"x", std::round(t.x)}, {"y", std::round(t.y)}, {"scaleX", round2(t.scaleX)}, {"scaleY", round2(t.scaleY)},
            {"rotation", std::round(qRadiansToDegrees(t.rotation))}};
}

QVariantList CompositorLayoutEditor::layerEntries() const {
    QVariantList entries;
    const auto layers = displayLayers();
    for (int i = 0; i < keys_.size(); ++i) {
        const auto layer = layers.value(i);
        entries.append(QVariantMap{{"name", tr("Layer %1").arg(i + 1)}, {"key", keys_[i]}, {"visible", layer.visible},
                                   {"opacity", layer.opacity}, {"blend", layer.blend}, {"ready", !layerSize(i).isEmpty()}});
    }
    return entries;
}

QVariantList CompositorLayoutEditor::blendModeEntries() const {
    QVariantList modes;
    for (const auto &[value, label] : compositorBlendModes()) { modes.append(QVariantMap{{"value", value}, {"label", label}}); }
    return modes;
}

void CompositorLayoutEditor::press(const QPointF &point, double viewScale) {
    // 1) A handle of the selected layer, 2) inside the selected layer,
    // 3) the topmost visible layer under the pointer, 4) empty space deselects.
    if (selected_ >= 0) {
        const auto size = layerSize(selected_);
        const auto t = layerTransform(selected_);
        if (!size.isEmpty()) {
            if (const auto handle = hitHandle(t, size, point, viewScale)) {
                drag_ = Drag{*handle, selected_, t, point, std::atan2(point.y() - t.y, point.x() - t.x), std::nullopt};
                return;
            }
            if (pointInLayer(t, size, point)) {
                drag_ = Drag{GizmoHandle::Move, selected_, t, point, 0, std::nullopt};
                return;
            }
        }
    }
    // image_0 draws on top, so it is hit first.
    for (int i = 0; i < keys_.size(); ++i) {
        const auto size = layerSize(i);
        if (!layers_.value(i).visible || size.isEmpty()) { continue; }
        const auto t = layerTransform(i);
        if (pointInLayer(t, size, point)) {
            selected_ = i;
            drag_ = Drag{GizmoHandle::Move, i, t, point, 0, std::nullopt};
            emit changed();
            return;
        }
    }
    if (selected_ != -1) {
        selected_ = -1;
        emit changed();
    }
}

void CompositorLayoutEditor::drag(const QPointF &point, bool uniform) {
    if (!drag_) { return; }
    switch (drag_->handle) {
    case GizmoHandle::Move: drag_->current = applyMove(drag_->start, point - drag_->startPointer); break;
    case GizmoHandle::Rotate: drag_->current = applyRotate(drag_->start, drag_->startAngle, point); break;
    default: drag_->current = applyScale(drag_->start, layerSize(drag_->layer), drag_->handle, point, uniform); break;
    }
    emit changed();
}

void CompositorLayoutEditor::release() {
    if (!drag_) { return; }
    const auto finished = *drag_;
    drag_.reset();
    if (finished.current && *finished.current != finished.start) {
        const auto title = finished.handle == GizmoHandle::Move ? tr("Move layer") : finished.handle == GizmoHandle::Rotate ? tr("Rotate layer") : tr("Scale layer");
        commitTransform(finished.layer, *finished.current, title);
    }
    emit changed();
}

void CompositorLayoutEditor::select(int index) {
    const auto next = index >= 0 && index < keys_.size() ? index : -1;
    if (next == selected_) { return; }
    selected_ = next;
    emit changed();
}

void CompositorLayoutEditor::setCanvasSize(int width, int height) {
    width = std::clamp(width, 1, 16384);
    height = std::clamp(height, 1, 16384);
    // Compare with the stored size. canvas_ also follows the first image when none is stored.
    const auto data = node_["data"].toObject();
    if (data.value(QStringLiteral("canvas_width")).toDouble() == width && data.value(QStringLiteral("canvas_height")).toDouble() == height) {
        return;
    }
    emit commandRequested({{"op", "batch"}, {"commands", QJsonArray{propertyCommand(nodeId_, QStringLiteral("canvas_width"), width),
                                                                    propertyCommand(nodeId_, QStringLiteral("canvas_height"), height)}}},
                          tr("Resize canvas"));
}

void CompositorLayoutEditor::setTransformField(const QString &name, double value) {
    if (selected_ < 0) { return; }
    auto t = layerTransform(selected_);
    if (name == QStringLiteral("x")) { t.x = value; }
    else if (name == QStringLiteral("y")) { t.y = value; }
    else if (name == QStringLiteral("scaleX")) { t.scaleX = std::clamp(value, minimumScale, maximumScale); }
    else if (name == QStringLiteral("scaleY")) { t.scaleY = std::clamp(value, minimumScale, maximumScale); }
    else if (name == QStringLiteral("rotation")) { t.rotation = qDegreesToRadians(std::clamp(value, -360.0, 360.0)); }
    else { return; }
    commitTransform(selected_, t, tr("Transform layer"));
}

void CompositorLayoutEditor::resetTransform() {
    if (selected_ < 0 || !layers_.value(selected_).transform) { return; }
    auto layers = layers_;
    layers[selected_].transform.reset();
    commitLayers(layers, tr("Reset transform"));
}

void CompositorLayoutEditor::toggleVisible(int index) {
    if (index < 0 || index >= layers_.size()) { return; }
    auto layers = layers_;
    layers[index].visible = !layers[index].visible;
    commitLayers(layers, layers[index].visible ? tr("Show layer") : tr("Hide layer"));
}

void CompositorLayoutEditor::setOpacity(int index, double value, bool commit) {
    if (index < 0 || index >= layers_.size()) { return; }
    value = std::clamp(value, 0.0, 1.0);
    if (!commit) {
        opacityDraft_ = std::pair{index, value};
        emit changed();
        return;
    }
    opacityDraft_.reset();
    auto layers = layers_;
    if (layers[index].opacity == value) {
        emit changed();
        return;
    }
    layers[index].opacity = value;
    commitLayers(layers, tr("Change layer opacity"));
}

void CompositorLayoutEditor::setBlend(int index, const QString &mode) {
    if (index < 0 || index >= layers_.size() || layers_[index].blend == mode) { return; }
    auto layers = layers_;
    layers[index].blend = mode;
    commitLayers(layers, tr("Change blend mode"));
}

void CompositorLayoutEditor::addLayer() { emit layerActionRequested(QStringLiteral("compositorAdd"), -1); }

void CompositorLayoutEditor::deleteLayer(int index) {
    if (index < 0 || index >= keys_.size()) { return; }
    if (selected_ == index) { select(-1); }
    emit layerActionRequested(QStringLiteral("compositorDelete"), index);
}

void CompositorLayoutEditor::commitLayers(const QVector<CompositorLayer> &layers, const QString &title) {
    emit commandRequested(propertyCommand(nodeId_, QStringLiteral("layers"), compositorLayersJson(layers)), title);
}

void CompositorLayoutEditor::commitTransform(int index, const LayerTransform &transform, const QString &title) {
    auto layers = layers_;
    if (index < 0 || index >= layers.size()) { return; }
    layers[index].transform = transformJson(transform);
    commitLayers(layers, title);
}

CompositorStage::CompositorStage(CompositorLayoutEditor *editor, const CanvasTheme &theme, QWidget *parent)
    : QWidget(parent), editor_(editor), theme_(theme) {
    setObjectName(QStringLiteral("compositor-stage"));
    setMouseTracking(true);
    setMinimumSize(240, 200);
    connect(editor, &CompositorLayoutEditor::changed, this, qOverload<>(&QWidget::update));
}

double CompositorStage::viewScale() const {
    if (!editor_) { return 1; }
    // CompositorEditorCanvas: fit with a 32 px pad, at most 4x.
    constexpr double pad = 32;
    const auto canvas = QSizeF(editor_->canvas());
    const auto available = QSizeF(width() - 2 * pad, height() - 2 * pad);
    if (canvas.isEmpty() || available.isEmpty()) { return 1; }
    return std::min({available.width() / canvas.width(), available.height() / canvas.height(), 4.0});
}

QRectF CompositorStage::canvasRect() const {
    if (!editor_) { return {}; }
    const auto size = QSizeF(editor_->canvas()) * viewScale();
    return {QPointF((width() - size.width()) / 2, (height() - size.height()) / 2), size};
}

QPointF CompositorStage::toCanvas(const QPointF &widgetPoint) const { return (widgetPoint - canvasRect().topLeft()) / viewScale(); }
QPointF CompositorStage::toWidget(const QPointF &canvasPoint) const { return canvasRect().topLeft() + canvasPoint * viewScale(); }

void CompositorStage::paintEvent(QPaintEvent *) {
    QPainter painter(this);
    painter.fillRect(rect(), theme_.canvas);
    if (!editor_) { return; }
    const auto area = canvasRect();
    // The alpha checker under the canvas, as the card's paint canvas.
    painter.save();
    painter.setClipRect(area);
    painter.fillRect(area, theme_.alphaBase);
    constexpr int cell = 8;
    for (int y = 0; y * cell < area.height(); ++y) {
        for (int x = (y % 2); x * cell < area.width(); x += 2) {
            painter.fillRect(QRectF(area.x() + x * cell, area.y() + y * cell, cell, cell), theme_.alphaChecker);
        }
    }
    painter.restore();
    const auto composite = compositeLayers(editor_->keys(), editor_->displayLayers(), editor_->sources(), editor_->canvas(),
                                           area.size() * devicePixelRatioF());
    if (!composite.isNull()) { painter.drawImage(area, composite); }
    painter.setPen(QPen(theme_.divider, 1));
    painter.setBrush(Qt::NoBrush);
    painter.drawRect(area.adjusted(-0.5, -0.5, 0.5, 0.5));
    const auto index = editor_->selected();
    const auto size = editor_->layerSize(index);
    if (index < 0 || size.isEmpty()) { return; }
    // The gizmo: outline, a line to the rotate handle, and the handles.
    painter.setRenderHint(QPainter::Antialiasing);
    const auto t = editor_->layerTransform(index);
    const auto scale = viewScale();
    const auto corners = layerCorners(t, size);
    QPolygonF outline;
    for (const auto &corner : corners) { outline << toWidget(corner); }
    painter.setPen(QPen(theme_.primary, 1.5));
    painter.drawPolygon(outline);
    const auto top = toWidget(handlePoint(t, size, GizmoHandle::Top, scale));
    const auto rotate = toWidget(handlePoint(t, size, GizmoHandle::Rotate, scale));
    painter.drawLine(top, rotate);
    const auto handleSize = handleHitRadius * 1.4;
    painter.setBrush(theme_.node);
    for (const auto handle : {GizmoHandle::TopLeft, GizmoHandle::TopRight, GizmoHandle::BottomRight, GizmoHandle::BottomLeft, GizmoHandle::Top,
                              GizmoHandle::Right, GizmoHandle::Bottom, GizmoHandle::Left}) {
        const auto center = toWidget(handlePoint(t, size, handle, scale));
        painter.drawRect(QRectF(center - QPointF(handleSize / 2, handleSize / 2), QSizeF(handleSize, handleSize)));
    }
    painter.drawEllipse(rotate, handleSize / 2, handleSize / 2);
}

void CompositorStage::mousePressEvent(QMouseEvent *event) {
    if (!editor_ || event->button() != Qt::LeftButton) { return QWidget::mousePressEvent(event); }
    editor_->press(toCanvas(event->position()), viewScale());
}

void CompositorStage::mouseMoveEvent(QMouseEvent *event) {
    if (!editor_ || !editor_->dragging()) { return QWidget::mouseMoveEvent(event); }
    editor_->drag(toCanvas(event->position()), event->modifiers().testFlag(Qt::ShiftModifier));
}

void CompositorStage::mouseReleaseEvent(QMouseEvent *event) {
    if (!editor_ || event->button() != Qt::LeftButton) { return QWidget::mouseReleaseEvent(event); }
    editor_->release();
}
} // namespace nodetool::node_editor
