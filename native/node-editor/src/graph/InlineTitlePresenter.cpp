#include "InlineTitlePresenter.h"
#include "EditorScene.h"
#include "WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include <QApplication>
#include "ui/CanvasSurface.h"
#include <QKeyEvent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QSet>
#include <QTimer>
#include <algorithm>
#include <cmath>
#include <memory>
namespace nodetool {
namespace {
class TitleEditorWidget final : public QQuickWidget {
public:
  TitleEditorWidget(QQmlEngine *engine, QWidget *parent) : QQuickWidget(engine, parent) {}
protected:
  bool event(QEvent *event) override {
    if (event->type() == QEvent::ShortcutOverride) { event->accept(); return true; }
    return QQuickWidget::event(event);
  }
  void keyPressEvent(QKeyEvent *event) override { QQuickWidget::keyPressEvent(event); event->accept(); }
  void keyReleaseEvent(QKeyEvent *event) override { QQuickWidget::keyReleaseEvent(event); event->accept(); }
};

}
InlineTitlePresenter::InlineTitlePresenter(WorkflowGraphModel &model, EditorScene &scene,
    CanvasSurface &canvas, QQmlEngine *engine, QObject *parent)
    : QObject(parent), model_(model), scene_(scene), canvas_(canvas), engine_(engine) {
  connect(&scene_, &EditorScene::titleEditRequested, this, &InlineTitlePresenter::activate);
  // The group and comment controls survive a projection. refresh() keeps the widget of
  // each surviving node, because building one compiles a Quick scene.
  connect(&model_, &WorkflowGraphModel::projectionAboutToChange, this, [this] { cancel(); notes_.clear(); });
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, [this] { QTimer::singleShot(0, this, &InlineTitlePresenter::refresh); });
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, [this](QtNodes::NodeId id) {
    if (const auto note = notes_.find(id); note != notes_.end() && model_.nodeExists(id)) {
      note->second->updateCardGeometry(model_.layout(id).size);
    }
    reposition();
  });
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, [this](QtNodes::NodeId) { reposition(); });
  connect(&canvas_.selection(), &CanvasSelection::selectionChanged, this, [this] { if (active() && !current()) cancel(); });
  connect(&canvas_, &CanvasSurface::viewportMoved, this, &InlineTitlePresenter::reposition);
  qApp->installEventFilter(this);
  QTimer::singleShot(0, this, &InlineTitlePresenter::refresh);
}
InlineTitlePresenter::~InlineTitlePresenter() {
  qApp->removeEventFilter(this); cancel(); notes_.clear(); clearControls();
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  for (const auto &widget : retired_) delete widget.data();
}
void InlineTitlePresenter::clearControls() {
  for (const auto &widget : controls_) { if (widget) { widget->hide(); widget->setEnabled(false); widget->deleteLater(); } }
  controls_.clear();
}
void InlineTitlePresenter::repositionControls() {
  auto *editor = qobject_cast<EditorWindow *>(parent());
  if (!editor) return;
  const auto pointer = canvas_.hostWidget().mapFromGlobal(QCursor::pos());
  for (auto it = controls_.begin(); it != controls_.end(); ++it) {
    auto *widget = it.value().data();
    if (!widget || !canvas_.hasNode(it.key())) continue;
    const auto bounds = canvas_.viewportTransform().mapRect(canvas_.nodeRect(it.key()));
    const bool group = model_.isGroup(it.key());
    const auto zoom = std::clamp(std::abs(canvas_.zoom()), 0.08, 8.0);
    const auto scale = group ? std::pow(zoom, 0.45) : zoom;
    const auto height = 28 * scale;
    const auto header = QRectF(bounds.left(), bounds.top() - 5 - 32 * scale, bounds.width(), 5 + 32 * scale);
    const bool hovered = (group ? header : bounds).contains(pointer);
    const auto width = (group ? 64 : 28) * scale;
    widget->setGeometry(qRound(bounds.right() - width - (group ? 0 : 8 * zoom)), qRound(group ? bounds.top() - 5 - 30 * scale : bounds.top() + 8 * zoom), qCeil(width), qCeil(height));
    if (widget->rootObject()) widget->rootObject()->setScale(scale);
    widget->setVisible((hovered || canvas_.selection().contains(it.key()) || widget->underMouse() || (widget->rootObject() && widget->rootObject()->property("menuOpen").toBool())) && canvas_.viewportWidget().rect().intersects(widget->geometry()));
    widget->raise();
  }
}
void InlineTitlePresenter::refresh() {
  auto *editor = qobject_cast<EditorWindow *>(parent());
  QSet<QString> bypassedParents, parents;
  for (const auto id : model_.allNodeIds()) {
    parents.insert(model_.nodeSnapshot(id)["parent_id"].toString());
    if (model_.bypassed(id)) bypassedParents.insert(model_.nodeSnapshot(id)["parent_id"].toString());
  }
  QSet<QtNodes::NodeId> shown;
  if (editor && engine_) for (const auto id : model_.allNodeIds()) {
    if (!model_.isGroup(id) && !model_.isComment(id)) continue;
    const auto resource = model_.resourceId(id);
    const QVariantMap properties{{"hasChildren", parents.contains(resource)}, {"bypassed", bypassedParents.contains(resource)},
      {"resourceId", resource}, {"group", model_.isGroup(id)}, {"epoch", QVariant::fromValue(editor->documentEpoch())},
      {"credentials", QVariant::fromValue(editor->credentialsEpoch())}};
    shown.insert(id);
    auto *widget = controls_.value(id).data();
    if (widget && widget->rootObject() && widget->objectName() == "authored-controls-" + resource) {
      for (auto it = properties.cbegin(); it != properties.cend(); ++it) {
        if (widget->rootObject()->property(it.key().toUtf8().constData()) != it.value()) widget->rootObject()->setProperty(it.key().toUtf8().constData(), it.value());
      }
      continue;
    }
    if (widget) { widget->hide(); widget->setEnabled(false); widget->deleteLater(); }
    widget = new QQuickWidget(engine_, &canvas_.viewportWidget());
    controls_.insert(id, widget);
    widget->setObjectName("authored-controls-" + resource);
    widget->setClearColor(Qt::transparent);
    widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
    auto initial = properties;
    initial.insert("commands", QVariant::fromValue(editor->editorCommands()));
    initial.insert("runs", QVariant::fromValue(editor->runState()));
    widget->setInitialProperties(initial);
    widget->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/AuthoredControls.qml"));
  }
  for (auto it = controls_.begin(); it != controls_.end();) {
    if (shown.contains(it.key())) { ++it; continue; }
    if (auto *widget = it.value().data()) { widget->hide(); widget->setEnabled(false); widget->deleteLater(); }
    it = controls_.erase(it);
  }
  notes_.clear();
  for (const auto id : model_.allNodeIds()) {
    if (model_.isGroup(id) || model_.isComment(id) || model_.nodeData(id, QtNodes::NodeRole::Type).toString() == "nodetool.code.Code") continue;
    const auto text = model_.uiProperties(id)["title"].toString();
    if (text.isEmpty()) { continue; }
    const bool reroute = model_.isReroute(id);
    const auto name = (reroute ? "reroute-label-" : "node-note-") + model_.resourceId(id);
    std::function<void()> edit, remove;
    if (!model_.readOnly()) {
      const auto presenter = QPointer(this);
      edit = [presenter, id] { if (presenter) { presenter->activate(id); } };
      remove = [presenter, id] {
        if (presenter) {
          presenter->activate(id);
          presenter->commit({}, presenter->generation_);
        }
      };
    }
    if (auto note = canvas_.addNote(id, text, name, std::move(edit), std::move(remove))) {
      notes_.emplace(id, std::move(note));
    }
  }
  reposition();
}
bool InlineTitlePresenter::current() const {
  if (!active() || model_.readOnly() || !model_.nodeExists(node_)) return false;
  const auto stored = comment_ ? model_.comment(node_).toString()
      : (group_ || header_) ? model_.layout(node_).title : model_.uiProperties(node_)["title"].toString();
  return canvas_.selection().contains(node_) && canvas_.selection().count() == 1 && stored == text_;
}
void InlineTitlePresenter::activate(QtNodes::NodeId id) {
  cancel();
  if (!engine_ || model_.readOnly() || !model_.nodeExists(id)) return;
  // Rich-text comments keep their formatting, which only the web editor writes.
  if (model_.isComment(id) && !model_.comment(id).isString()) return;
  if (!canvas_.hasNode(id)) return;
  const auto viewZoom = std::clamp(std::abs(canvas_.zoom()), 0.08, 8.0);
  canvas_.ensureVisible(model_.isGroup(id) ? scene_.groupLabelRect(id, viewZoom) : canvas_.nodeBounds(id), 16);
  canvas_.selection().clear(); canvas_.selection().setNode(id, true); emit scene_.nodeSelected(id);
  node_ = id; group_ = model_.isGroup(id); reroute_ = model_.isReroute(id); comment_ = model_.isComment(id);
  header_ = model_.nodeData(id, QtNodes::NodeRole::Type).toString() == "nodetool.code.Code"; requestedHeight_ = 100;
  text_ = comment_ ? model_.comment(id).toString() : (group_ || header_) ? model_.layout(id).title : model_.uiProperties(id)["title"].toString();
  if (!current()) { cancel(); return; }
  emit activated();
  auto *widget = new TitleEditorWidget(engine_, &canvas_.viewportWidget()); widget_ = widget;
  widget->setObjectName("inline-title-overlay"); widget->setClearColor(Qt::transparent);
  widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
  widget->setInitialProperties({{"presenter", QVariant::fromValue(this)}, {"activationToken", generation_}});
  reposition(); widget->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/InlineTitleEditor.qml"));
  if (widget->status() == QQuickWidget::Error) { cancel(); return; }
  widget->show(); widget->raise(); widget->setFocus(Qt::MouseFocusReason); emit changed();
  const auto token = generation_;
  QTimer::singleShot(0, this, [this, token] { if (token == generation_ && widget_ && current()) QMetaObject::invokeMethod(widget_->rootObject(), "activate"); });
}
void InlineTitlePresenter::validateDocument(const node_editor::WorkflowDocument &document) {
    if (!active()) {
        return;
    }
    const auto node = document.node(model_.resourceId(node_));
    const auto previous = model_.nodeSnapshot(node_);
    const auto title = [](const QJsonObject &value) {
        return QJsonArray{value["type"], value["ui_properties"].toObject()["title"],
            value["data"].toObject()["headline"], value["data"].toObject()["comment"]};
    };
    if (node.isEmpty() || document.isReadOnly() || title(node) != title(previous)) {
        cancel();
    }
}
void InlineTitlePresenter::cancel() {
  if (const auto note = notes_.find(node_); note != notes_.end()) { note->second->setVisible(true); }
  ++generation_; committing_ = false; pending_.clear(); node_ = QtNodes::InvalidNodeId; text_.clear();
  if (widget_) { auto old = widget_; widget_.clear(); old->hide(); old->setEnabled(false); retired_.removeIf([](const auto &entry) { return entry.isNull(); }); retired_.append(old); old->deleteLater(); }
  emit changed();
}
void InlineTitlePresenter::commit(const QString &text, int token) {
  if (token != generation_ || committing_ || !current()) return;
  pending_ = text; committing_ = true;
  QTimer::singleShot(0, this, [this, token] { if (token == generation_) flush(); });
}
void InlineTitlePresenter::flush() {
  if (!committing_ || !current()) return;
  const auto id = model_.resourceId(node_); auto text = pending_; const auto previous = text_;
  // resolveCodeNodeTitle: a blank draft or the metadata title stores nothing, so the header follows the metadata.
  if (header_) {
    const auto fallback = model_.metadata(node_)["title"].toString(QStringLiteral("Code"));
    text = text.trimmed() == fallback ? QString{} : text.trimmed();
  }
  const auto stored = header_ ? model_.uiProperties(node_)["title"].toString() : previous;
  cancel(); if (text != (header_ ? stored : previous) && commitTitle) commitTitle(id, text);
  canvas_.setFocus(Qt::OtherFocusReason);
}
void InlineTitlePresenter::setEditorHeight(double logicalHeight, int token) {
  if (token != generation_ || singleLine() || comment_ || !current() || !std::isfinite(logicalHeight) || logicalHeight <= 0) return;
  const auto height = std::clamp(logicalHeight, 32.0, 1000000.0);
  if (std::abs(height - requestedHeight_) < 0.5) return;
  requestedHeight_ = height;
  reposition();
}
void InlineTitlePresenter::reposition() {
  repositionControls();
  if (!widget_) return;
  if (!current()) { cancel(); return; }
  if (const auto note = notes_.find(node_); note != notes_.end()) { note->second->setVisible(false); }
  if (!canvas_.hasNode(node_)) { cancel(); return; }
  const auto origin = canvas_.nodeOrigin(node_);
  const auto viewZoom = std::clamp(std::abs(canvas_.zoom()), 0.08, 8.0);
  zoom_ = group_ ? viewZoom * groupLabelScale(viewZoom) : viewZoom;
  QRectF sceneRect;
  if (group_) sceneRect = scene_.groupLabelRect(node_, viewZoom);
  else if (comment_) sceneRect = QRectF(origin, model_.layout(node_).size);
  else if (header_) sceneRect = QRectF(origin + QPointF(node_metrics::borderWidth + node_metrics::padding + node_metrics::titleOffset - 4, node_metrics::borderWidth + node_metrics::padding - 2),
      QSizeF(std::max(60, model_.layout(node_).size.width() - 2 * (node_metrics::borderWidth + node_metrics::padding) - node_metrics::titleOffset), node_metrics::headerHeight + 4));
  else if (reroute_) sceneRect = QRectF(origin + QPointF((model_.layout(node_).size.width() - 116) / 2.0, model_.layout(node_).size.height() + 6), QSizeF(116, 26));
  else sceneRect = QRectF(origin + QPointF(8, model_.layout(node_).size.height() + 10), QSizeF(std::max(120, model_.layout(node_).size.width() - 16), requestedHeight_));
  rect_ = canvas_.viewportTransform().mapRect(sceneRect);
  if (!group_ && !comment_ && !header_) {
    auto available = QRectF(canvas_.viewportWidget().rect());
    if (availableViewport) available = available.intersected(availableViewport());
    available = available.adjusted(8, 8, -8, -8);
    if (available.isEmpty()) { cancel(); return; }
    rect_.setSize(QSizeF(std::min(rect_.width(), available.width()), std::min(rect_.height(), available.height())));
    rect_.moveLeft(std::clamp(rect_.left(), available.left(), std::max(available.left(), available.right() - rect_.width())));
    rect_.moveTop(std::clamp(rect_.top(), available.top(), std::max(available.top(), available.bottom() - rect_.height())));
  }
  widget_->setGeometry(canvas_.viewportWidget().rect());
  widget_->setMask(QRegion(rect_.toAlignedRect()).intersected(QRegion(canvas_.viewportWidget().rect())));
  if (!canvas_.viewportWidget().rect().intersects(rect_.toAlignedRect())) { cancel(); return; }
  widget_->raise(); emit geometryChanged();
}
bool InlineTitlePresenter::eventFilter(QObject *object, QEvent *event) {
  if (event->type() == QEvent::MouseMove || event->type() == QEvent::Resize || event->type() == QEvent::Wheel)
    QTimer::singleShot(0, this, &InlineTitlePresenter::repositionControls);
  if (active() && widget_) {
    if (event->type() == QEvent::ShortcutOverride) {
      if (const auto *item = qobject_cast<QQuickItem *>(object); item && item->window() == widget_->quickWindow()) { event->accept(); return true; }
      for (auto *target = object; target; target = target->parent())
        if (target == widget_ || target == widget_->quickWindow() || target == widget_->rootObject()) { event->accept(); return true; }
    }
    if (object == &canvas_.viewportWidget() || object == &canvas_.hostWidget()) {
      if (event->type() == QEvent::Resize || event->type() == QEvent::Wheel) QTimer::singleShot(0, this, &InlineTitlePresenter::reposition);
      if (event->type() == QEvent::MouseButtonPress) { if (widget_->rootObject()) QMetaObject::invokeMethod(widget_->rootObject(), "finish"); flush(); }
    }
  }
  return QObject::eventFilter(object, event);
}
}
