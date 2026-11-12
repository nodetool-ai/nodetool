#include "InlinePropertyPresenter.h"
#include "EditorScene.h"
#include "WorkflowGraphModel.h"
#include <QEvent>
#include <QApplication>
#include <QGraphicsView>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QQmlEngine>
#include <QScrollBar>
#include <QTimer>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <algorithm>
#include <cmath>
namespace nodetool {
namespace {
// Unhandled Quick keys must not bubble into the graph's editing shortcuts.
class InlineEditorWidget final : public QQuickWidget {
public:
  InlineEditorWidget(QQmlEngine *engine, QWidget *parent) : QQuickWidget(engine, parent) {}
protected:
  bool event(QEvent *event) override {
    if (event->type() == QEvent::ShortcutOverride) { event->accept(); return true; }
    return QQuickWidget::event(event);
  }
  void keyPressEvent(QKeyEvent *event) override { QQuickWidget::keyPressEvent(event); event->accept(); }
  void keyReleaseEvent(QKeyEvent *event) override { QQuickWidget::keyReleaseEvent(event); event->accept(); }
};
}
InlinePropertyPresenter::InlinePropertyPresenter(WorkflowGraphModel &model,
    EditorScene &scene, QGraphicsView &view, QQmlEngine *engine, QObject *parent)
    : QObject(parent), model_(model), scene_(scene), view_(view), engine_(engine) {
  connect(&scene_, &EditorScene::inlineEditRequested, this, &InlinePropertyPresenter::activate);
  connect(&model_, &WorkflowGraphModel::projectionAboutToChange, this, [this] { if (!holding_) { cancel(); } });
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, [this](QtNodes::NodeId) { reposition(); });
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, [this](QtNodes::NodeId) { reposition(); });
  connect(&scene_, &QGraphicsScene::selectionChanged, this, [this] { if (!holding_ && active() && !current()) { cancel(); } });
  connect(view.horizontalScrollBar(), &QScrollBar::valueChanged, this, &InlinePropertyPresenter::reposition);
  connect(view.verticalScrollBar(), &QScrollBar::valueChanged, this, &InlinePropertyPresenter::reposition);
  qApp->installEventFilter(this);
}
InlinePropertyPresenter::~InlinePropertyPresenter() {
  qApp->removeEventFilter(this);
  ++generation_;
  descriptor_.clear();
  auto widget = widget_.data();
  widget_.clear();
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  delete widget;
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  for (const auto &retired : retiredWidgets_) { delete retired.data(); }
}
QQuickWidget *InlinePropertyPresenter::editorWidget() const { return widget_; }
bool InlinePropertyPresenter::current() const {
  if (!active() || model_.readOnly() || !model_.nodeExists(node_)) { return false; }
  const auto item = scene_.nodeGraphicsObject(node_);
  return item && item->isSelected() && scene_.selectedItems().size() == 1 && model_.inlineDescriptor(node_, name_) == descriptor_;
}
void InlinePropertyPresenter::activate(QtNodes::NodeId id, const QString &name) {
  if (active() && current() && id == node_) {
    if (name == name_) {
      if (widget_) { widget_->setFocus(Qt::MouseFocusReason); }
      return;
    }
    if (widget_ && widget_->rootObject()) { QMetaObject::invokeMethod(widget_->rootObject(), "finish"); }
    if (committing_) {
      const auto resource = model_.resourceId(id);
      QTimer::singleShot(0, this, [this, id, name, resource] {
        if (model_.resourceId(id) == resource) { activate(id, name); }
      });
      return;
    }
  }
  cancel();
  const auto descriptor = model_.inlineDescriptor(id, name);
  if (descriptor.isEmpty() || !engine_) { return; }
  node_ = id;
  name_ = name;
  descriptor_ = descriptor;
  if (!current()) { cancel(); return; }
  expanded_ = false;
  auto widget = new InlineEditorWidget(engine_, view_.viewport());
  widget_ = widget;
  widget->setObjectName("inline-property-overlay");
  widget->setAttribute(Qt::WA_AlwaysStackOnTop);
  widget->setClearColor(Qt::transparent);
  widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
  widget->setInitialProperties({{"presenter", QVariant::fromValue(this)}, {"activationToken", generation_}});
  reposition();
  widget->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/InlinePropertyEditor.qml"));
  if (widget->status() == QQuickWidget::Error) { cancel(); return; }
  widget->show();
  widget->raise();
  widget->setFocus(Qt::MouseFocusReason);
  emit changed();
  const auto token = generation_;
  QTimer::singleShot(0, this, [this, token] {
    if (token != generation_ || !widget_ || !current()) { return; }
    QMetaObject::invokeMethod(widget_->rootObject(), "activate");
  });
}
void InlinePropertyPresenter::cancel() {
  ++generation_;
  committing_ = false;
  pendingValue_.clear();
  applyQueued_ = false;
  pendingApply_.clear();
  contentHeight_ = 0;
  descriptor_.clear();
  name_.clear();
  node_ = QtNodes::InvalidNodeId;
  const bool popupWasOpen = popupOpen();
  popupRect_ = {};
  if (popupWasOpen) { emit popupChanged(); }
  expanded_ = false;
  if (widget_) {
    auto old = widget_;
    widget_.clear();
    old->hide();
    old->setEnabled(false);
    retiredWidgets_.removeIf([](const auto &entry) { return entry.isNull(); });
    retiredWidgets_.append(old);
    old->deleteLater();
  }
  emit changed();
}
void InlinePropertyPresenter::flushCommit() {
  if (!committing_ || !current()) { return; }
  const auto id = model_.resourceId(node_);
  const auto name = name_;
  const auto value = pendingValue_;
  const auto command = model_.propertyCommand(node_, name, QJsonValue::fromVariant(value));
  cancel();
  if (command["op"] == QStringLiteral("batch") && commitCommand) { commitCommand(command); }
  else if (commitProperty) { commitProperty(id, name, value); }
  view_.setFocus(Qt::OtherFocusReason);
}
void InlinePropertyPresenter::commit(const QVariant &value, int token) {
  if (token != generation_ || committing_ || !current()) { return; }
  pendingValue_ = value;
  committing_ = true;
  QTimer::singleShot(0, this, [this, token] {
    if (token == generation_) { flushCommit(); }
  });
}
void InlinePropertyPresenter::apply(const QVariant &value, int token) {
  if (token != generation_ || committing_ || !current()) { return; }
  pendingApply_ = value;
  if (applyQueued_) { return; }
  applyQueued_ = true;
  // Deferred like commit(): the Quick handler that published the value returns first.
  QTimer::singleShot(0, this, [this, token] { if (token == generation_) { flushApply(); } });
}
void InlinePropertyPresenter::flushApply() {
  if (!applyQueued_) { return; }
  applyQueued_ = false;
  const auto value = pendingApply_;
  pendingApply_.clear();
  if (!current() || !commitProperty) { return; }
  const auto resource = model_.resourceId(node_);
  holding_ = true;
  commitProperty(resource, name_, value);
  holding_ = false;
  // Projection can replace the node's graph id. The resource id is stable.
  node_ = QtNodes::InvalidNodeId;
  for (const auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) == resource) { node_ = id; break; }
  }
  const auto descriptor = model_.nodeExists(node_) ? model_.inlineDescriptor(node_, name_) : QVariantMap{};
  if (descriptor.isEmpty()) { cancel(); return; }
  descriptor_ = descriptor;
  if (!current()) { cancel(); return; }
  emit changed();
  reposition();
}
void InlinePropertyPresenter::close(int token) {
  if (token != generation_) { return; }
  flushApply();
  if (token != generation_) { return; }
  cancel();
  view_.setFocus(Qt::OtherFocusReason);
}
void InlinePropertyPresenter::setContentHeight(double height) {
  if (!active() || qFuzzyCompare(height, contentHeight_)) { return; }
  contentHeight_ = std::max(0.0, height);
  reposition();
}

