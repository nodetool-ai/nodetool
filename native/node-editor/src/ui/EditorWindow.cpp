#include "document/ChildPorts.h"
#include "properties/CodeHighlighter.h"
#include "EditorWindow.h"
#include "document/GroupIntoSubgraph.h"
#include "MiniMap.h"
#include "layout/AutoLayout.h"
#include "layout/SelectionLayout.h"
#include <QMap>
#include <QQuickTextDocument>
#include <QTextDocument>
#include <QTextBlock>
#include <QTextCursor>
#include <QDrag>
#include <QDragEnterEvent>
#include <QMimeData>
#include <QUuid>
#include "media/VideoFrameView.h"
#include "graph/EditorScene.h"
#include "graph/InlinePropertyPresenter.h"
#include "graph/InlineTitlePresenter.h"
#include "graph/CanvasMediaPresenter.h"
#include "graph/CanvasDropController.h"
#include "graph/NodeCreation.h"
#include "graph/CompatibleNodePicker.h"
#include "graph/LineageLayer.h"
#include "properties/PropertyFields.h"
#include <QApplication>
#include <QClipboard>
#include <QCloseEvent>
#include <QDockWidget>
#include <QDialog>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QCursor>
#include <optional>
#include <QGraphicsView>
#include <QHBoxLayout>
#include <QInputDialog>
#include <QCompleter>
#include <QComboBox>
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
#include <QSettings>
#include <QStackedWidget>
#include <QScrollBar>
#include <QSignalBlocker>
#include <QSet>
#include <QTimer>
#include <QToolTip>
#include <QUndoStack>
#include <QVBoxLayout>
#include <QNativeGestureEvent>
#include <QWheelEvent>
#include <QtNodes/ConnectionStyle>
#include <algorithm>
#include <QtNodes/NodeStyle>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
namespace nodetool {
void EditorWindow::styleOutputMarkdown(QObject *source, const QColor &link,
                                     const QColor &codeSurface, const QFont &codeFont) {
  const auto quickDocument = qobject_cast<QQuickTextDocument *>(source);
  if (!quickDocument || !quickDocument->textDocument()) { return; }
  auto document = quickDocument->textDocument();
  struct Span { int start; int length; QTextCharFormat format; };
  QList<Span> spans;
  for (auto block = document->begin(); block.isValid(); block = block.next()) {
    for (auto it = block.begin(); !it.atEnd(); ++it) {
      const auto fragment = it.fragment();
      auto format = fragment.charFormat();
      const bool code = format.fontFixedPitch() || format.fontFamilies().toStringList().contains("monospace")
          || format.fontFamilies().toStringList().contains(codeFont.family());
      if (format.isAnchor()) { format.setForeground(link); }
      if (code) { format.setFont(codeFont); format.setBackground(codeSurface); }
      if (code || format.isAnchor()) { spans.append({fragment.position(), fragment.length(), format}); }
    }
  }
  for (const auto &span : spans) {
    QTextCursor cursor(document);
    cursor.setPosition(span.start);
    cursor.setPosition(span.start + span.length, QTextCursor::KeepAnchor);
    cursor.mergeCharFormat(span.format);
  }
}

namespace {
constexpr int narrowWindowWidth = 1000;
constexpr int compactToolbarWidth = 480;
const QMap<QString, node_editor::layout::SelectionAction> selectionActions{
    {"Align left", node_editor::layout::SelectionAction::AlignLeft},
    {"Align center", node_editor::layout::SelectionAction::AlignCenter},
    {"Align right", node_editor::layout::SelectionAction::AlignRight},
    {"Align top", node_editor::layout::SelectionAction::AlignTop},
    {"Align middle", node_editor::layout::SelectionAction::AlignMiddle},
    {"Align bottom", node_editor::layout::SelectionAction::AlignBottom},
    {"Distribute horizontally", node_editor::layout::SelectionAction::DistributeHorizontal},
    {"Distribute vertically", node_editor::layout::SelectionAction::DistributeVertical},
    {"Stack selection", node_editor::layout::SelectionAction::Stack},
    {"Arrange grid", node_editor::layout::SelectionAction::Grid}};
} // namespace
EditorWindow::EditorWindow(QWidget *parent) : EditorWindow(parent, nullptr) {}
EditorWindow::EditorWindow(QWidget *parent, EditorWindow *tabOwner)
    : QMainWindow(parent), tabOwner_(tabOwner), dynamicPorts_(&document_, tabOwner ? this : nullptr), model_(tabOwner ? this : nullptr) {
  if (!tabOwner_) {
    resize(1440, 900);
    tabStack_ = new QStackedWidget(this);
    setCentralWidget(tabStack_);
    newTab();
    return;
  }
  setWindowTitle(tr("NodeTool Workflow[*]"));
  resize(1440, 900);
  node_editor::registerMediaTypes();
  node_editor::registerCodeHighlighter();
  connect(&document_, &node_editor::WorkflowDocument::replaced, this, [this] {
    model_.resetOnNextProjection();
    ++documentEpoch_;
    if (!childSyncing_) {
        closeChildSurfaces();
    }
    invalidateGesture();
    guideStarted_ = false;
    guideDismissed_ = false;
    emit documentEpochChanged();
    QTimer::singleShot(0, this, &EditorWindow::refreshChildReferences);
    session_.setSnapshot(document_.snapshot());
  });
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &setup_, &node_editor::SetupController::configure);
    connect(&session_, &node_editor::WorkflowSession::credentialsChanged, this,
            [this](const QUrl &origin, const QString &token, const QString &user) {
        packOrigin_ = origin;
        packToken_ = token;
        packUser_ = user;
        syncPackSetup();
    });

  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, this, [this] {
    guideStarted_ = false;
    guideDismissed_ = false;
    refresh();
  });
  connect(&setup_, &node_editor::SetupController::registryRefreshRequested, &session_, &node_editor::WorkflowSession::loadCatalog);
    connect(&setup_, &node_editor::SetupController::registryRefreshRequested, this, [this] {
        packSetup()->refresh();
    });
  connect(&setup_, &node_editor::SetupController::templateChosen, this, [this](const QJsonObject &workflow) {
    if (readOnly()) { return; }
    session_.openWorkflow(workflow["id"].toString());
    if (setupDialog_) { setupDialog_->close(); }
  });
  connect(&setup_, &node_editor::SetupController::changed, this, [this] { refresh(); });
  engine_ = new QQmlEngine(this);
  engine_->rootContext()->setContextProperty("editor", this);
  engine_->rootContext()->setContextProperty("workflowBrowser", &browser_);
  engine_->rootContext()->setContextProperty("runOutput", &runOutput_);
  engine_->rootContext()->setContextProperty("workflowSession", &session_);
  engine_->rootContext()->setContextProperty("mediaResolver", &mediaResolver_);
  engine_->rootContext()->setContextProperty("modelPickerController", &modelPicker_);
  engine_->rootContext()->setContextProperty("assetPickerController", &assetPicker_);
  engine_->rootContext()->setContextProperty("resourcePickerController", &resourcePicker_);
    engine_->rootContext()->setContextProperty("documentPickerController", &documentPicker_);
  model_.setRuntimeModel(&runtime_);
  connect(&session_, &node_editor::WorkflowSession::generationsChanged, this, &EditorWindow::schedulePanelChanged);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, this, [this](const QUrl &origin, const QString &token, const QString &userId) {
    auto owner = tabOwner_ ? tabOwner_ : this;
    if (owner->tabsOrigin_ != origin || owner->tabsToken_ != token || owner->tabsUser_ != userId) {
      owner->tabsOrigin_ = origin; owner->tabsToken_ = token; owner->tabsUser_ = userId;
        const auto retained = owner->retainedChatHosts_;
        owner->retainedChatHosts_.clear();
        for (const auto &host : retained) {
            if (host) {
                host->chat_.disconnectFromServer();
                host->deleteLater();
            }
        }
      for (auto tab : owner->tabs_) {
        if (tab == this) { continue; }
        if (origin.isEmpty()) { tab->session_.disconnectFromServer(); }
        else { tab->session_.connectToServer(origin, token, userId); }
      }
    }
    invalidateGesture();
    ++credentialsEpoch_;
    emit credentialsEpochChanged();
    runOutput_.reset();
    if (serverSyncDialog_) { serverSyncDialog_->close(); }
    conflictPresented_ = false;
    if (lineage_) { lineage_->setSelectedLinkIds({}); }
    ++browserEpoch_;
    browserLoadingProjects_ = false;
    browser_.configure(origin, token, userId);
    if (browserVisible() && !origin.isEmpty()) { loadBrowser(); }
    if (scene_) { refresh(); }
  });
  connect(&browser_, &node_editor::WorkflowBrowser::changed, this, [this] {
    schedulePanelChanged();
    if (browserLoadingProjects_ && !browser_.projectsLoading()) {
      browserLoadingProjects_ = false;
      if (browser_.error().isEmpty()) { browser_.refresh(); }
    }
  });
  connect(&browser_, &node_editor::WorkflowBrowser::created, this, &EditorWindow::openWorkflow);
  connect(&browser_, &node_editor::WorkflowBrowser::renamed, this, [this](const QString &id) {
    if (id == document_.snapshot()["id"].toString() && document_.undoStack()->isClean()) { session_.openWorkflow(id); }
  });
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &mediaResolver_, &node_editor::MediaResolver::configure);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &modelPicker_, &node_editor::ModelPickerController::configure);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &assetPicker_, &node_editor::AssetPickerController::configure);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &resourcePicker_, &node_editor::ResourcePickerController::configure);
    connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &documentPicker_, &node_editor::DocumentPickerController::configure);
  // A running job sends many messages each second. Panels follow at most
  // every 100 ms, because each panel refresh re-evaluates many bindings.
  runPanelTimer_ = new QTimer(this);
  runPanelTimer_->setSingleShot(true);
  runPanelTimer_->setInterval(100);
  connect(runPanelTimer_, &QTimer::timeout, this, &EditorWindow::schedulePanelChanged);
  connect(&runOutput_, &node_editor::RunOutputModel::changed, this, [this] {
    runtime_.selectRun(runOutput_.selectedRunId());
    syncRuntimePreviews();
    if (!runPanelTimer_->isActive()) { runPanelTimer_->start(); }
  });
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
  lineage_ = new node_editor::LineageLayer(*scene_, this);
  connect(&model_, &WorkflowGraphModel::modelReset, this, &EditorWindow::scheduleLineage);
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, &EditorWindow::scheduleLineage);
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, &EditorWindow::scheduleLineage);
  connect(lineage_, &node_editor::LineageLayer::selectionRequested, this, [this](const QString &id, bool additive) {
    auto ids = additive ? lineage_->selectedLinkIds() : QStringList{};
    if (!additive) { scene_->clearSelection(); }
    if (ids.contains(id)) { ids.removeAll(id); } else { ids.append(id); }
    lineage_->setSelectedLinkIds(ids);
    schedulePanelChanged();
  });
  connect(lineage_, &node_editor::LineageLayer::deleteRequested, this, [this](const QString &id) {
    apply({{"op", "removeLink"}, {"id", id}});
  });
  connect(lineage_, &node_editor::LineageLayer::contextMenuRequested, this, [this](const QString &id, const QPoint &position) {
    auto menu = new QMenu(this);
    menu->setAttribute(Qt::WA_DeleteOnClose);
    auto remove = menu->addAction(tr("Delete link"), this, [this, id] { apply({{"op", "removeLink"}, {"id", id}}); });
    remove->setEnabled(!readOnly());
    menu->popup(position);
  });
    connect(scene_, &EditorScene::outputFormRequested, this, [this](const QString &id) {
        if (readOnly() || !selectNode(id)) { return; }
        auto *dialog = new QDialog(this, Qt::Popup);
        dialog->setObjectName("subgraph-output-form");
        dialog->setAttribute(Qt::WA_DeleteOnClose);
        auto *quick = new QQuickWidget(engine_, dialog);
        quick->setResizeMode(QQuickWidget::SizeRootObjectToView);
        quick->setInitialProperties({{"controller", QVariant::fromValue(&dynamicPorts_)}, {"outputsOnly", true}});
        quick->setSource(QUrl("qrc:/editor/DynamicPorts.qml"));
        auto *layout = new QVBoxLayout(dialog);
        layout->addWidget(quick);
        dialog->resize(350, 400);
        dialog->move(QCursor::pos());
        connect(this, &EditorWindow::documentEpochChanged, dialog, &QDialog::close);
        connect(this, &EditorWindow::credentialsEpochChanged, dialog, &QDialog::close);
        dialog->show();
    });
    connect(scene_, &EditorScene::childOpenRequested, this, [this](const QString &id) {
        if (selectNode(id)) { openChild(); }
    });
  connect(scene_, &EditorScene::canvasContextMenuRequested, this, [this](const QString &id, const QPoint &position) {
    if (!id.isEmpty() && !selectedIds().contains(id)) { selectNode(id); }
    const auto kind = id.isEmpty() ? QString("pane") : document_.node(id)["type"].toString().endsWith(".Group") ? QString("group") : selectedCount() > 1 ? QString("selection") : QString("node");
    showActionMenu(kind, position);
  });
  connect(scene_, &EditorScene::dataEdgeContextMenuRequested, this,
          [this](const QString &id, const QPointF &position, const QPoint &screenPosition) {
    if (readOnly()) { return; }
    QJsonObject original;
    for (const auto &value : document_.edges()) {
      const auto edge = value.toObject();
      if (edge["id"].toString() == id) { original = edge; break; }
    }
    if (original.isEmpty()) { return; }
    const auto documentEpoch = documentEpoch_, credentialsEpoch = credentialsEpoch_;
    auto *menu = new QMenu(this);
    menu->setObjectName("data-edge-menu");
    menu->setAttribute(Qt::WA_DeleteOnClose);
    auto *insert = menu->addAction(tr("Insert reroute"), this,
        [this, id, position, original, documentEpoch, credentialsEpoch] {
      if (documentEpoch != documentEpoch_ || credentialsEpoch != credentialsEpoch_ || readOnly()) { return; }
      for (const auto &value : document_.edges()) {
        if (value.toObject() == original) {
          apply({{"op", "insertReroute"}, {"id", id},
                 {"position", QJsonObject{{"x", position.x()}, {"y", position.y()}}}});
          return;
        }
      }
    });
    auto *remove = menu->addAction(tr("Delete edge"), this, [this, id, original, documentEpoch, credentialsEpoch] {
      if (documentEpoch != documentEpoch_ || credentialsEpoch != credentialsEpoch_ || readOnly()) { return; }
      for (const auto &value : document_.edges()) { if (value.toObject() == original) { apply({{"op", "removeEdge"}, {"id", id}}); return; } }
    });
    remove->setObjectName("delete-edge");
    insert->setObjectName("insert-reroute");
    insert->setEnabled(knownNodeType("nodetool.control.Reroute"));
    connect(this, &EditorWindow::documentEpochChanged, menu, &QMenu::close);
    connect(this, &EditorWindow::credentialsEpochChanged, menu, &QMenu::close);
    menu->popup(screenPosition);
  });
  // Plain QGraphicsView deliberately avoids QtNodes' clipboard and undo
  // actions.
  view_ = new QGraphicsView(scene_, this);
  view_->setAcceptDrops(true);
  view_->viewport()->setAcceptDrops(true);
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
  inlinePresenter_ = new InlinePropertyPresenter(model_, *scene_, *view_, engine_, this);
  inlinePresenter_->commitProperty = [this](const QString &id, const QString &name, const QVariant &value) {
    return commitProperty(id, name, value);
  };
  connect(this, &EditorWindow::zoomChanged, inlinePresenter_, &InlinePropertyPresenter::reposition);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, inlinePresenter_, &InlinePropertyPresenter::cancel);
  connect(this, &EditorWindow::documentEpochChanged, inlinePresenter_, &InlinePropertyPresenter::cancel);
  inlineTitle_ = new InlineTitlePresenter(model_, *scene_, *view_, engine_, this);
  inlineTitle_->availableViewport = [this] { return unobstructedViewport(); };
  inlineTitle_->commitTitle = [this](const QString &id, const QString &text) {
    return apply({{"op", "renameNode"}, {"id", id}, {"title", text}});
  };
  connect(this, &EditorWindow::zoomChanged, inlineTitle_, &InlineTitlePresenter::reposition);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, inlineTitle_, &InlineTitlePresenter::cancel);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, inlineTitle_, &InlineTitlePresenter::clearControls);
  connect(this, &EditorWindow::documentEpochChanged, inlineTitle_, &InlineTitlePresenter::cancel);
  connect(inlineTitle_, &InlineTitlePresenter::activated, inlinePresenter_, &InlinePropertyPresenter::cancel);
  connect(scene_, &EditorScene::inlineEditRequested, inlineTitle_, &InlineTitlePresenter::cancel);
  canvasMedia_ = new CanvasMediaPresenter(model_, *scene_, *view_, engine_, this);
  connect(this, &EditorWindow::zoomChanged, canvasMedia_, &CanvasMediaPresenter::refresh);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, canvasMedia_, &CanvasMediaPresenter::clear);
  compatiblePicker_ = new CompatibleNodePicker(model_, *scene_, *view_, engine_, this);
  compatiblePicker_->applyCommand = [this](const QJsonObject &command) { return apply(command); };
  connect(compatiblePicker_, &CompatibleNodePicker::nodeCreated, this, [this](const QString &id) {
    const auto documentEpoch = documentEpoch_, credentialsEpoch = credentialsEpoch_;
    QTimer::singleShot(0, this, [this, id, documentEpoch, credentialsEpoch] {
      if (documentEpoch == documentEpoch_ && credentialsEpoch == credentialsEpoch_ && !document_.node(id).isEmpty()) selectNode(id);
    });
  });
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, compatiblePicker_, &CompatibleNodePicker::cancel);
  connect(this, &EditorWindow::documentEpochChanged, compatiblePicker_, &CompatibleNodePicker::cancel);
  canvasDrops_ = new CanvasDropController(model_, *view_, this);
  canvasDrops_->createNode = [this](const QJsonObject &metadata, const QPointF &position, const QJsonObject &properties) {
    return createNativeNode(metadata, position, document_.nodes(), properties);
  };
  canvasDrops_->applyCommand = [this](const QJsonObject &command) { return apply(command); };
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, canvasDrops_, &CanvasDropController::configure);
  connect(this, &EditorWindow::documentEpochChanged, canvasDrops_, &CanvasDropController::cancelAll);
  connect(&session_, &node_editor::WorkflowSession::stateChanged, this, [this] {
    canvasDrops_->setWorkflowId(session_.serverBound() ? session_.workflow()["id"].toString() : QString{});
  });
  connect(canvasDrops_, &CanvasDropController::changed, this, [this] {
    const bool pending = !canvasDrops_->transfers().isEmpty();
    if (pending && !canvasDropsPending_) QTimer::singleShot(0, this, [this] { if (!canvasDrops_->transfers().isEmpty()) showCanvasDrops(); });
    if (!pending && canvasDropDialog_) canvasDropDialog_->close();
    canvasDropsPending_ = pending;
  });
  connect(canvasDrops_, &CanvasDropController::errorOccurred, this, [this](const QString &error) {
    message_ = error; schedulePanelChanged(); showCanvasDrops();
  });
  connect(canvasDrops_, &CanvasDropController::nodeCreated, this, [this](const QString &id) {
    const auto documentEpoch = documentEpoch_, credentialsEpoch = credentialsEpoch_;
    QTimer::singleShot(0, this, [this, id, documentEpoch, credentialsEpoch] {
      if (documentEpoch == documentEpoch_ && credentialsEpoch == credentialsEpoch_ && !document_.node(id).isEmpty()) selectNode(id);
    });
  });
  model_.commit = [this](const auto &c) {
    if (gesture_) {
      gestureCommands_.append(c);
      return true;
    }
    return apply(c);
  };
  connect(scene_, &EditorScene::reconnectRequested, this, [this](const QString &id, const QJsonObject &connection) {
    apply({{"op", "reconnectEdge"}, {"id", id}, {"connection", connection}});
  });
  connect(scene_, &EditorScene::reconnectDiscarded, this, [this](const QString &id) {
    apply({{"op", "removeEdge"}, {"id", id}});
  });
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
    const auto reconnect = scene_->reconnectingEdgeId();
    if (!reconnect.isEmpty()) {
      return candidate.applyCommand({{"op", "reconnectEdge"}, {"id", reconnect}, {"connection", edge}}).ok;
    }
    return candidate.applyCommand({{"op", "addEdge"}, {"edge", edge}}).ok;
  };
  // The rail, tab strip, and status bar frame the docks, as in the web editor.
  dockHost_ = new QMainWindow(this);
  dockHost_->setWindowFlags(Qt::Widget);
    auto canvasColumn = new QWidget(dockHost_);
    auto canvasLayout = new QVBoxLayout(canvasColumn);
    canvasLayout->setContentsMargins(0, 0, 0, 0);
    canvasLayout->setSpacing(0);
    auto canvasTabs = panel("CanvasTabStrip");
    const auto resizeCanvasTabs = [canvasTabs] {
        canvasTabs->setFixedHeight(qCeil(canvasTabs->rootObject()->implicitHeight()));
    };
    connect(canvasTabs->rootObject(), &QQuickItem::implicitHeightChanged, canvasTabs, resizeCanvasTabs);
    resizeCanvasTabs();
    canvasLayout->addWidget(canvasTabs);
    canvasLayout->addWidget(view_, 1);
    dockHost_->setCentralWidget(canvasColumn);
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
  browserDock_ = dock(tr("Workflows"), "WorkflowBrowser", Qt::LeftDockWidgetArea);
  browserDock_->setObjectName("workflow-browser-dock");
  browserDock_->hide();
  inspectorDock_ = dock(tr("Inspector"), "Inspector", Qt::RightDockWidgetArea);
  outputDock_ = dock(tr("Output"), "RunOutput", Qt::BottomDockWidgetArea);
  outputDock_->setObjectName("run-output-dock");
  outputDock_->setAllowedAreas(Qt::BottomDockWidgetArea);
  outputDock_->hide();
  inspectorDock_->hide();
  auto rail = panel("Rail");
  rail->setFixedWidth(rail->initialSize().width());
  auto tabs = panel("TabBar");
    const auto resizeTabs = [tabs] {
        if (tabs->rootObject()) {
            tabs->setFixedHeight(tabs->rootObject()->implicitHeight());
        }
    };
    connect(tabs->rootObject(), &QQuickItem::implicitHeightChanged, tabs, resizeTabs);
    resizeTabs();
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
    initializeChat();
  queueOverlay_ = overlay("QueueOverlay");
  queueOverlay_->setParent(centralWidget());
  queueOverlay_->setResizeMode(QQuickWidget::SizeRootObjectToView);
  connect(queueOverlay_->rootObject(), SIGNAL(expandedChanged()), this, SLOT(layoutOverlays()));
  connect(queueOverlay_->rootObject(), SIGNAL(presentedChanged()), this, SLOT(layoutOverlays()));
  connect(queueOverlay_->rootObject(), SIGNAL(contentHeightChanged()), this, SLOT(layoutOverlays()));
  connect(&session_, &node_editor::WorkflowSession::stateChanged, this, [this] { layoutOverlays(); });
  selectionOverlay_ = overlay("SelectionToolbar");
  viewportOverlay_ = overlay("ViewportIndicator");
  setupGuide_ = overlay("SetupGuide");
  setupGuide_->show();
  auto miniMap = new MiniMap(model_, *scene_, *view_);
  miniMap->navigated = [this] { fitActive_ = false; };
  miniMap->zoomed = [this] { emit zoomChanged(); };
  connect(this, &EditorWindow::zoomChanged, miniMap, [miniMap] { miniMap->update(); });
  miniMap->show();
  toolbarOverlay_->show();
  viewportOverlay_->show();
  layoutOverlays();
  connect(catalogDock_, &QDockWidget::visibilityChanged, this, [this] { schedulePanelChanged(); });
  connect(inspectorDock_, &QDockWidget::visibilityChanged, this, [this] { schedulePanelChanged(); });
  connect(outputDock_, &QDockWidget::visibilityChanged, this,
          [this] { schedulePanelChanged(); });
  connect(scene_, &QtNodes::BasicGraphicsScene::nodeDoubleClicked, this, [this](QtNodes::NodeId id) {
    if (node_editor::isChildNode(document_.node(model_.resourceId(id)))) { selected_ = model_.resourceId(id); openChild(); }
  });
  const auto selectionSettled = [this] {
    const auto ids = selectedIds();
    const auto next = ids.size() == 1 ? ids.first() : QString{};
    if (selected_ != next) { selected_ = next; inspectorDismissed_ = false; syncInspector(); }
    schedulePanelChanged();
    scheduleViewportSettle();
  };
  // A box selection changes the selection on many mouse moves. Panels follow
  // it once, when the drag ends, because each panel refresh is expensive.
  connect(scene_, &QGraphicsScene::selectionChanged, this, [this, selectionSettled] {
    if (selectingNode_) { return; }
    if (!view_->rubberBandRect().isNull()) { rubberBandSelectionPending_ = true; return; }
    selectionSettled();
  });
  connect(view_, &QGraphicsView::rubberBandChanged, this, [this, selectionSettled](QRect rect) {
    if (!rect.isNull() || !rubberBandSelectionPending_) { return; }
    rubberBandSelectionPending_ = false;
    selectionSettled();
  });
  connect(scene_, &QtNodes::BasicGraphicsScene::nodeClicked, this, [this](auto id) { inspectNode(model_.resourceId(id)); });
  connect(document_.undoStack(), &QUndoStack::cleanChanged, this, [this](bool clean) {
    setWindowModified(!clean);
    schedulePanelChanged();
  });
  connect(&document_, &node_editor::WorkflowDocument::changed, this, [this] {
    historyWorkflowStale_ = true;
    if (!refreshPending_) {
      refreshPending_ = true;
      QTimer::singleShot(0, this, [this] {
        syncPackSetup();
        if (refreshPending_) { refresh(); }
      });
      // The panel emit runs the queued projection, so panels follow an edit in the next pass.
      schedulePanelChanged();
    }
    // A synchronous session refresh also satisfies this queued projection.
    session_.setSnapshot(document_.snapshot());
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
            if (serverSyncDialog_) { serverSyncDialog_->close(); }
            runOutput_.reset();
            lineage_->setSelectedLinkIds({});
            mediaResolver_.clear();
            dynamicPorts_.setSelectedNode({});
            showBrowser(false);
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
            if (session_.autosaveState() == "conflict") {
              message_ = tr("Server workflow changed. Review the conflict to continue saving.");
            } else if (session_.autosaveState() == "deleted") {
              message_ = tr("Server workflow deleted. Your local draft is preserved.");
            }
            if (!serverSyncNeedsAttention()) { outputDock_->show(); }
            schedulePanelChanged();
          });
  connect(&session_, &node_editor::WorkflowSession::runSubmitted, this,
          [this](const QString &id) {
            run_ = id;
            message_ = tr("Run starting");
            schedulePanelChanged();
            runtime_.beginRun(id);
            runOutput_.beginRun(id);
            outputDock_->show();
          });
  connect(&session_, &node_editor::WorkflowSession::runEvent, this,
          [this](const QString &id, const QJsonObject &event) {
            runtime_.ingest(id, event);
            runOutput_.ingest(id, event);
            const auto status = event["status"].toString();
            if (id == run_ && status == "running") {
                message_ = tr("Run running");
                schedulePanelChanged();
            }
            if (id == run_ && event["type"] == "job_update" &&
                (status == "completed" || status == "finished" || status == "failed" || status == "cancelled")) {
              message_ = event["error"].toString().isEmpty() ? tr("Run %1").arg(status) : event["error"].toString();
              const auto plan = session_.lastPartialPlan();
              if (!plan.stale.isEmpty()) { message_ += tr(" · Reusing generations from edited nodes: %1").arg(plan.stale.join(", ")); }
              schedulePanelChanged();
            }
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
            if (session_.conflictPending() && !conflictPresented_) {
              QTimer::singleShot(0, this, [this] { if (session_.conflictPending()) { showServerSync(); } });
            }
            conflictPresented_ = session_.conflictPending();
            schedulePanelChanged();
          });
  auto result = document_.load(
      QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{}},
                                        {"edges", QJsonArray{}}}}});
  if (!result) {
    message_ = result.error;
  }
  refresh();
  connect(this, &EditorWindow::panelChanged, this, &EditorWindow::notifyTabs);
}
EditorWindow::~EditorWindow() {
    disconnect(this, &EditorWindow::panelChanged, this, &EditorWindow::syncChatContext);
    disconnect(this, &EditorWindow::tabsChanged, this, &EditorWindow::syncChatContext);
  if (!tabOwner_) {
    for (const auto &host : retainedChatHosts_) {
        delete host.data();
    }
    retainedChatHosts_.clear();
    const auto tabs = tabs_;
    // Owner panels forward to the active tab and must die before the tabs do.
    for (auto panel : findChildren<QQuickWidget *>()) {
      const auto inTab = std::any_of(tabs.cbegin(), tabs.cend(), [panel](EditorWindow *tab) { return tab->isAncestorOf(panel); });
      if (!inTab) {
        delete panel;
      }
    }
    tabs_.clear();
    // Children forward to their parent surface and open after it, so they go first.
    for (auto it = tabs.crbegin(); it != tabs.crend(); ++it) {
      delete *it;
    }
    return;
  }
  delete canvasDropDialog_.data();
  delete canvasDrops_;
  canvasDrops_ = nullptr;
  delete compatiblePicker_;
  delete serverSyncDialog_.data();
  delete lineage_;
  delete canvasMedia_;
  delete inlineTitle_;
  delete inlinePresenter_;
  // Dock animations can resize the viewport while bound overlays are destroyed.
  view_->removeEventFilter(this);
  view_->viewport()->removeEventFilter(this);
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
    if (file == "Inspector") {
        w->setAcceptDrops(true);
    }
  w->setSource(QUrl("qrc:/editor/" + file + ".qml"));
  return w;
}
QString EditorWindow::serverSaveState() const {
  if (!tabOwner_) { return activeEditor_->serverSaveState(); }
    if (inlineChild_ && childParent_) { return childParent_->serverSaveState(); }
  if (session_.autosaveState() == "deleted") { return tr("Server deleted"); }
  if (session_.conflictPending()) { return tr("Server conflict"); }
  if (session_.saving()) { return tr("Saving to server"); }
  if (session_.autosaveState() == "error") { return tr("Server save failed"); }
  if (!session_.serverBound()) { return tr("Local workflow"); }
  return session_.dirty() ? tr("Server changes unsaved") : tr("Saved to server");
}
QString EditorWindow::saveState() const {
  if (!tabOwner_) { return activeEditor_->saveState(); }
    if (inlineChild_ && childParent_) { return childParent_->saveState(); }
  if (session_.serverBound() || session_.saving() || serverSyncNeedsAttention()) { return serverSaveState(); }
  if (file_.isEmpty()) { return document_.undoStack()->isClean() ? tr("New workflow") : tr("Unsaved"); }
  return document_.undoStack()->isClean() ? tr("Saved locally") : tr("Unsaved local changes");
}
void EditorWindow::showWorkflowDetails(const QString &kind) {
  if (kind == "versions") {
    for (auto *existing : findChildren<QDockWidget *>("workflow-versions-dock")) { existing->close(); }
    auto *dock = new QDockWidget(tr("Version history"), dockHost_);
    dock->setObjectName("workflow-versions-dock");
    dock->setAttribute(Qt::WA_DeleteOnClose);
    dock->setTitleBarWidget(new QWidget(dock));
    dock->setAllowedAreas(Qt::BottomDockWidgetArea);
    outputDock_->hide();
    auto *content = new QQuickWidget(engine_, dock);
    content->setResizeMode(QQuickWidget::SizeRootObjectToView);
    content->setInitialProperties({{"controller", QVariant::fromValue(&versions_)}});
    content->setSource(QUrl("qrc:/editor/VersionHistoryPanel.qml"));
    dock->setWidget(content);
    connect(content->rootObject(), SIGNAL(closeRequested()), dock, SLOT(close()));
    dockHost_->addDockWidget(Qt::BottomDockWidgetArea, dock);
    dockHost_->resizeDocks({dock}, {height() / 2}, Qt::Vertical);
    connect(this, &EditorWindow::documentEpochChanged, dock, &QDockWidget::close);
    connect(this, &EditorWindow::credentialsEpochChanged, dock, &QDockWidget::close);
    versions_.load(kind); dock->show(); return;
  }
  for (auto *existing : findChildren<QDialog *>("workflow-details-dialog")) { existing->close(); }
  auto *dialog = new QDialog(this);
  dialog->setObjectName("workflow-details-dialog");
  dialog->setAttribute(Qt::WA_DeleteOnClose);
  auto *content = new QQuickWidget(engine_, dialog);
  content->setResizeMode(QQuickWidget::SizeRootObjectToView);
  content->setInitialProperties({{"controller", QVariant::fromValue(&versions_)}, {"kind", kind}});
  content->setSource(QUrl("qrc:/editor/WorkflowDetails.qml"));
  auto *layout = new QVBoxLayout(dialog); layout->setContentsMargins(0, 0, 0, 0); layout->addWidget(content);
  connect(this, &EditorWindow::documentEpochChanged, dialog, &QDialog::close);
  connect(this, &EditorWindow::credentialsEpochChanged, dialog, &QDialog::close);
  dialog->resize(std::min(640, width()), std::min(680, height()));
  versions_.load(kind); dialog->show();
}
void EditorWindow::showServerSync() {
  if (serverSyncDialog_) {
    serverSyncDialog_->show();
    serverSyncDialog_->raise();
    serverSyncDialog_->activateWindow();
    return;
  }
  auto dialog = new QDialog(this);
  dialog->setObjectName("server-sync-dialog");
  dialog->setAttribute(Qt::WA_DeleteOnClose);
  dialog->setWindowTitle(tr("Server workflow"));
  serverSyncDialog_ = dialog;
  auto content = new QQuickWidget(engine_, dialog);
  content->setResizeMode(QQuickWidget::SizeRootObjectToView);
  content->setInitialProperties({{"workflowSession", QVariant::fromValue(&session_)},
                               {"lastError", session_.autosaveState() == "error" ? message_ : QString{}}});
  content->setSource(QUrl("qrc:/editor/ServerSyncPanel.qml"));
  auto layout = new QVBoxLayout(dialog);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->addWidget(content);
  if (const auto root = content->rootObject()) {
    connect(root, SIGNAL(closeRequested()), dialog, SLOT(close()));
    connect(root, SIGNAL(saveLocalAsRequested()), this, SLOT(saveLocalCopyAs()));
  }
  dialog->resize(std::min(720, width()), std::min(640, height()));
  dialog->show();
}
void EditorWindow::showCanvasDrops() {
  if (canvasDropDialog_) { canvasDropDialog_->show(); canvasDropDialog_->raise(); return; }
  auto *dialog = new QDialog(this);
  dialog->setObjectName("canvas-drop-dialog");
  dialog->setAttribute(Qt::WA_DeleteOnClose);
  dialog->setWindowTitle(tr("Canvas uploads"));
  canvasDropDialog_ = dialog;
  auto *content = new QQuickWidget(engine_, dialog);
  content->setResizeMode(QQuickWidget::SizeRootObjectToView);
  content->setInitialProperties({{"controller", QVariant::fromValue(canvasDrops_)}});
  content->setSource(QUrl("qrc:/editor/CanvasDropPanel.qml"));
  auto *layout = new QVBoxLayout(dialog); layout->setContentsMargins(0, 0, 0, 0); layout->addWidget(content);
  if (const auto root = content->rootObject()) connect(root, SIGNAL(closeRequested()), dialog, SLOT(close()));
  dialog->resize(std::min(444, width()), std::min(540, height())); dialog->show();
}
void EditorWindow::saveLocalCopyAs() {
  const auto snapshot = document_.snapshot();
  QWidget *owner = serverSyncDialog_ ? static_cast<QWidget *>(serverSyncDialog_.data()) : this;
  const auto path = QFileDialog::getSaveFileName(owner, tr("Save local copy"), {}, tr("Workflow (*.json)"));
  if (path.isEmpty()) { return; }
  const auto bytes = QJsonDocument(snapshot).toJson();
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
    QMessageBox::warning(owner, tr("Save local copy"), file.errorString());
    return;
  }
  message_ = tr("Saved a local copy. Server changes remain unresolved.");
  schedulePanelChanged();
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
  QHash<QString, QString> primaryOutputs;
  for (const auto id : model_.allNodeIds()) {
    const auto metadata = model_.metadata(id);
    const auto outputs = metadata["outputs"].toArray();
    if (outputs.isEmpty()) { continue; }
    auto primary = outputs.first().toObject()["name"].toString();
    const auto named = metadata["primary_output"].toString();
    for (const auto &output : outputs) {
      if (!named.isEmpty() && output.toObject()["name"].toString() == named) { primary = named; break; }
    }
    primaryOutputs.insert(model_.resourceId(id), primary);
  }
  QVariantList canvasCollections;
  for (const auto &value : runOutput_.entries()) {
    const auto entry = value.toMap();
    const auto primary = primaryOutputs.constFind(entry["nodeId"].toString());
    const auto items = entry["items"].toList();
    if (entry["kind"] != "output" || primary == primaryOutputs.cend() || *primary != entry["outputName"].toString()) { continue; }
    canvasCollections.append(QVariantMap{{"nodeId", entry["nodeId"]}, {"runId", runOutput_.selectedRunId()}, {"outputName", entry["outputName"]}, {"items", items}, {"notice", entry["previewNotice"]}, {"richEntry", entry}});
  }
  if (canvasMedia_) { canvasMedia_->setCollections(canvasCollections); }

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
bool EditorWindow::browserVisible() const {
  if (!tabOwner_) { return activeEditor_->browserVisible(); } return browserDock_ && !browserDock_->isHidden(); }
