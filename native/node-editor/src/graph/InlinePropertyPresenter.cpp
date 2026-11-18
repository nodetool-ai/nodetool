#include "InlinePropertyPresenter.h"
#include "CardBodies.h"
#include "canvas/CanvasStyle.h"
#include "canvas/EditorSceneApi.h"
#include "WorkflowGraphModel.h"
#include "interfaces/PropertyHost.h"
#include <QEvent>
#include <QApplication>
#include "ui/CanvasSurface.h"
#include <QKeyEvent>
#include <QMouseEvent>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QQmlEngine>
#include <QTimer>
#include <algorithm>
#include <cmath>
#include <utility>
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
    EditorSceneApi &scene, CanvasSurface &canvas, QQmlEngine *engine, node_editor::PropertyHost &host, QObject *parent)
    : QObject(parent), model_(model), canvas_(canvas), engine_(engine), host_(host) {
  connect(&scene.interaction(), &canvas::CanvasInteraction::inlineEditRequested, this, &InlinePropertyPresenter::activate);
  connect(&model_, &WorkflowGraphModel::projectionAboutToChange, this, [this] {
    if (holding_) { return; }
    const auto kind = descriptor_.value("kind").toString();
    // An unrelated incremental projection must not cancel a resource request
    // or close its popup. Revalidate the field after the projection finishes.
    projectingResource_ = kind == "workflow" || kind == "workflow_list" || kind == "app" || kind == "collection";
    if (!projectingResource_) { cancel(); }
  });
  connect(&model_, &WorkflowGraphModel::modelReset, this, [this] {
    if (projectingResource_) { cancel(); }
  });
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, [this] {
    if (std::exchange(projectingResource_, false)) { reposition(); }
  });
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, [this](QtNodes::NodeId) { reposition(); });
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, [this](QtNodes::NodeId) { reposition(); });
  connect(&canvas_.selection(), &CanvasSelection::selectionChanged, this, [this] { if (!holding_ && active() && !current()) { cancel(); } });
  connect(&canvas_, &CanvasSurface::viewportMoved, this, &InlinePropertyPresenter::reposition);
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
  return canvas_.selection().contains(node_) && canvas_.selection().count() == 1 && model_.inlineDescriptor(node_, name_) == descriptor_;
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
  auto widget = new InlineEditorWidget(engine_, &canvas_.viewportWidget());
  widget_ = widget;
  widget->setObjectName("inline-property-overlay");
  widget->setAttribute(Qt::WA_AlwaysStackOnTop);
  widget->setClearColor(Qt::transparent);
  widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
  widget->setInitialProperties({{"presenter", QVariant::fromValue(this)}, {"activationToken", generation_},
                                {"host", QVariant::fromValue(&host_)}});
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
  projectingResource_ = false;
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
  if (isCardControl(name)) {
    const auto node = node_;
    cancel();
    model_.setCardControl(node, name, value);
    canvas_.setFocus(Qt::OtherFocusReason);
    return;
  }
  const auto command = model_.propertyCommand(node_, name, QJsonValue::fromVariant(value));
  cancel();
  if (command["op"] == QStringLiteral("batch") && commitCommand) { commitCommand(command); }
  else if (commitProperty) { commitProperty(id, name, value); }
  canvas_.setFocus(Qt::OtherFocusReason);
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
  canvas_.setFocus(Qt::OtherFocusReason);
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
  widget_->setMask(region.intersected(QRegion(canvas_.viewportWidget().rect())));
}
void InlinePropertyPresenter::reposition() {
  if (holding_ || projectingResource_) { return; }
  if (!widget_ || !current()) { if (active()) { cancel(); } return; }
  auto local = model_.inlineFieldRect(node_, name_);
  if (contentHeight_ > 0 && name_ != "code") { local.setHeight(std::max(local.height(), contentHeight_)); }
  const auto kind = descriptor_["kind"].toString();
  // A small control, such as the Painter's swatch, opens a wider editor to its right.
  if (const auto minimum = descriptor_.value(QStringLiteral("minimumWidth")).toDouble(); minimum > local.width()) { local.setWidth(minimum); }
  // The code editor covers the card's code field exactly and has no Expand strip.
  if (name_ != "code" && (kind == "text" || kind == "multiline")) {
    if (expanded_) { local.setHeight(std::max(180.0, local.height())); }
    // A narrow action strip expands multiline editing without discarding draft.
    local.setHeight(local.height() + 24);
  }
  if (!canvas_.hasNode(node_)) { cancel(); return; }
  const auto sceneRect = local.translated(canvas_.nodeOrigin(node_));
  zoom_ = std::clamp(std::abs(canvas_.zoom()), 0.08, 8.0);
  const auto transform = canvas_.viewportTransform();
  editorRect_ = transform.mapRect(sceneRect);
  widget_->setGeometry(canvas_.viewportWidget().rect());
  if (!canvas_.viewportWidget().rect().intersects(editorRect_.toAlignedRect())) { cancel(); return; }
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
  if (active() && (object == &canvas_.viewportWidget() || object == &canvas_.hostWidget())) {
    if (event->type() == QEvent::Resize || event->type() == QEvent::Wheel) {
      const auto token = generation_;
      QTimer::singleShot(0, this, [this, token] { if (token == generation_) { reposition(); } });
    }
    if (event->type() == QEvent::MouseButtonPress) {
      const auto *mouse = static_cast<QMouseEvent *>(event);
      if (mouse->button() == Qt::LeftButton && name_ == QStringLiteral("prompt") && current()) {
        const auto local = canvas_.mapToNode(node_, canvas_.mapToScene(canvas_.viewportWidget().mapFromGlobal(mouse->globalPosition().toPoint())));
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
