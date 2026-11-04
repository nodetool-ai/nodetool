#include "EditorWindow.h"
#include "media/VideoFrameView.h"
#include "graph/EditorScene.h"
#include "properties/PropertyFields.h"
#include <QApplication>
#include <QClipboard>
#include <QCloseEvent>
#include <QDockWidget>
#include <QFile>
#include <QFileDialog>
#include <QCursor>
#include <optional>
#include <QGraphicsView>
#include <QHBoxLayout>
#include <QInputDialog>
#include <QLineEdit>
#include <QJsonDocument>
#include <QKeyEvent>
#include <QMenu>
#include <QMessageBox>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QSaveFile>
#include <QScrollBar>
#include <QSignalBlocker>
#include <QSet>
#include <QTimer>
#include <QToolTip>
#include <QUndoStack>
#include <QVBoxLayout>
#include <QWheelEvent>
#include <QtNodes/ConnectionStyle>
#include <algorithm>
#include <QtNodes/NodeStyle>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
namespace nodetool {
namespace {
constexpr int narrowWindowWidth = 1000;
constexpr int compactToolbarWidth = 480;
} // namespace
EditorWindow::EditorWindow(QWidget *parent)
    : QMainWindow(parent), model_(this) {
  setWindowTitle(tr("NodeTool Workflow[*]"));
  resize(1440, 900);
  node_editor::registerMediaTypes();
  engine_ = new QQmlEngine(this);
  engine_->rootContext()->setContextProperty("editor", this);
  engine_->rootContext()->setContextProperty("runOutput", &runOutput_);
  engine_->rootContext()->setContextProperty("mediaResolver", &mediaResolver_);
  model_.setRuntimeModel(&runtime_);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &mediaResolver_, &node_editor::MediaResolver::configure);
  connect(&runOutput_, &node_editor::RunOutputModel::changed, this, [this] { runtime_.selectRun(runOutput_.selectedRunId()); syncRuntimePreviews(); emit panelChanged(); });
  connect(&mediaResolver_, &node_editor::MediaResolver::resolved, this, [this](const QString &key, const QUrl &url) {
    if (!key.startsWith("node-image:")) { return; }
    const auto id = key.mid(11);
    if (previewRun_ != runOutput_.selectedRunId() || !runtimePreviewSources_.contains(id)) { return; }
    model_.setRuntimePreview(id, QImage(url.toLocalFile()));
    mediaResolver_.release(key);
  });
  connect(&mediaResolver_, &node_editor::MediaResolver::cleared, this, [this] {
    for (auto it = runtimePreviewSources_.cbegin(); it != runtimePreviewSources_.cend(); ++it) { model_.setRuntimePreview(it.key(), {}); }
    runtimePreviewSources_.clear();
  });
  scene_ = new EditorScene(model_, this);
  // Plain QGraphicsView deliberately avoids QtNodes' clipboard and undo
  // actions.
  view_ = new QGraphicsView(scene_, this);
  view_->setRenderHint(QPainter::Antialiasing);
  view_->setRenderHint(QPainter::TextAntialiasing);
  view_->setDragMode(QGraphicsView::RubberBandDrag);
  view_->setFrameShape(QFrame::NoFrame);
  // Selected-node port labels sit outside their items, so a partial repaint would trail them.
  view_->setViewportUpdateMode(QGraphicsView::FullViewportUpdate);
  view_->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  view_->setVerticalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  view_->setSceneRect(-32767, -32767, 65534, 65534);
  view_->installEventFilter(this);
  view_->viewport()->installEventFilter(this);
  model_.commit = [this](const auto &c) {
    if (gesture_) {
      gestureCommands_.append(c);
      return true;
    }
    return apply(c);
  };
  model_.validateConnection = [this](const QJsonObject &edge) {
    if (readOnly()) {
      return false;
    }
    node_editor::WorkflowDocument candidate;
    auto loaded = candidate.load(document_.snapshot());
    if (!loaded) {
      return false;
    }
    candidate.setNodeMetadata(metadata_);
    return candidate.applyCommand({{"op", "addEdge"}, {"edge", edge}}).ok;
  };
  // The rail, tab strip, and status bar frame the docks, as in the web editor.
  dockHost_ = new QMainWindow(this);
  dockHost_->setWindowFlags(Qt::Widget);
  dockHost_->setCentralWidget(view_);
  dockHost_->setDockOptions(QMainWindow::AnimatedDocks);
  const auto dock = [this](const QString &title, const QString &file, Qt::DockWidgetArea area) {
    auto widget = new QDockWidget(title, dockHost_);
    widget->setFeatures(QDockWidget::NoDockWidgetFeatures);
    widget->setTitleBarWidget(new QWidget(widget));
    widget->setWidget(panel(file));
    dockHost_->addDockWidget(area, widget);
    return widget;
  };
  catalogDock_ = dock(tr("Nodes"), "Catalog", Qt::LeftDockWidgetArea);
  inspectorDock_ = dock(tr("Inspector"), "Inspector", Qt::RightDockWidgetArea);
  outputDock_ = dock(tr("Output"), "RunOutput", Qt::BottomDockWidgetArea);
  outputDock_->setObjectName("run-output-dock");
  outputDock_->setAllowedAreas(Qt::BottomDockWidgetArea);
  outputDock_->hide();
  inspectorDock_->hide();
  auto rail = panel("Rail");
  rail->setFixedWidth(rail->initialSize().width());
  auto tabs = panel("TabBar");
  tabs->setFixedHeight(tabs->initialSize().height());
  auto status = panel("StatusBar");
  status->setFixedHeight(status->initialSize().height());
  auto column = new QVBoxLayout;
  column->setContentsMargins(0, 0, 0, 0);
  column->setSpacing(0);
  column->addWidget(tabs);
  column->addWidget(dockHost_, 1);
  column->addWidget(status);
  auto root = new QWidget(this);
  auto row = new QHBoxLayout(root);
  row->setContentsMargins(0, 0, 0, 0);
  row->setSpacing(0);
  row->addWidget(rail);
  row->addLayout(column, 1);
  setCentralWidget(root);
  const auto overlay = [this](const QString &file) {
    auto widget = panel(file);
    widget->setParent(view_);
    widget->setAttribute(Qt::WA_AlwaysStackOnTop);
    widget->setClearColor(Qt::transparent);
    widget->setResizeMode(QQuickWidget::SizeViewToRootObject);
    connect(widget, &QQuickWidget::sceneGraphError, this, [](auto, const QString &message) { qWarning() << message; });
    return widget;
  };
  toolbarOverlay_ = overlay("Toolbar");
  viewportOverlay_ = overlay("ViewportIndicator");
  toolbarOverlay_->show();
  viewportOverlay_->show();
  layoutOverlays();
  connect(catalogDock_, &QDockWidget::visibilityChanged, this, [this] { emit panelChanged(); });
  connect(inspectorDock_, &QDockWidget::visibilityChanged, this, [this] { emit panelChanged(); });
  connect(outputDock_, &QDockWidget::visibilityChanged, this,
          [this] { emit panelChanged(); });
  connect(scene_, &QGraphicsScene::selectionChanged, this, [this] {
    const auto ids = selectedIds();
    const auto next = ids.size() == 1 ? ids.first() : QString{};
    if (selected_ != next) { selected_ = next; inspectorDismissed_ = false; syncInspector(); emit panelChanged(); }
    scheduleViewportSettle();
  });
  connect(scene_, &QtNodes::BasicGraphicsScene::nodeClicked, this,
          [this](auto id) {
            selected_ = model_.resourceId(id);
            inspectorDismissed_ = false;
            syncInspector();
            emit panelChanged();
            scheduleViewportSettle();
          });
  connect(&document_, &node_editor::WorkflowDocument::changed, this, [this] {
    session_.setSnapshot(document_.snapshot());
    if (!refreshPending_) {
      refreshPending_ = true;
      QTimer::singleShot(0, this, [this] {
        refreshPending_ = false;
        refresh();
      });
    }
  });
  connect(&session_, &node_editor::WorkflowSession::catalogChanged, this,
          [this] {
            auto c = session_.catalog();
            metadata_ = c["nodes"].toArray();
            if (metadata_.isEmpty()) {
              metadata_ = c["data"].toArray();
            }
            setCatalog(metadata_);
          });
  connect(&session_, &node_editor::WorkflowSession::workflowChanged, this,
          [this] {
            if (session_.workflow().isEmpty()) {
              return;
            }
            if (session_.workflow()["graph"] == document_.snapshot()["graph"]) {
              document_.reconcileMetadata(session_.workflow());
              refresh();
              return;
            }
            auto r = document_.load(session_.workflow());
            if (!r) {
              message_ = r.error;
            }
            refresh();
          });
  connect(&session_, &node_editor::WorkflowSession::workflowOpened, this,
          [this] {
            mediaResolver_.clear();
            auto result = document_.load(session_.workflow());
            if (result) {
              file_.clear();
              fitActive_ = true;
              scheduleViewportSettle();
              message_ = tr("Opened server workflow");
            } else {
              message_ = result.error;
            }
            refresh();
          });
  connect(&session_, &node_editor::WorkflowSession::errorOccurred, this,
          [this](const auto &m) {
            message_ = m;
            outputDock_->show();
            emit panelChanged();
          });
  connect(&session_, &node_editor::WorkflowSession::runSubmitted, this,
          [this](const QString &id) {
            run_ = id;
            runtime_.beginRun(id);
            runOutput_.beginRun(id);
            outputDock_->show();
          });
  connect(&session_, &node_editor::WorkflowSession::runEvent, this,
          [this](const QString &id, const QJsonObject &event) {
            runtime_.ingest(id, event);
            runOutput_.ingest(id, event);
            const auto status = event["status"].toString();
            if (event["type"] == "error" || status == "failed" || status == "error") {
              outputDock_->show();
            }
          });
  connect(&session_, &node_editor::WorkflowSession::saved, this,
          [this](const auto &) {
            if (!session_.dirty()) {
              document_.undoStack()->setClean();
              message_ = tr("Saved to server");
              refresh();
            }
          });
  connect(&session_, &node_editor::WorkflowSession::stateChanged, this,
          [this] {
            runtime_.setConnected(session_.connected());
            if (session_.connected() && message_ == tr("Connecting to server")) {
              message_ = tr("Connected to server");
            }
            emit panelChanged();
          });
  auto result = document_.load(
      QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{}},
                                        {"edges", QJsonArray{}}}}});
  if (!result) {
    message_ = result.error;
  }
  refresh();
}
EditorWindow::~EditorWindow() {
  // Panels bind to members of this class and must die before those members.
  for (auto panel : findChildren<QQuickWidget *>()) {
    delete panel;
  }
  view_->setScene(nullptr);
  delete scene_;
}
QQuickWidget *EditorWindow::panel(const QString &file) {
  // One engine keeps a single Theme singleton across every panel.
  auto w = new QQuickWidget(engine_, this);
  w->setResizeMode(QQuickWidget::SizeRootObjectToView);
  w->setSource(QUrl("qrc:/editor/" + file + ".qml"));
  return w;
}
void EditorWindow::syncRuntimePreviews() {
  QVariantList mediaEntries;
  for (const auto &value : runOutput_.entries()) {
    const auto entry = value.toMap();
    for (const auto &item : entry["media"].toList()) {
      auto media = item.toMap();
      media["runId"] = runOutput_.selectedRunId();
      media["nodeId"] = entry["nodeId"];
      media["outputName"] = entry["outputName"];
      mediaEntries.append(media);
    }
  }
  if (outputMedia_ != mediaEntries) { outputMedia_ = mediaEntries; emit mediaChanged(); }

  if (previewRun_ != runOutput_.selectedRunId()) {
    for (auto it = runtimePreviewSources_.cbegin(); it != runtimePreviewSources_.cend(); ++it) {
      mediaResolver_.cancel("node-image:" + it.key());
      model_.setRuntimePreview(it.key(), {});
      mediaResolver_.release("node-image:" + it.key());
    }
    runtimePreviewSources_.clear();
    previewRun_ = runOutput_.selectedRunId();
  }
  QSet<QString> imageNodes;
  for (const auto &value : runOutput_.entries()) {
    const auto entry = value.toMap();
    const auto id = entry["nodeId"].toString();
    if (id.isEmpty()) { continue; }
    for (const auto &mediaValue : entry["media"].toList()) {
      const auto media = mediaValue.toMap();
      if (media["kind"] != "image") { continue; }
      imageNodes.insert(id);
      const auto source = media["locator"];
      if (runtimePreviewSources_.value(id) != source) {
        model_.setRuntimePreview(id, {});
        runtimePreviewSources_[id] = source;
        mediaResolver_.resolve("node-image:" + id, source);
      }
      break;
    }
  }
  for (const auto &id : runtimePreviewSources_.keys()) {
    if (!imageNodes.contains(id)) {
      mediaResolver_.cancel("node-image:" + id);
      model_.setRuntimePreview(id, {});
      mediaResolver_.release("node-image:" + id);
      runtimePreviewSources_.remove(id);
    }
  }
}
bool EditorWindow::runActive() const {
  for (const auto &item : runOutput_.runs()) {
    const auto run = item.toMap();
    if (run["jobId"].toString() == run_) { return !run["terminal"].toBool(); }
  }
  return false;
}
bool EditorWindow::outputVisible() const { return outputDock_ && !outputDock_->isHidden(); }
bool EditorWindow::catalogVisible() const { return catalogDock_ && !catalogDock_->isHidden(); }
bool EditorWindow::inspectorVisible() const { return inspectorDock_ && !inspectorDock_->isHidden(); }
QString EditorWindow::workflowName() const {
  return document_.snapshot()["name"].toString(tr("Untitled workflow"));
}
QString EditorWindow::graphSummary() const {
  return tr("%1 nodes  ·  %2 edges").arg(document_.nodes().size()).arg(document_.edges().size());
}
QVariantMap EditorWindow::selectionInfo() const {
  const auto node = document_.node(selected_);
  if (node.isEmpty()) { return {}; }
  QJsonObject metadata;
  QtNodes::NodeId graphId = QtNodes::InvalidNodeId;
  for (auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) == selected_) { graphId = id; metadata = model_.metadata(id); }
  }
  if (graphId == QtNodes::InvalidNodeId) { return {}; }
  const auto ports = [&](QtNodes::PortType type) {
    QVariantList rows;
    const auto list = model_.ports(graphId, type);
    for (int i = 0; i < list.size(); ++i) {
      const auto id = model_.portData<QtNodes::NodeDataType>(graphId, type, QtNodes::PortIndex(i), QtNodes::PortRole::DataType).id;
      rows.append(QVariantMap{{"name", model_.portData<QString>(graphId, type, QtNodes::PortIndex(i), QtNodes::PortRole::Caption)},
                              {"type", id.isEmpty() ? QStringLiteral("unknown") : id}, {"color", typeColor(id)}});
    }
    return rows;
  };
  const auto &layout = model_.layout(graphId);
  const auto type = node["type"].toString();
  return {{"title", layout.title}, {"icon", layout.icon},
          {"namespace", metadata["namespace"].toString(type.section('.', 0, -2))},
          {"description", metadata["description"].toString()},
          {"inputs", ports(QtNodes::PortType::In)}, {"outputs", ports(QtNodes::PortType::Out)}};
}
int EditorWindow::zoomPercent() const { return int(std::round(view_->transform().m11() * 100)); }
QString EditorWindow::iconPath(const QString &name) const { return nodetool::iconPath(name); }
void EditorWindow::showToolTip(const QString &text) {
  if (text.isEmpty()) { QToolTip::hideText(); } else { QToolTip::showText(QCursor::pos(), text, this); }
}
void EditorWindow::syncInspector() {
  if (!inspectorDock_) { return; }
  const bool show = !inspectorDismissed_ && (!selected_.isEmpty() || readOnly());
  inspectorDock_->setVisible(show);
  // A narrow window shows one side panel at a time and restores the catalog afterward.
  if (show && width() < narrowWindowWidth && catalogVisible()) {
    catalogAutoHidden_ = true;
    catalogDock_->hide();
  } else if (catalogAutoHidden_ && (!show || width() >= narrowWindowWidth)) {
    catalogAutoHidden_ = false;
    catalogDock_->show();
  }
}
void EditorWindow::layoutOverlays() {
  if (!toolbarOverlay_ || !viewportOverlay_) { return; }
  const auto area = view_->rect();
  if (auto root = toolbarOverlay_->rootObject()) { root->setProperty("compact", area.width() < compactToolbarWidth); }
  const auto toolbar = toolbarOverlay_->sizeHint();
  toolbarOverlay_->setGeometry(std::max(0, (area.width() - toolbar.width()) / 2), std::max(0, area.height() - toolbar.height() - 20), toolbar.width(), toolbar.height());
  const auto corner = viewportOverlay_->sizeHint();
  // The web keeps the zoom readout beside the toolbar's end when both fit.
  viewportOverlay_->setGeometry(std::max(0, area.width() - corner.width() - 16), std::max(0, area.height() - corner.height() - 16), corner.width(), corner.height());
  viewportOverlay_->setVisible(area.width() >= toolbar.width() + 2 * corner.width() + 32);
}
bool EditorWindow::selectNode(const QString &resourceId) {
  for (auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) != resourceId) { continue; }
    scene_->clearSelection();
    scene_->nodeGraphicsObject(id)->setSelected(true);
    emit scene_->nodeClicked(id);
    return true;
  }
  return false;
}
void EditorWindow::setDarkTheme(bool dark) {
  if (auto theme = engine_->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme")) {
    theme->setProperty("preference", dark ? 2 : 3);
  }
}
void EditorWindow::zoomBy(double factor) {
  const auto scale = view_->transform().m11() * factor;
  if (scale < 0.12 || scale > 4) { return; }
  fitActive_ = false;
  view_->setTransformationAnchor(QGraphicsView::AnchorViewCenter);
  view_->scale(factor, factor);
  emit zoomChanged();
}
void EditorWindow::showMoreMenu() {
  auto menu = new QMenu(this);
  menu->setAttribute(Qt::WA_DeleteOnClose);
  for (const auto &name : {QStringLiteral("Connect"), QStringLiteral("Server Open"), QStringLiteral("Server Save"), QStringLiteral("Reconnect"), QStringLiteral("Stop"), QString(), QStringLiteral("Copy"), QStringLiteral("Paste"), QStringLiteral("Duplicate"), QStringLiteral("Delete"), QString(), QStringLiteral("Fit")}) {
    if (name.isEmpty()) { menu->addSeparator(); continue; }
    menu->addAction(name, this, [this, name] { action(name); });
  }
  menu->popup(QCursor::pos() - QPoint(0, menu->sizeHint().height()));
}
QString EditorWindow::readOnlyReason() const {
  if (document_.isReadOnly()) {
    return document_.readOnlyReason();
  }
  if (!document_.graph()["links"].toArray().isEmpty()) {
    return tr("Read-only: lineage links are preserved but cannot be displayed "
              "by this editor.");
  }
  for (auto v : document_.nodes()) {
    auto n = v.toObject();
    if (!n["parent_id"].toString().isEmpty() ||
        n["type"].toString() == "group" || n["type"].toString() == "comment") {
      return tr("Read-only: groups and comments require the web editor.");
    }
  }
  return {};
}
bool EditorWindow::apply(const QJsonObject &c) {
  if (readOnly()) {
    message_ = readOnlyReason();
    emit panelChanged();
    return false;
  }
  auto r = document_.applyCommand(c);
  if (!r) {
    message_ = r.error;
    emit panelChanged();
  }
  return r.ok;
}
void EditorWindow::setCatalog(const QJsonArray &metadata) {
  metadata_ = metadata;
  document_.setNodeMetadata(metadata_);
  refresh();
  scheduleViewportSettle();
}
void EditorWindow::refresh() {
  auto selected = selectedIds();
  const QSignalBlocker selectionBlocker(scene_);
  model_.project(document_.snapshot(), metadata_, readOnly());
  for (auto id : model_.allNodeIds()) {
    if (selected.contains(model_.resourceId(id))) {
      scene_->nodeGraphicsObject(id)->setSelected(true);
    }
  }
  if (document_.node(selected_).isEmpty()) { selected_.clear(); }
  setWindowTitle(
      document_.snapshot()["name"].toString(tr("NodeTool Workflow")) + "[*]");
  setWindowModified(!document_.undoStack()->isClean());
  syncInspector();
  emit panelChanged();
}
QVariantList EditorWindow::catalog() const {
  QVariantList r;
  for (auto v : metadata_) {
    auto m = v.toObject();
    auto type = m["node_type"].toString(m["type"].toString());
    const auto ns = m["namespace"].toString(type.section('.', 0, -2));
    const auto outputs = m["outputs"].toArray();
    const auto output = outputs.isEmpty() ? QJsonValue{} : outputs[0].toObject()["type"];
    const auto outputType = output.isString() ? output.toString() : output.toObject()["type"].toString();
    r.append(QVariantMap{{"type", type}, {"label", m["title"].toString(type)},
                         {"namespace", ns}, {"category", displayName(ns.section('.', -1))},
                         {"description", m["description"].toString()},
                         {"icon", typeIcon(outputType)}, {"color", typeColor(outputType)}});
  }
  return r;
}
QVariantList EditorWindow::properties() const {
  const auto node = document_.node(selected_);
  QJsonObject metadata;
  for (const auto &v : metadata_) {
    if (v.toObject()["node_type"] == node["type"]) { metadata = v.toObject(); break; }
  }
  auto rows = node_editor::propertyFields(node, metadata, document_.edges());
  if (readOnly()) {
    for (auto &v : rows) { auto row = v.toMap(); row["editable"] = false; v = row; }
  }
  return rows;
}
void EditorWindow::addNode(const QString &type) { model_.addNode(type); }
void EditorWindow::setProperty(const QString &name, const QVariant &value) {
  commitProperty(selected_, name, value);
}
bool EditorWindow::commitProperty(const QString &nodeId, const QString &name, const QVariant &value) {
  if (nodeId.isEmpty() || nodeId != selected_) { return false; }
  if ((value.metaType().id() == QMetaType::Double || value.metaType().id() == QMetaType::Float) && !std::isfinite(value.toDouble())) { return false; }
  return apply({{"op", "setProperty"}, {"id", nodeId}, {"name", name}, {"value", QJsonValue::fromVariant(value)}});
}
bool EditorWindow::removeProperty(const QString &nodeId, const QString &name) {
  if (nodeId.isEmpty() || nodeId != selected_) { return false; }
  return apply({{"op", "removeProperty"}, {"id", nodeId}, {"name", name}});
}

