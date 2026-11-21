#include "ui/CanvasOverlay.h"
#include "CanvasMediaPresenter.h"
#include "canvas/CanvasStyle.h"
#include "WorkflowGraphModel.h"
#include "media/MediaResolver.h"
#include <QEvent>
#include <QApplication>
#include <QQuickWindow>
#include <QQuickRenderControl>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QQuickItem>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QRegion>
#include <QSet>
#include <QTimer>
#include <QWheelEvent>
#include <algorithm>
#include <cmath>
namespace nodetool {
CanvasMediaPresenter::CanvasMediaPresenter(WorkflowGraphModel &model, QuickCanvas &canvas, QQmlEngine *engine, node_editor::MediaResolver &resolver, QObject *parent)
    : QObject(parent), model_(model), canvas_(canvas), engine_(engine), resolver_(resolver) {
  connect(&model_, &WorkflowGraphModel::modelReset, this, [this] { allPlayerNodesDirty_ = true; releaseOverlays(); schedule(); });
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
  connect(&canvas_.selection(), &CanvasSelection::selectionChanged, this, &CanvasMediaPresenter::schedule);
  connect(&canvas, &CanvasSurface::branchDimmingChanged, this, &CanvasMediaPresenter::schedule);
  connect(&canvas_, &CanvasSurface::viewportMoved, this, &CanvasMediaPresenter::schedule);
  qApp->installEventFilter(this);
  canvas_.hostWidget().installEventFilter(this);
  canvas_.viewportWidget().installEventFilter(this);
}
CanvasMediaPresenter::~CanvasMediaPresenter() {
  closeImageViewer();
  qApp->removeEventFilter(this);
  canvas_.hostWidget().removeEventFilter(this);
  canvas_.viewportWidget().removeEventFilter(this);
  releaseOverlays();
}
QList<QQuickItem *> CanvasMediaPresenter::activeItems() const {
  QList<QQuickItem *> result;
  for (const auto &entry : active_) {
    if (auto *root = entry.widget->rootObject()) { result.append(root); }
  }
  return result;
}

CanvasOverlay *CanvasMediaPresenter::createOverlay(QtNodes::NodeId node, const QString &file, const QString &name,
                                                   const QVariantMap &properties) {
  const QUrl source(QStringLiteral("qrc:/qt/qml/NodeTool/NodeEditor/") + file + QStringLiteral(".qml"));
  auto overlay = CanvasOverlay::onQuickCanvas(canvas_, *engine_, source, properties, 0, node);
  if (!overlay->rootObject()) { return nullptr; }
  overlay->setObjectName(name);
  auto *handle = overlay.get();
  overlays_.emplace(handle, std::move(overlay));
  return handle;
}

void CanvasMediaPresenter::retireOverlay(CanvasOverlay &overlay) {
  overlay.hide();
  overlay.setEnabled(false);
  if (auto *root = overlay.rootObject()) { QMetaObject::invokeMethod(root, "release"); }
  overlay.retireQuickRoot(retiredQuickRoots_);
  overlays_.erase(&overlay);
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
  if (entry.widget) { retireOverlay(*entry.widget); }
}
void CanvasMediaPresenter::releaseOverlays() {
  closeImageViewer();
  for (const auto &id : active_.keys()) { retire(id); }
  for (const auto &key : players_.keys()) { retirePlayer(key); }
  emit changed();
}
void CanvasMediaPresenter::retirePlayer(const QString &key) {
  const auto player = players_.take(key);
  if (player.widget) { retireOverlay(*player.widget); }
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
void CanvasMediaPresenter::showPlayers(QtNodes::NodeId node, const QRect &viewport, const QTransform &transform, double zoom,
                                       const QRegion &covered, QSet<QString> &visible) {
  const auto resource = model_.resourceId(node);
  for (const auto &row : model_.layout(node).rows) {
    if (row.kind != NodeRowKind::DropZone || row.media.isEmpty() || (row.mediaKind != "video" && row.mediaKind != "audio")) { continue; }
    QRectF local;
    for (const auto &item : row.media) { local = local.united(item.rect); }
    const auto mapped = transform.mapRect(canvas_.mapRectFromNode(node, local));
    const auto clipped = mapped.toAlignedRect().intersected(viewport);
    const auto exposed = QRegion(clipped).subtracted(covered);
    if (exposed.isEmpty()) { continue; }
    QVariantList items, geometry;
    for (const auto &item : row.media) {
      items.append(QVariantMap{{"kind", row.mediaKind}, {"locator", item.locator}, {"identity", item.identity},
                               {"rounded", !row.bare}, {"compact", row.mediaList}});
      geometry.append(QVariantMap{{"x", item.rect.x() - local.x()}, {"y", item.rect.y() - local.y()}, {"width", item.rect.width()}, {"height", item.rect.height()}});
    }
    const auto key = resource + '-' + row.propertyName;
    visible.insert(key);
    if (players_.contains(key) && (!players_[key].widget->rootObject() || players_[key].items != items)) { retirePlayer(key); }
    if (!players_.contains(key)) {
      auto *widget = createOverlay(node, "CardMediaPlayer", "card-media-" + key,
          {{"items", items}, {"geometry", geometry}, {"playerKey", key}, {"resolver", QVariant::fromValue<QObject *>(&resolver_)},
           {"requestKey", "card-media-player:" + key + ':' + QString::number(++serial_)}});
      if (!widget) { continue; }
      connect(widget->rootObject(), SIGNAL(naturalSizeReported(QString,int,int,int)), this, SLOT(reportNaturalSize(QString,int,int,int)));
      players_.insert(key, {widget, node, row.propertyName, row.mediaList, items, geometry});
    }
    auto &player = players_[key];
    auto *widget = player.widget;
    if (!widget || !widget->rootObject()) { continue; }
    widget->setGeometry(clipped);
    widget->setCardInteractiveArea(exposed);
    auto root = widget->rootObject();
    if (player.geometry != geometry) { root->setProperty("geometry", geometry); player.geometry = geometry; }
    root->setProperty("logicalWidth", local.width());
    root->setProperty("logicalHeight", local.height());
    root->setProperty("zoom", zoom);
    root->setProperty("offsetX", mapped.x() - clipped.x());
    root->setProperty("offsetY", mapped.y() - clipped.y());
    root->setProperty("mediaOpacity", model_.bypassed(node) ? node_metrics::disabledOpacity : 1.0);
    widget->show();
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
  releaseOverlays();
  model_.setCanvasMediaNodes({});
}
void CanvasMediaPresenter::refresh() {
  if (!engine_ || !canvas_.hostWidget().isVisible() || !canvas_.viewportWidget().isVisible()) { releaseOverlays(); return; }
  if (imageViewer_) {
    bool present = false;
    for (const auto id : model_.allNodeIds()) {
      if (model_.resourceId(id) == imageViewerNode_ && !model_.collapsed(id)) { present = true; break; }
    }
    if (!present) { closeImageViewer(); }
  }
  updatePlayerNodes();
  if (sources_.isEmpty() && playerNodes_.isEmpty() && active_.isEmpty() && players_.isEmpty()) { return; }
  const auto viewport = canvas_.viewportWidget().rect();
  const auto transform = canvas_.viewportTransform();
  const auto zoom = std::clamp(std::abs(canvas_.zoom()), 0.08, 8.0);
  QSet<QString> visible, visiblePlayers;
  QRegion covered;
  for (const auto node : canvas_.visibleNodes()) {
    const auto id = model_.resourceId(node);
    const auto source = sources_.constFind(id);
    const auto local = model_.canvasPlaybackRect(node);
    if (source != sources_.cend() && !local.isEmpty()) {
      const auto mapped = transform.mapRect(canvas_.mapRectFromNode(node, local));
      const auto clipped = mapped.toAlignedRect().intersected(viewport);
      const auto exposed = QRegion(clipped).subtracted(covered);
      if (!exposed.isEmpty()) {
        visible.insert(id);
        if (active_.contains(id) && (!active_[id].widget->rootObject() || active_[id].source.value("runId") != source->value("runId") || active_[id].source.value("outputName") != source->value("outputName"))) { retire(id); }
        if (!active_.contains(id)) {
          auto *widget = createOverlay(node, "CanvasMedia", "canvas-media-" + id,
              {{"richEntry", source->value("richEntry", QVariantMap{})}, {"mediaKind", source->value("kind")}, {"locator", source->value("locator")},
            {"filename", source->value("filename").toString()}, {"notice", source->value("notice").toString()}, {"items", source->value("items")}, {"previewActions", source->value("previewActions").toBool()}, {"resolver", QVariant::fromValue<QObject *>(&resolver_)}, {"requestKey", "canvas-media:" + id + ':' + QString::number(++serial_)}});
          if (!widget) { continue; }
          active_.insert(id, {widget, *source});
        }
        auto *widget = active_[id].widget;
        if (!widget || !widget->rootObject()) { continue; }
        widget->setGeometry(clipped);
        widget->setCardInteractiveArea(exposed);
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
        // Card stacking supplies branch opacity. The content also reflects bypass state.
        root->setProperty("mediaOpacity", model_.bypassed(node) ? node_metrics::disabledOpacity : 1.0);
        widget->show();
      }
    }
    if (playerNodes_.contains(node)) { showPlayers(node, viewport, transform, zoom, covered, visiblePlayers); }
    covered += QRegion(transform.mapRect(canvas_.nodeBounds(node)).toAlignedRect());
  }
  for (const auto &id : active_.keys()) { if (!visible.contains(id)) { retire(id); } }
  for (const auto &key : players_.keys()) { if (!visiblePlayers.contains(key)) { retirePlayer(key); } }
  emit changed();
}
void CanvasMediaPresenter::closeImageViewer() {
  if (!imageViewer_) { return; }
  auto viewer = imageViewer_.data();
  imageViewer_.clear();
  imageViewerNode_.clear();
  imageViewerSource_.clear();
  QMetaObject::invokeMethod(viewer, "dismiss");
  viewer->QObject::setParent(nullptr);
  const std::unique_ptr<QQuickWindow> detached(viewer);
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
  return engine_ && canvas_.hostWidget().isVisible() && canvas_.viewportWidget().isVisible() && source.value("kind") == "image" && source.value("items").toList().size() == 1
      && !model_.collapsed(id) && !model_.canvasResultRect(id).isEmpty();
}
bool CanvasMediaPresenter::openImageViewer(QtNodes::NodeId id) {
  const auto resource = model_.resourceId(id);
  const auto source = sources_.value(resource);
  const auto items = source.value("items").toList();
  if (!canOpenImageViewer(id)) { return false; }
  closeImageViewer();
  QQmlComponent component(engine_, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ImageViewer.qml"));
  std::unique_ptr<QObject> object(component.createWithInitialProperties({{"items", items}, {"selected", items.first()},
      {"currentIndex", 0}, {"resolver", QVariant::fromValue<QObject *>(&resolver_)}, {"scopeKey", "canvas-image:" + resource + ':' + QString::number(++serial_)}}));
  auto *viewer = qobject_cast<QQuickWindow *>(object.get());
  if (!viewer) { return false; }
  viewer->QObject::setParent(this);
  object.release();
  imageViewer_ = viewer;
  imageViewerNode_ = resource;
  imageViewerSource_ = source;
  viewer->setTransientParent(canvas_.hostWidget().window()->windowHandle());
  connect(viewer, &QWindow::visibleChanged, this, [this, viewer = QPointer(viewer)](bool visible) {
    if (!viewer || visible) { return; }
    if (imageViewer_ == viewer) { imageViewer_.clear(); imageViewerNode_.clear(); imageViewerSource_.clear(); }
    viewer->deleteLater();
    canvas_.setFocus(Qt::PopupFocusReason);
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
          if (current == imageViewer_ || current == canvas_.hostWidget().window()->windowHandle()) { return true; }
        }
        const auto quick = qobject_cast<QQuickWindow *>(window);
        return quick && QQuickRenderControl::renderWindowFor(quick) == canvas_.hostWidget().window()->windowHandle();
      };
      bool owned = false;
      for (auto target = object; target && !owned; target = target->parent()) {
        if (const auto widget = qobject_cast<QWidget *>(target)) { owned = widget->window() == canvas_.hostWidget().window(); }
        else if (const auto item = qobject_cast<QQuickItem *>(target)) { owned = ownsWindow(item->window()); }
        else if (const auto window = qobject_cast<QWindow *>(target)) { owned = ownsWindow(window); }
      }
      if (owned) { event->accept(); return true; }
    }
    for (const auto &[handle, overlay] : overlays_) {
      if (overlay->ownsFocus(object)) { event->accept(); return true; }
    }
  }
  if (object == &canvas_.viewportWidget() && event->type() == QEvent::MouseButtonDblClick) {
    const auto mouse = static_cast<QMouseEvent *>(event);
    if (mouse->button() == Qt::LeftButton && mouse->modifiers() == Qt::NoModifier) {
      const auto point = mouse->position().toPoint();
      // The first containing card owns the point, even when its result is empty.
      const auto node = canvas_.nodeAt(point);
      if (node != QtNodes::InvalidNodeId &&
          model_.canvasResultRect(node).contains(canvas_.mapToNode(node, canvas_.mapToScene(point))) &&
          openImageViewer(node)) {
        event->accept();
        return true;
      }
    }
  }
  if (object == &canvas_.hostWidget() || object == &canvas_.viewportWidget()) {
    if (event->type() == QEvent::Hide) { releaseOverlays(); }
    else if (event->type() == QEvent::Show || event->type() == QEvent::Resize || event->type() == QEvent::Wheel) { schedule(); }
  }
  return QObject::eventFilter(object, event);
}
}
