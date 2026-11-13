#include "CanvasMediaPresenter.h"
#include "EditorScene.h"
#include "WorkflowGraphModel.h"
#include "media/MediaResolver.h"
#include <QEvent>
#include <QApplication>
#include <QQuickWindow>
#include <QQuickRenderControl>
#include <QGraphicsView>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QRegion>
#include <QScrollBar>
#include <QSet>
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
  // A wheel that no output scrolls goes on to the viewport, which zooms or pans the canvas.
  void wheelEvent(QWheelEvent *event) override {
    event->ignore();
    QQuickWidget::wheelEvent(event);
    if (event->isAccepted() || !parentWidget()) { event->accept(); return; }
    // Qt propagates only spontaneous wheel events, so hand this one to the viewport explicitly.
    QWheelEvent forwarded(mapToParent(event->position()), event->globalPosition(), event->pixelDelta(), event->angleDelta(),
      event->buttons(), event->modifiers(), event->phase(), event->inverted(), event->source());
    QCoreApplication::sendEvent(parentWidget(), &forwarded);
    event->accept();
  }
  void keyPressEvent(QKeyEvent *event) override { QQuickWidget::keyPressEvent(event); event->accept(); }
  void keyReleaseEvent(QKeyEvent *event) override { QQuickWidget::keyReleaseEvent(event); event->accept(); }
};
}
CanvasMediaPresenter::CanvasMediaPresenter(WorkflowGraphModel &model, EditorScene &scene,
    QGraphicsView &view, QQmlEngine *engine, node_editor::MediaResolver &resolver, QObject *parent)
    : QObject(parent), model_(model), scene_(scene), view_(view), engine_(engine), resolver_(resolver) {
  connect(&model_, &WorkflowGraphModel::modelReset, this, [this] { allPlayerNodesDirty_ = true; releaseWidgets(); schedule(); });
  // An incremental projection keeps the players of surviving nodes.
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, [this] {
    QSet<QString> present;
    for (const auto id : model_.allNodeIds()) { present.insert(model_.resourceId(id)); }
    bool retired = false;
    for (const auto &id : active_.keys()) {
      if (!present.contains(id)) { retire(id); retired = true; }
    }
    if (retired) { emit changed(); }
    allPlayerNodesDirty_ = true;
    schedule();
  });
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, [this](QtNodes::NodeId id) { dirtyPlayerNodes_.insert(id); schedule(); });
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, [this](QtNodes::NodeId) { schedule(); });
  connect(&model_, &WorkflowGraphModel::runtimeChanged, this, &CanvasMediaPresenter::schedule);
  connect(&scene_, &QGraphicsScene::selectionChanged, this, &CanvasMediaPresenter::schedule);
  connect(&scene_, &EditorScene::branchDimmingChanged, this, &CanvasMediaPresenter::schedule);
  connect(view.horizontalScrollBar(), &QScrollBar::valueChanged, this, &CanvasMediaPresenter::schedule);
  connect(view.verticalScrollBar(), &QScrollBar::valueChanged, this, &CanvasMediaPresenter::schedule);
  qApp->installEventFilter(this);
  view_.installEventFilter(this);
  view_.viewport()->installEventFilter(this);
}
CanvasMediaPresenter::~CanvasMediaPresenter() {
  closeImageViewer();
  qApp->removeEventFilter(this);
  view_.removeEventFilter(this);
  view_.viewport()->removeEventFilter(this);
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  for (const auto &entry : active_) { delete entry.widget.data(); }
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  for (const auto &player : players_) { delete player.widget.data(); }
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
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
      source["previewActions"] = collection.value("previewActions");
      next.insert(id, source); break;
    }
  }
  applySources(next);
}
void CanvasMediaPresenter::applySources(const QHash<QString, QVariantMap> &sources) {
  if (sources_ == sources) { return; }
  sources_ = sources;
  if (imageViewer_) {
    const auto source = sources_.value(imageViewerNode_);
    if (source.isEmpty() || source.value("runId") != imageViewerSource_.value("runId")
        || source.value("outputName") != imageViewerSource_.value("outputName")) { closeImageViewer(); }
    else {
      QVariantList images;
      for (const auto &entry : source.value("items").toList()) {
        if (entry.toMap().value("kind") == "image") { images.append(entry); }
      }
      QMetaObject::invokeMethod(imageViewer_, "sync", Q_ARG(QVariant, images));
    }
  }
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
  closeImageViewer();
  for (const auto &id : active_.keys()) { retire(id); }
  for (const auto &key : players_.keys()) { retirePlayer(key); }
  emit changed();
}
void CanvasMediaPresenter::retirePlayer(const QString &key) {
  const auto player = players_.take(key);
  if (!player.widget) { return; }
  if (player.widget->rootObject()) { QMetaObject::invokeMethod(player.widget->rootObject(), "release"); }
  player.widget->hide();
  player.widget->setEnabled(false);
  retired_.removeIf([](const auto &widget) { return widget.isNull(); });
  retired_.append(player.widget);
  player.widget->deleteLater();
}
void CanvasMediaPresenter::updatePlayerNodes() {
  const auto hasPlayer = [this](QtNodes::NodeId id) {
    if (!model_.nodeExists(id) || model_.collapsed(id)) { return false; }
    for (const auto &row : model_.layout(id).rows) {
      if (row.kind == NodeRowKind::DropZone && !row.media.isEmpty() && (row.mediaKind == "video" || row.mediaKind == "audio")) { return true; }
    }
    return false;
  };
  if (allPlayerNodesDirty_) {
    allPlayerNodesDirty_ = false;
    dirtyPlayerNodes_.clear();
    playerNodes_.clear();
    for (const auto id : model_.allNodeIds()) {
      if (hasPlayer(id)) { playerNodes_.insert(id); }
    }
    return;
  }
  for (const auto id : std::as_const(dirtyPlayerNodes_)) {
    if (hasPlayer(id)) { playerNodes_.insert(id); } else { playerNodes_.remove(id); }
  }
  dirtyPlayerNodes_.clear();
}
void CanvasMediaPresenter::showPlayers(QtNodes::NodeGraphicsObject &node, const QRect &viewport, const QTransform &transform, double zoom,
                                       const QRegion &covered, QSet<QString> &visible, QList<QQuickWidget *> &stacking) {
  const auto resource = model_.resourceId(node.nodeId());
  for (const auto &row : model_.layout(node.nodeId()).rows) {
    if (row.kind != NodeRowKind::DropZone || row.media.isEmpty() || (row.mediaKind != "video" && row.mediaKind != "audio")) { continue; }
    QRectF local;
    for (const auto &item : row.media) { local = local.united(item.rect); }
    const auto mapped = transform.mapRect(node.mapRectToScene(local));
    const auto clipped = mapped.toAlignedRect().intersected(viewport);
    const auto mask = QRegion(clipped).subtracted(covered);
    if (mask.isEmpty()) { continue; }
    QVariantList items, geometry;
    for (const auto &item : row.media) {
      items.append(QVariantMap{{"kind", row.mediaKind}, {"locator", item.locator}, {"identity", item.identity},
                               {"rounded", !row.bare}, {"compact", row.mediaList}});
      geometry.append(QVariantMap{{"x", item.rect.x() - local.x()}, {"y", item.rect.y() - local.y()}, {"width", item.rect.width()}, {"height", item.rect.height()}});
    }
    const auto key = resource + '-' + row.propertyName;
    visible.insert(key);
    if (players_.contains(key) && players_[key].items != items) { retirePlayer(key); }
    if (!players_.contains(key)) {
      auto widget = new CanvasMediaWidget(engine_, view_.viewport());
      widget->setObjectName("card-media-" + key);
      widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
      widget->setClearColor(Qt::transparent);
      widget->setAttribute(Qt::WA_AlwaysStackOnTop);
      widget->setFocusPolicy(Qt::StrongFocus);
      widget->setInitialProperties({{"items", items}, {"geometry", geometry}, {"playerKey", key}, {"resolver", QVariant::fromValue<QObject *>(&resolver_)},
                                    {"requestKey", "card-media-player:" + key + ':' + QString::number(++serial_)}});
      widget->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/CardMediaPlayer.qml"));
      if (widget->status() == QQuickWidget::Error || !widget->rootObject()) { widget->deleteLater(); continue; }
      connect(widget->rootObject(), SIGNAL(naturalSizeReported(QString,int,int,int)), this, SLOT(reportNaturalSize(QString,int,int,int)));
      players_.insert(key, {widget, node.nodeId(), row.propertyName, row.mediaList, items, geometry});
    }
    auto &player = players_[key];
    auto widget = player.widget.data();
    if (!widget || !widget->rootObject()) { continue; }
    widget->setGeometry(clipped);
    widget->setMask(mask.translated(-clipped.topLeft()));
    auto root = widget->rootObject();
    if (player.geometry != geometry) { root->setProperty("geometry", geometry); player.geometry = geometry; }
    root->setProperty("logicalWidth", local.width());
    root->setProperty("logicalHeight", local.height());
    root->setProperty("zoom", zoom);
    root->setProperty("offsetX", mapped.x() - clipped.x());
    root->setProperty("offsetY", mapped.y() - clipped.y());
    root->setProperty("mediaOpacity", (model_.bypassed(node.nodeId()) ? node_metrics::disabledOpacity : 1.0) * node.opacity());
    widget->show();
    stacking.prepend(widget);
  }
}
void CanvasMediaPresenter::reportNaturalSize(const QString &key, int index, int width, int height) {
  const auto found = players_.constFind(key);
  if (found == players_.cend() || found->list || !model_.nodeExists(found->id)) { return; }
  for (const auto &row : model_.layout(found->id).rows) {
    if (row.kind != NodeRowKind::DropZone || row.propertyName != found->property || index >= row.media.size()) { continue; }
    auto item = row.media[index];
    if (item.natural == QSize(width, height)) { return; }
    item.natural = QSize(width, height);
    item.state = CardMediaState::Ready;
    model_.setCardMedia(model_.resourceId(found->id), found->property, index, item);
    return;
  }
}
void CanvasMediaPresenter::clear() {
  sources_.clear();
  releaseWidgets();
  model_.setCanvasMediaNodes({});
}
void CanvasMediaPresenter::refresh() {
  if (!engine_ || !view_.isVisible() || !view_.viewport()->isVisible()) { releaseWidgets(); return; }
  if (imageViewer_) {
    bool present = false;
    for (const auto id : model_.allNodeIds()) {
      if (model_.resourceId(id) == imageViewerNode_ && !model_.collapsed(id)) { present = true; break; }
    }
    if (!present) { closeImageViewer(); }
  }
  const auto viewport = view_.viewport()->rect();
  const auto transform = view_.viewportTransform();
  const auto zoom = std::clamp(std::abs(view_.transform().m11()), 0.08, 8.0);
  updatePlayerNodes();
  const auto items = scene_.items(view_.mapToScene(viewport), Qt::IntersectsItemBoundingRect, Qt::DescendingOrder);
  QSet<QString> visible, visiblePlayers;
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
            {"filename", source->value("filename").toString()}, {"notice", source->value("notice").toString()}, {"items", source->value("items")}, {"previewActions", source->value("previewActions").toBool()}, {"resolver", QVariant::fromValue<QObject *>(&resolver_)}, {"requestKey", "canvas-media:" + id + ':' + QString::number(++serial_)}});
          widget->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/CanvasMedia.qml"));
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
          root->setProperty("previewActions", source->value("previewActions").toBool());
          active_[id].source = *source;
        }
        root->setProperty("logicalWidth", local.width());
        root->setProperty("logicalHeight", local.height());
        root->setProperty("zoom", zoom);
        root->setProperty("offsetX", mapped.x() - clipped.x());
        root->setProperty("offsetY", mapped.y() - clipped.y());
        // The widget sits above the canvas, so it follows the card opacity: disabled and off the selected branch.
        root->setProperty("mediaOpacity", (model_.bypassed(node->nodeId()) ? node_metrics::disabledOpacity : 1.0) * node->opacity());
        widget->show();
        stacking.prepend(widget);
      }
    }
    if (playerNodes_.contains(node->nodeId())) { showPlayers(*node, viewport, transform, zoom, covered, visiblePlayers, stacking); }
    covered += QRegion(transform.mapRect(node->sceneBoundingRect()).toAlignedRect());
  }
  for (const auto &id : active_.keys()) { if (!visible.contains(id)) { retire(id); } }
  for (const auto &key : players_.keys()) { if (!visiblePlayers.contains(key)) { retirePlayer(key); } }
  for (auto widget : stacking) { widget->raise(); }
  if (auto editor = view_.viewport()->findChild<QQuickWidget *>("inline-property-overlay", Qt::FindDirectChildrenOnly)) { editor->raise(); }
  if (auto picker = view_.viewport()->findChild<QQuickWidget *>("compatible-node-picker", Qt::FindDirectChildrenOnly); picker && picker->isVisible()) { picker->raise(); }
  emit changed();
}
void CanvasMediaPresenter::closeImageViewer() {
  if (!imageViewer_) { return; }
  auto viewer = imageViewer_.data();
  imageViewer_.clear();
  imageViewerNode_.clear();
  imageViewerSource_.clear();
  QMetaObject::invokeMethod(viewer, "dismiss");
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  delete viewer;
}
bool CanvasMediaPresenter::canViewImage(const QString &nodeId) const {
  for (const auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) == nodeId) { return canOpenImageViewer(id); }
  }
  return false;
}
QString CanvasMediaPresenter::imageOutputName(const QString &nodeId) const {
  const auto source = sources_.value(nodeId);
  return source.value("kind") == "image" ? source.value("outputName").toString() : QString{};
}
bool CanvasMediaPresenter::viewImage(const QString &nodeId) {
  for (const auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) == nodeId) { return openImageViewer(id); }
  }
  return false;
}
bool CanvasMediaPresenter::canOpenImageViewer(QtNodes::NodeId id) const {
  const auto source = sources_.value(model_.resourceId(id));
  return engine_ && view_.isVisible() && view_.viewport()->isVisible() && source.value("kind") == "image" && source.value("items").toList().size() == 1
      && !model_.collapsed(id) && !model_.canvasResultRect(id).isEmpty();
}
bool CanvasMediaPresenter::openImageViewer(QtNodes::NodeId id) {
  const auto resource = model_.resourceId(id);
  const auto source = sources_.value(resource);
  const auto items = source.value("items").toList();
  if (!canOpenImageViewer(id)) { return false; }
  closeImageViewer();
  QQmlComponent component(engine_, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ImageViewer.qml"));
  auto object = component.createWithInitialProperties({{"items", items}, {"selected", items.first()},
      {"currentIndex", 0}, {"resolver", QVariant::fromValue<QObject *>(&resolver_)}, {"scopeKey", "canvas-image:" + resource + ':' + QString::number(++serial_)}});
  auto viewer = qobject_cast<QQuickWindow *>(object);
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  if (!viewer) { delete object; return false; }
  viewer->QObject::setParent(this);
  imageViewer_ = viewer;
  imageViewerNode_ = resource;
  imageViewerSource_ = source;
  viewer->setTransientParent(view_.window()->windowHandle());
  connect(viewer, &QWindow::visibleChanged, this, [this, viewer](bool visible) {
    if (visible) { return; }
    if (imageViewer_ == viewer) { imageViewer_.clear(); imageViewerNode_.clear(); imageViewerSource_.clear(); }
    viewer->deleteLater();
    view_.setFocus(Qt::PopupFocusReason);
  });
  viewer->show();
  viewer->requestActivate();
  return true;
}
bool CanvasMediaPresenter::eventFilter(QObject *object, QEvent *event) {
  if (event->type() == QEvent::ShortcutOverride) {
    if (imageViewer_ && imageViewer_->isVisible()) {
      const auto ownsWindow = [this](QWindow *window) {
        for (auto current = window; current; current = current->transientParent()) {
          if (current == imageViewer_ || current == view_.window()->windowHandle()) { return true; }
        }
        const auto quick = qobject_cast<QQuickWindow *>(window);
        return quick && QQuickRenderControl::renderWindowFor(quick) == view_.window()->windowHandle();
      };
      bool owned = false;
      for (auto target = object; target && !owned; target = target->parent()) {
        if (const auto widget = qobject_cast<QWidget *>(target)) { owned = widget->window() == view_.window(); }
        else if (const auto item = qobject_cast<QQuickItem *>(target)) { owned = ownsWindow(item->window()); }
        else if (const auto window = qobject_cast<QWindow *>(target)) { owned = ownsWindow(window); }
      }
      if (owned) { event->accept(); return true; }
    }
    QList<QQuickWidget *> widgets = activeWidgets();
    for (const auto &player : players_) { if (player.widget) { widgets.append(player.widget); } }
    for (auto *widget : widgets) {
      bool inside = object == widget || object == widget->quickWindow();
      for (auto target = object; target && !inside; target = target->parent()) {
        inside = target == widget || target == widget->rootObject();
      }
      if (inside) { event->accept(); return true; }
    }
  }
  if (object == view_.viewport() && event->type() == QEvent::MouseButtonDblClick) {
    const auto mouse = static_cast<QMouseEvent *>(event);
    if (mouse->button() == Qt::LeftButton && mouse->modifiers() == Qt::NoModifier) {
      const auto scenePoint = view_.mapToScene(mouse->position().toPoint());
      // The first containing card owns the point, even when its result is empty.
      for (auto item : scene_.items(scenePoint, Qt::IntersectsItemBoundingRect, Qt::DescendingOrder)) {
        const auto node = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item);
        if (!node || !node->isVisible()) { continue; }
        if (model_.canvasResultRect(node->nodeId()).contains(node->mapFromScene(scenePoint)) && openImageViewer(node->nodeId())) {
          event->accept(); return true;
        }
        break;
      }
    }
  }
  if (object == &view_ || object == view_.viewport()) {
    if (event->type() == QEvent::Hide) { releaseWidgets(); }
    else if (event->type() == QEvent::Show || event->type() == QEvent::Resize || event->type() == QEvent::Wheel) { schedule(); }
  }
  return QObject::eventFilter(object, event);
}
}