void InlinePropertyPresenter::expand() {
  if (!current()) { cancel(); return; }
  expanded_ = !expanded_;
  emit changed();
  reposition();
}
void InlinePropertyPresenter::popupRect(const QRectF &rect) {
  const bool wasOpen = popupOpen();
  popupRect_ = rect;
  updateMask();
  if (wasOpen != popupOpen()) { emit popupChanged(); }
}
void InlinePropertyPresenter::updateMask() {
  if (!widget_) { return; }
  auto region = QRegion(editorRect_.adjusted(-2, -2, 2, 2).toAlignedRect());
  if (!popupRect_.isEmpty()) { region += QRegion(popupRect_.adjusted(-2,-2,2,2).toAlignedRect()); }
  widget_->setMask(region.intersected(QRegion(view_.viewport()->rect())));
}
void InlinePropertyPresenter::reposition() {
  if (holding_) { return; }
  if (!widget_ || !current()) { if (active()) { cancel(); } return; }
  auto local = model_.inlineFieldRect(node_, name_);
  if (contentHeight_ > 0) { local.setHeight(std::max(local.height(), contentHeight_)); }
  const auto kind = descriptor_["kind"].toString();
  if (name_ == "code") { local.setHeight(std::max(280.0, local.height())); }
  if (kind == "text" || kind == "multiline") {
    if (expanded_) { local.setHeight(std::max(180.0, local.height())); }
    // A narrow action strip expands multiline editing without discarding draft.
    local.setHeight(local.height() + 24);
  }
  const auto item = scene_.nodeGraphicsObject(node_);
  if (!item) { cancel(); return; }
  const auto sceneRect = local.translated(item->scenePos());
  zoom_ = std::clamp(std::abs(view_.transform().m11()), 0.08, 8.0);
  const auto transform = view_.viewportTransform();
  editorRect_ = transform.mapRect(sceneRect);
  widget_->setGeometry(view_.viewport()->rect());
  if (!view_.viewport()->rect().intersects(editorRect_.toAlignedRect())) { cancel(); return; }
  updateMask();
  widget_->raise();
  emit geometryChanged();
}
bool InlinePropertyPresenter::eventFilter(QObject *object, QEvent *event) {
  if (active() && widget_ && event->type() == QEvent::ShortcutOverride) {
    bool inside = object == widget_ || object == widget_->quickWindow();
    for (auto target = object; target && !inside; target = target->parent()) {
      inside = target == widget_ || target == widget_->rootObject();
    }
    if (inside) { event->accept(); return true; }
  }
  if (active() && (object == view_.viewport() || object == &view_)) {
    if (event->type() == QEvent::Resize || event->type() == QEvent::Wheel) {
      const auto token = generation_;
      QTimer::singleShot(0, this, [this, token] { if (token == generation_) { reposition(); } });
    }
    if (event->type() == QEvent::MouseButtonPress) {
      const auto *mouse = static_cast<QMouseEvent *>(event);
      if (mouse->button() == Qt::LeftButton && name_ == QStringLiteral("prompt") && current()) {
        const auto *item = scene_.nodeGraphicsObject(node_);
        const auto local = item->mapFromScene(view_.mapToScene(view_.viewport()->mapFromGlobal(mouse->globalPosition().toPoint())));
        for (const auto &row : model_.layout(node_).rows) {
          if (row.action != QStringLiteral("insertVariable") || !row.rect.contains(local)) { continue; }
          const auto field = widget_->rootObject()->findChild<QQuickItem *>(QStringLiteral("inline-multiline"));
          if (!field) { break; }
          auto text = field->property("text").toString();
          const auto start = field->property("selectionStart").toInt();
          const auto end = field->property("selectionEnd").toInt();
          const auto inserted = QStringLiteral("{{ %1 }}").arg(row.value);
          if (!field->property("editing").toBool()) {
            field->setProperty("editBaseline", field->property("value"));
            field->setProperty("editing", true);
          }
          text.replace(start, end - start, inserted);
          field->setProperty("text", text);
          field->setProperty("cursorPosition", start + inserted.size());
          field->forceActiveFocus(Qt::MouseFocusReason);
          event->accept();
          return true;
        }
      }
      // A deliberate canvas blur commits before its pointer dispatch changes
      // selection. Programmatic selection/source changes still invalidate queued
      // writes. finish() has returned, so document projection cannot destroy a
      // Quick object while its editing handler is running.
      if (widget_ && widget_->rootObject()) { QMetaObject::invokeMethod(widget_->rootObject(), "finish"); }
      flushCommit();
    }
  }
  return QObject::eventFilter(object, event);
}
}