void EditorWindow::loadBrowser() {
  if (session_.serverUrl().isEmpty()) { return; }
  browserLoadingProjects_ = true;
  browser_.loadProjects();
}
void EditorWindow::showBrowser(bool visible) {
  if (!browserDock_ || browserVisible() == visible) { return; }
  if (visible) {
    browserRestoreCatalog_ = catalogVisible();
    catalogDock_->hide();
    inspectorDock_->hide();
    browserDock_->show();
    loadBrowser();
  } else {
    browserDock_->hide();
    if (browserRestoreCatalog_) { catalogDock_->show(); }
    syncInspector();
  }
  schedulePanelChanged();
  scheduleViewportSettle();
}
void EditorWindow::openWorkflow(const QString &id) {
  if (id.isEmpty()) return;
  auto owner = tabOwner_ ? tabOwner_ : this;
  for (int i = 0; i < owner->tabs_.size(); ++i) {
    auto tab = owner->tabs_[i];
    if (tab->requestedWorkflow_ == id || (tab->session_.serverBound() && tab->document_.snapshot()["id"].toString() == id)) {
      owner->activateSurface(i); return;
    }
  }
  auto tab = owner->activeEditor_;
  if (!tab->file_.isEmpty() || !tab->document_.nodes().isEmpty() || !tab->document_.undoStack()->isClean() || tab->session_.serverBound() || !tab->requestedWorkflow_.isEmpty()) {
    owner->newTab(); tab = owner->activeEditor_;
  }
  tab->requestedWorkflow_ = id;
  tab->session_.openWorkflow(id);
}
void EditorWindow::deleteWorkflow(const QString &id, const QString &name) {
  if (!tabOwner_) { activeEditor_->deleteWorkflow(id, name); return; }
  if (id.isEmpty()) { return; }
  const auto epoch = browserEpoch_;
  const auto answer = QMessageBox::question(this, tr("Delete workflow"), tr("Delete “%1” from the server? This cannot be undone.").arg(name), QMessageBox::Cancel | QMessageBox::Yes, QMessageBox::Cancel);
  if (answer == QMessageBox::Yes && epoch == browserEpoch_) { browser_.deleteWorkflow(id); }
}
bool EditorWindow::runActive() const {
  if (!tabOwner_) { return activeEditor_->runActive(); }
  for (const auto &item : session_.queue()) {
    const auto job = item.toMap();
    if (job.contains("order") && job["workflow_id"].toString() == document_.snapshot()["id"].toString()
        && !job["terminal"].toBool()) return true;
  }
  return false;
}
bool EditorWindow::outputVisible() const {
  if (!tabOwner_) { return activeEditor_->outputVisible(); } return outputDock_ && !outputDock_->isHidden(); }