QStringList EditorWindow::selectedIds() const {
  QStringList ids;
  for (auto item : scene_->selectedItems()) {
    if (auto n = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item)) {
      ids.append(model_.resourceId(n->nodeId()));
    }
  }
  return ids;
}
void EditorWindow::fit() {
  fitActive_ = true;
  applyFit();
  emit zoomChanged();
}
QRectF EditorWindow::unobstructedViewport() const {
  const QRectF area = view_->viewport()->rect();
  if (!toolbarOverlay_ || !toolbarOverlay_->isVisible()) { return area; }
  const auto toolbarTop = toolbarOverlay_->geometry().top() - 8.0;
  // On a very short canvas the toolbar has to overlap the graph.
  return toolbarTop > area.height() / 2 ? area.adjusted(0, 0, 0, toolbarTop - area.height()) : area;
}
void EditorWindow::applyFit() {
  QRectF bounds;
  for (auto id : model_.allNodeIds()) {
    const auto margin = node_metrics::handleDiameter / 2;
    bounds |= scene_->nodeGraphicsObject(id)->mapRectToScene(QRectF(QPointF(0, 0), QSizeF(model_.layout(id).size))).adjusted(-margin, -margin, margin, margin);
  }
  const auto area = unobstructedViewport();
  view_->setTransformationAnchor(QGraphicsView::AnchorViewCenter);
  if (bounds.isEmpty() || area.isEmpty()) {
    view_->resetTransform();
    view_->centerOn(0, 0);
    return;
  }
  // React Flow's fitView padding of 0.1. The native editor stops at 100%.
  const auto padded = bounds.size() * 1.1;
  const auto zoom = std::clamp(std::min(area.width() / padded.width(), area.height() / padded.height()), 0.12, 1.0);
  view_->setTransform(QTransform::fromScale(zoom, zoom));
  const auto offset = (QRectF(view_->viewport()->rect()).center() - area.center()) / zoom;
  view_->centerOn(bounds.center() + offset);
}
void EditorWindow::revealSelection() {
  const auto modelId = [&]() -> std::optional<QtNodes::NodeId> {
    for (auto id : model_.allNodeIds()) {
      if (model_.resourceId(id) == selected_) { return id; }
    }
    return std::nullopt;
  }();
  if (!modelId) { return; }
  const auto node = scene_->nodeGraphicsObject(*modelId);
  const auto rect = view_->mapFromScene(node->mapRectToScene(QRectF(QPointF(0, 0), QSizeF(model_.layout(*modelId).size)))).boundingRect();
  const auto area = unobstructedViewport().toRect();
  const auto delta = [](int low, int high, int areaLow, int areaHigh) {
    if (high - low > areaHigh - areaLow || low < areaLow) { return low - areaLow; }
    return high > areaHigh ? high - areaHigh : 0;
  };
  view_->horizontalScrollBar()->setValue(view_->horizontalScrollBar()->value() + delta(rect.left(), rect.right(), area.left(), area.right()));
  view_->verticalScrollBar()->setValue(view_->verticalScrollBar()->value() + delta(rect.top(), rect.bottom(), area.top(), area.bottom()));
}
void EditorWindow::scheduleViewportSettle() {
  if (settlePending_) { return; }
  settlePending_ = true;
  // Runs after a dock change has laid out and resized the canvas.
  QMetaObject::invokeMethod(this, [this] {
    settlePending_ = false;
    if (fitActive_) { applyFit(); emit zoomChanged(); } else { revealSelection(); }
  }, Qt::QueuedConnection);
}
bool EditorWindow::openFile(const QString &path) {
  if (!confirmOpen()) {
    return false;
  }
  QFile f(path);
  if (!f.open(QIODevice::ReadOnly)) {
    message_ = f.errorString();
    emit panelChanged();
    return false;
  }
  auto r = document_.loadJson(f.readAll());
  if (!r) {
    message_ = r.error;
    emit panelChanged();
    return false;
  }
  mediaResolver_.clear();
  file_ = path;
  refresh();
  QTimer::singleShot(0, this, &EditorWindow::fit);
  return true;
}
bool EditorWindow::saveFile(const QString &path) {
  QSaveFile f(path);
  auto bytes = QJsonDocument(document_.snapshot()).toJson();
  if (!f.open(QIODevice::WriteOnly) || f.write(bytes) != bytes.size() ||
      !f.commit()) {
    message_ = f.errorString();
    emit panelChanged();
    return false;
  }
  file_ = path;
  document_.undoStack()->setClean();
  message_ = tr("Saved");
  refresh();
  return true;
}
void EditorWindow::action(const QString &name) {
  if (name == "Output") {
    outputDock_->setVisible(!outputVisible());
    return;
  }
  if (name == "Toggle nodes") {
    catalogAutoHidden_ = false;
    catalogDock_->setVisible(!catalogVisible());
    return;
  }
  if (name == "Toggle inspector") {
    inspectorDismissed_ = inspectorVisible();
    inspectorDock_->setVisible(!inspectorDismissed_);
    return;
  }
  if (name == "Clear selection") {
    scene_->clearSelection();
    selected_.clear();
    inspectorDismissed_ = true;
    syncInspector();
    emit panelChanged();
    return;
  }
  if (name == "More") {
    showMoreMenu();
    return;
  }
  if (name == "Zoom in" || name == "Zoom out") {
    zoomBy(name == "Zoom in" ? 1.2 : 1 / 1.2);
    return;
  }
  if (name == "Reset zoom") {
    fitActive_ = false;
    view_->setTransformationAnchor(QGraphicsView::AnchorViewCenter);
    view_->resetTransform();
    emit zoomChanged();
    return;
  }
  if (name == "Add node") {
    auto widgets = findChildren<QQuickWidget *>();
    for (auto panel : widgets) {
      if (panel->source().fileName() == "Catalog.qml") {
        panel->parentWidget()->show();
        panel->setFocus();
        if (auto field =
                panel->rootObject()->findChild<QQuickItem *>("nodeSearch")) {
          field->forceActiveFocus();
        }
      }
    }
    return;
  }
  if (name == "Connect" || (name == "Reconnect" && session_.serverUrl().isEmpty())) {
    bool accepted = false;
    const auto current = session_.serverUrl();
    const auto address = QInputDialog::getText(
        this, tr("Connect to server"), tr("Server URL"), QLineEdit::Normal,
        current.isEmpty() ? QStringLiteral("http://localhost:7777") : current.toString(),
        &accepted);
    if (!accepted) {
      return;
    }
    const auto token = QInputDialog::getText(
        this, tr("Server authentication"),
        tr("Access token (optional, kept only for this session)"),
        QLineEdit::Password, {}, &accepted);
    if (!accepted) {
      return;
    }
    message_ = tr("Connecting to server");
    session_.connectToServer(QUrl(address.trimmed()), token);
    emit panelChanged();
    return;
  }
  if (name == "Server Open") {
    if (!confirmOpen()) {
      return;
    }
    auto id = QInputDialog::getText(this, tr("Open server workflow"),
                                    tr("Workflow ID"));
    if (!id.isEmpty()) {
      session_.openWorkflow(id);
    }
    return;
  }
  if (name == "Reconnect") {
    session_.reconnectTransport();
    return;
  }
  if (name == "Server Save") {
    session_.setSnapshot(document_.snapshot());
    session_.save();
    return;
  }
  if (readOnly() && (name == "Run" || name == "Delete" || name == "Paste" ||
                     name == "Duplicate")) {
    message_ = readOnlyReason();
    emit panelChanged();
    return;
  }
  if (name == "Undo") {
    document_.undo();
  } else if (name == "Redo") {
    document_.redo();
  } else if (name == "Fit") {
    fit();
  } else if (name == "Open") {
    auto p = QFileDialog::getOpenFileName(this, tr("Open workflow"), {},
                                          tr("Workflow (*.json)"));
    if (!p.isEmpty()) {
      openFile(p);
    }
  } else if (name == "Save") {
    auto p = file_.isEmpty()
                 ? QFileDialog::getSaveFileName(this, tr("Save workflow"), {},
                                                tr("Workflow (*.json)"))
                 : file_;
    if (!p.isEmpty()) {
      saveFile(p);
    }
  } else if (name == "Run") {
    run_ = session_.run(document_.snapshot());
  } else if (name == "Stop") {
    session_.stop(run_);
  } else if (name == "Delete") {
    QJsonArray commands;
    for (auto item : scene_->selectedItems()) {
      if (auto c =
              qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(item)) {
        auto wanted = model_.edge(c->connectionId());
        for (auto v : document_.edges()) {
          auto e = v.toObject();
          if (e["source"] == wanted["source"] &&
              e["target"] == wanted["target"] &&
              e["sourceHandle"] == wanted["sourceHandle"] &&
              e["targetHandle"] == wanted["targetHandle"]) {
            commands.append(QJsonObject{{"op", "removeEdge"}, {"id", e["id"]}});
          }
        }
      }
    }
    auto ids = selectedIds();
    if (!ids.isEmpty()) {
      commands.append(QJsonObject{{"op", "removeNodes"},
                                  {"ids", QJsonArray::fromStringList(ids)}});
    }
    if (!commands.isEmpty()) {
      apply({{"op", "batch"}, {"commands", commands}});
    }
  } else if (name == "Copy") {
    QApplication::clipboard()->setText(QString::fromUtf8(
        QJsonDocument(document_.copy(selectedIds())).toJson()));
  } else if (name == "Paste") {
    auto fragment =
        QJsonDocument::fromJson(QApplication::clipboard()->text().toUtf8());
    if (fragment.isObject()) {
      apply({{"op", "paste"},
             {"fragment", fragment.object()},
             {"offset", QJsonObject{{"x", 24}, {"y", 24}}}});
    }
  } else if (name == "Duplicate") {
    auto r = document_.duplicate(selectedIds());
    if (!r) {
      message_ = r.error;
      emit panelChanged();
    }
  }
}
bool EditorWindow::eventFilter(QObject *object, QEvent *event) {
  if (event->type() == QEvent::Resize && object == view_->viewport()) {
    layoutOverlays();
    scheduleViewportSettle();
  }
  if (event->type() == QEvent::Wheel && object == view_->viewport()) {
    auto wheel = static_cast<QWheelEvent *>(event);
    auto factor = wheel->angleDelta().y() > 0 ? 1.15 : 1.0 / 1.15;
    auto scale = view_->transform().m11() * factor;
    if (scale >= 0.12 && scale <= 4) {
      fitActive_ = false;
      view_->setTransformationAnchor(QGraphicsView::AnchorUnderMouse);
      view_->scale(factor, factor);
      emit zoomChanged();
    }
    return true;
  }
  if (event->type() == QEvent::MouseButtonPress &&
      object == view_->viewport()) {
    auto mouse = static_cast<QMouseEvent *>(event);
    if (mouse->button() == Qt::MiddleButton) {
      panning_ = true;
      fitActive_ = false;
      panPosition_ = mouse->position().toPoint();
      return true;
    }
  }
  if (event->type() == QEvent::MouseMove && panning_) {
    auto mouse = static_cast<QMouseEvent *>(event);
    auto delta = mouse->position().toPoint() - panPosition_;
    panPosition_ = mouse->position().toPoint();
    view_->horizontalScrollBar()->setValue(
        view_->horizontalScrollBar()->value() - delta.x());
    view_->verticalScrollBar()->setValue(view_->verticalScrollBar()->value() -
                                         delta.y());
    return true;
  }
  if (event->type() == QEvent::MouseButtonRelease && panning_) {
    panning_ = false;
    return true;
  }
  if (event->type() == QEvent::MouseButtonPress &&
      object == view_->viewport()) {
    gesture_ = true;
    gestureCommands_ = {};
  }
  if (event->type() == QEvent::MouseButtonRelease &&
      object == view_->viewport()) {
    QTimer::singleShot(0, this, [this] {
      QJsonObject positions;
      for (auto id : model_.allNodeIds()) {
        auto p = model_.nodeData(id, QtNodes::NodeRole::Position).toPointF();
        auto old = document_.node(model_.resourceId(id))["ui_properties"]
                       .toObject()["position"]
                       .toObject();
        if (p != QPointF(old["x"].toDouble(), old["y"].toDouble())) {
          positions[model_.resourceId(id)] =
              QJsonObject{{"x", p.x()}, {"y", p.y()}};
        }
      }
      if (!positions.isEmpty()) {
        fitActive_ = false;
        gestureCommands_.append(
            QJsonObject{{"op", "moveNodes"}, {"positions", positions}});
      }
      gesture_ = false;
      bool detachOnly = !gestureCommands_.isEmpty();
      for (auto v : gestureCommands_) {
        if (v.toObject()["op"] != "removeEdge") {
          detachOnly = false;
        }
      }
      if (detachOnly) {
        gestureCommands_ = {};
        refresh();
      }
      if (!gestureCommands_.isEmpty()) {
        apply({{"op", "batch"}, {"commands", gestureCommands_}});
        gestureCommands_ = {};
      }
      scene_->undoStack().clear();
    });
  }
  if (event->type() == QEvent::KeyPress) {
    auto key = static_cast<QKeyEvent *>(event);
    QString command;
    if (key->key() == Qt::Key_Escape) {
      gesture_ = false;
      gestureCommands_ = {};
      scene_->resetDraftConnection();
      refresh();
      return true;
    }
    if (key->key() == Qt::Key_Space) {
      command = "Add node";
    } else if (key->key() == Qt::Key_D &&
               key->modifiers().testFlag(Qt::ControlModifier)) {
      command = "Duplicate";
    } else if (key->matches(QKeySequence::Save)) {
      command = "Save";
    } else if (key->matches(QKeySequence::Open)) {
      command = "Open";
    } else if (key->matches(QKeySequence::Undo)) {
      command = "Undo";
    } else if (key->matches(QKeySequence::Redo)) {
      command = "Redo";
    } else if (key->matches(QKeySequence::Copy)) {
      command = "Copy";
    } else if (key->matches(QKeySequence::Paste)) {
      command = "Paste";
    } else if (key->key() == Qt::Key_Delete) {
      command = "Delete";
    } else if (key->key() == Qt::Key_F) {
      command = "Fit";
    }
    if (!command.isEmpty()) {
      action(command);
      return true;
    }
  }
  return QMainWindow::eventFilter(object, event);
}
bool EditorWindow::confirmOpen() {
  if (document_.undoStack()->isClean()) {
    return true;
  }
  auto choice = QMessageBox::warning(
      this, tr("Unsaved workflow"),
      tr("Save changes before opening another workflow?"),
      QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel);
  if (choice == QMessageBox::Save) {
    action("Save");
    return document_.undoStack()->isClean();
  }
  return choice == QMessageBox::Discard;
}
void EditorWindow::presentation(const QVariantMap &roles) {
  scene_->setReducedMotion(roles.value("reducedMotion").toBool());
  auto color = [&](const char *name) {
    return roles.value(name).value<QColor>();
  };
  QPalette palette;
  palette.setColor(QPalette::Window, color("panel"));
  palette.setColor(QPalette::WindowText, color("text"));
  palette.setColor(QPalette::Base, color("canvas"));
  palette.setColor(QPalette::Text, color("text"));
  palette.setColor(QPalette::Button, color("panel"));
  palette.setColor(QPalette::ButtonText, color("text"));
  setPalette(palette);
  const auto css = [](const QColor &c) { return QStringLiteral("rgba(%1,%2,%3,%4)").arg(c.red()).arg(c.green()).arg(c.blue()).arg(c.alphaF()); };
  dockHost_->setStyleSheet(QStringLiteral("QMainWindow::separator { background: %1; width: 1px; height: 1px; }").arg(css(color("border"))));
  setStyleSheet(QStringLiteral("QMenu { background: %1; color: %2; border: 1px solid %3; border-radius: 8px; padding: 4px; font-family: \"%4\"; font-size: 13px; }"
                               "QMenu::item { padding: 6px 24px 6px 12px; border-radius: 6px; }"
                               "QMenu::item:selected { background: %5; }"
                               "QMenu::separator { height: 1px; background: %3; margin: 4px 0; }"
                               "QToolTip { background: %1; color: %2; border: 1px solid %3; font-family: \"%4\"; font-size: 11px; padding: 4px 8px; }")
                    .arg(css(color("overlay")), css(color("text")), css(color("border")), roles.value("sans").toString(), css(color("field"))));
  CanvasTheme theme;
  theme.canvas = color("canvas");
  theme.grid = color("grid");
  theme.node = color("node");
  theme.divider = color("divider");
  theme.field = color("field");
  theme.checker = color("checker");
  theme.primary = color("primary");
  theme.selectionShadow = color("shadow");
  theme.textPrimary = color("text");
  theme.textSecondary = color("secondary");
  theme.sansFamily = roles.value("sans").toString();
  QJsonObject style{{"NormalBoundaryColor", theme.divider.name(QColor::HexArgb)},
                    {"SelectedBoundaryColor", color("focus").name()},
                    {"FontColor", theme.textPrimary.name()},
                    {"FontColorFaded", theme.textSecondary.name()},
                    {"ShadowColor", theme.canvas.name()},
                    {"ShadowEnabled", false},
                    {"ConnectionPointColor", theme.textSecondary.name()},
                    {"FilledConnectionPointColor", color("focus").name()},
                    {"ErrorColor", color("error").name()},
                    {"WarningColor", color("warning").name()},
                    {"PenWidth", node_metrics::borderWidth},
                    {"HoveredPenWidth", node_metrics::borderWidth},
                    // Sets the QtNodes port hit tolerance to the web's snap radius.
                    {"ConnectionPointDiameter", node_metrics::handleDiameter / 2},
                    {"Opacity", 1}};
  for (auto key : {"GradientColor0", "GradientColor1", "GradientColor2",
                   "GradientColor3"}) {
    style[key] = theme.node.name();
  }
  QtNodes::NodeStyle::setNodeStyle(QString::fromUtf8(
      QJsonDocument(QJsonObject{{"NodeStyle", style}}).toJson()));
  // WirePainter reads no connection colors. The diameter sets the bounds margin.
  const auto ink = theme.textSecondary.name();
  QJsonObject connection{{"ConstructionColor", ink},
                         {"NormalColor", ink},
                         {"SelectedColor", ink},
                         {"SelectedHaloColor", ink},
                         {"HoveredColor", ink},
                         {"LineWidth", node_metrics::wireWidth},
                         {"ConstructionLineWidth", node_metrics::wireWidth},
                         {"PointDiameter", node_metrics::wireBoundsMargin},
                         {"UseDataDefinedColors", false}};
  QtNodes::ConnectionStyle::setConnectionStyle(QString::fromUtf8(
      QJsonDocument(QJsonObject{{"ConnectionStyle", connection}}).toJson()));
  scene_->setTheme(theme);
}
void EditorWindow::resizeEvent(QResizeEvent *event) {
  QMainWindow::resizeEvent(event);
  syncInspector();
}
void EditorWindow::closeEvent(QCloseEvent *event) {
  if (document_.undoStack()->isClean()) {
    event->accept();
    return;
  }
  auto choice = QMessageBox::warning(
      this, tr("Unsaved workflow"), tr("Save changes before closing?"),
      QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel);
  if (choice == QMessageBox::Save) {
    action("Save");
  }
  if (choice == QMessageBox::Discard || document_.undoStack()->isClean()) {
    event->accept();
  } else {
    event->ignore();
  }
}
} // namespace nodetool
