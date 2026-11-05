#include "CanvasMediaPresenter.h"
#include "EditorScene.h"
#include "WorkflowGraphModel.h"
#include <QEvent>
#include <QApplication>
#include <QQuickWindow>
#include <QGraphicsView>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQmlEngine>
#include <QRegion>
#include <QScrollBar>
#include <QTimer>
#include <QWheelEvent>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <algorithm>
#include <cmath>
namespace nodetool {
namespace {
class CanvasMediaWidget final : public QQuickWidget {
public:
  CanvasMediaWidget(QQmlEngine *engine, QWidget *parent) : QQuickWidget(engine, parent) {}
protected:
  bool event(QEvent *event) override {
    if (event->type() == QEvent::ShortcutOverride) { event->accept(); return true; }
    return QQuickWidget::event(event);
  }
  void mousePressEvent(QMouseEvent *event) override { QQuickWidget::mousePressEvent(event); event->accept(); }
  void mouseMoveEvent(QMouseEvent *event) override { QQuickWidget::mouseMoveEvent(event); event->accept(); }
  void mouseReleaseEvent(QMouseEvent *event) override { QQuickWidget::mouseReleaseEvent(event); event->accept(); }
  void mouseDoubleClickEvent(QMouseEvent *event) override { QQuickWidget::mouseDoubleClickEvent(event); event->accept(); }
  void wheelEvent(QWheelEvent *event) override { QQuickWidget::wheelEvent(event); event->accept(); }
  void keyPressEvent(QKeyEvent *event) override { QQuickWidget::keyPressEvent(event); event->accept(); }
  void keyReleaseEvent(QKeyEvent *event) override { QQuickWidget::keyReleaseEvent(event); event->accept(); }
};
}
CanvasMediaPresenter::CanvasMediaPresenter(WorkflowGraphModel &model, EditorScene &scene,
    QGraphicsView &view, QQmlEngine *engine, QObject *parent)
    : QObject(parent), model_(model), scene_(scene), view_(view), engine_(engine) {
  connect(&model_, &WorkflowGraphModel::modelReset, this, [this] { releaseWidgets(); schedule(); });
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, [this](QtNodes::NodeId) { schedule(); });
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, [this](QtNodes::NodeId) { schedule(); });
  connect(&model_, &WorkflowGraphModel::runtimeChanged, this, &CanvasMediaPresenter::schedule);
  connect(&scene_, &QGraphicsScene::selectionChanged, this, &CanvasMediaPresenter::schedule);
  connect(view.horizontalScrollBar(), &QScrollBar::valueChanged, this, &CanvasMediaPresenter::schedule);
  connect(view.verticalScrollBar(), &QScrollBar::valueChanged, this, &CanvasMediaPresenter::schedule);
  qApp->installEventFilter(this);
  view_.installEventFilter(this);
  view_.viewport()->installEventFilter(this);
}
CanvasMediaPresenter::~CanvasMediaPresenter() {
  qApp->removeEventFilter(this);
  view_.removeEventFilter(this);
  view_.viewport()->removeEventFilter(this);
  for (const auto &entry : active_) { delete entry.widget.data(); }
  for (const auto &widget : retired_) { delete widget.data(); }
}
QList<QQuickWidget *> CanvasMediaPresenter::activeWidgets() const {
  QList<QQuickWidget *> result;
  for (const auto &entry : active_) { if (entry.widget) { result.append(entry.widget); } }
  return result;
}
void CanvasMediaPresenter::schedule() {
  if (scheduled_) { return; }
  scheduled_ = true;
  QTimer::singleShot(0, this, [this] { scheduled_ = false; refresh(); });
}
void CanvasMediaPresenter::setSources(const QVariantList &sources) {
  QHash<QString, QVariantMap> next;
  for (const auto &value : sources) {
    auto source = value.toMap();
    const auto id = source.value("nodeId").toString();
    const auto kind = source.value("kind").toString();
    if (id.isEmpty() || (kind != "audio" && kind != "video" && kind != "image")) { continue; }
    auto item = source;
    if (item.value("itemKey").toString().isEmpty()) { item["itemKey"] = QString::number(next.value(id).value("items").toList().size()); }
    if (!next.contains(id)) { source["items"] = QVariantList{item}; next.insert(id, source); }
    else if (next[id].value("outputName") == source.value("outputName") && next[id].value("runId") == source.value("runId")) {
      auto items = next[id].value("items").toList(); items.append(item); next[id]["items"] = items;
    }
  }
  applySources(next);
}
void CanvasMediaPresenter::setCollections(const QVariantList &collections) {
  QHash<QString, QVariantMap> next;
  for (const auto &value : collections) {
    const auto collection = value.toMap();
    const auto id = collection.value("nodeId").toString();
    if (id.isEmpty() || next.contains(id)) { continue; }
    const auto rich = collection.value("richEntry").toMap();
    const auto renderer = rich.value("renderer").toString();
    // Specialized output owns its renderer even when it contains media refs.
    if (!rich.isEmpty() && (collection.value("items").toList().isEmpty()
        || (renderer != "generic" && renderer != "text" && renderer != "sequence"))) {
      auto source = collection;
      source["kind"] = "rich";
      source["locator"] = QVariantMap{};
      next.insert(id, source);
      continue;
    }
    const auto items = collection.value("items").toList();
    for (const auto &entry : items) {
      auto source = entry.toMap();
      const auto kind = source.value("kind").toString();
      if (kind != "image" && kind != "video" && kind != "audio") { continue; }
      source["nodeId"] = id; source["runId"] = collection.value("runId");
      source["outputName"] = collection.value("outputName"); source["items"] = items; source["notice"] = collection.value("notice").toString();
      next.insert(id, source); break;
    }
  }
  applySources(next);
}
void CanvasMediaPresenter::applySources(const QHash<QString, QVariantMap> &sources) {
  if (sources_ == sources) { return; }
  sources_ = sources;
  QSet<QString> mediaNodes;
  for (auto it = sources_.cbegin(); it != sources_.cend(); ++it) {
    if (it->value("kind") != "image" || it->value("items").toList().size() > 1) { mediaNodes.insert(it.key()); }
  }
  model_.setCanvasMediaNodes(mediaNodes);
  refresh();
}
void CanvasMediaPresenter::retire(const QString &id) {
  const auto entry = active_.take(id);
  if (!entry.widget) { return; }
  if (entry.widget->rootObject()) { QMetaObject::invokeMethod(entry.widget->rootObject(), "release"); }
  entry.widget->hide();
  entry.widget->setEnabled(false);
  retired_.removeIf([](const auto &widget) { return widget.isNull(); });
  retired_.append(entry.widget);
  entry.widget->deleteLater();
}
void CanvasMediaPresenter::releaseWidgets() {
  for (const auto &id : active_.keys()) { retire(id); }
  emit changed();
}
void CanvasMediaPresenter::clear() {
  sources_.clear();
  releaseWidgets();
  model_.setCanvasMediaNodes({});
}
void CanvasMediaPresenter::refresh() {
  if (!engine_ || !view_.isVisible() || !view_.viewport()->isVisible()) { releaseWidgets(); return; }
  const auto viewport = view_.viewport()->rect();
  const auto transform = view_.viewportTransform();
  const auto zoom = std::clamp(std::abs(view_.transform().m11()), 0.08, 8.0);
  const auto items = scene_.items(view_.mapToScene(viewport), Qt::IntersectsItemBoundingRect, Qt::DescendingOrder);
  QSet<QString> visible;
  QRegion covered;
  QList<QQuickWidget *> stacking;
  for (auto item : items) {
    const auto node = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item);
    if (!node || !node->isVisible()) { continue; }
    const auto id = model_.resourceId(node->nodeId());
    const auto source = sources_.constFind(id);
    const auto local = model_.canvasPlaybackRect(node->nodeId());
    if (source != sources_.cend() && !local.isEmpty()) {
      const auto mapped = transform.mapRect(node->mapRectToScene(local));
      const auto clipped = mapped.toAlignedRect().intersected(viewport);
      const auto mask = QRegion(clipped).subtracted(covered);
      if (!mask.isEmpty()) {
        visible.insert(id);
        if (active_.contains(id) && (active_[id].source.value("runId") != source->value("runId") || active_[id].source.value("outputName") != source->value("outputName"))) { retire(id); }
        if (!active_.contains(id)) {
          auto widget = new CanvasMediaWidget(engine_, view_.viewport());
          widget->setObjectName("canvas-media-" + id);
          widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
          widget->setClearColor(Qt::transparent);
          widget->setAttribute(Qt::WA_AlwaysStackOnTop);
          widget->setFocusPolicy(Qt::StrongFocus);
          widget->setInitialProperties({{"richEntry", source->value("richEntry", QVariantMap{})}, {"mediaKind", source->value("kind")}, {"locator", source->value("locator")},
            {"filename", source->value("filename").toString()}, {"notice", source->value("notice").toString()}, {"items", source->value("items")}, {"requestKey", "canvas-media:" + id + ':' + QString::number(++serial_)}});
          widget->setSource(QUrl("qrc:/editor/CanvasMedia.qml"));
          if (widget->status() == QQuickWidget::Error) { widget->deleteLater(); continue; }
          active_.insert(id, {widget, *source});
        }
        auto widget = active_[id].widget.data();
        if (!widget || !widget->rootObject()) { continue; }
        widget->setGeometry(clipped);
        widget->setMask(mask.translated(-clipped.topLeft()));
        auto root = widget->rootObject();
        if (active_[id].source != *source) {
          root->setProperty("richEntry", source->value("richEntry", QVariantMap{}));
          root->setProperty("items", source->value("items"));
          root->setProperty("notice", source->value("notice").toString());
          root->setProperty("mediaKind", source->value("kind"));
          active_[id].source = *source;
        }
        root->setProperty("logicalWidth", local.width());
        root->setProperty("logicalHeight", local.height());
        root->setProperty("zoom", zoom);
        root->setProperty("offsetX", mapped.x() - clipped.x());
        root->setProperty("offsetY", mapped.y() - clipped.y());
        root->setProperty("mediaOpacity", model_.bypassed(node->nodeId()) ? node_metrics::disabledOpacity : 1.0);
        widget->show();
        stacking.prepend(widget);
      }
    }
    covered += QRegion(transform.mapRect(node->sceneBoundingRect()).toAlignedRect());
  }
  for (const auto &id : active_.keys()) { if (!visible.contains(id)) { retire(id); } }
  for (auto widget : stacking) { widget->raise(); }
  if (auto editor = view_.viewport()->findChild<QQuickWidget *>("inline-property-overlay", Qt::FindDirectChildrenOnly)) { editor->raise(); }
  if (auto picker = view_.viewport()->findChild<QQuickWidget *>("compatible-node-picker", Qt::FindDirectChildrenOnly); picker && picker->isVisible()) { picker->raise(); }
  emit changed();
}
bool CanvasMediaPresenter::eventFilter(QObject *object, QEvent *event) {
  if (event->type() == QEvent::ShortcutOverride) {
    for (const auto &entry : active_) {
      if (!entry.widget) { continue; }
      bool inside = object == entry.widget || object == entry.widget->quickWindow();
      for (auto target = object; target && !inside; target = target->parent()) {
        inside = target == entry.widget || target == entry.widget->rootObject();
      }
      if (inside) { event->accept(); return true; }
    }
  }
  if (object == &view_ || object == view_.viewport()) {
    if (event->type() == QEvent::Hide) { releaseWidgets(); }
    else if (event->type() == QEvent::Show || event->type() == QEvent::Resize || event->type() == QEvent::Wheel) { schedule(); }
  }
  return QObject::eventFilter(object, event);
}
}