bool EditorWindow::catalogVisible() const {
  if (!tabOwner_) { return activeEditor_->catalogVisible(); } return catalogDock_ && !catalogDock_->isHidden(); }
bool EditorWindow::inspectorVisible() const {
  if (!tabOwner_) { return activeEditor_->inspectorVisible(); } return inspectorDock_ && !inspectorDock_->isHidden(); }
QString EditorWindow::workflowName() const {
  if (!tabOwner_) { return activeEditor_->workflowName(); }
  return document_.snapshot()["name"].toString(tr("Untitled workflow"));
}
QString EditorWindow::graphSummary() const {
  if (!tabOwner_) { return activeEditor_->graphSummary(); }
  return tr("%1 nodes  ·  %2 edges").arg(document_.nodes().size()).arg(document_.edges().size());
}
QVariantMap EditorWindow::selectionInfo() const {
  if (!tabOwner_) { return activeEditor_->selectionInfo(); }
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
  return {{"childGraph", node_editor::isChildNode(node)}, {"title", model_.isComment(graphId) ? QString("Comment") : model_.isGroup(graphId) ? node["data"].toObject()["headline"].toString("Group") : layout.title}, {"icon", layout.icon},
          {"namespace", metadata["namespace"].toString(type.section('.', 0, -2))},
          {"description", metadata["description"].toString()},
          {"inputs", ports(QtNodes::PortType::In)}, {"outputs", ports(QtNodes::PortType::Out)}};
}
int EditorWindow::zoomPercent() const {
  if (!tabOwner_) { return activeEditor_->zoomPercent(); } return int(std::round(view_->transform().m11() * 100)); }
QString EditorWindow::iconPath(const QString &name) const {
  if (!tabOwner_) { return activeEditor_->iconPath(name); } return nodetool::iconPath(name); }
void EditorWindow::showToolTip(const QString &text) {
  if (!tabOwner_) { activeEditor_->showToolTip(text); return; }
  if (text.isEmpty()) { QToolTip::hideText(); } else { QToolTip::showText(QCursor::pos(), text, this); }
}
void EditorWindow::syncInspector() {
  if (historyWorkflowStale_) {
    historyWorkflowStale_ = false;
    generationHistory()->setWorkflow(document_.snapshot());
  }
  generationHistory()->selectNode(selected_);
  dynamicPorts_.setSelectedNode(selected_);
  emit inspectorSynced();
  if (browserVisible()) { return; }
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
  if (setupGuide_ && setupGuide_->rootObject()) {
    const auto size = setupGuide_->sizeHint();
    setupGuide_->setGeometry(std::max(0, (area.width() - size.width()) / 2), setupGuide_->rootObject()->property("topInset").toInt(), size.width(), size.height());
    setupGuide_->setVisible(guideVisible());
  }
  if (selectionOverlay_) {
    const auto selection = selectionOverlay_->sizeHint();
    selectionOverlay_->setGeometry(std::max(0, (area.width() - selection.width()) / 2), 30, selection.width(), selection.height());
    selectionOverlay_->setVisible(selectedCount() > 0 && !browserVisible());
  }
  if (auto root = toolbarOverlay_->rootObject()) { root->setProperty("compact", area.width() < compactToolbarWidth); }
  const auto toolbar = toolbarOverlay_->sizeHint();
    if (chatOverlay_) {
        layoutChat(QSize(area.width(), std::max(0, area.height() - toolbar.height() - 20)));
        chatOverlay_->setVisible(chatVisible_);
        chatOverlay_->raise();
    }
  toolbarOverlay_->setGeometry(std::max(0, (area.width() - toolbar.width()) / 2), std::max(0, area.height() - toolbar.height() - 20), toolbar.width(), toolbar.height());
  if (queueOverlay_ && queueOverlay_->rootObject()) {
    auto *queueRoot = queueOverlay_->rootObject();
    const int desired = qCeil(queueRoot->property("contentHeight").toReal());
    const QPoint origin = view_->mapTo(centralWidget(), QPoint(16, 16));
    const int height = std::max(0, std::min(desired, this->height() - 112));
    // Clear the native rail and catalog, and float above the output dock like the web overlay.
    queueOverlay_->setGeometry(origin.x(), origin.y(), std::max(0, std::min(304, area.width() - 32)), height);
    queueOverlay_->setVisible(queueRoot->property("presented").toBool() && height >= 36);
    queueOverlay_->raise();
  }
  const auto corner = viewportOverlay_->sizeHint();
  // The web keeps the zoom readout beside the toolbar's end when both fit.
  viewportOverlay_->setGeometry(std::max(0, area.width() - corner.width() - 16), std::max(0, area.height() - corner.height() - 16), corner.width(), corner.height());
  viewportOverlay_->setVisible(area.width() >= toolbar.width() + 2 * corner.width() + 32);
  if (auto miniMap = view_->findChild<QWidget *>("mini-map")) {
    const bool beside = area.width() >= toolbar.width() + 2 * corner.width() + 32;
    const int statusBottom = beside ? 16 : toolbar.height() + 28;
    viewportOverlay_->setGeometry(std::max(0, area.width()-corner.width()-16), std::max(0, area.height()-corner.height()-statusBottom), corner.width(), corner.height());
    viewportOverlay_->show();
    miniMap->move(std::max(0, area.width()-miniMap->width()-20), std::max(70, viewportOverlay_->y()-miniMap->height()-16));
    miniMap->setVisible(beside);
    viewportOverlay_->setVisible(beside);
    miniMap->raise(); viewportOverlay_->raise();
  }
  toolbarOverlay_->raise();
    if (chatOverlay_ && chatVisible_) {
        chatOverlay_->raise();
    }
  if (inlineTitle_) { inlineTitle_->reposition(); }
  if (compatiblePicker_ && compatiblePicker_->widget() && compatiblePicker_->active()) {
    compatiblePicker_->widget()->raise();
  }
}
bool EditorWindow::selectNode(const QString &resourceId) {
  if (!tabOwner_) { return activeEditor_->selectNode(resourceId); }
  for (auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) != resourceId) { continue; }
    lineage_->setSelectedLinkIds({});
    // The empty selection between these steps would sync the inspector too.
    selectingNode_ = true;
    scene_->clearSelection();
    selectingNode_ = false;
    scene_->nodeGraphicsObject(id)->setSelected(true);
    inspectNode(resourceId);
    return true;
  }
  return false;
}
void EditorWindow::inspectNode(const QString &resourceId) {
  scheduleViewportSettle();
  // A click releases a press that has already selected the node and synced the inspector.
  if (selected_ == resourceId && !inspectorDismissed_ && (browserVisible() || inspectorVisible())) { return; }
  selected_ = resourceId;
  inspectorDismissed_ = false;
  syncInspector();
  schedulePanelChanged();
}
void EditorWindow::setDarkTheme(bool dark) {
  tabsDark_ = dark;
  if (!tabOwner_) { for (auto tab : tabs_) tab->setDarkTheme(dark); return; }
  if (auto theme = engine_->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme")) {
    theme->setProperty("preference", dark ? 2 : 3);
  }
}
// macOS always uses gestures. Other platforms default to mouse and offer a setting.
bool EditorWindow::mouseNavigation() {
#ifdef Q_OS_MACOS
  return false;
#else
  return QSettings().value("canvas/navigation", "mouse").toString() == "mouse";
#endif
}
void EditorWindow::zoomUnderCursor(double factor) {
  const auto scale = view_->transform().m11() * factor;
  if (scale < 0.12 || scale > 4) { return; }
  fitActive_ = false;
  view_->setTransformationAnchor(QGraphicsView::AnchorUnderMouse);
  view_->scale(factor, factor);
  emit zoomChanged();
}
void EditorWindow::panBy(QPoint delta) {
  fitActive_ = false;
  view_->horizontalScrollBar()->setValue(view_->horizontalScrollBar()->value() - delta.x());
  view_->verticalScrollBar()->setValue(view_->verticalScrollBar()->value() - delta.y());
}
void EditorWindow::zoomBy(double factor) {
  const auto scale = view_->transform().m11() * factor;
  if (scale < 0.1 || scale > 5) { return; }
  fitActive_ = false;
  view_->setTransformationAnchor(QGraphicsView::AnchorViewCenter);
  view_->scale(factor, factor);
  emit zoomChanged();
}
void EditorWindow::showMoreMenu() {
  showActionMenu("more", QCursor::pos());
}
bool EditorWindow::selectionDisabled() const {
  if (!tabOwner_) { return activeEditor_->selectionDisabled(); }
  auto pending = selectedIds();
  QHash<QString, QJsonObject> nodes;
  QHash<QString, QStringList> children;
  for (const auto &value : document_.nodes()) {
    const auto node = value.toObject();
    const auto id = node["id"].toString();
    nodes.insert(id, node);
    children[node["parent_id"].toString()].append(id);
  }
  QSet<QString> visited;
  bool anyRunnable = false;
  for (qsizetype i = 0; i < pending.size(); ++i) {
    const auto id = pending[i];
    if (visited.contains(id)) { continue; }
    visited.insert(id);
    const auto node = nodes.value(id);
    const auto type = node["type"].toString();
    if (type == "nodetool.workflows.base_node.Group" || type == "nodetool.workflows.Group") {
      pending += children.value(id);
    } else if (!node.isEmpty() && type != "nodetool.workflows.base_node.Comment" && type != "nodetool.workflows.Comment") {
      anyRunnable = true;
      if (!node["ui_properties"].toObject()["bypassed"].toBool()) { return false; }
    }
  }
  return anyRunnable;
}
QString EditorWindow::readOnlyReason() const {
  if (!tabOwner_) { return activeEditor_->readOnlyReason(); }
  if (document_.isReadOnly()) {
    return document_.readOnlyReason();
  }
  for (const auto &value : document_.nodes()) {
    const auto type = value.toObject()["type"].toString();
    if (type == "group" || type == "comment") {
      return tr("Read-only: this legacy node format requires conversion in the web editor.");
    }
  }
  return {};
}
bool EditorWindow::apply(const QJsonObject &c) {
  if (readOnly()) {
    message_ = readOnlyReason();
    schedulePanelChanged();
    return false;
  }
  auto r = document_.applyCommand(c);
  if (!r) {
    message_ = r.error;
    schedulePanelChanged();
  }
    const auto op = c.value("op").toString();
    if (r && op != "addNode" && op != "addEdge" && op != "moveNodes") {
        session_.setSnapshot(document_.snapshot());
        if (refreshPending_) {
            refresh();
        }
    }
  return r.ok;
}
void EditorWindow::setCatalog(const QJsonArray &metadata) {
  if (!tabOwner_) { metadata_ = metadata; for (auto tab : tabs_) tab->setCatalog(metadata); emit catalogChanged(); return; }
  metadata_ = metadata;
  // Panels can bind to the tab or to the window that owns the tabs.
  emit catalogChanged();
  emit tabOwner_->catalogChanged();
  compatiblePicker_->setCatalog(metadata);
  canvasDrops_->setCatalog(metadata);
  session_.setNodeMetadata(metadata);
  document_.setNodeMetadata(metadata_);
  dynamicPorts_.setNodeMetadata(metadata_);
  refresh();
  // New descriptors must reach the fields before a commit queued for the old ones runs.
  flushPanelChanged();
  scheduleViewportSettle();
}
void EditorWindow::invalidateGesture() {
  ++gestureEpoch_;
  gesture_ = false;
  gestureCommands_ = {};
  gesturePositions_.clear();
}
void EditorWindow::refresh() {
  refreshPending_ = false;
  if (setupGuide_) setupGuide_->setVisible(guideVisible());
  if (canvasDrops_) canvasDrops_->setWorkflowId(session_.serverBound() ? session_.workflow()["id"].toString() : QString{});
  invalidateGesture();
  auto selected = selectedIds();
  const QSignalBlocker selectionBlocker(scene_);
  auto presentationMetadata = metadata_;
  for (qsizetype i = 0; i < presentationMetadata.size(); ++i) {
    auto entry = presentationMetadata[i].toObject(); QStringList missing;
    for (auto value : entry["required_runtimes"].toArray()) {
      const auto runtime = value.toString();
      if (setup_.statuses().contains(runtime) && !setup_.statuses()[runtime].toBool()) missing.append(runtime);
    }
    entry["native_dependency_warning"] = missing.isEmpty() ? QString{} : tr("Requires %1 — install on server").arg(missing.join(", "));
    presentationMetadata[i] = entry;
  }
  model_.project(document_.snapshot(), presentationMetadata, readOnly());
  for (auto id : model_.allNodeIds()) {
    if (selected.contains(model_.resourceId(id))) {
      scene_->nodeGraphicsObject(id)->setSelected(true);
    }
  }
  if (document_.node(selected_).isEmpty()) { selected_.clear(); }
  setWindowTitle(
      document_.snapshot()["name"].toString(tr("NodeTool Workflow")) + "[*]");
  setWindowModified(!document_.undoStack()->isClean());
  syncRuntimePreviews();
  syncLineage();
  syncInspector();
  schedulePanelChanged();
}
void EditorWindow::scheduleLineage() {
  if (lineagePending_) { return; }
  lineagePending_ = true;
  QTimer::singleShot(0, this, [this] { lineagePending_ = false; syncLineage(); });
}
void EditorWindow::syncLineage() {
  QHash<QString, QRectF> geometry;
  for (const auto id : model_.allNodeIds()) {
    if (const auto item = scene_->nodeGraphicsObject(id)) {
      geometry.insert(model_.resourceId(id), item->mapRectToScene(QRectF(QPointF{}, model_.layout(id).size)));
    }
  }
  const auto error = lineage_->update(document_.graph(), geometry);
  if (!error.isEmpty() && !document_.isReadOnly()) { message_ = error; }
}
QVariantList EditorWindow::catalog() const {
  if (!tabOwner_) { return activeEditor_->catalog(); }
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
QString EditorWindow::pinnedGeneration() const {
  if (!tabOwner_) { return activeEditor_->pinnedGeneration(); }
  return document_.node(selected_)["ui_properties"].toObject()["selected_generation"].toString();
}
QStringList EditorWindow::replayGenerations() const {
  if (!tabOwner_) { return activeEditor_->replayGenerations(); }
  QStringList ids;
  for (const auto &value : document_.node(selected_)["ui_properties"].toObject()["selected_generations"].toArray()) { ids.append(value.toString()); }
  return ids;
}
bool EditorWindow::pinGeneration(const QString &id) {
  if (!tabOwner_) { return activeEditor_->pinGeneration(id); }
  if (selected_.isEmpty() || readOnly()) { return false; }
  if (!id.isEmpty() && !generationHistory()->contains(selected_, id)) { message_ = tr("This generation is missing. Refresh history or choose another generation."); schedulePanelChanged(); return false; }
  auto ui = document_.node(selected_)["ui_properties"].toObject();
  if (id.isEmpty()) { ui.remove("selected_generation"); } else { ui["selected_generation"] = id; }
  return apply({{"op", "setNodeField"}, {"id", selected_}, {"field", "ui_properties"}, {"value", ui}});
}
bool EditorWindow::clearReplayGenerations() {
  if (!tabOwner_) { return activeEditor_->clearReplayGenerations(); }
  if (selected_.isEmpty() || readOnly()) { return false; }
  auto ui = document_.node(selected_)["ui_properties"].toObject(); ui.remove("selected_generations");
  return apply({{"op", "setNodeField"}, {"id", selected_}, {"field", "ui_properties"}, {"value", ui}});
}
bool EditorWindow::toggleReplayGeneration(const QString &id) {
  if (!tabOwner_) { return activeEditor_->toggleReplayGeneration(id); }
  if (selected_.isEmpty() || readOnly()) { return false; }
  auto ids = replayGenerations();
  if (ids.contains(id)) { ids.removeAll(id); }
  else {
    if (!generationHistory()->contains(selected_, id)) { message_ = tr("This generation is missing. Refresh history or choose another generation."); schedulePanelChanged(); return false; }
    ids.append(id);
  }
  auto ui = document_.node(selected_)["ui_properties"].toObject();
  if (ids.isEmpty()) { ui.remove("selected_generations"); } else { ui["selected_generations"] = QJsonArray::fromStringList(ids); }
  return apply({{"op", "setNodeField"}, {"id", selected_}, {"field", "ui_properties"}, {"value", ui}});
}
QVariantList EditorWindow::properties() const {
  if (!tabOwner_) { return activeEditor_->properties(); }
  const auto node = document_.node(selected_);
  if (node["type"].toString().endsWith(".Group") || node["type"].toString().endsWith(".Comment")) return {};
  QJsonObject metadata;
  for (const auto &v : metadata_) {
    if (v.toObject()["node_type"] == node["type"]) { metadata = v.toObject(); break; }
  }
  auto rows = node_editor::propertyFields(node, metadata, document_.edges());
    const auto project = document_.snapshot().value("project_id").toString(browser_.projectId());
    for (auto& value : rows) {
        auto row = value.toMap();
        row.insert("projectId", project.isEmpty() ? QStringLiteral("default") : project);
        value = row;
    }
  if (readOnly()) {
    for (auto &v : rows) { auto row = v.toMap(); row["editable"] = false; v = row; }
  }
  return rows;
}
bool EditorWindow::knownNodeType(const QString &type) const {
  return std::any_of(metadata_.begin(), metadata_.end(), [&type](const auto &entry) {
    const auto node = entry.toObject();
    return node["node_type"].toString(node["type"].toString()) == type;
  });
}
bool EditorWindow::addNodeAt(const QString &type, const QPointF &position) {
  if (!knownNodeType(type) || !std::isfinite(position.x()) || !std::isfinite(position.y())) { return false; }
  for (const auto &entry : metadata_) {
    const auto metadata = entry.toObject();
    if (metadata["node_type"].toString(metadata["type"].toString()) != type) continue;
    NodeCreationOptions options; options.paletteStarters = true;
    return apply({{"op", "addNode"}, {"node", createNativeNode(metadata, position, document_.nodes(), {}, options)}});
  }
  return false;
}
void EditorWindow::addNode(const QString &type) {
  if (!tabOwner_) { activeEditor_->addNode(type); return; }
  if (knownNodeType(type)) { addNodeAt(type, view_->mapToScene(unobstructedViewport().center().toPoint())); }
  else { model_.addNode(type); }
}
void EditorWindow::dragNode(const QString &type) {
  if (!tabOwner_) { activeEditor_->dragNode(type); return; }
  if (readOnly() || !knownNodeType(type)) { return; }
  auto mime = new QMimeData;
  mime->setData("application/x-nodetool-node-type", type.toUtf8());
  QDrag drag(this);
  drag.setMimeData(mime);
  drag.exec(Qt::CopyAction, Qt::CopyAction);
}
void EditorWindow::autoLayout(bool selectedOnly) {
  if (readOnly()) { message_ = readOnlyReason(); schedulePanelChanged(); return; }
  node_editor::layout::LayoutOptions options;
  if (selectedOnly) {
    const auto ids = selectedIds();
    if (ids.isEmpty()) { message_ = tr("Select nodes to arrange."); schedulePanelChanged(); return; }
    options.selection = ids;
  }
  QHash<QString, QSizeF> sizes;
  for (const auto id : model_.allNodeIds()) {
    const auto item = scene_->nodeGraphicsObject(id);
    if (item) { sizes.insert(model_.resourceId(id), item->boundingRect().size().expandedTo(QSizeF(model_.layout(id).size))); }
  }
  const auto result = node_editor::layout::autoLayoutCommand(document_.graph(), sizes, options);
  if (!result.ok) { message_ = result.error; schedulePanelChanged(); return; }
  if (apply(result.command)) {
    message_ = selectedOnly ? tr("Selection arranged") : tr("Workflow arranged");
    QTimer::singleShot(0, this, &EditorWindow::fit);
    schedulePanelChanged();
  }
}
void EditorWindow::setProperty(const QString &name, const QVariant &value) {
  if (!tabOwner_) { activeEditor_->setProperty(name, value); return; }
  commitProperty(selected_, name, value);
}
bool EditorWindow::commitProperty(const QString &nodeId, const QString &name, const QVariant &value) {
  if (!tabOwner_) { return activeEditor_->commitProperty(nodeId, name, value); }
  if (nodeId.isEmpty() || nodeId != selected_) { return false; }
  if ((value.metaType().id() == QMetaType::Double || value.metaType().id() == QMetaType::Float) && !std::isfinite(value.toDouble())) { return false; }
  const bool changed = apply({{"op", "setProperty"}, {"id", nodeId}, {"name", name}, {"value", QJsonValue::fromVariant(value)}});
    if (changed && instantUpdate_ && session_.connected() && !runActive()) {
        const auto generation = ++instantUpdateGeneration_;
        const auto credentials = credentialsEpoch_;
        const auto workflowId = document_.snapshot()["id"].toString();
        auto execute = [this, nodeId, generation, credentials, workflowId] {
            if (!instantUpdate_ || generation != instantUpdateGeneration_
                || credentials != credentialsEpoch_ || workflowId != document_.snapshot()["id"].toString()
                || !session_.connected() || runActive()) {
                return;
            }
            const auto snapshot = document_.snapshot();
            QHash<QString, QStringList> downstream;
            for (const auto &value : snapshot["graph"].toObject()["edges"].toArray()) {
                const auto edge = value.toObject();
                downstream[edge["source"].toString()].append(edge["target"].toString());
            }
            QStringList targets{nodeId};
            QSet<QString> visited{nodeId};
            for (qsizetype i = 0; i < targets.size(); ++i) {
                for (const auto &target : downstream.value(targets[i])) {
                    if (!visited.contains(target)) {
                        visited.insert(target);
                        targets.append(target);
                    }
                }
            }
            session_.runSelected(snapshot, targets, metadata_);
        };
        const bool numeric = value.metaType().id() == QMetaType::Double
            || value.metaType().id() == QMetaType::Float || value.metaType().id() == QMetaType::Int;
        if (numeric) {
            execute();
        } else {
            QTimer::singleShot(300, this, std::move(execute));
        }
    }
  return changed;
}
bool EditorWindow::removeProperty(const QString &nodeId, const QString &name) {
  if (!tabOwner_) { return activeEditor_->removeProperty(nodeId, name); }
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
  if (!tabOwner_) { activeEditor_->fit(); return; }
  fitActive_ = true;
  applyFit();
  emit zoomChanged();
}
QRectF EditorWindow::unobstructedViewport() const {
  if (!tabOwner_) { return activeEditor_->unobstructedViewport(); }
  QRectF area = view_->viewport()->rect();
  if (selectionOverlay_ && selectionOverlay_->isVisible()) {
    const auto bottom = selectionOverlay_->geometry().bottom() + 8.0;
    if (bottom < area.height() / 2) { area.setTop(bottom); }
  }
  if (!toolbarOverlay_ || !toolbarOverlay_->isVisible()) { return area; }
  const auto toolbarTop = toolbarOverlay_->geometry().top() - 8.0;
  // On a very short canvas the toolbar has to overlap the graph.
  if (toolbarTop > area.top() + area.height() / 2) { area.setBottom(toolbarTop); }
  return area;
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
    layoutOverlays();
    if (fitActive_) { applyFit(); emit zoomChanged(); } else { revealSelection(); }
  }, Qt::QueuedConnection);
}
bool EditorWindow::openFile(const QString &path) {
  if (!tabOwner_) { return activeEditor_->openFile(path); }
  if (!confirmOpen()) {
    return false;
  }
  QFile f(path);
  if (!f.open(QIODevice::ReadOnly)) {
    message_ = f.errorString();
    schedulePanelChanged();
    return false;
  }
  node_editor::WorkflowDocument candidate;
  auto r = candidate.loadJson(f.readAll());
  if (!r) {
    message_ = r.error;
    schedulePanelChanged();
    return false;
  }
  session_.detachServerWorkflow();
  requestedWorkflow_.clear();
  if (serverSyncDialog_) { serverSyncDialog_->close(); }
  lineage_->setSelectedLinkIds({});
  r = document_.load(candidate.snapshot());
  if (!r) {
    message_ = r.error;
    schedulePanelChanged();
    return false;
  }
  mediaResolver_.clear();
  session_.clearGenerations();
  runOutput_.reset();
  dynamicPorts_.setSelectedNode({});
  file_ = path;
  refresh();
  QTimer::singleShot(0, this, &EditorWindow::fit);
  return true;
}
bool EditorWindow::saveFile(const QString &path) {
  if (!tabOwner_) { return activeEditor_->saveFile(path); }
    if (inlineChild_ && childParent_) {
        flushChild();
        return childParent_->saveFile(path);
    }
  QSaveFile f(path);
  auto bytes = QJsonDocument(document_.snapshot()).toJson();
  if (!f.open(QIODevice::WriteOnly) || f.write(bytes) != bytes.size() ||
      !f.commit()) {
    message_ = f.errorString();
    schedulePanelChanged();
    return false;
  }
  file_ = path;
  document_.undoStack()->setClean();
  message_ = tr("Saved");
  refresh();
  return true;
}
void EditorWindow::authoredAction(const QString &id, const QString &command, quint64 epoch, quint64 credentials) {
  if (!tabOwner_) { activeEditor_->authoredAction(id, command, epoch, credentials); return; }
  if (epoch != documentEpoch_ || credentials != credentialsEpoch_ || readOnly() || document_.node(id).isEmpty()) return;
  const auto node = document_.node(id);
  if (command.startsWith("color:")) {
    const auto color = command.mid(6);
    apply({{"op", node["type"].toString().endsWith(".Group") ? "setGroupColor" : "setCommentColor"}, {"id", id}, {"value", color.isEmpty() ? QJsonValue(QJsonValue::Null) : QJsonValue(color)}});
    return;
  }
  if (node["type"].toString() != "nodetool.workflows.base_node.Group" && node["type"].toString() != "nodetool.workflows.Group") return;
  if (command == "run") {
    if (runActive() || !session_.connected()) return;
    const auto run = session_.runSelected(document_.snapshot(), {id}, metadata_);
    if (!run.isEmpty()) { run_ = run; schedulePanelChanged(); }
  } else if (command == "bypass") {
    bool bypassed = false;
    for (const auto value : document_.nodes()) {
      const auto child = value.toObject();
      if (child["parent_id"].toString() == id && child["ui_properties"].toObject()["bypassed"].toBool()) bypassed = true;
    }
    apply({{"op", "setDisabled"}, {"ids", QJsonArray{id}}, {"disabled", !bypassed}});
  }
}

void EditorWindow::action(const QString &name) {
  if (!tabOwner_) { activeEditor_->action(name); return; }
  if (name == "Command menu" || name == "Keyboard shortcuts") { showActionMenu(name == "Command menu" ? "command" : "shortcuts", view_->viewport()->mapToGlobal(unobstructedViewport().center().toPoint())); return; }
  if (name == "Disable toggle") { action(selectionDisabled() ? "Enable selected" : "Disable selected"); return; }
  if (name == "Select all") {
    // Each setSelected emits selectionChanged, and every listener does work
    // that grows with the graph. Notify once for the whole selection.
    QSignalBlocker blocker(scene_);
    for (auto id : model_.allNodeIds()) { if (auto *item = scene_->nodeGraphicsObject(id)) { item->setSelected(true); } }
    blocker.unblock();
    emit scene_->selectionChanged();
    return;
  }
  if (name == "Cut") { if (menuActionEnabled(name)) { action("Copy"); action("Delete"); } return; }
  if (name == "Version history" || name == "Share workflow" || name == "Workflow metadata") {
    showWorkflowDetails(name == "Version history" ? "versions" : name == "Share workflow" ? "sharing" : "metadata"); return;
  }
    if (name == "Save" && inlineChild_ && childParent_) {
        flushChild();
        childParent_->action(name);
        return;
    }
    if (name == "Group into subgraph") {
        if (!menuActionEnabled(name)) { return; }
        for (const auto &value : metadata_) {
            const auto metadata = value.toObject();
            if (metadata["node_type"] != "nodetool.workflows.subgraph.Subgraph") { continue; }
            const auto node = createNativeNode(metadata, {}, document_.nodes(), {});
            const auto graph = node_editor::groupIntoSubgraph(document_.graph(), selectedIds(), node);
            if (apply({{"op", "replaceGraph"}, {"graph", graph}})) { selectNode(node["id"].toString()); }
            return;
        }
        return;
    }
  if (name == "Open child") { openChild(); return; }
  if (name == "Linked workflows") { showLinkedWorkflows(); return; }
  if (name == "Server sync") { showServerSync(); return; }
  if (name == "Canvas uploads") { showCanvasDrops(); return; }
  if (name == "Save local copy as") { saveLocalCopyAs(); return; }
  if (name == "Arrange selection") {
    auto menu = new QMenu(this);
    menu->setAttribute(Qt::WA_DeleteOnClose);
    for (auto it = selectionActions.cbegin(); it != selectionActions.cend(); ++it) {
      const auto command = it.key();
      auto item = menu->addAction(command, this, [this, command] { action(command); });
      item->setEnabled(!readOnly() && selectedCount() >= 2);
    }
    menu->popup(QCursor::pos());
    return;
  }
  if (name == "Duplicate vertical") {
    if (readOnly() || selectedIds().isEmpty()) { return; }
    QRectF bounds;
    for (const auto id : model_.allNodeIds()) {
      if (selectedIds().contains(model_.resourceId(id))) {
        bounds = bounds.united(QRectF(model_.nodeData(id, QtNodes::NodeRole::Position).toPointF(), model_.layout(id).size));
      }
    }
    apply({{"op", "paste"}, {"fragment", document_.copy(selectedIds())},
           {"offset", QJsonObject{{"x", 0}, {"y", bounds.height() + 20}}}});
    return;
  }
  if (name == "Align" || name == "Align with spacing") {
    if (readOnly()) { return; }
    QHash<QString, QRectF> geometry;
    for (const auto id : model_.allNodeIds()) {
      geometry.insert(model_.resourceId(id), QRectF(model_.nodeData(id, QtNodes::NodeRole::Position).toPointF(), model_.layout(id).size));
    }
    const auto roots = node_editor::layout::selectionLayoutCommand(document_.graph(), selectedIds(), geometry, node_editor::layout::SelectionAction::AlignLeft).roots;
    if (roots.size() < 2) { return; }
    double minX = geometry[roots.first()].x(), maxX = minX;
    double minY = geometry[roots.first()].y(), maxY = minY;
    for (const auto &id : roots) {
      minX = std::min(minX, geometry[id].x()); maxX = std::max(maxX, geometry[id].x());
      minY = std::min(minY, geometry[id].y()); maxY = std::max(maxY, geometry[id].y());
    }
    const bool vertical = maxX - minX < maxY - minY;
    auto sorted = roots;
    std::stable_sort(sorted.begin(), sorted.end(), [&](const auto &a, const auto &b) { return vertical ? geometry[a].y() < geometry[b].y() : geometry[a].x() < geometry[b].x(); });
    QJsonObject positions;
    double next = vertical ? minY : minX;
    for (const auto &id : sorted) {
      const auto rect = geometry[id];
      const auto point = vertical ? QPointF(minX, name == "Align with spacing" ? next : rect.y()) : QPointF(name == "Align with spacing" ? next : rect.x(), minY);
      positions[id] = QJsonObject{{"x", point.x()}, {"y", point.y()}};
      next += vertical ? rect.height() + 20 : rect.width() + 40;
    }
    apply({{"op", "moveNodes"}, {"positions", positions}, {"space", "absolute"}});
    return;
  }
  if (selectionActions.contains(name)) {
    if (readOnly()) { message_ = readOnlyReason(); schedulePanelChanged(); return; }
    QHash<QString, QRectF> geometry;
    for (const auto id : model_.allNodeIds()) {
      geometry.insert(model_.resourceId(id), QRectF(model_.nodeData(id, QtNodes::NodeRole::Position).toPointF(), model_.layout(id).size));
    }
    const auto result = node_editor::layout::selectionLayoutCommand(document_.graph(), selectedIds(), geometry, selectionActions.value(name));
    if (!result.ok) { message_ = result.error; schedulePanelChanged(); return; }
    if (!result.command["positions"].toObject().isEmpty() && apply(result.command)) { fitActive_ = false; }
    return;
  }
  if (name == "Find node") {
    QMap<QString, QString> matches;
    for (const auto id : model_.allNodeIds()) {
      const auto resource = model_.resourceId(id);
      const auto type = document_.node(resource)["type"].toString();
      matches.insert(QStringLiteral("%1 (%2) [%3]").arg(model_.layout(id).title, type, resource), resource);
    }
    if (matches.isEmpty()) { message_ = tr("No nodes to find."); schedulePanelChanged(); return; }
    QInputDialog dialog(this);
    dialog.setWindowTitle(tr("Find node"));
    dialog.setLabelText(tr("Search by title, type, or ID"));
    dialog.setComboBoxEditable(true);
    dialog.setComboBoxItems(matches.keys());
    dialog.setTextValue({});
    if (auto combo = dialog.findChild<QComboBox *>()) {
      auto completer = new QCompleter(matches.keys(), combo);
      completer->setCaseSensitivity(Qt::CaseInsensitive);
      completer->setFilterMode(Qt::MatchContains);
      combo->setCompleter(completer);
    }
    while (dialog.exec() == QDialog::Accepted) {
      const auto query = dialog.textValue().trimmed();
      auto id = matches.value(query);
      if (id.isEmpty() && !query.isEmpty()) {
        QStringList found;
        for (auto it = matches.cbegin(); it != matches.cend(); ++it) {
          if (it.key().contains(query, Qt::CaseInsensitive)) { found.append(it.value()); }
        }
        if (found.size() == 1) { id = found.first(); }
      }
      if (!id.isEmpty()) { fitActive_ = false; selectNode(id); return; }
      dialog.setLabelText(tr("Choose one matching node, or narrow your search."));
    }
    return;
  }
  if (name == "Group selection" || name == "Ungroup" || name == "Remove from group") {
    const auto ids = selectedIds();
    if (ids.isEmpty()) { message_ = tr("Select nodes first."); schedulePanelChanged(); return; }
    QJsonObject command{{"op", name == "Group selection" ? "groupNodes" : name == "Ungroup" ? "ungroupNodes" : "detachNodes"}, {"ids", QJsonArray::fromStringList(ids)}};
    if (name == "Group selection") {
      QJsonObject sizes;
      for (const auto id : model_.allNodeIds()) {
        const auto resource = model_.resourceId(id);
        if (!ids.contains(resource)) { continue; }
        const auto size = model_.layout(id).size;
        sizes.insert(resource, QJsonObject{{"width", size.width()}, {"height", size.height()}});
      }
      command.insert("sizes", sizes);
    }
    apply(command);
    return;
  }
  if (name == "Add comment") {
    const auto position = view_->mapToScene(unobstructedViewport().center().toPoint());
    const auto id = QUuid::createUuid().toString(QUuid::Id128);
    if (apply({{"op", "addNode"}, {"node", QJsonObject{{"id", id}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Comment"}}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", position.x()}, {"y", position.y()}}}, {"width", 300}, {"height", 160}}}}}})) { selectNode(id); }
    return;
  }
  if (name == "Edit note" || name == "Rename group") {
    if (refreshPending_) { refresh(); }
    if (readOnly()) { message_ = readOnlyReason(); schedulePanelChanged(); return; }
    const auto ids = selectedIds();
    if (ids.size() != 1) { message_ = tr("Select one node first."); schedulePanelChanged(); return; }
    for (const auto id : model_.allNodeIds()) {
      if (model_.resourceId(id) != ids.first()) { continue; }
      if (model_.isComment(id) || (name == "Rename group") != model_.isGroup(id) || model_.nodeSnapshot(id)["type"] == "nodetool.code.Code") {
        message_ = name == "Rename group" ? tr("Select a group.") : tr("Select a node that supports notes.");
        schedulePanelChanged();
        return;
      }
      inlineTitle_->activate(id);
      return;
    }
    return;
  }
  if (name == "Rename node" || name == "Edit comment") {
    if (readOnly()) { message_ = readOnlyReason(); schedulePanelChanged(); return; }
    const auto ids = selectedIds();
    if (ids.size() != 1) { message_ = tr("Select one node first."); schedulePanelChanged(); return; }
    const auto id = ids.first();
    const auto node = document_.node(id);
    bool accepted = false;
    if (name == "Rename node") {
      const auto title = node["data"].toObject()["headline"].toString(node["ui_properties"].toObject()["title"].toString());
      const auto text = QInputDialog::getText(this, tr("Rename node"), tr("Title"), QLineEdit::Normal, title, &accepted);
      if (accepted) { apply({{"op", "renameNode"}, {"id", id}, {"title", text}}); }
    } else {
      const auto type = node["type"].toString();
      if (type != "nodetool.workflows.base_node.Comment" && type != "nodetool.workflows.Comment") { message_ = tr("Select a comment node."); schedulePanelChanged(); return; }
      const QJsonValue value = node["data"].toObject()["comment"];
      if (value.isObject()) { message_ = tr("Rich-text comments can be viewed here. Edit their formatting in the web editor."); schedulePanelChanged(); return; }
      const auto text = QInputDialog::getMultiLineText(this, tr("Edit comment"), tr("Comment (Markdown)"), value.toString(), &accepted);
      if (accepted) { apply({{"op", "setComment"}, {"id", id}, {"value", text}}); }
    }
    return;
  }
  if (name == "Run selected" || name == "Disable selected" || name == "Enable selected") {
    if (readOnly()) { message_ = readOnlyReason(); schedulePanelChanged(); return; }
    const auto ids = selectedIds();
    if (ids.isEmpty()) { message_ = tr("Select nodes first."); schedulePanelChanged(); return; }
    if (name == "Run selected") {
      if (runActive()) { message_ = tr("Stop the active workflow before running the selection."); schedulePanelChanged(); return; }
      const auto id = session_.runSelected(document_.snapshot(), ids, metadata_);
      if (!id.isEmpty()) {
        run_ = id;
        const auto plan = session_.lastPartialPlan();
        message_ = tr("Running selected nodes · Reused upstream nodes: %1").arg(plan.reused.size());
        if (!plan.stale.isEmpty()) { message_ += tr(" · Reusing generations from edited nodes: %1").arg(plan.stale.join(", ")); }
        schedulePanelChanged();
      }
    } else if (apply({{"op", "setDisabled"}, {"ids", QJsonArray::fromStringList(ids)}, {"disabled", name == "Disable selected"}})) {
      message_ = name == "Disable selected" ? tr("Selected nodes disabled") : tr("Selected nodes enabled");
      schedulePanelChanged();
    }
    return;
  }
  if (name == "Auto layout" || name == "Layout selection") { autoLayout(name == "Layout selection"); return; }
  if (name == "Refresh workflows") { loadBrowser(); return; }
  if (name == "Output") {
    outputDock_->setVisible(!outputVisible());
    return;
  }
  if (name == "Toggle nodes") {
    if (browserVisible()) { showBrowser(false); catalogDock_->show(); return; }
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
    lineage_->setSelectedLinkIds({});
    scene_->clearSelection();
    selected_.clear();
    inspectorDismissed_ = true;
    syncInspector();
    schedulePanelChanged();
    return;
  }
  if (name.startsWith("Canvas navigation:")) {
    QSettings().setValue("canvas/navigation", mouseNavigation() ? "trackpad" : "mouse");
    return;
  }
  if (name.startsWith("Instant Update:")) {
      instantUpdate_ = !instantUpdate_;
      ++instantUpdateGeneration_;
      scene_->setReducedMotion(canvasReducedMotion_ || instantUpdate_);
      schedulePanelChanged();
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
  if (name == "Zoom presets") {
    QMenu menu(this);
    for (double zoom : {0.25, 0.5, 0.75, 1., 1.5, 2.}) {
      auto entry = menu.addAction(QString::number(qRound(zoom * 100)) + "%");
      entry->setCheckable(true); entry->setChecked(std::abs(view_->transform().m11()-zoom) < .01);
      connect(entry, &QAction::triggered, this, [this, zoom] { zoomBy(zoom / view_->transform().m11()); });
    }
    menu.exec(viewportOverlay_->mapToGlobal(QPoint(0,0))); return;
  }
  if (name == "Fit selection") {
    QRectF bounds;
    for (auto id : model_.allNodeIds()) {
      auto item = scene_->nodeGraphicsObject(id);
      if (item && item->isSelected()) { bounds |= item->mapRectToScene(QRectF(QPointF(), model_.layout(id).size)); }
    }
    if (bounds.isEmpty()) { fit(); return; }
    fitActive_ = false;
    const auto area = unobstructedViewport();
    const double zoom = std::clamp(std::min(area.width()/(bounds.width()*1.2), area.height()/(bounds.height()*1.2)), .1, 5.);
    view_->setTransform(QTransform::fromScale(zoom,zoom)); view_->centerOn(bounds.center()); emit zoomChanged(); return;
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
    schedulePanelChanged();
    return;
  }
  if (name == "Server Open" || name == "Open" || name == "Workflows") {
    showBrowser(name == "Workflows" ? !browserVisible() : true);
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
    schedulePanelChanged();
    return;
  }
  if (name == "Undo") {
    document_.undo();
  } else if (name == "Redo") {
    document_.redo();
  } else if (name == "Fit") {
    fit();
  } else if (name == "Open file") {
    auto p = QFileDialog::getOpenFileName(this, tr("Open workflow"), {},
                                          tr("Workflow (*.json)"));
    if (!p.isEmpty()) {
      auto owner = tabOwner_;
      for (int i = 0; i < owner->tabs_.size(); ++i) {
        if (QFileInfo(owner->tabs_[i]->file_).absoluteFilePath() == QFileInfo(p).absoluteFilePath()) { owner->activateSurface(i); return; }
      }
      if (!file_.isEmpty() || !document_.nodes().isEmpty() || hasUnsavedChanges() || session_.serverBound()) owner->newTab();
      owner->activeEditor_->openFile(p);
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
    const auto id = session_.run(document_.snapshot());
    if (!id.isEmpty()) { run_ = id; }
  } else if (name == "Stop") {
    QString latest;
    double order = -1;
    for (const auto &item : session_.queue()) {
      const auto job = item.toMap();
      if (job["local"].toBool() && !job["terminal"].toBool()
          && job["workflow_id"].toString() == document_.snapshot()["id"].toString()
          && job["order"].toDouble() > order) {
          latest = job["jobId"].toString();
          order = job["order"].toDouble();
      }
    }
    if (!latest.isEmpty()) {
      session_.stop(latest);
    }
  } else if (name == "Delete") {
    QJsonArray commands;
    for (const auto &id : lineage_->selectedLinkIds()) {
      commands.append(QJsonObject{{"op", "removeLink"}, {"id", id}});
    }
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
  } else if (name == "Link selected") {
    apply({{"op", "linkNodes"}, {"ids", QJsonArray::fromStringList(selectedIds())}});
  } else if (name == "Copy") {
    QApplication::clipboard()->setText(QString::fromUtf8(
        QJsonDocument(document_.copy(selectedIds())).toJson()));
  } else if (name == "Paste") {
    auto fragment =
        QJsonDocument::fromJson(QApplication::clipboard()->text().toUtf8());
    if (fragment.isObject()) {
      // As on the web: the first top-level node lands at the pointer, or at the
      // canvas centre when the pointer is elsewhere. Repeats at one spot step.
      const auto viewport = view_->viewport();
      auto screen = pasteMenuPosition_.isNull() ? viewport->mapFromGlobal(QCursor::pos()) : viewport->mapFromGlobal(pasteMenuPosition_);
      pasteMenuPosition_ = {};
      if (!viewport->rect().contains(screen)) { screen = viewport->rect().center(); }
      auto at = view_->mapToScene(screen);
      constexpr double step = 40;
      if (lastPaste_ && std::abs(lastPaste_->x() - at.x()) < step && std::abs(lastPaste_->y() - at.y()) < step) {
        at = *lastPaste_ + QPointF(step, step);
      }
      lastPaste_ = at;
      QPointF anchor;
      for (const auto &value : fragment.object().value("nodes").toArray()) {
        const auto node = value.toObject();
        if (!node.value("parent_id").toString().isEmpty()) { continue; }
        const auto position = node.value("ui_properties").toObject().value("position").toObject();
        anchor = QPointF(position.value("x").toDouble(), position.value("y").toDouble());
        break;
      }
      apply({{"op", "paste"},
             {"fragment", fragment.object()},
             {"offset", QJsonObject{{"x", at.x() - anchor.x()}, {"y", at.y() - anchor.y()}}}});
    }
  } else if (name == "Duplicate") {
    auto r = document_.duplicate(selectedIds());
    if (!r) {
      message_ = r.error;
      schedulePanelChanged();
    }
  }
}
bool EditorWindow::eventFilter(QObject *object, QEvent *event) {
  if (object == view_->viewport() && (event->type() == QEvent::DragEnter || event->type() == QEvent::DragMove || event->type() == QEvent::Drop) && static_cast<QDropEvent *>(event)->mimeData()->hasFormat("application/x-nodetool-node-type")) {
    auto drop = static_cast<QDropEvent *>(event);
    const auto bytes = drop->mimeData()->data("application/x-nodetool-node-type");
    const auto type = QString::fromUtf8(bytes);
    if (readOnly() || bytes.isEmpty() || bytes.size() > 4096 || type.toUtf8() != bytes || !knownNodeType(type) || !(drop->possibleActions() & Qt::CopyAction)) {
      drop->ignore(); return true;
    }
    if (event->type() != QEvent::Drop || addNodeAt(type, view_->mapToScene(drop->position().toPoint()))) {
      drop->setDropAction(Qt::CopyAction); drop->accept();
    } else { drop->ignore(); }
    return true;
  }
  if (event->type() == QEvent::Resize && object == view_->viewport()) {
    layoutOverlays();
    scheduleViewportSettle();
  }
  if (event->type() == QEvent::Wheel && object == view_->viewport()) {
    auto wheel = static_cast<QWheelEvent *>(event);
    // A physical wheel reports no scroll phase and no pixel delta, so it still zooms.
    const bool physicalWheel = wheel->phase() == Qt::NoScrollPhase && wheel->pixelDelta().isNull();
    if (mouseNavigation() || physicalWheel || wheel->modifiers().testAnyFlags(Qt::ControlModifier | Qt::MetaModifier)) {
      if (wheel->angleDelta().y() != 0) { zoomUnderCursor(wheel->angleDelta().y() > 0 ? 1.15 : 1.0 / 1.15); }
    } else {
      panBy(wheel->pixelDelta().isNull() ? wheel->angleDelta() / 2 : wheel->pixelDelta());
    }
    return true;
  }
  if (event->type() == QEvent::NativeGesture && object == view_->viewport()) {
    auto gesture = static_cast<QNativeGestureEvent *>(event);
    if (gesture->gestureType() != Qt::ZoomNativeGesture) { return false; }
    zoomUnderCursor(1.0 + gesture->value());
    return true;
  }
  if (event->type() == QEvent::MouseButtonPress &&
      object == view_->viewport()) {
    auto mouse = static_cast<QMouseEvent *>(event);
    if (mouse->button() == Qt::LeftButton && !mouse->modifiers().testAnyFlags(Qt::ShiftModifier | Qt::ControlModifier | Qt::MetaModifier)) {
      lineage_->setSelectedLinkIds({});
    }
    // Applied per press so that every open tab follows the one setting.
    view_->setDragMode(mouseNavigation() ? QGraphicsView::ScrollHandDrag : QGraphicsView::RubberBandDrag);
    if (mouseNavigation() && mouse->button() == Qt::LeftButton && !view_->itemAt(mouse->position().toPoint())) { fitActive_ = false; }
    if (mouse->button() == Qt::MiddleButton) {
      const auto hit = view_->itemAt(mouse->position().toPoint());
      if (hit && hit->toGraphicsObject() && hit->toGraphicsObject()->parent() == lineage_) { return false; }
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
    ++gestureEpoch_;
    gesture_ = true;
    gestureCommands_ = {};
    gesturePositions_.clear();
    for (auto id : model_.allNodeIds()) {
      gesturePositions_.insert(model_.resourceId(id), model_.nodeData(id, QtNodes::NodeRole::Position).toPointF());
    }
  }
  if (event->type() == QEvent::MouseButtonRelease &&
      object == view_->viewport()) {
    const auto epoch = gestureEpoch_;
    QTimer::singleShot(0, this, [this, epoch] {
      if (!gesture_ || epoch != gestureEpoch_) { return; }
      QJsonObject positions;
      for (auto id : model_.allNodeIds()) {
        auto p = model_.nodeData(id, QtNodes::NodeRole::Position).toPointF();
        const auto resource = model_.resourceId(id);
        if (gesturePositions_.contains(resource) && p != gesturePositions_.value(resource)) {
          positions[model_.resourceId(id)] =
              QJsonObject{{"x", p.x()}, {"y", p.y()}};
        }
      }
      if (!positions.isEmpty()) {
        fitActive_ = false;
        gestureCommands_.append(
            QJsonObject{{"op", "moveNodes"}, {"positions", positions}, {"space", "absolute"}});
      }
      gesture_ = false;
      gesturePositions_.clear();
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
    if (QApplication::activePopupWidget() || inlinePresenter_->active() || inlineTitle_->active()) { return false; }
    auto key = static_cast<QKeyEvent *>(event);
    if (key->modifiers() == Qt::NoModifier &&
        (key->key() == Qt::Key_Left || key->key() == Qt::Key_Right ||
         key->key() == Qt::Key_Up || key->key() == Qt::Key_Down)) {
      const auto selected = selectedIds();
      if (!selected.isEmpty()) {
        const QSet<QString> ids(selected.cbegin(), selected.cend());
        const QPointF delta(key->key() == Qt::Key_Left ? -10 : key->key() == Qt::Key_Right ? 10 : 0,
                            key->key() == Qt::Key_Up ? -10 : key->key() == Qt::Key_Down ? 10 : 0);
        QJsonObject positions;
        for (const auto id : model_.allNodeIds()) {
          const auto resource = model_.resourceId(id);
          if (!ids.contains(resource)) { continue; }
          const auto position = model_.nodeData(id, QtNodes::NodeRole::Position).toPointF() + delta;
          positions.insert(resource, QJsonObject{{"x", position.x()}, {"y", position.y()}});
        }
        if (apply({{"op", "moveNodes"}, {"positions", positions}, {"space", "absolute"}})) { fitActive_ = false; }
        return true;
      }
    }
    QString command;
    if (key->key() == Qt::Key_Escape) {
        if (runActive()) {
            action("Stop");
        }
      invalidateGesture();
      scene_->resetDraftConnection();
      refresh();
      return true;
    }
    if (QApplication::activePopupWidget()) { return false; }
    command = shortcutCommand(key->key(), key->modifiers());
    if (!command.isEmpty()) {
      action(command);
      return true;
    }
  }
  return QMainWindow::eventFilter(object, event);
}
bool EditorWindow::confirmOpen() {
  if (!tabOwner_) { return activeEditor_->confirmOpen(); }
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
  if (!tabOwner_) { activeEditor_->presentation(roles); return; }
    canvasReducedMotion_ = roles.value("reducedMotion").toBool();
    scene_->setReducedMotion(canvasReducedMotion_ || instantUpdate_);
  auto color = [&](const char *name) {
    return roles.value(name).value<QColor>();
  };
  QFont linkFont(roles.value("sans").toString());
  linkFont.setPixelSize(roles.value("captionSize", node_metrics::fontValue).toInt());
  lineage_->setTheme({color("secondary"), color("primary"), linkFont});
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
                               "QMenu::item:disabled { color: %6; }"
                               "QMenu::separator { height: 1px; background: %3; margin: 4px 0; }"
                               "QToolTip { background: %1; color: %2; border: 1px solid %3; font-family: \"%4\"; font-size: 11px; padding: 4px 8px; }")
                    .arg(css(color("overlay")), css(color("text")), css(color("border")), roles.value("sans").toString(), css(color("field")), css(color("secondary"))));
  CanvasTheme theme;
  theme.canvas = color("canvas");
  theme.grid = color("grid");
  theme.node = color("node");
  theme.reroutePaper = color("reroutePaper");
  theme.rerouteBorder = color("rerouteBorder");
    theme.subgraphAccent = color("subgraphAccent");
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
  if (!tabOwner_) { QMainWindow::resizeEvent(event); return; }
  QMainWindow::resizeEvent(event);
  syncInspector();
}
void EditorWindow::closeEvent(QCloseEvent *event) {
  auto owner = tabOwner_ ? tabOwner_ : this;
    if (owner->activeEditor_) {
        owner->activeEditor_->flushChild();
    }
  for (auto tab : owner->tabs_) {
    if (tab->inlineChild_) { continue; }
    if (!tab->confirmTabClose()) { event->ignore(); return; }
  }
  owner->persistTabs();
  event->accept();
}

} // namespace nodetool

void nodetool::EditorWindow::setupAction(const QString &name) {
    if (!tabOwner_) {
        activeEditor_->setupAction(name);
        return;
    }
    if (name == "close-guide") {
        guideStarted_ = false;
        guideDismissed_ = true;
        refresh();
        return;
    }
    if (name == "choose") {
        guideStarted_ = true;
        catalogDock_->show();
        refresh();
        return;
    }
    if (name == "starter") {
        if (!emptyCanvas() || readOnly()) {
            return;
        }
        guideStarted_ = true;
        schedulePanelChanged();
        QJsonObject inputMeta, outputMeta;
        for (auto value : metadata_) {
            const auto entry = value.toObject();
            if (entry["node_type"] == "nodetool.input.StringInput") {
                inputMeta = entry;
            }
            if (entry["node_type"] == "nodetool.output.Output") {
                outputMeta = entry;
            }
        }
        if (inputMeta.isEmpty() || outputMeta.isEmpty()) {
            catalogDock_->show();
            message_ = tr("Choose String Input from the node catalog. Connect "
                          "to a server if it is unavailable.");
            schedulePanelChanged();
            return;
        }
        const auto input =
            createNativeNode(inputMeta, {-240, 0}, document_.nodes());
        const auto output =
            createNativeNode(outputMeta, {240, 0}, document_.nodes());
        apply({{"op", "batch"},
               {"commands",
                QJsonArray{QJsonObject{{"op", "addNode"}, {"node", input}},
                           QJsonObject{{"op", "addNode"}, {"node", output}},
                           QJsonObject{
                               {"op", "addEdge"},
                               {"edge",
                                QJsonObject{{"id", QUuid::createUuid().toString(
                                                       QUuid::Id128)},
                                            {"source", input["id"]},
                                            {"target", output["id"]},
                                            {"sourceHandle", "output"},
                                            {"targetHandle", "value"}}}}}}});
        fit();
        return;
    }
    if (setupDialog_) {
        setupDialog_->show();
        setupDialog_->raise();
        if (name == "templates") {
            setup_.browseTemplates();
        }
        return;
    }
    auto *dialog = new QDialog(this);
    setupDialog_ = dialog;
    dialog->setAttribute(Qt::WA_DeleteOnClose);
    dialog->setWindowTitle(tr("Runtimes and packs"));
    auto *content = new QQuickWidget(engine_, dialog);
    content->setResizeMode(QQuickWidget::SizeRootObjectToView);
    content->setInitialProperties(
        {{"controller", QVariant::fromValue(&setup_)}});
    content->setSource(QUrl("qrc:/editor/SetupPanel.qml"));
    auto *layout = new QVBoxLayout(dialog);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(content);
    if (content->rootObject()) {
        connect(content->rootObject(), SIGNAL(closeRequested()), dialog,
                SLOT(close()));
    }
    connect(dialog, &QDialog::finished, &setup_,
            &node_editor::SetupController::cancel);
    dialog->resize(content->sizeHint());
    dialog->show();
    if (name == "templates") {
        setup_.browseTemplates();
    } else {
        setup_.refresh();
    }
}

QVariantList nodetool::EditorWindow::guideReadiness() const {
    QSet<QString> inputs, outputs;
    for (const auto &value : document_.nodes()) {
        const auto node = value.toObject();
        if (node["type"] == "nodetool.input.StringInput") {
            inputs.insert(node["id"].toString());
        }
        if (node["type"] == "nodetool.output.Output") {
            outputs.insert(node["id"].toString());
        }
    }
    bool connected = false;
    for (const auto &value : document_.edges()) {
        const auto edge = value.toObject();
        connected |= inputs.contains(edge["source"].toString()) &&
                     outputs.contains(edge["target"].toString());
    }
    bool completed = false;
    const auto workflowId = document_.snapshot()["id"].toString();
    for (const auto &value : session_.queue()) {
        const auto row = value.toMap();
        completed |= row["workflow_id"].toString() == workflowId &&
                     row["status"] == "completed";
    }
    return {!inputs.isEmpty(), !outputs.isEmpty(), connected,
            !inputs.isEmpty() && !outputs.isEmpty() && !hasUnsavedChanges(),
            completed};
}
