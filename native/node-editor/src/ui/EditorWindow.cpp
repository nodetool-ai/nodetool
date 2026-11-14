#include "document/ChildPorts.h"
#include "properties/CodeHighlighter.h"
#include "EditorWindow.h"
#include "media/LocalMediaStore.h"
#include "graph/CardBodies.h"
#include "document/GroupIntoSubgraph.h"
#include "MiniMap.h"
#include "InspectorClearance.h"
#include <QDateTime>
#include <QAbstractAnimation>
#include <QEasingCurve>
#include <QVariantAnimation>
#include "graph/CatalogCategories.h"
#include "graph/CatalogSearch.h"
#include "layout/AutoLayout.h"
#include "layout/SelectionLayout.h"
#include <QMap>
#include <QTextBlock>
#include <QDrag>
#include <memory>
#include <QDragEnterEvent>
#include <QMimeData>
#include <QUuid>
#include "media/VideoFrameView.h"
#include "graph/EditorScene.h"
#include "graph/InlinePropertyPresenter.h"
#include "graph/InlineTitlePresenter.h"
#include "graph/CanvasMediaPresenter.h"
#include "graph/CardMediaLoader.h"
#include "graph/CanvasDropController.h"
#include "graph/NodeCreation.h"
#include "graph/CompatibleNodePicker.h"
#include "graph/CompatibleNodePlacement.h"
#include "graph/LineageLayer.h"
#include "graph/NodeFocus.h"
#include "properties/PropertyFields.h"
#include <QApplication>
#include <QClipboard>
#include <QCloseEvent>
#include <QDockWidget>
#include <QDebug>
#include <QDialog>
#include <QFile>
#include <QFileDialog>
#include <QDir>
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
#include "EntryMenu.h"
#include <QMenu>
#include <QMenuBar>
#include <QMessageBox>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QScopedValueRollback>
#include <QSaveFile>
#include <QSettings>
#include <QScreen>
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
#include <cmath>
#include <utility>
#include <QtNodes/NodeStyle>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
namespace nodetool {
namespace {
// The web node menu lists code snippets as virtual node types. Choosing one
// creates a Code node with the snippet's code (web/src/config/snippetMetadata.ts).
QHash<QString, QJsonObject> loadCodeSnippets() {
  QFile file(":/editor/code/snippets.json");
  if (!file.open(QIODevice::ReadOnly)) { return {}; }
  QHash<QString, QJsonObject> snippets;
  for (const auto &value : QJsonDocument::fromJson(file.readAll())["snippets"].toArray()) {
    const auto snippet = value.toObject();
    snippets.insert(snippet["node_type"].toString(), snippet);
  }
  return snippets;
}
// Snippets appear only when the catalog has the Code node they create.
QJsonArray withCodeSnippets(const QJsonArray &metadata, const QHash<QString, QJsonObject> &snippets) {
  QSet<QString> types;
  QJsonObject codeNode;
  for (const auto &entry : metadata) {
    const auto node = entry.toObject();
    types.insert(node["node_type"].toString());
    if (node["node_type"] == "nodetool.code.Code") { codeNode = node; }
  }
  if (codeNode.isEmpty()) { return metadata; }
  auto result = metadata;
  for (auto it = snippets.cbegin(); it != snippets.cend(); ++it) {
    if (types.contains(it.key())) { continue; }
    // Every create path reads this entry, so each one makes a Code node (createNativeNode).
    auto entry = it.value()["metadata"].toObject();
    entry["code_snippet"] = QJsonObject{{"code", it.value()["code"]}, {"title", it.value()["title"]},
                                        {"data", it.value()["data"]}, {"code_node", codeNode}};
    result.append(entry);
  }
  return result;
}
constexpr int narrowWindowWidth = 1000;
constexpr int compactToolbarWidth = 480;
// NodeSelectionToolbar.tsx TOOLBAR_SHOW_DELAY.
constexpr qint64 toolbarShowDelayMs = 200;
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
    installTabShortcuts();
    installApplicationMenu();
    // The shared Generations list asks the active tab, which holds the session.
    connect(&generations_, &node_editor::GenerationActivity::refreshRequested, this, [this] { activeEditor_->refreshGenerations(); });
    connect(&generations_, &node_editor::GenerationActivity::openSourceRequested, this, &EditorWindow::openWorkflow);
    connect(&generations_, &node_editor::GenerationActivity::openAsWorkflowRequested, this,
            [this](const QJsonObject &workflow) { activeEditor_->openWorkflowDocument(workflow); });
    connect(&generations_, &node_editor::GenerationActivity::errorOccurred, this, [this](const QString &message) { notify("error", message); });
    // Every tab's status bar counts the running generations.
    connect(&generations_, &node_editor::GenerationActivity::rowsChanged, this, [this] {
      for (auto *tab : tabs_) { tab->schedulePanelChanged(); }
    });
    installComfy();
    return;
  }
  setWindowTitle(tr("NodeTool Workflow[*]"));
  resize(1440, 900);
  node_editor::registerMediaTypes();
  node_editor::registerCodeHighlighter();
  connect(&document_, &node_editor::WorkflowDocument::replaced, this, [this] {
    // A loaded workflow has other nodes than the run in progress.
    trackLiveRun({});
    model_.resetOnNextProjection();
    documentReplaced_ = true;
    ++documentEpoch_;
    runTrace_.setWorkflow(document_.snapshot().value("id").toString(), document_.snapshot().value("name").toString());
    QTimer::singleShot(0, this, [this] { modelPicker_.fillWorkflowDefaults(&document_, metadata_); });
    if (!childSyncing_) {
        closeChildSurfaces();
    }
    invalidateGesture();
    guideStarted_ = false;
    guideDismissed_ = false;
    emit documentEpochChanged();
    QTimer::singleShot(0, this, &EditorWindow::refreshChildReferences);
  });
  installComfy();
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &setup_, &node_editor::SetupController::configure);
  // Every prediction a run on this socket reports reaches the shared Generations list.
  connect(&session_, &node_editor::WorkflowSession::predictionReceived, this, [this](const QJsonObject &message) {
    generationActivity()->ingestPrediction(message, QDateTime::currentMSecsSinceEpoch());
  });
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
    setup_.setInstallScope(tabOwner_ ? tabOwner_ : this);
    connect(&setup_, &node_editor::SetupController::runtimeOfferRequested, this, [this] {
        QTimer::singleShot(0, this, [this] { setupAction("runtime-offer"); });
    });
    connect(&setup_, &node_editor::SetupController::changed, this, [this] {
        refresh();
        setup_.offerWorkflow(document_.snapshot(), metadata_);
    });
  // Catalog state goes down to the interface, and its requests come back here.
  connect(this, &EditorWindow::catalogChanged, this, [this] { nodeCatalog_.setNodes(catalog()); });
  connect(this, &EditorWindow::catalogRecentChanged, this, [this] { nodeCatalog_.setRecent(catalogRecent()); });
  connect(this, &EditorWindow::catalogFavoritesChanged, this, [this] { nodeCatalog_.setFavorites(catalogFavorites()); });
  connect(this, &EditorWindow::panelChanged, this, [this] { nodeCatalog_.setReadOnly(readOnly()); });
  connect(&nodeCatalog_, &node_editor::NodeCatalog::addRequested, this, &EditorWindow::addNode);
  connect(&nodeCatalog_, &node_editor::NodeCatalog::dragRequested, this, &EditorWindow::dragNode);
  connect(&nodeCatalog_, &node_editor::NodeCatalog::toggleFavoriteRequested, this, &EditorWindow::toggleCatalogFavorite);
  connect(&nodeCatalog_, &node_editor::NodeCatalog::clearFavoritesRequested, this, &EditorWindow::clearCatalogFavorites);
  connect(&nodeCatalog_, &node_editor::NodeCatalog::clearRecentRequested, this, &EditorWindow::clearCatalogRecent);
  connect(&nodeCatalog_, &node_editor::NodeCatalog::closeMenuRequested, this, &EditorWindow::closeNodeMenu);
  connect(&nodeCatalog_, &node_editor::NodeCatalog::moveMenuRequested, this, &EditorWindow::moveNodeMenu);
  syncNodeCatalog();
  // The inspector's state goes down the same way.
  connect(this, &EditorWindow::panelChanged, this, &EditorWindow::syncNodeInspector);
  connect(this, &EditorWindow::shownQueueChanged, this, [this] { nodeInspector_.setRunning(shownRunActive()); });
  connect(this, &EditorWindow::costEstimateChanged, this, [this] { nodeInspector_.setCostEstimate(costEstimate()); });
  connect(this, &EditorWindow::documentEpochChanged, this, [this] { nodeInspector_.fields()->setDocumentEpoch(documentEpoch()); });
  connect(this, &EditorWindow::credentialsEpochChanged, this, [this] { nodeInspector_.fields()->setCredentialsEpoch(credentialsEpoch()); });
  connect(&nodeInspector_, &node_editor::NodeInspector::clearSelectionRequested, this, [this] { action("Clear selection"); });
  connect(&nodeInspector_, &node_editor::NodeInspector::focusNodeRequested, this, [this] { userAction("Focus node"); });
  // The node info panel: panelChanged covers document, title and run error changes.
  connect(this, &EditorWindow::panelChanged, this, &EditorWindow::syncNodeInfo);
  connect(this, &EditorWindow::documentEpochChanged, this, &EditorWindow::closeNodeInfo);
  connect(&nodeInfo_, &node_editor::NodeInfo::closeRequested, this, &EditorWindow::closeNodeInfo);
  connect(&nodeInfo_, &node_editor::NodeInfo::focusRequested, this, [this] { focusNode(nodeInfo_.nodeId()); });
  connect(&nodeInfo_, &node_editor::NodeInfo::namespaceRequested, this,
          [this](const QString &nodeNamespace) { openNodeMenuAt(nodeNamespace.split('.', Qt::SkipEmptyParts), {}); });
  connect(&nodeInfo_, &node_editor::NodeInfo::tagSearchRequested, this, [this](const QString &tag) { openNodeMenuAt({}, tag); });
  connect(&nodeInspector_, &node_editor::NodeInspector::runSelectedRequested, this, &EditorWindow::runSelectedNodes);
  connect(nodeInspector_.fields(), &node_editor::PropertyHost::commitRequested, this, &EditorWindow::commitProperty);
  connect(nodeInspector_.fields(), &node_editor::PropertyHost::removeRequested, this, &EditorWindow::removeProperty);
  connect(nodeInspector_.fields(), &node_editor::PropertyHost::reportRequested, this, [this](const QString &source, const QString &text) { reportBug({.source = source, .errorText = text}); });
  connect(nodeInspector_.history(), &node_editor::GenerationReplay::pinRequested, this, &EditorWindow::pinGeneration);
  connect(nodeInspector_.history(), &node_editor::GenerationReplay::toggleReplayRequested, this, &EditorWindow::toggleReplayGeneration);
  connect(nodeInspector_.history(), &node_editor::GenerationReplay::clearReplayRequested, this, &EditorWindow::clearReplayGenerations);
  nodeInspector_.setDynamicPorts(&dynamicPorts_);
  // The tab bar's state lives in the root window, which tells every tab.
  connect(this, &EditorWindow::tabsChanged, this, &EditorWindow::syncDocumentTabs);
  connect(this, &EditorWindow::notificationsChanged, this, &EditorWindow::syncNotifications);
  connect(&documentTabs_, &node_editor::DocumentTabs::newTabRequested, this, &EditorWindow::newTab);
  connect(&documentTabs_, &node_editor::DocumentTabs::activateTabRequested, this, &EditorWindow::activateTab);
  connect(&documentTabs_, &node_editor::DocumentTabs::closeTabRequested, this, &EditorWindow::closeTab);
  connect(&documentTabs_, &node_editor::DocumentTabs::dropTabRequested, this, &EditorWindow::dropTab);
  connect(&documentTabs_, &node_editor::DocumentTabs::renameTabRequested, this, &EditorWindow::renameTab);
  connect(&documentTabs_, &node_editor::DocumentTabs::tabMenuRequested, this, &EditorWindow::showTabMenu);
  connect(&documentTabs_, &node_editor::DocumentTabs::projectMenuRequested, this, &EditorWindow::showProjectMenu);
  connect(&documentTabs_, &node_editor::DocumentTabs::toolTipRequested, this, &EditorWindow::showTabToolTip);
  connect(&documentTabs_, &node_editor::DocumentTabs::stripScrolled, this, &EditorWindow::setTabStripOffset);
  connect(&documentTabs_, &node_editor::DocumentTabs::activateSurfaceRequested, this, &EditorWindow::activateSurface);
  connect(&documentTabs_, &node_editor::DocumentTabs::closeSurfaceRequested, this, &EditorWindow::closeSurface);
  connect(&documentTabs_, &node_editor::DocumentTabs::settingsRequested, this, &EditorWindow::openSettings);
  connect(&notificationList_, &node_editor::Notifications::openRequested, this, &EditorWindow::showNotifications);
  connect(&notificationList_, &node_editor::Notifications::copyRequested, this, &EditorWindow::copyText);
  connect(&notificationList_, &node_editor::Notifications::reportRequested, this, [this](const QString &text) {
    (activeEditor_ ? activeEditor_ : this)->reportBug({.source = QStringLiteral("Error notification"), .errorText = text});
  });
  syncDocumentTabs();
  syncNotifications();
  // The document bar and the rail read the state every panel change carries.
  connect(this, &EditorWindow::panelChanged, this, &EditorWindow::syncChrome);
  connect(&workflowHeader_, &node_editor::WorkflowHeader::renameRequested, this, &EditorWindow::renameWorkflow);
  connect(&workflowHeader_, &node_editor::WorkflowHeader::undoRequested, this, [this] { action("Undo"); });
  connect(&workflowHeader_, &node_editor::WorkflowHeader::redoRequested, this, [this] { action("Redo"); });
  connect(&workflowHeader_, &node_editor::WorkflowHeader::saveToServerRequested, this, [this] { action("Server Save"); });
  connect(&workflowHeader_, &node_editor::WorkflowHeader::serverSyncRequested, this, [this] { action("Server sync"); });
  connect(&workflowHeader_, &node_editor::WorkflowHeader::actionRequested, this, [this](const QString &name) {
    if (menuActionEnabled(name)) { userAction(name); }
  });
  connect(&workflowHeader_, &node_editor::WorkflowHeader::toolTipRequested, this, &EditorWindow::showToolTip);
  connect(&panelLayout_, &node_editor::PanelLayout::toggleBrowserRequested, this, [this] { action("Workflows"); });
  connect(&panelLayout_, &node_editor::PanelLayout::toggleChatRequested, this, &EditorWindow::toggleChat);
  connect(&panelLayout_, &node_editor::PanelLayout::toggleLibraryRequested, this, [this] { action("Library"); });
  connect(&panelLayout_, &node_editor::PanelLayout::toggleExamplesRequested, this, [this] { action("Examples"); });
  connect(&panelLayout_, &node_editor::PanelLayout::toggleCatalogRequested, this, [this] { action("Toggle nodes"); });
  connect(&panelLayout_, &node_editor::PanelLayout::toggleInspectorRequested, this, [this] { action("Toggle inspector"); });
  connect(&panelLayout_, &node_editor::PanelLayout::togglePanelRequested, this, [this] { action("Toggle panel"); });
  connect(&panelLayout_, &node_editor::PanelLayout::miniMapRequested, this, &EditorWindow::setMiniMapVisible);
  connect(&panelLayout_, &node_editor::PanelLayout::statusViewRequested, this, &EditorWindow::toggleStatusView);
  connect(&statusModel_, &node_editor::StatusModel::connectRequested, this, [this] { action("Connect"); });
  connect(&statusModel_, &node_editor::StatusModel::reconnectRequested, this, [this] { action("Reconnect"); });
  connect(&statusModel_, &node_editor::StatusModel::queueRequested, this, [this] { action("Queue"); });
  connect(&statusModel_, &node_editor::StatusModel::reportRequested, this, [this](const QString &source, const QString &text) { reportBug({.source = source, .errorText = text}); });
  connect(&statusModel_, &node_editor::StatusModel::toolTipRequested, this, &EditorWindow::showToolTip);
  connect(&editorCommands_, &node_editor::EditorCommands::commandRequested, this, [this](const QString &command) { action(command); });
  connect(&editorCommands_, &node_editor::EditorCommands::presentationRequested, this, &EditorWindow::presentation);
  connect(&selection_, &node_editor::Selection::nodeMenuRequested, this, &EditorWindow::showNodeMenu);
  connect(&runState_, &node_editor::RunState::authoredRequested, this, &EditorWindow::authoredAction);
  connect(&runState_, &node_editor::RunState::agentRequested, this, [this](const QString &runId) { askRunAgent(runId); });
  connect(&viewport_, &node_editor::Viewport::commandRequested, this, &EditorWindow::userAction);
  connect(&viewport_, &node_editor::Viewport::popupRequested, this, &EditorWindow::showMiniMapPopup);
  connect(&viewport_, &node_editor::Viewport::colorModeRequested, this, &EditorWindow::setMiniMapColorMode);
  connect(&viewport_, &node_editor::Viewport::closePopupRequested, this, &EditorWindow::closeMiniMapPopup);
  connect(&firstWorkflowGuide_, &node_editor::FirstWorkflowGuide::actionRequested, this, &EditorWindow::setupAction);
  connect(&nodeCatalog_, &node_editor::NodeCatalog::runtimesRequested, this, [this] { setupAction("dependencies"); });
  engine_ = new QQmlEngine(this);
  // Panels are QQuickWidgets sized to their strip, so an overlay tooltip clips there.
  // Ui.Tooltip hands its text to the window when the overlay cannot hold it.
  if (auto *tooltips = engine_->singletonInstance<QObject *>("NodeTool.UiPrimitives", "TooltipHost")) {
    tooltips->setProperty("routeToHost", true);
    const auto *meta = tooltips->metaObject();
    connect(tooltips, meta->method(meta->indexOfSignal("requested(QString)")), this,
            metaObject()->method(metaObject()->indexOfMethod("showToolTip(QString)")));
  }
  // The property editors, the inspector's history and the card editors reach
  // the resolver and the pickers through the property host.
  nodeInspector_.fields()->setServices({.media = &mediaResolver_,
                                        .modelPicker = &modelPicker_,
                                        .assetPicker = &assetPicker_,
                                        .resourcePicker = &resourcePicker_,
                                        .documentPicker = &documentPicker_});
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
    runtime_.reset();
    runOutput_.reset();
    if (serverSyncDialog_) { serverSyncDialog_->close(); }
    conflictPresented_ = false;
    if (lineage_) { lineage_->setSelectedLinkIds({}); }
    ++browserEpoch_;
    browserLoadingProjects_ = false;
    browser_.configure(origin, token, userId);
    previewAssets_.configure(origin, token, userId);
    library_.configure(origin, token, userId);
    exampleGallery_.configure(origin, token, userId);
    if (browserVisible() && !origin.isEmpty()) { loadBrowser(); }
    if (libraryVisible()) { library_.refresh(); }
    if (examplesVisible()) { exampleGallery_.refresh(); }
    if (scene_) { refresh(); }
  });
  connect(&previewAssets_, &node_editor::PreviewSourceAssets::changed, this, [this] { syncRuntimePreviews(); });
  connect(&browser_, &node_editor::WorkflowBrowser::changed, this, [this] {
    schedulePanelChanged();
    if (browserLoadingProjects_ && !browser_.projectsLoading()) {
      browserLoadingProjects_ = false;
      if (browser_.error().isEmpty()) { browser_.refresh(); browser_.loadTriggers(); }
    }
  });
  connect(&library_, &node_editor::LibraryBrowser::changed, this, &EditorWindow::schedulePanelChanged);
  connect(&browser_, &node_editor::WorkflowBrowser::created, this, &EditorWindow::openWorkflow);
  connect(&browser_, &node_editor::WorkflowBrowser::openRequested, this, &EditorWindow::openWorkflow);
  connect(&browser_, &node_editor::WorkflowBrowser::deleteRequested, this, &EditorWindow::deleteWorkflow);
  connect(&browser_, &node_editor::WorkflowBrowser::deleteSelectedRequested, this, &EditorWindow::deleteWorkflows);
  connect(&browser_, &node_editor::WorkflowBrowser::reloadRequested, this, [this] { action("Refresh workflows"); });
  connect(&browser_, &node_editor::WorkflowBrowser::renamed, this, [this](const QString &id) {
    if (id == document_.snapshot()["id"].toString() && document_.undoStack()->isClean()) { session_.openWorkflow(id); }
  });
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &mediaResolver_, &node_editor::MediaResolver::configure);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, &runTrace_, &node_editor::RunTraceController::configure);
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
  // After the lambda above, so the run output reads the run the runtime selected.
  shownRunOutput_ = &runOutput_;
  runState_.setOutputModels(runOutput_.collections(), runOutput_.richEntries());
  const auto syncRunOutput = [this] {
    if (shownRunOutput_ == &runOutput_) { runState_.setOutput(runOutput_.runs(), runOutput_.selectedRunId()); }
  };
  syncRunOutput();
  connect(&runOutput_, &node_editor::RunOutputModel::changed, this, syncRunOutput);
  connect(&runState_, &node_editor::RunState::selectRunRequested, this, [this](const QString &runId) { shownRunOutput_->selectRun(runId); });
  connect(&runState_, &node_editor::RunState::clearOutputRequested, this, [this] { shownRunOutput_->clear(); });
  connect(&runState_, &node_editor::RunState::cancelRequested, &session_, &node_editor::WorkflowSession::cancelJob);
  connect(&runState_, &node_editor::RunState::reportJobRequested, this, &EditorWindow::reportJob);
  connect(&runState_, &node_editor::RunState::openJobWorkflowRequested, this, &EditorWindow::openWorkflow);
  connect(&runState_, &node_editor::RunState::openJobOutputRequested, this, &EditorWindow::openJobOutput);
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
    showContextMenu("link", position, {}, id);
  });
    connect(scene_, &EditorScene::outputFormRequested, this, [this](const QString &id) {
        if (readOnly() || !selectNode(id)) { return; }
        // Frameless and transparent so only the QML overlay surface shows.
        auto *dialog = new QDialog(this, Qt::Popup | Qt::FramelessWindowHint);
        dialog->setObjectName("subgraph-output-form");
        dialog->setAttribute(Qt::WA_DeleteOnClose);
        dialog->setAttribute(Qt::WA_TranslucentBackground);
        auto *quick = new QQuickWidget(engine_, dialog);
        quick->setAttribute(Qt::WA_TranslucentBackground);
        quick->setClearColor(Qt::transparent);
        quick->setResizeMode(QQuickWidget::SizeRootObjectToView);
        // DynamicPorts.qml is also embedded in the Inspector, so the overlay
        // surface wraps it here instead of in its root.
        const QUrl surfaceUrl("qrc:/qt/qml/NodeTool/NodeEditor/DynamicPortsOverlay.qml");
        QQmlComponent surface(engine_);
        surface.setData(QByteArrayLiteral(
            "import QtQuick\n"
            "import NodeTool.UiPrimitives as Ui\n"
            "Rectangle {\n"
            "  id: root\n"
            "  required property var controller\n"
            "  property bool outputsOnly: false\n"
            "  color: Ui.Theme.surfaceOverlay\n"
            "  border.color: Ui.Theme.borderControl\n"
            "  border.width: Ui.Metrics.border\n"
            "  radius: Ui.Metrics.radiusOverlay\n"
            "  implicitWidth: ports.implicitWidth + Ui.Metrics.lg * 2\n"
            "  implicitHeight: ports.implicitHeight + Ui.Metrics.lg * 2\n"
            "  DynamicPorts { id: ports; anchors.fill: parent; anchors.margins: Ui.Metrics.lg; controller: root.controller; outputsOnly: root.outputsOnly }\n"
            "}\n"), surfaceUrl);
        auto *root = qobject_cast<QQuickItem *>(surface.createWithInitialProperties(
            {{"controller", QVariant::fromValue(&dynamicPorts_)}, {"outputsOnly", true}}, engine_->rootContext()));
        if (!root) { qWarning() << surface.errorString(); dialog->deleteLater(); return; }
        quick->setContent(surfaceUrl, &surface, root);
        auto *layout = new QVBoxLayout(dialog);
        layout->setContentsMargins(0, 0, 0, 0);
        layout->addWidget(quick);
        dialog->resize(350, 400);
        dialog->move(QCursor::pos());
        connect(this, &EditorWindow::documentEpochChanged, dialog, &QDialog::close);
        connect(this, &EditorWindow::credentialsEpochChanged, dialog, &QDialog::close);
        dialog->show();
    });
    connect(scene_, &EditorScene::dynamicPortFormRequested, this, &EditorWindow::showDynamicPortDialog);
    connect(scene_, &EditorScene::dynamicTypeMenuRequested, this, &EditorWindow::showDynamicTypeMenu);
    connect(scene_, &EditorScene::headerActionRequested, this, [this](const QString &id, const QString &action) {
        if (action == QStringLiteral("loadComfyWorkflow")) { showComfyWorkflowDialog(id); }
        if (action == QStringLiteral("compositorLayout")) { showCompositorLayoutDialog(id); }
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
    showContextMenu("edge", screenPosition, {}, id, position);
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
  inlinePresenter_ = new InlinePropertyPresenter(model_, *scene_, *view_, engine_, *nodeInspector_.fields(), this);
  inlinePresenter_->commitProperty = [this](const QString &id, const QString &name, const QVariant &value) {
    return commitProperty(id, name, value);
  };
  inlinePresenter_->commitCommand = [this](const QJsonObject &command) { return apply(command); };
  connect(this, &EditorWindow::zoomChanged, inlinePresenter_, &InlinePropertyPresenter::reposition);
  // Constant String's Open editor stands in for the web's text editor modal.
  connect(scene_, &EditorScene::inlineExpandRequested, this, [this](QtNodes::NodeId id, const QString &name) {
    inlinePresenter_->activate(id, name);
    if (inlinePresenter_->active() && !inlinePresenter_->expanded()) { inlinePresenter_->expand(); }
  });
  connect(scene_, &EditorScene::documentOpenRequested, this, [this](const QString &kind, const QString &id) { documentPicker_.open(kind, id); });
  // The web opens provider onboarding at the key. Native opens the server's provider settings.
  connect(scene_, &EditorScene::providerConnectRequested, this, [this] { packSetup()->openProviderSettings(); });
  // The scene selects the card before it asks, so Run selected runs that node.
  connect(scene_, &EditorScene::nodeRunRequested, this, [this](const QString &) { action(QStringLiteral("Run selected")); });
  connect(scene_, &EditorScene::errorReportRequested, this, [this](const QString &resource) {
    node_editor::BugReportContext context{.source = QStringLiteral("Node error")};
    for (const auto id : model_.allNodeIds()) {
      if (model_.resourceId(id) != resource) { continue; }
      context.nodeType = model_.nodeSnapshot(id)["type"].toString();
      context.nodeTitle = model_.nodeData(id, QtNodes::NodeRole::Caption).toString();
      context.errorText = model_.runtimeState(id)["error"].toString();
    }
    reportBug(context);
  });
  connect(inlinePresenter_, &InlinePropertyPresenter::popupChanged, this, &EditorWindow::positionSelectionToolbar);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, inlinePresenter_, &InlinePropertyPresenter::cancel);
  connect(this, &EditorWindow::documentEpochChanged, inlinePresenter_, &InlinePropertyPresenter::cancel);
  inlineTitle_ = new InlineTitlePresenter(model_, *scene_, *view_, engine_, this);
  inlineTitle_->availableViewport = [this] {
    auto area = unobstructedViewport();
    // A tall note editor stays clear of a toolbar floating over its card.
    if (selectionOverlay_ && selectionOverlay_->isVisible() && selectionToolbarFloating_) {
      area.setTop(std::max(area.top(), selectionOverlay_->geometry().bottom() + 8.0));
    }
    return area;
  };
  inlineTitle_->commitTitle = [this](const QString &id, const QString &text) {
    if (!document_.node(id)["type"].toString().endsWith(".Comment")) {
      return apply({{"op", "renameNode"}, {"id", id}, {"title", text}});
    }
    // handleScaleToFit in CommentNode.tsx: a changed comment grows or shrinks
    // its card to the text, and text and size share one undo step.
    QJsonArray commands{QJsonObject{{"op", "setComment"}, {"id", id}, {"value", text}}};
    for (const auto graphId : model_.allNodeIds()) {
      if (model_.resourceId(graphId) != id) { continue; }
      auto ui = model_.uiProperties(graphId);
      const auto size = model_.layout(graphId).size;
      const auto height = std::max<double>(commentMinimumHeight, std::ceil(scene_->commentContentHeight(text, size.width())));
      if (height != size.height()) {
        ui["height"] = height;
        commands.append(QJsonObject{{"op", "setNodeField"}, {"id", id}, {"field", "ui_properties"}, {"value", ui}});
      }
      break;
    }
    return apply({{"op", "batch"}, {"commands", commands}});
  };
  connect(this, &EditorWindow::zoomChanged, inlineTitle_, &InlineTitlePresenter::reposition);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, inlineTitle_, &InlineTitlePresenter::cancel);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, inlineTitle_, &InlineTitlePresenter::clearControls);
  connect(this, &EditorWindow::documentEpochChanged, inlineTitle_, &InlineTitlePresenter::cancel);
  connect(inlineTitle_, &InlineTitlePresenter::activated, inlinePresenter_, &InlinePropertyPresenter::cancel);
  connect(scene_, &EditorScene::inlineEditRequested, inlineTitle_, &InlineTitlePresenter::cancel);
  canvasMedia_ = new CanvasMediaPresenter(model_, *scene_, *view_, engine_, mediaResolver_, this);
  cardMediaLoader_ = new CardMediaLoader(model_, mediaResolver_, this);
  connect(this, &EditorWindow::zoomChanged, canvasMedia_, &CanvasMediaPresenter::refresh);
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, canvasMedia_, &CanvasMediaPresenter::clear);
  compatiblePicker_ = new CompatibleNodePicker(model_, *scene_, *view_, engine_, this);
  compatiblePicker_->applyCommand = [this](const QJsonObject &command) { return apply(command); };
  compatiblePicker_->recentTypes = [this] { return catalogRecent(); };
  connect(compatiblePicker_, &CompatibleNodePicker::nodeCreated, this, [this](const QString &id) {
    const auto documentEpoch = documentEpoch_, credentialsEpoch = credentialsEpoch_;
    QTimer::singleShot(0, this, [this, id, documentEpoch, credentialsEpoch] {
      if (documentEpoch == documentEpoch_ && credentialsEpoch == credentialsEpoch_ && !document_.node(id).isEmpty()) selectNode(id);
    });
  });
  // The AI rows: the chat opens with a draft that names the new Code node.
  connect(compatiblePicker_, &CompatibleNodePicker::codeRequested, this, [this](const QString &, const QString &draft) { askAgent(draft); });
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, compatiblePicker_, &CompatibleNodePicker::cancel);
  connect(this, &EditorWindow::documentEpochChanged, compatiblePicker_, &CompatibleNodePicker::cancel);
  canvasDrops_ = new CanvasDropController(model_, *view_, this);
  connect(canvasDrops_, &CanvasDropController::copyRequested, this, [this](const QString &node, const QString &property) {
    if (cardMediaLoader_) { cardMediaLoader_->copy(node, property); }
  });
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
  connect(canvasDrops_, &CanvasDropController::workflowFileDropped, this, [this](const QString &path) {
    // Opening a tab replaces surfaces, so it waits until the drop event returns.
    QTimer::singleShot(0, this, [this, path] { openFileInTab(path); });
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
    if (!apply(c)) { return false; }
    previewCardEdit(c["op"] == "batch" ? c["commands"].toArray() : QJsonArray{c});
    return true;
  };
  connect(scene_, &EditorScene::sliderDraftChanged, this, [this](QtNodes::NodeId id, const QString &name, double value) {
    // A card control such as the Painter's brush size is no property to rerun with.
    if (readOnly() || !model_.nodeExists(id) || isCardControl(name)) { return; }
    sendLiveDraft(model_.resourceId(id), name, value);
    scheduleInstantRerun(model_.resourceId(id), {{"name", name}, {"value", value}}, true, true);
  });
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
    // The web document bar sits above the subgraph strip and the canvas.
    // See web/src/components/workspace/WorkflowDocumentBar.tsx.
    // The panel's first bindings read the state the window has at this point.
    syncChrome();
    auto headerRow = panel("HeaderRow", {{"header", QVariant::fromValue(&workflowHeader_)},
                                         {"panels", QVariant::fromValue(&panelLayout_)}});
    headerRow->setFixedHeight(qCeil(headerRow->rootObject()->implicitHeight()));
    canvasLayout->addWidget(headerRow);
    auto canvasTabs = panel("CanvasTabStrip", {{"tabs", QVariant::fromValue(&documentTabs_)}});
    const auto resizeCanvasTabs = [canvasTabs] {
        canvasTabs->setFixedHeight(qCeil(canvasTabs->rootObject()->implicitHeight()));
    };
    connect(canvasTabs->rootObject(), &QQuickItem::implicitHeightChanged, canvasTabs, resizeCanvasTabs);
    resizeCanvasTabs();
    canvasLayout->addWidget(canvasTabs);
    canvasLayout->addWidget(view_, 1);
    dockHost_->setCentralWidget(canvasColumn);
    canvasColumn->installEventFilter(this);
  dockHost_->setDockOptions(QMainWindow::AnimatedDocks);
  const auto dock = [this](const QString &title, const QString &file, Qt::DockWidgetArea area,
                            const QVariantMap &properties = {}) {
    auto widget = new QDockWidget(title, dockHost_);
    widget->setFeatures(QDockWidget::NoDockWidgetFeatures);
    widget->setTitleBarWidget(new QWidget(widget));
    widget->setWidget(panel(file, properties));
    dockHost_->addDockWidget(area, widget);
    return widget;
  };
  // The web node library is a fixed panel over the canvas, so opening it keeps
  // the canvas size and zoom (web/src/components/panels/PanelLeft.tsx).
  // The library and the node menu take the catalog interface, not the window.
  const QVariantMap catalogProperties{{"catalog", QVariant::fromValue(&nodeCatalog_)},
                                      {"packSetup", QVariant::fromValue(packSetup())}};
  catalogPanel_ = panel("Catalog", catalogProperties);
  catalogPanel_->setParent(dockHost_);
  catalogPanel_->setObjectName("catalog-panel");
  catalogPanel_->setFocusPolicy(Qt::StrongFocus);
  catalogPanel_->installEventFilter(this);
  nodeMenu_ = panel("NodeMenu", catalogProperties);
  nodeMenu_->setParent(dockHost_);
  nodeMenu_->setObjectName("node-menu");
  nodeMenu_->setFocusPolicy(Qt::StrongFocus);
  nodeMenu_->setAttribute(Qt::WA_AlwaysStackOnTop);
  nodeMenu_->setClearColor(Qt::transparent);
  nodeMenu_->installEventFilter(this);
  nodeMenu_->hide();
  const QVariantMap chromeProperties{{"panels", QVariant::fromValue(&panelLayout_)},
                                     {"status", QVariant::fromValue(&statusModel_)}};
  auto browserProperties = chromeProperties;
  browserProperties.insert("browser", QVariant::fromValue(&browser_));
  browserDock_ = dock(tr("Workflows"), "WorkflowBrowser", Qt::LeftDockWidgetArea, browserProperties);
  browserDock_->setObjectName("workflow-browser-dock");
  browserDock_->hide();
  auto libraryProperties = chromeProperties;
  libraryProperties.insert("library", QVariant::fromValue(&library_));
  libraryProperties.insert("assets", QVariant::fromValue<QObject *>(&assetPicker_));
  libraryDock_ = dock(tr("Library"), "LibraryPanel", Qt::LeftDockWidgetArea, libraryProperties);
  libraryDock_->setObjectName("library-dock");
  libraryDock_->hide();
  // The rail's Examples view: the server's workflow examples and the bundled ones.
  exampleGallery_.setBundled(bundledExamples());
  examplesDock_ = dock(tr("Examples"), "ExamplesPanel", Qt::LeftDockWidgetArea,
                       {{"gallery", QVariant::fromValue(&exampleGallery_)},
                        {"resolver", QVariant::fromValue<QObject *>(&mediaResolver_)}});
  examplesDock_->setObjectName("examples-dock");
  examplesDock_->hide();
  // The web leaves the panel to the opened document (showTab in useExampleGroups.ts).
  const auto leavePanel = [this] {
    if (examplesVisible()) { toggleExamples(); }
  };
  connect(&exampleGallery_, &node_editor::ExampleGallery::bundledRequested, this, [this, leavePanel](const QString &resource) {
    leavePanel();
    openExample(resource);
  });
  connect(&exampleGallery_, &node_editor::ExampleGallery::workflowCopied, this, [this, leavePanel](const QString &id, const QString &name) {
    leavePanel();
    openWorkflow(id);
    // handleExampleClick in web/src/hooks/useWorkflowActions.ts says the tab holds a copy.
    notify("info", tr("This is your own copy of \"%1\". Changes you save stay in your copy, and the example stays as it was.").arg(name));
  });
  connect(&exampleGallery_, &node_editor::ExampleGallery::copyFailed, this, [this](const QString &message) { notify("error", message); });
  connect(&exampleGallery_, &node_editor::ExampleGallery::connectRequested, this, [this] { action("Connect"); });
  connect(&exampleGallery_, &node_editor::ExampleGallery::closeRequested, this, &EditorWindow::toggleExamples);
  // The panel's first bindings read the state the window has at this point.
  nodeInspector_.setRunning(shownRunActive());
  nodeInspector_.setCostEstimate(costEstimate());
  nodeInspector_.fields()->setDocumentEpoch(documentEpoch());
  nodeInspector_.fields()->setCredentialsEpoch(credentialsEpoch());
  syncNodeInspector();
  inspectorDock_ = dock(tr("Inspector"), "Inspector", Qt::RightDockWidgetArea,
                        {{"inspector", QVariant::fromValue(&nodeInspector_)}});
  outputDock_ = dock(tr("Output"), "RunOutput", Qt::BottomDockWidgetArea,
                     {{"panels", QVariant::fromValue(&panelLayout_)},
                      {"status", QVariant::fromValue(&statusModel_)},
                      {"runs", QVariant::fromValue(&runState_)},
                      {"resolver", QVariant::fromValue<QObject *>(&mediaResolver_)}});
  {
    // placeStatusBar() moves the status bar above the output while the panel is open.
    auto *body = new QWidget(outputDock_);
    auto *bodyLayout = new QVBoxLayout(body);
    bodyLayout->setContentsMargins(0, 0, 0, 0);
    bodyLayout->setSpacing(0);
    bodyLayout->addWidget(outputDock_->widget(), 1);
    outputDock_->setWidget(body);
  }
  outputDock_->setObjectName("run-output-dock");
  outputDock_->setAllowedAreas(Qt::BottomDockWidgetArea);
  outputDock_->hide();
  inspectorDock_->hide();
  // The web opens with its side panels closed. See web/src/stores/PanelStore.ts.
  catalogPanel_->hide();
  syncChrome();
  auto rail = panel("Rail", {{"panels", QVariant::fromValue(&panelLayout_)}});
  rail->setFixedWidth(rail->initialSize().width());
  auto tabs = panel("TabBar", {{"tabs", QVariant::fromValue(&documentTabs_)},
                               {"notifications", QVariant::fromValue(&notificationList_)}});
    const auto resizeTabs = [tabs] {
        if (tabs->rootObject()) {
            tabs->setFixedHeight(tabs->rootObject()->implicitHeight());
        }
    };
    connect(tabs->rootObject(), &QQuickItem::implicitHeightChanged, tabs, resizeTabs);
    resizeTabs();
  syncChrome();
  auto status = panel("StatusBar", {{"status", QVariant::fromValue(&statusModel_)},
                                    {"panels", QVariant::fromValue(&panelLayout_)}});
  status->setFixedHeight(status->initialSize().height());
  statusBar_ = status;
  // native-rules #2: naked new with no QObject parent, a later addLayout call takes ownership
  auto column = new QVBoxLayout;
  statusColumn_ = column;
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
  initializePanels();
  const auto overlay = [this](const QString &file, const QVariantMap &properties = {}) {
    auto widget = panel(file, properties);
    widget->setParent(view_);
    widget->setAttribute(Qt::WA_AlwaysStackOnTop);
    widget->setClearColor(Qt::transparent);
    widget->setResizeMode(QQuickWidget::SizeViewToRootObject);
    connect(widget, &QQuickWidget::sceneGraphError, this, [](auto, const QString &message) { qWarning() << message; });
    return widget;
  };
  // The overlays' first bindings read the state the window has at this point.
  syncChrome();
  syncRuns();
  toolbarOverlay_ = overlay("Toolbar", {{"commands", QVariant::fromValue(&editorCommands_)},
                                        {"runs", QVariant::fromValue(&runState_)}});
    initializeChat();
  queueOverlay_ = overlay("QueueOverlay", {{"runs", QVariant::fromValue(&runState_)},
                                          {"resolver", QVariant::fromValue<QObject *>(&mediaResolver_)}});
  queueOverlay_->setParent(centralWidget());
  queueOverlay_->setResizeMode(QQuickWidget::SizeRootObjectToView);
  connect(queueOverlay_->rootObject(), SIGNAL(expandedChanged()), this, SLOT(layoutOverlays()));
  // The status bar Queue tab shows whether the queue lists its jobs.
  connect(queueOverlay_->rootObject(), SIGNAL(showListChanged()), this, SLOT(schedulePanelChanged()));
  connect(queueOverlay_->rootObject(), SIGNAL(presentedChanged()), this, SLOT(layoutOverlays()));
  connect(queueOverlay_->rootObject(), SIGNAL(contentHeightChanged()), this, SLOT(layoutOverlays()));
  connect(&session_, &node_editor::WorkflowSession::stateChanged, this, [this] { layoutOverlays(); });
  shownQueueTimer_ = new QTimer(this);
  shownQueueTimer_->setSingleShot(true);
  shownQueueTimer_->setInterval(shownQueueDelayMs);
  connect(shownQueueTimer_, &QTimer::timeout, this, [this] { updateShownQueue(true); });
  connect(&session_, &node_editor::WorkflowSession::stateChanged, this, [this] { updateShownQueue(false); });
  connect(this, &EditorWindow::shownQueueChanged, this, &EditorWindow::syncRuns);
  connect(&session_, &node_editor::WorkflowSession::stateChanged, this, &EditorWindow::syncRuns);
  connect(&session_, &node_editor::WorkflowSession::workflowChanged, this, &EditorWindow::syncRuns);
  connect(this, &EditorWindow::shownQueueChanged, this, &EditorWindow::layoutOverlays, Qt::QueuedConnection);
  connect(&session_, &node_editor::WorkflowSession::systemStatsChanged, this, &EditorWindow::schedulePanelChanged);
  selectionOverlay_ = overlay("SelectionToolbar", {{"commands", QVariant::fromValue(&editorCommands_)},
                                                  {"selection", QVariant::fromValue(&selection_)}});
  syncViewport();
  connect(this, &EditorWindow::zoomChanged, this, &EditorWindow::syncViewport);
  connect(this, &EditorWindow::panelChanged, this, &EditorWindow::syncViewport);
  viewportOverlay_ = overlay("ViewportIndicator", {{"viewport", QVariant::fromValue(&viewport_)}});
  miniMapControls_ = overlay("MiniMapControls", {{"viewport", QVariant::fromValue(&viewport_)}});
  // The legend button joins the row in type mode, so the row keeps its right edge on the mini-map's.
  if (auto *controls = miniMapControls_->rootObject()) {
    connect(controls, SIGNAL(implicitWidthChanged()), this, SLOT(layoutOverlays()));
  }
  syncChrome();
  setupGuide_ = overlay("SetupGuide", {{"guide", QVariant::fromValue(&firstWorkflowGuide_)}});
  setupGuide_->show();
  // native-rules #2: naked new, parent (the view) is set inside the MiniMap constructor, not documented here
  auto miniMap = new MiniMap(model_, *scene_, *view_);
  miniMap->navigated = [this] { fitActive_ = false; cancelViewAnimation(); };
  miniMap->colorByType = [this] { return miniMapColorMode_ == "type"; };
  miniMap->zoomed = [this] { emit zoomChanged(); };
  connect(this, &EditorWindow::zoomChanged, miniMap, [miniMap] { miniMap->update(); });
  // The web hides the mini-map until the user turns it on and remembers the choice.
  miniMapVisible_ = QSettings().value("minimap/visible", false).toBool();
  miniMapColorMode_ = QSettings().value("minimap/colorMode", "default").toString() == "type" ? "type" : "default";
  miniMap->show();
  toolbarOverlay_->show();
  viewportOverlay_->show();
  layoutOverlays();
  // The card toolbar follows its card through pan, zoom, resize, move and drag.
  const auto followCard = [this] { positionSelectionToolbar(); };
  connect(view_->horizontalScrollBar(), &QScrollBar::valueChanged, this, followCard);
  connect(view_->verticalScrollBar(), &QScrollBar::valueChanged, this, followCard);
  connect(this, &EditorWindow::zoomChanged, this, followCard);
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, followCard);
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, followCard);
  connect(scene_, &EditorScene::nodeDragChanged, this, followCard);
  // The node info panel follows its node the same way.
  nodeInfoOverlay_ = overlay("NodeInfoPanel", {{"info", QVariant::fromValue(&nodeInfo_)}});
  nodeInfoOverlay_->setObjectName("node-info-overlay");
  nodeInfoOverlay_->hide();
  const auto followInfo = [this] { positionNodeInfo(); };
  connect(view_->horizontalScrollBar(), &QScrollBar::valueChanged, this, followInfo);
  connect(view_->verticalScrollBar(), &QScrollBar::valueChanged, this, followInfo);
  connect(this, &EditorWindow::zoomChanged, this, followInfo);
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, followInfo);
  connect(&model_, &WorkflowGraphModel::runtimeChanged, this, &EditorWindow::syncNodeInfo);
  connect(inspectorDock_, &QDockWidget::visibilityChanged, this, [this] { schedulePanelChanged(); });
  connect(outputDock_, &QDockWidget::visibilityChanged, this,
          [this] { placeStatusBar(); schedulePanelChanged(); });
  connect(scene_, &QtNodes::BasicGraphicsScene::nodeDoubleClicked, this, [this](QtNodes::NodeId id) {
    if (node_editor::isChildNode(document_.node(model_.resourceId(id)))) { selected_ = model_.resourceId(id); openChild(); }
  });
  connect(scene_, &EditorScene::headerDoubleClicked, this, [this](QtNodes::NodeId id) {
    if (readOnly()) { return; }
    // A Code node's header title is editable, so a double-click renames it.
    if (model_.nodeSnapshot(id)["type"].toString() == "nodetool.code.Code") { inlineTitle_->activate(id); }
    else { action("Toggle collapse"); }
  });
  connect(scene_, &EditorScene::paneDoubleClicked, this, [this](const QPointF &position) {
    if (readOnly()) { return; }
    armCatalogPlacement(position);
    action("Add node");
  });
  connect(this, &EditorWindow::documentEpochChanged, this, [this] { cancelCatalogPlacement(); });
  connect(scene_, &EditorScene::connectionRefused, this, [this] {
    message_ = tr("Cannot connect these handles");
    schedulePanelChanged();
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
    // The document bar's Undo and Redo follow the history.
    connect(document_.undoStack(), &QUndoStack::canUndoChanged, this, &EditorWindow::schedulePanelChanged);
    connect(document_.undoStack(), &QUndoStack::canRedoChanged, this, &EditorWindow::schedulePanelChanged);
    session_.setSnapshotProvider([this] { return document_.snapshot(); });
    // A merged server change is one undoable edit, so Undo returns to the local draft.
    session_.setGraphApplier([this](const QJsonObject &graph) {
        return document_.applyCommand({{"op", "replaceGraph"}, {"graph", graph}}, tr("Merge server changes")).ok;
    });
    connect(&document_, &node_editor::WorkflowDocument::changed, this, [this] {
        sendLiveEdits();
        // GenerationHistory copies the document on the next inspector sync.
        historyWorkflowStale_ = true;
        const bool replaced = std::exchange(documentReplaced_, false);
        if (!syncingSession_) {
            if (replaced) {
                session_.setSnapshot(document_.snapshot());
            } else {
                session_.documentChanged();
            }
        }
        requestRefresh();
        if (replaced && !syncingSession_) {
            ensureProjected();
        }
        // Title targets must stop accepting stale commits before projection.
        inlineTitle_->validateDocument(document_);
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
            const auto workflow = session_.workflow();
            if (workflow.isEmpty()) {
                return;
            }
            const QScopedValueRollback syncing(syncingSession_, true);
            if (workflow["graph"] == document_.snapshot()["graph"]) {
                document_.reconcileMetadata(workflow);
                return;
            }
            auto result = document_.load(workflow);
            if (!result) {
                message_ = result.error;
            }
            refresh();
          });
  connect(&session_, &node_editor::WorkflowSession::workflowOpened, this,
          [this] {
            const QScopedValueRollback syncing(syncingSession_, true);
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
              scheduleViewportSettle(true);
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
            // A preview run is silent, as on the web. Only its error shows.
            if (submittingPreview_) {
              previewRuns_.insert(id);
            } else {
              message_ = session_.runsInProcess(id) ? tr("Run starting (local)") : tr("Run starting");
            }
            schedulePanelChanged();
            runtime_.beginRun(id);
            runOutput_.beginRun(id);
            trackLiveRun(id);
          });
  connect(&session_, &node_editor::WorkflowSession::runEvent, this,
          [this](const QString &id, const QJsonObject &event) {
            ensureProjected();
            const auto detail = event["error_detail"].toObject();
            if (detail["missing_runtime"].isObject()) {
                setup_.missingRuntime(detail["missing_runtime"].toObject());
            }
            runtime_.ingest(id, event);
            runOutput_.ingest(id, event);
            const auto status = event["status"].toString();
            const bool terminal = event["type"] == "job_update" &&
                (status == "completed" || status == "finished" || status == "failed" || status == "cancelled");
            const bool silent = previewRuns_.contains(id) && event["error"].toString().isEmpty() && status != "failed";
            if (terminal) { previewRuns_.remove(id); }
            if (terminal && id == liveRun_) { trackLiveRun({}); }
            if (id == run_ && status == "running" && !silent) {
                message_ = session_.runsInProcess(id) ? tr("Run running (local)") : tr("Run running");
                schedulePanelChanged();
            }
            if (id == run_ && terminal) {
              if (!silent) {
                message_ = event["error"].toString().isEmpty() ? tr("Run %1").arg(status) : event["error"].toString();
                if (session_.runsInProcess(id)) { message_ += tr(" (local)"); }
                const auto plan = session_.lastPartialPlan();
                if (!plan.stale.isEmpty()) { message_ += tr(" · Reusing generations from edited nodes: %1").arg(plan.stale.join(", ")); }
              }
              schedulePanelChanged();
              if (instantPending_) {
                  const auto edit = *std::exchange(instantPending_, std::nullopt);
                  const auto generation = instantUpdateGeneration_;
                  QTimer::singleShot(0, this, [this, edit, generation] {
                      if (generation == instantUpdateGeneration_ && !runActive()
                          && (session_.localRunnerReady() || (!edit.localOnly && session_.connected()))) {
                          instantRerun(edit);
                      }
                  });
              } else if (scrubbing_ && scene_->sliderDraftNode() == QtNodes::InvalidNodeId) {
                  setScrubbing(false);
              }
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
            runtime_.setConnected(session_.connected() || session_.runsInProcess(run_));
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
    // Popups retain callbacks into their Quick children and the inspector.
    // Cancel every generation before panels or scene selection are destroyed.
    clearDynamicPortDialogs();
    // Docks die in ~QWidget after this class is gone, so their visibility and
    // destroyed signals must not reach its slots.
    for (auto *dock : findChildren<QDockWidget *>()) {
        dock->disconnect(this);
    }
    disconnect(this, &EditorWindow::panelChanged, this, &EditorWindow::syncChatContext);
    disconnect(this, &EditorWindow::tabsChanged, this, &EditorWindow::syncChatContext);
  if (!tabOwner_) {
    for (const auto &host : retainedChatHosts_) {
        // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
        delete host.data();
    }
    retainedChatHosts_.clear();
    const auto tabs = tabs_;
    // Owner panels forward to the active tab and must die before the tabs do.
    for (auto panel : findChildren<QQuickWidget *>()) {
      const auto inTab = std::any_of(tabs.cbegin(), tabs.cend(), [panel](EditorWindow *tab) { return tab->isAncestorOf(panel); });
      if (!inTab) {
        // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
        delete panel;
      }
    }
    tabs_.clear();
    // Children forward to their parent surface and open after it, so they go first.
    for (auto it = tabs.crbegin(); it != tabs.crend(); ++it) {
      // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
      delete *it;
    }
    return;
  }
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete canvasDropDialog_.data();
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete canvasDrops_;
  canvasDrops_ = nullptr;
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete compatiblePicker_;
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete serverSyncDialog_.data();
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete lineage_;
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete canvasMedia_;
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete cardMediaLoader_;
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete inlineTitle_;
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete inlinePresenter_;
  // Dock animations can resize the viewport while bound overlays are destroyed.
  view_->removeEventFilter(this);
  view_->viewport()->removeEventFilter(this);
  // ~QWidget sends the panels a Hide event, which must not reach eventFilter
  // once their QQuickWidget part is gone.
  if (catalogPanel_) { catalogPanel_->removeEventFilter(this); }
  if (nodeMenu_) { nodeMenu_->removeEventFilter(this); }
  // Panels bind to members of this class and must die before those members.
  for (auto panel : findChildren<QQuickWidget *>()) {
    // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
    delete panel;
  }
  view_->setScene(nullptr);
  // native-rules #2: naked delete of a member that also has a Qt parent, order managed by hand
  delete scene_;
}
QQuickWidget *EditorWindow::panel(const QString &file, const QVariantMap &properties) {
  // One engine keeps a single Theme singleton across every panel.
  auto w = new QQuickWidget(engine_, this);
  w->setResizeMode(QQuickWidget::SizeRootObjectToView);
    if (file == "Inspector") {
        w->setAcceptDrops(true);
    }
    if (!properties.isEmpty()) {
        w->setInitialProperties(properties);
    }
  w->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/" + file + ".qml"));
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
namespace {
// DESIGN.md dialogs: a frameless, transparent overlay that stays inside the
// editor window, so only the QML overlay surface shows. Focus returns to the
// widget that had it when the dialog opened. Escape closes through QDialog.
QQuickWidget *createOverlayDialog(QDialog *dialog, QQmlEngine *engine, const QVariantMap &properties, const QUrl &source) {
  dialog->setWindowFlags(Qt::Dialog | Qt::FramelessWindowHint);
  dialog->setAttribute(Qt::WA_DeleteOnClose);
  dialog->setAttribute(Qt::WA_TranslucentBackground);
  const QPointer<QWidget> trigger(QApplication::focusWidget());
  QObject::connect(dialog, &QDialog::finished, dialog, [trigger] {
    if (trigger) { trigger->setFocus(Qt::OtherFocusReason); }
  });
  auto *content = new QQuickWidget(engine, dialog);
  content->setAttribute(Qt::WA_TranslucentBackground);
  content->setClearColor(Qt::transparent);
  content->setResizeMode(QQuickWidget::SizeRootObjectToView);
  content->setInitialProperties(properties);
  content->setSource(source);
  auto *layout = new QVBoxLayout(dialog);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->addWidget(content);
  return content;
}
void showOverlayDialog(QDialog *dialog, QQuickWidget *content, QWidget *window, QSize size) {
  dialog->resize(size.boundedTo(window->size()));
  dialog->move(window->mapToGlobal(window->rect().center()) - QPoint(dialog->width() / 2, dialog->height() / 2));
  dialog->show();
  content->setFocus(Qt::OtherFocusReason);
}
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
    content->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/VersionHistoryPanel.qml"));
    // The dock never narrows below the width where every control keeps its label on one line.
    // The panel's minimum follows the UI scale and the panel reports each change, so the dock follows it.
    content->setMinimumWidth(qCeil(content->rootObject()->property("minimumWidth").toReal()));
    connect(&versions_, &node_editor::WorkflowVersions::panelMinimumWidthChanged, content, [content](qreal width) {
        content->setMinimumWidth(qCeil(width));
    });
    dock->setWidget(content);
    connect(content->rootObject(), SIGNAL(closeRequested()), dock, SLOT(close()));
    dockHost_->addDockWidget(Qt::BottomDockWidgetArea, dock);
    dockHost_->resizeDocks({dock}, {height() / 2}, Qt::Vertical);
    connect(this, &EditorWindow::documentEpochChanged, dock, &QDockWidget::close);
    connect(this, &EditorWindow::credentialsEpochChanged, dock, &QDockWidget::close);
    // The status bar Versions tab shows whether the panel is open.
    connect(dock, &QDockWidget::visibilityChanged, this, &EditorWindow::schedulePanelChanged);
    connect(dock, &QObject::destroyed, this, &EditorWindow::schedulePanelChanged);
    versions_.load(kind); dock->show(); return;
  }
  for (auto *existing : findChildren<QDialog *>("workflow-details-dialog")) { existing->close(); }
  auto *dialog = new QDialog(this);
  dialog->setObjectName("workflow-details-dialog");
  auto *content = createOverlayDialog(dialog, engine_, {{"controller", QVariant::fromValue(&versions_)}, {"kind", kind}},
                                      QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkflowDetails.qml"));
  connect(this, &EditorWindow::documentEpochChanged, dialog, &QDialog::close);
  connect(this, &EditorWindow::credentialsEpochChanged, dialog, &QDialog::close);
  showOverlayDialog(dialog, content, this, {640, 680});
  versions_.load(kind);
}
void EditorWindow::showRunTrace() {
  for (auto *dock : findChildren<QDockWidget *>("run-trace-dock")) {
    dock->show();
    dock->raise();
    return;
  }
  auto *dock = new QDockWidget(tr("Run trace"), dockHost_);
  dock->setObjectName("run-trace-dock");
  dock->setAttribute(Qt::WA_DeleteOnClose);
  dock->setAllowedAreas(Qt::BottomDockWidgetArea);
  dock->setTitleBarWidget(new QWidget(dock));
  auto *content = new QQuickWidget(engine_, dock);
  content->setResizeMode(QQuickWidget::SizeRootObjectToView);
  content->setInitialProperties({{"controller", QVariant::fromValue(&runTrace_)}});
  content->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/RunTracePanel.qml"));
  dock->setWidget(content);
  if (content->rootObject()) {
    connect(content->rootObject(), SIGNAL(closeRequested()), dock, SLOT(close()));
    connect(content->rootObject(), SIGNAL(askAgentRequested(QString,QString)), this, SLOT(askRunAgent(QString,QString)));
    connect(content->rootObject(), SIGNAL(reportRequested(QString,QString)), this, SLOT(reportError(QString,QString)));
  }
  connect(dock, &QDockWidget::visibilityChanged, &runTrace_, &node_editor::RunTraceController::setActive);
  connect(this, &EditorWindow::documentEpochChanged, dock, &QDockWidget::close);
  connect(this, &EditorWindow::credentialsEpochChanged, dock, &QDockWidget::close);
  connect(dock, &QObject::destroyed, &runTrace_, [this] { runTrace_.setActive(false); });
  // The status bar Trace tab shows whether the panel is open.
  connect(dock, &QDockWidget::visibilityChanged, this, &EditorWindow::schedulePanelChanged);
  connect(dock, &QObject::destroyed, this, &EditorWindow::schedulePanelChanged);
  runTrace_.setWorkflow(document_.snapshot().value("id").toString(), document_.snapshot().value("name").toString());
  outputDock_->hide();
  dockHost_->addDockWidget(Qt::BottomDockWidgetArea, dock);
  dockHost_->resizeDocks({dock}, {height() / 2}, Qt::Vertical);
  dock->show();
  runTrace_.refresh();
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
  dialog->setWindowTitle(tr("Server workflow"));
  serverSyncDialog_ = dialog;
  auto *content = createOverlayDialog(dialog, engine_,
                                      {{"workflowSession", QVariant::fromValue(&session_)},
                                       {"lastError", session_.autosaveState() == "error" ? message_ : QString{}}},
                                      QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ServerSyncPanel.qml"));
  if (const auto root = content->rootObject()) {
    connect(root, SIGNAL(closeRequested()), dialog, SLOT(close()));
    connect(root, SIGNAL(saveLocalAsRequested()), this, SLOT(saveLocalCopyAs()));
  }
  showOverlayDialog(dialog, content, this, {720, 640});
}
void EditorWindow::showCanvasDrops() {
  if (canvasDropDialog_) { canvasDropDialog_->show(); canvasDropDialog_->raise(); return; }
  auto *dialog = new QDialog(this);
  dialog->setObjectName("canvas-drop-dialog");
  dialog->setWindowTitle(tr("Canvas uploads"));
  canvasDropDialog_ = dialog;
  auto *content = createOverlayDialog(dialog, engine_, {{"controller", QVariant::fromValue(canvasDrops_)}},
                                      QUrl("qrc:/qt/qml/NodeTool/NodeEditor/CanvasDropPanel.qml"));
  if (const auto root = content->rootObject()) connect(root, SIGNAL(closeRequested()), dialog, SLOT(close()));
  showOverlayDialog(dialog, content, this, {444, 540});
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
void EditorWindow::syncSourcePreviews() {
  QHash<QString, QJsonObject> byId;
  for (const auto &value : document_.nodes()) { const auto node = value.toObject(); byId.insert(node["id"].toString(), node); }
  QJsonArray values;
  QHash<QString, node_editor::PreviewSourceAssets::Wire> wires;
  for (const auto &value : document_.edges()) {
    const auto edge = value.toObject();
    const auto target = byId.value(edge["target"].toString());
    const auto source = byId.value(edge["source"].toString());
    const auto sourceType = source["type"].toString();
    if (target["type"] != "nodetool.workflows.base_node.Preview" || edge["targetHandle"] != "value") { continue; }
    const auto data = source["data"].toObject();
    if ((sourceType.startsWith("nodetool.input.") || sourceType.startsWith("nodetool.constant."))
        && data.contains("value") && !data["value"].isNull()) {
      values.append(QJsonObject{{"node", target["id"]}, {"value", data["value"]}});
    } else {
      wires.insert(target["id"].toString(), {source["id"].toString(), edge["sourceHandle"].toString()});
    }
  }
  previewAssets_.request(session_.serverBound() ? session_.workflow()["id"].toString() : QString{}, wires);
  const auto saved = previewAssets_.values();
  for (auto it = saved.cbegin(); it != saved.cend(); ++it) { values.append(QJsonObject{{"node", it.key()}, {"value", it.value()}}); }
  if (values == sourcePreviewValues_) { return; }
  sourcePreviewValues_ = values;
  const QString job = "graph-values";
  sourcePreviews_.reset();
  if (values.isEmpty()) { return; }
  sourcePreviews_.beginRun(job);
  for (const auto &value : values) {
    const auto item = value.toObject();
    sourcePreviews_.ingest(job, {{"type", "output_update"}, {"job_id", job}, {"node_id", item["node"]},
                                 {"output_name", "output"}, {"value", item["value"]}, {"done", true}});
  }
}
namespace {
// A card preview of a local-media image: at most 512 px, and owning its pixels,
// so it stays valid after the store releases the run.
QImage localPreview(const QString &uri) {
  const auto stored = node_editor::LocalMediaStore::instance().image(uri);
  if (stored.isNull()) { return {}; }
  // Borrows the store's pixels. `stored` keeps them alive until the copy below.
  const QImage pixels(stored.rgba->data(), int(stored.width), int(stored.height), int(stored.width) * 4,
                      QImage::Format_RGBA8888);
  constexpr int side = 512;
  if (pixels.width() <= side && pixels.height() <= side) { return pixels.copy(); }
  return pixels.scaled(side, side, Qt::KeepAspectRatio, Qt::SmoothTransformation);
}
}  // namespace
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
  QSet<QString> contentCards;
  for (const auto id : model_.allNodeIds()) {
    const auto metadata = model_.metadata(id);
    const auto body = cardBodyFor(metadata["node_type"].toString(metadata["type"].toString()), metadata);
    if (body == CardBody::Content || body == CardBody::ConstantString) { contentCards.insert(model_.resourceId(id)); }
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
  QSet<QString> previews;
  // A node whose card already shows its content (a content card or a constant)
  // shows no run result below it.
  QSet<QString> ownContent = contentCards;
  for (const auto &value : document_.nodes()) {
    const auto node = value.toObject();
    const auto type = node["type"].toString();
    if (type == "nodetool.workflows.base_node.Preview") { previews.insert(node["id"].toString()); }
    if (type.startsWith("nodetool.constant.")) { ownContent.insert(node["id"].toString()); }
  }
  // The kernel sends output_update only for an output with no outgoing wire. A
  // node inside a chain reports its result in node_update, so its audio or
  // video plays on the card from there. Its images take the preview path below.
  QVariantList chainMedia;
  for (const auto &value : runOutput_.entries()) {
    const auto entry = value.toMap();
    const auto id = entry["nodeId"].toString();
    const auto primary = primaryOutputs.constFind(id);
    const auto items = entry["items"].toList();
    if (ownContent.contains(id) || primary == primaryOutputs.cend()) { continue; }
    if (entry["kind"] == "status") {
      const auto path = "$/" + *primary;
      QVariantList played;
      for (const auto &item : items) {
        const auto media = item.toMap();
        const auto at = media["path"].toString();
        if ((media["kind"] == "audio" || media["kind"] == "video") && (at == path || at.startsWith(path + '/'))) { played.append(media); }
      }
      if (played.isEmpty()) { continue; }
      auto rich = entry;
      rich["renderer"] = QStringLiteral("generic");
      rich["items"] = played;
      chainMedia.append(QVariantMap{{"nodeId", id}, {"runId", runOutput_.selectedRunId()}, {"outputName", *primary}, {"items", played}, {"notice", entry["previewNotice"]}, {"richEntry", rich}, {"previewActions", previews.contains(id)}});
      continue;
    }
    // A Preview with a name reports its one output under that name (clientFacingOutputName in runner.ts).
    if (entry["kind"] != "output" || (*primary != entry["outputName"].toString() && !previews.contains(id))) { continue; }
    canvasCollections.append(QVariantMap{{"nodeId", entry["nodeId"]}, {"runId", runOutput_.selectedRunId()}, {"outputName", entry["outputName"]}, {"items", items}, {"notice", entry["previewNotice"]}, {"richEntry", entry}, {"previewActions", previews.contains(id)}});
  }
  // setCollections keeps the first collection of a node, so an output_update wins.
  canvasCollections += chainMedia;
  syncSourcePreviews();
  for (const auto &value : sourcePreviews_.entries()) {
    const auto entry = value.toMap();
    canvasCollections.append(QVariantMap{{"nodeId", entry["nodeId"]}, {"runId", QString()}, {"outputName", entry["outputName"]}, {"items", entry["items"]}, {"notice", entry["previewNotice"]}, {"richEntry", entry}, {"previewActions", previews.contains(entry["nodeId"].toString())}});
  }
  if (canvasMedia_) { canvasMedia_->setCollections(canvasCollections); }

  // A card keeps its image until the next one has loaded, also across runs. A
  // new run holds the results of the nodes it has not run yet
  // (NodeRuntimeModel::beginRun), as a preview run does for reused upstream
  // nodes. Without the image, the card would draw the held result as JSON.
  previewRun_ = runOutput_.selectedRunId();
  QSet<QString> imageNodes;
  QSet<QString> reported;
  for (const auto &value : runOutput_.entries()) {
    const auto entry = value.toMap();
    const auto id = entry["nodeId"].toString();
    if (id.isEmpty() || ownContent.contains(id)) { continue; }
    // A running or queued status is not a new result. The card keeps the
    // held image until the node outputs, completes or fails in this run.
    const auto status = entry["status"].toString();
    if (entry["kind"] == "output" || status == "completed" || status == "error" || status == "failed") { reported.insert(id); }
    for (const auto &mediaValue : entry["media"].toList()) {
      const auto media = mediaValue.toMap();
      if (media["kind"] != "image") { continue; }
      imageNodes.insert(id);
      const auto source = media["locator"];
      if (runtimePreviewSources_.value(id) != source) {
        runtimePreviewSources_[id] = source;
        const auto uri = source.toMap().value("uri").toString();
        if (node_editor::LocalMediaStore::isLocalMedia(uri)) {
          // The in-process runner's pixels are in this process. The card takes
          // them directly instead of the resolver's encoded cache file.
          mediaResolver_.cancel("node-image:" + id);
          const auto preview = localPreview(uri);
          if (!preview.isNull()) { model_.setRuntimePreview(id, preview); }
        } else {
          mediaResolver_.resolve("node-image:" + id, source);
        }
      }
      break;
    }
  }
  for (const auto &id : runtimePreviewSources_.keys()) {
    const auto state = runtime_.nodeState(id);
    const bool held = !reported.contains(id) && (state.contains("result") || state.contains("outputs") || state.contains("text"));
    if (!imageNodes.contains(id) && !held) {
      mediaResolver_.cancel("node-image:" + id);
      model_.setRuntimePreview(id, {});
      mediaResolver_.release("node-image:" + id);
      runtimePreviewSources_.remove(id);
    }
  }
}
bool EditorWindow::browserVisible() const {
  if (!tabOwner_) { return activeEditor_->browserVisible(); } return browserDock_ && !browserDock_->isHidden(); }
bool EditorWindow::libraryVisible() const {
  if (!tabOwner_) { return activeEditor_->libraryVisible(); } return libraryDock_ && !libraryDock_->isHidden(); }
bool EditorWindow::examplesVisible() const {
  if (!tabOwner_) { return activeEditor_->examplesVisible(); } return examplesDock_ && !examplesDock_->isHidden(); }
void EditorWindow::loadBrowser() {
  if (session_.serverUrl().isEmpty()) { return; }
  // Favourites and view choices other tabs changed since the last load. Its
  // change signal must come before the project load is marked pending.
  browser_.restoreViewSettings();
  browserLoadingProjects_ = true;
  browser_.loadProjects();
}
void EditorWindow::showBrowser(bool visible) {
  if (!browserDock_ || browserVisible() == visible) { return; }
  if (visible) {
    browserRestoreCatalog_ = catalogVisible();
    catalogPanel_->hide();
    if (libraryDock_) { libraryDock_->hide(); }
    if (examplesDock_) { examplesDock_->hide(); }
    inspectorDock_->hide();
    browserDock_->show();
    loadBrowser();
  } else {
    browserDock_->hide();
    if (browserRestoreCatalog_) { catalogPanel_->show(); }
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
// WorkflowDeleteDialog.tsx with several workflows.
void EditorWindow::deleteWorkflows(const QStringList &ids) {
  if (!tabOwner_) { activeEditor_->deleteWorkflows(ids); return; }
  if (ids.isEmpty()) { return; }
  const auto epoch = browserEpoch_;
  const auto answer = QMessageBox::question(this, tr("Delete workflows?"),
      tr("Delete %n workflow(s) and their graphs from the server? This cannot be undone.", nullptr, int(ids.size())),
      QMessageBox::Cancel | QMessageBox::Yes, QMessageBox::Cancel);
  if (answer == QMessageBox::Yes && epoch == browserEpoch_) { browser_.deleteWorkflows(ids); }
}
QPair<bool, bool> EditorWindow::queueActivity(const QVariantList &queue) const {
  QPair<bool, bool> activity{false, false};
  const auto workflow = document_.snapshot()["id"].toString();
  for (const auto &item : queue) {
    const auto job = item.toMap();
    if (job["terminal"].toBool()) { continue; }
    // QueueOverlay's hasJobs and runActive's scope.
    if (QStringList{"running", "queued", "scheduled", "starting"}.contains(job["status"].toString())) { activity.first = true; }
    if (job.contains("order") && job["workflow_id"].toString() == workflow) { activity.second = true; }
  }
  return activity;
}
void EditorWindow::updateShownQueue(bool settled) {
  // last_seq changes with each run event and nothing shows it. Without it, a
  // long run holds still and shows, while a burst of preview runs does not.
  auto live = session_.queue();
  for (auto &item : live) {
    auto row = item.toMap();
    row.remove(QStringLiteral("last_seq"));
    item = row;
  }
  if (live == shownQueue_) {
    shownQueueTimer_->stop();
    pendingQueue_.clear();
    return;
  }
  // A Stop is the user's own action, so "Stopping" and a refused Stop show at once.
  const auto stoppingJobs = [](const QVariantList &queue) {
    QSet<QString> jobs;
    for (const auto &item : queue) {
      if (item.toMap()["stopping"].toBool()) { jobs.insert(item.toMap()["jobId"].toString()); }
    }
    return jobs;
  };
  if (stoppingJobs(live) != stoppingJobs(shownQueue_)) { settled = true; }
  if (!settled) {
    // Each change restarts the wait, so only a held queue shows.
    if (live != pendingQueue_ || !shownQueueTimer_->isActive()) { shownQueueTimer_->start(); }
    pendingQueue_ = live;
    return;
  }
  shownQueueTimer_->stop();
  pendingQueue_.clear();
  shownActivity_ = queueActivity(live);
  shownQueue_ = live;
  emit shownQueueChanged();
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
  if (!tabOwner_) { return activeEditor_->catalogVisible(); } return catalogPanel_ && !catalogPanel_->isHidden(); }
bool EditorWindow::inspectorVisible() const {
  if (!tabOwner_) { return activeEditor_->inspectorVisible(); } return inspectorDock_ && !inspectorDock_->isHidden(); }
QString EditorWindow::workflowName() const {
  if (!tabOwner_) { return activeEditor_->workflowName(); }
  return document_.snapshot()["name"].toString(tr("Untitled workflow"));
}
bool EditorWindow::canUndo() const {
    if (!tabOwner_) {
        return activeEditor_->canUndo();
    }
    return menuActionEnabled(QStringLiteral("Undo"));
}
bool EditorWindow::canRedo() const {
    if (!tabOwner_) {
        return activeEditor_->canRedo();
    }
    return menuActionEnabled(QStringLiteral("Redo"));
}
QString EditorWindow::documentSaveStatus() const {
    if (!tabOwner_) {
        return activeEditor_->documentSaveStatus();
    }
    if (inlineChild_ && childParent_) {
        return childParent_->documentSaveStatus();
    }
    if (readOnly()) {
        return QStringLiteral("readOnly");
    }
    if (session_.autosaveState() == "deleted") {
        return QStringLiteral("deleted");
    }
    if (session_.conflictPending()) {
        return QStringLiteral("conflict");
    }
    if (session_.saving()) {
        return QStringLiteral("saving");
    }
    if (session_.autosaveState() == "error") {
        return QStringLiteral("error");
    }
    const bool dirty = session_.serverBound() ? session_.dirty() : !document_.undoStack()->isClean();
    return dirty ? QStringLiteral("dirty") : QStringLiteral("saved");
}
bool EditorWindow::workflowRenamable() const {
    if (!tabOwner_) {
        return activeEditor_->workflowRenamable();
    }
    return !childParent_ && !readOnly();
}
void EditorWindow::renameWorkflow(const QString &name) {
    if (!tabOwner_) {
        activeEditor_->renameWorkflow(name);
        return;
    }
    if (inlineChild_ && childParent_) {
        workflowHost()->renameWorkflow(name);
        return;
    }
    if (!workflowRenamable()) {
        return;
    }
    renameTab(tabOwner_->visibleTabs().indexOf(this), name);
}
bool EditorWindow::chatVisible() const {
    if (!tabOwner_) {
        return activeEditor_->chatVisible();
    }
    return chatVisible_;
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
  const char *kind = model_.isGroup(graphId) ? "group" : model_.isComment(graphId) ? "comment" : model_.isReroute(graphId) ? "reroute" : "node";
  return {{"kind", kind}, {"childGraph", node_editor::isChildNode(node)}, {"title", model_.isComment(graphId) ? QString("Comment") : model_.isGroup(graphId) ? node["data"].toObject()["headline"].toString("Group") : layout.title}, {"icon", layout.icon},
          {"namespace", metadata["namespace"].toString(type.section('.', 0, -2))},
          {"description", metadata["description"].toString()},
          {"inputs", ports(QtNodes::PortType::In)}, {"outputs", ports(QtNodes::PortType::Out)}};
}
int EditorWindow::zoomPercent() const {
  if (!tabOwner_) { return activeEditor_->zoomPercent(); } return int(std::round(view_->transform().m11() * 100)); }
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
    catalogPanel_->hide();
  } else if (catalogAutoHidden_ && (!show || width() >= narrowWindowWidth)) {
    catalogAutoHidden_ = false;
    catalogPanel_->show();
  }
}
// useDragHandlers.ts and useAddToGroup.ts: a card dropped on a group joins it
// and the group grows to hold it, and Alt or a shake takes cards out of theirs.
// Positions are the absolute ones the drag ends with.
QJsonArray EditorWindow::dragGroupCommands(const QJsonObject &positions, QtNodes::NodeId groupId, bool detach) {
  QJsonArray commands;
  if (readOnly() || (!detach && groupId == QtNodes::InvalidNodeId)) { return commands; }
  QStringList dragged;
  for (const auto &id : selectedIds()) {
    const auto parent = document_.node(id)["parent_id"].toString();
    if (positions.contains(id) && !(positions.contains(parent) && !parent.isEmpty())) { dragged.append(id); }
  }
  const auto isGroupType = [](const QJsonObject &node) { return node["type"].toString().endsWith(".Group"); };
  QStringList detached;
  if (detach) {
    for (const auto &id : dragged) {
      const auto node = document_.node(id);
      if (!node["parent_id"].toString().isEmpty() && !isGroupType(node)) { detached.append(id); }
    }
    if (!detached.isEmpty()) { commands.append(QJsonObject{{"op", "detachNodes"}, {"ids", QJsonArray::fromStringList(detached)}}); }
  }
  if (groupId == QtNodes::InvalidNodeId || !model_.nodeExists(groupId)) { return commands; }
  const auto group = model_.resourceId(groupId);
  QStringList joining;
  for (const auto &id : dragged) {
    const auto node = document_.node(id);
    if (id == group || isGroupType(node)) { continue; }
    if (!node["parent_id"].toString().isEmpty() && !detached.contains(id)) { continue; }
    joining.append(id);
  }
  if (joining.isEmpty()) { return commands; }
  const auto groupAt = [&](const QString &id) {
    const auto moved = positions.value(id).toObject();
    return moved.isEmpty() ? model_.nodeData(groupId, QtNodes::NodeRole::Position).toPointF() : QPointF(moved["x"].toDouble(), moved["y"].toDouble());
  };
  const auto origin = groupAt(group);
  double right = 0, bottom = 0;
  for (const auto id : model_.allNodeIds()) {
    const auto resource = model_.resourceId(id);
    const bool joins = joining.contains(resource);
    if (!joins && model_.nodeSnapshot(id)["parent_id"].toString() != group) { continue; }
    const auto moved = positions.value(resource).toObject();
    const auto at = moved.isEmpty() ? model_.nodeData(id, QtNodes::NodeRole::Position).toPointF() : QPointF(moved["x"].toDouble(), moved["y"].toDouble());
    const auto relative = at - origin;
    right = std::max(right, relative.x() + model_.layout(id).size.width());
    bottom = std::max(bottom, relative.y() + model_.layout(id).size.height());
  }
  for (const auto &id : joining) { commands.append(QJsonObject{{"op", "setNodeField"}, {"id", id}, {"field", "parent_id"}, {"value", group}}); }
  // addToGroup pads the grown frame by 25 px on the right and 50 px below.
  const auto size = model_.layout(groupId).size;
  const auto width = std::max<double>(size.width(), right + 25);
  const auto height = std::max<double>(size.height(), bottom + 50);
  if (width > size.width() || height > size.height()) {
    auto ui = model_.uiProperties(groupId);
    ui["width"] = width;
    ui["height"] = height;
    commands.append(QJsonObject{{"op", "setNodeField"}, {"id", group}, {"field", "ui_properties"}, {"value", ui}});
  }
  return commands;
}

void EditorWindow::positionSelectionToolbar() {
  if (!selectionOverlay_ || !view_) { return; }
  const auto area = view_->rect();
  const auto selection = selectionOverlay_->sizeHint();
  QPoint origin(std::max(0, (area.width() - selection.width()) / 2), 30);
  bool visible = selectedCount() > 0 && !browserVisible();
  selectionToolbarFloating_ = false;
  // NodeSelectionToolbar.tsx shows the card toolbar only for one selected card
  // that is not being dragged, centered above it with an 8 px gap.
  const auto ids = selectedIds();
  if (!toolbarClock_.isValid()) {
    toolbarClock_.start();
    toolbarDelay_.setSingleShot(true);
    connect(&toolbarDelay_, &QTimer::timeout, this, &EditorWindow::positionSelectionToolbar);
  }
  const auto now = toolbarClock_.elapsed();
  if (scene_->nodeDragActive()) {
    toolbarSelectedAt_.clear();
  } else {
    for (auto it = toolbarSelectedAt_.begin(); it != toolbarSelectedAt_.end();) {
      it = ids.contains(it.key()) ? std::next(it) : toolbarSelectedAt_.erase(it);
    }
    for (const auto &id : ids) { toolbarSelectedAt_.insert(id, toolbarSelectedAt_.value(id, now)); }
  }
  if (visible && ids.size() == 1) {
    for (const auto id : model_.allNodeIds()) {
      if (model_.resourceId(id) != ids.first()) { continue; }
      if (model_.isGroup(id) || model_.isComment(id) || model_.isReroute(id)) { break; }
      const auto *item = scene_->nodeGraphicsObject(id);
      if (!item) { break; }
      const auto card = view_->mapFromScene(QRectF(item->scenePos(), model_.layout(id).size)).boundingRect().translated(view_->viewport()->pos());
      constexpr int cardToolbarGap = 8;
      if (!QRect(QPoint(), area.size()).intersects(card) || scene_->nodeDragActive()) { visible = false; break; }
      // The toolbar shows 200 ms after the card is selected, and not while one of the
      // card's dropdowns is open (NodeSelectionToolbar.tsx: useSelect activeSelect).
      const auto waited = now - toolbarSelectedAt_.value(ids.first(), now);
      if (waited < toolbarShowDelayMs) {
        toolbarDelay_.start(int(toolbarShowDelayMs - waited));
        visible = false;
        break;
      }
      if (inlinePresenter_ && inlinePresenter_->popupOpen()) { visible = false; break; }
      const int x = card.center().x() - selection.width() / 2;
      const int y = card.top() - cardToolbarGap - selection.height();
      origin = QPoint(std::clamp(x, 0, std::max(0, area.width() - selection.width())), std::clamp(y, 0, std::max(0, area.height() - selection.height())));
      selectionToolbarFloating_ = true;
      break;
    }
  }
  const QRect geometry(origin.x(), origin.y(), selection.width(), selection.height());
  const bool changed = selectionOverlay_->geometry() != geometry || selectionOverlay_->isVisible() != visible;
  selectionOverlay_->setGeometry(geometry);
  selectionOverlay_->setVisible(visible);
  // The web keeps the card toolbar while a note is edited (NodeSelectionToolbar.tsx reads no
  // editing state), so the 200 ms delay can show it after the editor was placed. A floating
  // toolbar changes the room the editor may take, so the editor lays out again.
  if (changed && inlineTitle_ && inlineTitle_->active()) { inlineTitle_->reposition(); }
}
void EditorWindow::layoutOverlays() {
  if (!toolbarOverlay_ || !viewportOverlay_) { return; }
  const auto area = view_->rect();
  if (setupGuide_ && setupGuide_->rootObject()) {
    // The web guide sizes to its content inside the canvas. Cap it the same way here.
    setupGuide_->rootObject()->setProperty("maximumWidth", std::max(0, area.width() - 2 * 16));
    const auto size = setupGuide_->sizeHint();
    setupGuide_->setGeometry(std::max(0, (area.width() - size.width()) / 2), setupGuide_->rootObject()->property("topInset").toInt(), size.width(), size.height());
    setupGuide_->setVisible(guideVisible());
  }
  positionSelectionToolbar();
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
    miniMap->setVisible(beside && miniMapVisible_);
    viewportOverlay_->setVisible(beside);
    miniMap->raise(); viewportOverlay_->raise();
    if (miniMapControls_) {
      // The palette and legend buttons sit above the mini-map's right edge, as the web's top -28px, right 0.
      const auto buttons = miniMapControls_->sizeHint();
      miniMapControls_->setGeometry(miniMap->geometry().right() + 1 - buttons.width(), miniMap->y() - buttons.height() - 4, buttons.width(), buttons.height());
      miniMapControls_->setVisible(beside && miniMapVisible_);
      miniMapControls_->raise();
    }
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
namespace {
class DynamicPortPopup final : public QDialog {
public:
    // The QML panel draws its own rounded border. Keep the window frameless
    // and transparent so no square window edge shows around it.
    explicit DynamicPortPopup(QWidget *parent) : QDialog(parent, Qt::Popup | Qt::FramelessWindowHint) {
        setAttribute(Qt::WA_TranslucentBackground);
    }
    QPointer<QQuickItem> form;
    bool renaming = false;
    // Focus taken before the popup is activated does not stick: the field
    // keeps focus without active focus, and every key is dropped. The
    // activation arrives after show(), so focus the field again here.
    bool event(QEvent *event) override {
        const bool handled = QDialog::event(event);
        if (event->type() == QEvent::WindowActivate && form && !focused_) {
            focused_ = true;
            QMetaObject::invokeMethod(form, "activate", Qt::QueuedConnection);
        }
        return handled;
    }
    void reject() override {
        if (renaming && form && !form->property("finished").toBool()) {
            QMetaObject::invokeMethod(form, "submit");
            return;
        }
        QDialog::reject();
    }
private:
    bool focused_ = false;
};
}

void EditorWindow::showDynamicPortDialog(const QString &id, bool output, const QString &name, const QRectF &sceneAnchor) {
    if (readOnly()) { return; }
    if (dynamicPortDialog_) {
        if (auto *quick = dynamicPortDialog_->findChild<QQuickWidget *>()) {
            if (quick->rootObject()) { quick->rootObject()->setProperty("finished", true); }
        }
        dynamicPortDialog_->close();
    }
    if (!selectNode(id)) { return; }
    auto *dialog = new DynamicPortPopup(this);
    dynamicPortDialog_ = dialog;
    dialog->setObjectName("dynamic-port-dialog");
    dialog->setAttribute(Qt::WA_DeleteOnClose);
    auto *controller = new node_editor::DynamicPortsController(&document_, dialog);
    controller->setNodeMetadata(metadata_);
    controller->setSelectedNode(id);
    if (controller->readOnly() || (output ? !controller->supportsOutputs() : !controller->supportsInputs())) {
        dialog->deleteLater();
        return;
    }
    auto *quick = new QQuickWidget(engine_, dialog);
    // QQuickWidget destroys its root before its QObject children. Keep the
    // controller alive while the root's bindings and focus handlers tear down.
    controller->setParent(quick);
    quick->setObjectName("dynamic-port-dialog-host");
    quick->setAttribute(Qt::WA_TranslucentBackground);
    quick->setClearColor(Qt::transparent);
    quick->setResizeMode(QQuickWidget::SizeRootObjectToView);
    quick->setInitialProperties({{"controller", QVariant::fromValue(controller)}, {"nodeId", id}, {"output", output}, {"originalName", name}});
    quick->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/DynamicPortDialog.qml"));
    if (!quick->rootObject()) { dialog->deleteLater(); return; }
    dialog->form = quick->rootObject();
    dialog->renaming = !name.isEmpty();
    auto *layout = new QVBoxLayout(dialog);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(quick);
    const QPointer<QQuickWidget> guardedQuick(quick);
    const QPointer<QDialog> guardedDialog(dialog);
    const auto cancel = [guardedDialog, guardedQuick] {
        if (guardedQuick && guardedQuick->rootObject()) { guardedQuick->rootObject()->setProperty("finished", true); }
        if (guardedDialog) { guardedDialog->close(); }
    };
    connect(this, &EditorWindow::documentEpochChanged, quick, cancel);
    connect(this, &EditorWindow::credentialsEpochChanged, quick, cancel);
    connect(&dynamicPorts_, &node_editor::DynamicPortsController::changed, quick, [this, id, cancel] {
        if (dynamicPorts_.selectedNode() != id) { cancel(); }
    });
    connect(controller, &node_editor::DynamicPortsController::changed, quick, [controller = QPointer<node_editor::DynamicPortsController>(controller), cancel] {
        if (controller && controller->readOnly()) { cancel(); }
    });
    connect(quick->rootObject(), SIGNAL(completed()), dialog, SLOT(accept()));
    const auto place = [this, guardedDialog, guardedQuick, sceneAnchor] {
        if (!guardedDialog || !guardedQuick) { return; }
        auto *dialog = guardedDialog.data();
        auto *quick = guardedQuick.data();
        auto area = QRect(mapToGlobal(QPoint()), size());
        if (screen()) { area = area.intersected(screen()->availableGeometry()); }
        if (area.isEmpty() || !quick->rootObject()) { return; }
        dialog->resize(std::min(area.width(), int(std::ceil(quick->rootObject()->implicitWidth()))),
                       std::min(area.height(), int(std::ceil(quick->rootObject()->implicitHeight()))));
        auto anchor = view_->viewport()->mapToGlobal(view_->mapFromScene(sceneAnchor.bottomLeft()));
        anchor.setX(std::clamp(anchor.x(), area.left(), std::max(area.left(), area.right() - dialog->width())));
        anchor.setY(std::clamp(anchor.y(), area.top(), std::max(area.top(), area.bottom() - dialog->height())));
        dialog->move(anchor);
    };
    connect(quick->rootObject(), &QQuickItem::implicitHeightChanged, dialog, [dialog, place] { QTimer::singleShot(0, dialog, place); });
    place();
    dialog->show();
    quick->setFocus(Qt::PopupFocusReason);
    QMetaObject::invokeMethod(quick->rootObject(), "activate");
    connect(dialog, &QDialog::finished, view_, [view = QPointer<QGraphicsView>(view_)] {
        if (view) { view->setFocus(Qt::OtherFocusReason); }
    });
}

// DynamicSlotTypePicker.tsx: a menu of the slot palette below the chip, with
// the current type checked. A choice retypes through setDynamicInputType.
void EditorWindow::showDynamicTypeMenu(const QString &id, const QString &name, const QRectF &sceneAnchor) {
    if (readOnly() || !selectNode(id)) { return; }
    // The controller lives as long as the menu, which keeps this pointer in its request.
    const std::shared_ptr<node_editor::DynamicPortsController> controller(new node_editor::DynamicPortsController(&document_, nullptr));
    controller->setNodeMetadata(metadata_);
    controller->setSelectedNode(id);
    QString current;
    bool retypable = false;
    for (const auto &entry : controller->inputs()) {
        const auto row = entry.toMap();
        if (row.value("name").toString() == name) { current = row.value("typeKey").toString(); retypable = row.value("retypable").toBool(); }
    }
    if (controller->readOnly() || !retypable) { return; }
    MenuBuilder menu;
    for (const auto &entry : controller->inputTypes()) {
        const auto key = entry.toMap().value("value").toString();
        menu.item("type:" + key, key, {}, [controller, name, key, current] {
            if (key != current) { controller->setPortType(name, key); }
        }, RowOptions{.checked = key == current});
    }
    EntryMenuRequest request;
    request.kind = "dynamic-slot-type-menu";
    request.global = view_->viewport()->mapToGlobal(view_->mapFromScene(sceneAnchor.bottomLeft()));
    request.entries = menu.entries();
    request.actions = menu.actions();
    request.keepAlive = controller;
    const QPointer<QQuickWidget> host = showEntryMenu(request);
    if (!host) { return; }
    connect(&dynamicPorts_, &node_editor::DynamicPortsController::changed, host, [this, id, host] {
        if (dynamicPorts_.selectedNode() != id) {
            QMetaObject::invokeMethod(host->rootObject(), "dismiss");
        }
    });
}

void EditorWindow::clearDynamicPortDialogs() {
    // Include closed popups awaiting deferred deletion and popups in owned tabs.
    const auto dialogs = findChildren<QDialog *>(QStringLiteral("dynamic-port-dialog"));
    for (auto *dialog : dialogs) {
        if (auto *quick = dialog->findChild<QQuickWidget *>()) {
            if (quick->rootObject()) { quick->rootObject()->setProperty("finished", true); }
        }
        // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
        delete dialog;
    }
    dynamicPortDialog_.clear();
}

bool EditorWindow::selectNode(const QString &resourceId) {
  if (!tabOwner_) { return activeEditor_->selectNode(resourceId); }
    ensureProjected();
  for (auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) != resourceId) { continue; }
    lineage_->setSelectedLinkIds({});
    // The empty selection between these steps would sync the inspector too.
    selectingNode_ = true;
    scene_->clearSelection();
    selectingNode_ = false;
    scene_->nodeGraphicsObject(id)->setSelected(true);
    // A programmatic selection may be off screen. A click is not, so it never asks.
    revealPending_ = true;
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
  cancelViewAnimation();
  view_->setTransformationAnchor(QGraphicsView::AnchorUnderMouse);
  view_->scale(factor, factor);
  emit zoomChanged();
}
void EditorWindow::panBy(QPoint delta) {
  fitActive_ = false;
  cancelViewAnimation();
  view_->horizontalScrollBar()->setValue(view_->horizontalScrollBar()->value() - delta.x());
  view_->verticalScrollBar()->setValue(view_->verticalScrollBar()->value() - delta.y());
}
void EditorWindow::zoomBy(double factor) {
  // ViewportStatusIndicator.tsx steps from the zoom the view has now: zoomTo(getZoom() * 1.2).
  zoomTo(view_->transform().m11() * factor);
}
void EditorWindow::showMoreMenu() {
  showActionMenu("more", QCursor::pos());
}
// The runnable cards a Disable or Run acts on: the selection with groups expanded to their
// descendants, without comments and groups themselves. The bool is true when the card is disabled.
QList<bool> EditorWindow::selectedRunnableStates() const {
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
  QList<bool> states;
  for (qsizetype i = 0; i < pending.size(); ++i) {
    const auto id = pending[i];
    if (visited.contains(id)) { continue; }
    visited.insert(id);
    const auto node = nodes.value(id);
    const auto type = node["type"].toString();
    if (type == "nodetool.workflows.base_node.Group" || type == "nodetool.workflows.Group") {
      pending += children.value(id);
    } else if (!node.isEmpty() && type != "nodetool.workflows.base_node.Comment" && type != "nodetool.workflows.Comment") {
      states.append(node["ui_properties"].toObject()["bypassed"].toBool());
    }
  }
  return states;
}
bool EditorWindow::selectionDisabled() const {
  if (!tabOwner_) { return activeEditor_->selectionDisabled(); }
  const auto states = selectedRunnableStates();
  return !states.isEmpty() && std::all_of(states.cbegin(), states.cend(), [](bool disabled) { return disabled; });
}
// NodeStore.toggleBypassSelected enables when at least half of the cards are disabled and disables otherwise.
bool EditorWindow::selectionMostlyDisabled() const {
  if (!tabOwner_) { return activeEditor_->selectionMostlyDisabled(); }
  const auto states = selectedRunnableStates();
  return !states.isEmpty() && std::count(states.cbegin(), states.cend(), true) >= states.size() / 2.0;
}
// useRunFromHere.ts: Run node is its own job, so a running workflow never blocks it.
// A group or comment selection is a Run selected.
bool EditorWindow::singleRunnableCardSelected() const {
  const auto ids = selectedIds();
  if (ids.size() != 1) { return false; }
  const auto type = document_.node(ids.first())["type"].toString();
  return !type.isEmpty() && type != "nodetool.workflows.base_node.Group" && type != "nodetool.workflows.Group"
      && type != "nodetool.workflows.base_node.Comment" && type != "nodetool.workflows.Comment";
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
        ensureProjected();
    }
  return r.ok;
}
void EditorWindow::setCatalog(const QJsonArray &source) {
  if (codeSnippets_.isEmpty()) { codeSnippets_ = loadCodeSnippets(); }
  // A Comfy workflow's tab adds its target's ComfyUI node classes to the catalog.
  baseCatalog_ = source;
  const auto metadata = withCodeSnippets(node_editor::mergeComfyCatalog(source, comfyRecords_), codeSnippets_);
  if (!tabOwner_) { metadata_ = metadata; for (auto tab : tabs_) tab->setCatalog(metadata); emit catalogChanged(); return; }
  metadata_ = metadata;
  // Panels can bind to the tab or to the window that owns the tabs.
  emit catalogChanged();
  emit tabOwner_->catalogChanged();
  compatiblePicker_->setCatalog(node_editor::comfyMenuMetadata(metadata, comfyWorkflow_));
  canvasDrops_->setCatalog(metadata);
  session_.setNodeMetadata(metadata);
  document_.setNodeMetadata(metadata_);
  modelPicker_.fillWorkflowDefaults(&document_, metadata_);
  dynamicPorts_.setNodeMetadata(metadata_);
  refresh();
  // New descriptors must reach the fields before a commit queued for the old ones runs.
  flushPanelChanged();
  // New descriptors change card sizes, so fit mode fits again.
  scheduleViewportSettle(true);
}
void EditorWindow::invalidateGesture() {
  ++gestureEpoch_;
  gesture_ = false;
  gestureCommands_ = {};
  gesturePositions_.clear();
}
void EditorWindow::refresh() {
    setup_.offerWorkflow(document_.snapshot(), metadata_);
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
    entry["native_dependency_warning"] = missing.isEmpty() ? QString{} : tr("Requires %1").arg(missing.join(", "));
    presentationMetadata[i] = entry;
  }
  QSet<QString> liveAudioNodes;
  for (const auto &value : document_.nodes()) {
    const auto node = value.toObject();
    if (node["type"] == "nodetool.audio.realtime.AudioOutput") { liveAudioNodes.insert(node["id"].toString()); }
  }
  runOutput_.setLiveNodes(liveAudioNodes);
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
  return node_editor::NodeCatalog::entriesFromMetadata(node_editor::comfyMenuMetadata(metadata_, comfyWorkflow_));
}
bool EditorWindow::miniMapVisible() const {
    if (!tabOwner_) { return activeEditor_->miniMapVisible(); }
    return miniMapVisible_;
}
void EditorWindow::setMiniMapVisible(bool visible) {
    if (!tabOwner_) { activeEditor_->setMiniMapVisible(visible); return; }
    QSettings().setValue("minimap/visible", visible);
    // The choice holds for every workflow tab, as in the web store.
    for (auto tab : tabOwner_->tabs_) {
        tab->miniMapVisible_ = visible;
        tab->layoutOverlays();
        tab->schedulePanelChanged();
    }
}
QVariantMap EditorWindow::systemStats() const {
    if (!tabOwner_) { return activeEditor_->systemStats(); }
    return session_.systemStats();
}
QString EditorWindow::connectionStatus() const {
    if (!tabOwner_) { return activeEditor_->connectionStatus(); }
    return session_.connectionState();
}
QString EditorWindow::connectionDetail() const {
    if (!tabOwner_) { return activeEditor_->connectionDetail(); }
    return session_.connectionDetail();
}
int EditorWindow::nodeCount() const {
    if (!tabOwner_) { return activeEditor_->nodeCount(); }
    return document_.nodes().size();
}
int EditorWindow::edgeCount() const {
    if (!tabOwner_) { return activeEditor_->edgeCount(); }
    return document_.edges().size();
}
int EditorWindow::queuedCount() const {
    if (!tabOwner_) { return activeEditor_->queuedCount(); }
    int count = 0;
    for (const auto &value : session_.queue()) {
        if (value.toMap()["status"].toString() == "queued") { ++count; }
    }
    return count;
}
bool EditorWindow::queueAvailable() const {
    if (!tabOwner_) { return activeEditor_->queueAvailable(); }
    for (const auto &value : session_.queue()) {
        if (!value.toMap()["terminal"].toBool()) { return true; }
    }
    return false;
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
bool EditorWindow::addNodeAt(const QString &type, const QPointF &position, bool clearOverlap) {
  if (!knownNodeType(type) || !std::isfinite(position.x()) || !std::isfinite(position.y())) { return false; }
  for (const auto &entry : metadata_) {
    auto metadata = entry.toObject();
    if (metadata["node_type"].toString(metadata["type"].toString()) != type) continue;
    NodeCreationOptions options; options.paletteStarters = true;
    auto node = createNativeNode(metadata, position, document_.nodes(), {}, options);
    // A snippet entry lays out as the Code node it creates.
    if (metadata.contains("code_snippet")) { metadata = metadata["code_snippet"].toObject()["code_node"].toObject(); }
    if (clearOverlap) {
      // The card's real size is known before it is added, so one pass replaces
      // the web's estimate and its post-measure correction.
      WorkflowGraphModel preview;
      preview.project(QJsonObject{{"nodes", QJsonArray{node}}, {"edges", QJsonArray{}}}, QJsonArray{metadata});
      const auto size = preview.allNodeIds().empty() ? QSizeF(280, 140) : QSizeF(preview.layout(*preview.allNodeIds().begin()).size);
      QVector<QRectF> obstacles;
      for (const auto id : model_.allNodeIds()) {
        if (!model_.nodeSnapshot(id)["parent_id"].toString().isEmpty()) { continue; }
        obstacles.append(QRectF(model_.nodeData(id, QtNodes::NodeRole::Position).toPointF(), QSizeF(model_.layout(id).size)));
      }
      auto ui = node["ui_properties"].toObject();
      ui["position"] = QJsonObject{{"x", position.x()}, {"y", compatibleNodeY(QRectF(position, size), obstacles)}};
      node["ui_properties"] = ui;
    }
    const bool added = apply({{"op", "addNode"}, {"node", node}});
    if (added) { rememberRecentNode(type); }
    return added;
  }
  return false;
}
bool EditorWindow::addConnectedNode(const QString &sourceId, const QString &outputName, const QString &type, const QString &targetPort) {
  if (!compatiblePicker_) { return false; }
  for (const auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) != sourceId) { continue; }
    const bool added = compatiblePicker_->addConnected(id, outputName, type, targetPort);
    if (added) { rememberRecentNode(type); }
    return added;
  }
  return false;
}
QStringList EditorWindow::catalogRecent() const {
    return QSettings().value("catalog/recentNodes").toStringList();
}
// Up to 12 node types, most recent first, as the web RecentNodesStore keeps them.
void EditorWindow::rememberRecentNode(const QString &type) {
    auto recent = catalogRecent();
    recent.removeAll(type);
    recent.prepend(type);
    while (recent.size() > 12) { recent.removeLast(); }
    QSettings().setValue("catalog/recentNodes", recent);
    const auto owner = tabOwner_ ? tabOwner_ : this;
    for (auto tab : owner->tabs_) { emit tab->catalogRecentChanged(); }
    emit owner->catalogRecentChanged();
}
// Up to 12 favorites, newest first (web stores/FavoriteNodesStore.ts).
QStringList EditorWindow::catalogFavorites() const {
    return QSettings().value("catalog/favoriteNodes").toStringList();
}
void EditorWindow::toggleCatalogFavorite(const QString &type) {
    auto favorites = catalogFavorites();
    if (favorites.removeAll(type) == 0) {
        favorites.prepend(type);
        while (favorites.size() > 12) { favorites.removeLast(); }
    }
    QSettings().setValue("catalog/favoriteNodes", favorites);
    const auto owner = tabOwner_ ? tabOwner_ : this;
    for (auto tab : owner->tabs_) { emit tab->catalogFavoritesChanged(); }
    emit owner->catalogFavoritesChanged();
}
void EditorWindow::clearCatalogFavorites() {
    QSettings().remove("catalog/favoriteNodes");
    const auto owner = tabOwner_ ? tabOwner_ : this;
    for (auto tab : owner->tabs_) { emit tab->catalogFavoritesChanged(); }
    emit owner->catalogFavoritesChanged();
}
void EditorWindow::clearCatalogRecent() {
    QSettings().remove("catalog/recentNodes");
    const auto owner = tabOwner_ ? tabOwner_ : this;
    for (auto tab : owner->tabs_) { emit tab->catalogRecentChanged(); }
    emit owner->catalogRecentChanged();
}
void EditorWindow::syncNodeCatalog() {
    nodeCatalog_.setNodes(catalog());
    nodeCatalog_.setRecent(catalogRecent());
    nodeCatalog_.setFavorites(catalogFavorites());
    nodeCatalog_.setReadOnly(readOnly());
}
void EditorWindow::syncChrome() {
  // The web document bar of a subgraph tab names the workflow (WorkflowDocumentBar.tsx).
  const auto *host = (tabOwner_ || !activeEditor_ ? this : activeEditor_)->workflowHost();
  workflowHeader_.setWorkflowName(host->workflowName());
  workflowHeader_.setRenamable(host->workflowRenamable());
  workflowHeader_.setSaveStatus(documentSaveStatus());
  workflowHeader_.setHistory(canUndo(), canRedo());
  browser_.setCurrentId(document_.snapshot()["id"].toString());
  // The outer window shows the active tab's commands.
  const auto *source = tabOwner_ || !activeEditor_ ? this : activeEditor_;
  QStringList enabled;
  for (const auto *name : {"Save", "Version history", "Workflow metadata", "Server sync", "Canvas uploads", "Command menu",
                           "Instant Update: On", "Canvas navigation: Mouse"}) {
    if (source->menuActionEnabled(QString::fromLatin1(name))) { enabled << QString::fromLatin1(name); }
  }
  workflowHeader_.setActions(enabled, source->instantUpdate_, mouseNavigation());
  panelLayout_.setPanels({.browser = browserVisible(),
                          .chat = chatVisible(),
                          .library = libraryVisible(),
                          .examples = examplesVisible(),
                          .catalog = catalogVisible(),
                          .inspector = inspectorVisible(),
                          .miniMap = miniMapVisible(),
                          .output = outputVisible(),
                          .queue = queueVisible(),
                          .generations = generationsVisible(),
                          .trace = traceVisible(),
                          .versions = versionsVisible()});
  statusModel_.setStatus({.connectionStatus = connectionStatus(),
                          .connectionDetail = connectionDetail(),
                          .connected = connectionState() == tr("Connected"),
                          .message = message(),
                          // The web status bar counts the workflow, also from a subgraph tab (PanelBottom.tsx).
                          .nodeCount = host->nodeCount(),
                          .edgeCount = host->edgeCount(),
                          .queuedCount = queuedCount(),
                          .generatingCount = generationActivity()->counts().value("generating").toInt(),
                          .systemStats = systemStats()});
  firstWorkflowGuide_.setState(guideVisible(), guideStarted(), guideReadiness());
  editorCommands_.setReadOnly(readOnly());
  selection_.setSelection(selectedCount(), selectionInfo(), selectionDisabled(), selectionMostlyDisabled());
}
void EditorWindow::syncViewport() {
  viewport_.setZoom(zoomPercent(), zoomIsPreset());
  viewport_.setMiniMapColorMode(miniMapColorMode());
}
void EditorWindow::syncRuns() {
  // A subgraph surface shows the run state of the workflow it belongs to.
  const auto *host = workflowHost();
  editorCommands_.setRunning(host->shownRunActive());
  runState_.setQueue(host->shownQueue());
  runState_.setConnected(host->session_.connected());
  runState_.setJobsError(host->session_.jobsError());
  runState_.setWorkflowId(host->session_.workflow()["id"].toString());
}
EditorWindow *EditorWindow::workflowHost() {
  auto *host = this;
  while (host->inlineChild_ && host->childParent_) { host = host->childParent_; }
  return host;
}
const EditorWindow *EditorWindow::workflowHost() const {
  return const_cast<EditorWindow *>(this)->workflowHost();
}
void EditorWindow::followHostRuns() {
  auto *host = workflowHost();
  if (host == this) { return; }
  connect(host, &EditorWindow::shownQueueChanged, this, &EditorWindow::syncRuns);
  connect(&host->session_, &node_editor::WorkflowSession::stateChanged, this, &EditorWindow::syncRuns);
  // The run output panel follows whichever surface ran last: the workflow for Run,
  // this subgraph for Run selected.
  const auto show = [this](node_editor::RunOutputModel *output) {
    if (shownRunOutput_ != output) {
      shownRunOutput_ = output;
      runState_.setOutputModels(output->collections(), output->richEntries());
    }
    runState_.setOutput(output->runs(), output->selectedRunId());
  };
  connect(&host->runOutput_, &node_editor::RunOutputModel::changed, this, [show, host] { show(&host->runOutput_); });
  connect(&runOutput_, &node_editor::RunOutputModel::changed, this, [show, this] { show(&runOutput_); });
  QPointer<EditorWindow> self(this);
  connect(host, &QObject::destroyed, this, [self] {
    if (self && self->shownRunOutput_ != &self->runOutput_) {
      self->shownRunOutput_ = &self->runOutput_;
      self->runState_.setOutputModels(self->runOutput_.collections(), self->runOutput_.richEntries());
      self->runState_.setOutput(self->runOutput_.runs(), self->runOutput_.selectedRunId());
    }
  });
  if (!host->runOutput_.runs().isEmpty()) { show(&host->runOutput_); }
  syncRuns();
}
void EditorWindow::syncNodeInspector() {
    const auto node = selection();
    const auto reason = readOnlyReason();
    nodeInspector_.setSelection(node);
    nodeInspector_.setSelectionInfo(selectionInfo());
    nodeInspector_.setProperties(properties());
    nodeInspector_.setReadOnlyReason(reason);
    nodeInspector_.setMessage(message());
    nodeInspector_.setRunProgress(runProgress());
    auto *fields = nodeInspector_.fields();
    fields->setSelection(node);
    fields->setReadOnly(!reason.isEmpty());
    auto *history = nodeInspector_.history();
    history->setGenerationHistory(generationHistory());
    history->setSelection(node);
    history->setReadOnly(!reason.isEmpty());
    history->setPinnedGeneration(pinnedGeneration());
    history->setReplayGenerations(replayGenerations());
}
void EditorWindow::addNode(const QString &type) {
  if (!tabOwner_) { activeEditor_->addNode(type); return; }
  // An armed pointer point places one node there, as the web menu's clickPosition
  // does (hooks/useCreateNode.ts). Otherwise the node lands in the visible center.
  const auto point = catalogPoint_;
  const bool fromMenu = nodeMenuVisible();
  if ((point || fromMenu) && knownNodeType(type)) { cancelCatalogPlacement(); }
  if (knownNodeType(type)) { addNodeAt(type, point ? *point : view_->mapToScene(unobstructedViewport().center().toPoint()), true); }
  else { model_.addNode(type); }
  // The web menu closes after an add, which returns the keyboard to the canvas.
  if (point || fromMenu) { focusCanvas(); }
}
bool EditorWindow::nodeMenuVisible() const {
    if (!tabOwner_) { return activeEditor_ && activeEditor_->nodeMenuVisible(); }
    return nodeMenu_ && !nodeMenu_->isHidden();
}
void EditorWindow::openNodeMenu() {
    if (!tabOwner_) {
        if (activeEditor_) { activeEditor_->openNodeMenu(); }
        return;
    }
    if (!nodeMenu_ || !nodeMenu_->rootObject() || !dockHost_ || !dockHost_->centralWidget()) { return; }
    const auto area = dockHost_->centralWidget()->geometry();
    // NodeMenu.tsx: 980 px wide and at most 90% of the window high.
    constexpr int margin = 10;
    nodeMenu_->resize(std::min(980, area.width() - 2 * margin), std::min(620, int(area.height() * 0.9)));
    QMetaObject::invokeMethod(nodeMenu_->rootObject(), "reset");
    // The menu opens at the pointer point (NodeMenuStore.openNodeMenu x, y), or centered.
    QPoint topLeft = area.center() - QPoint(nodeMenu_->width() / 2, nodeMenu_->height() / 2);
    if (catalogPoint_) {
        topLeft = view_->viewport()->mapTo(dockHost_, view_->mapFromScene(*catalogPoint_));
    }
    placeNodeMenu(topLeft);
    nodeMenu_->show();
    nodeMenu_->raise();
    nodeMenu_->setFocus(Qt::OtherFocusReason);
    QMetaObject::invokeMethod(nodeMenu_->rootObject(), "focusSearch");
}
void EditorWindow::closeNodeMenu() {
    if (!tabOwner_) {
        if (activeEditor_) { activeEditor_->closeNodeMenu(); }
        return;
    }
    const bool open = nodeMenuVisible();
    if (nodeMenu_) { nodeMenu_->hide(); }
    cancelCatalogPlacement();
    if (open) { focusCanvas(); }
}
void EditorWindow::moveNodeMenu(qreal dx, qreal dy) {
    if (!tabOwner_) {
        if (activeEditor_) { activeEditor_->moveNodeMenu(dx, dy); }
        return;
    }
    if (!nodeMenuVisible()) { return; }
    placeNodeMenu(nodeMenu_->pos() + QPoint(qRound(dx), qRound(dy)));
}
void EditorWindow::placeNodeMenu(QPoint topLeft) {
    if (!nodeMenu_ || !dockHost_ || !dockHost_->centralWidget()) { return; }
    const auto area = dockHost_->centralWidget()->geometry().adjusted(10, 10, -10, -10);
    topLeft.setX(std::clamp(topLeft.x(), area.left(), std::max(area.left(), area.right() - nodeMenu_->width())));
    topLeft.setY(std::clamp(topLeft.y(), area.top(), std::max(area.top(), area.bottom() - nodeMenu_->height())));
    nodeMenu_->move(topLeft);
}
void EditorWindow::focusCanvas() {
    if (!tabOwner_) {
        if (activeEditor_) { activeEditor_->focusCanvas(); }
        return;
    }
    view_->setFocus(Qt::ShortcutFocusReason);
}
void EditorWindow::armCatalogPlacement(const QPointF &scenePosition) {
    if (!std::isfinite(scenePosition.x()) || !std::isfinite(scenePosition.y())) { return; }
    catalogPoint_ = scenePosition;
    emit catalogPlacementChanged();
}
void EditorWindow::cancelCatalogPlacement() {
    if (!tabOwner_) {
        if (activeEditor_) { activeEditor_->cancelCatalogPlacement(); }
        return;
    }
    // A pane press, a document change or an add without a menu closes the menu too.
    if (nodeMenu_ && !nodeMenu_->isHidden()) { nodeMenu_->hide(); }
    if (!catalogPoint_) { return; }
    catalogPoint_.reset();
    emit catalogPlacementChanged();
}
void EditorWindow::dragNode(const QString &type) {
  if (!tabOwner_) { activeEditor_->dragNode(type); return; }
  if (readOnly() || !knownNodeType(type)) { return; }
  // QDrag::exec runs a nested event loop. Started inside the catalog
  // DragHandler's signal, that loop deletes the delegate whose handler is
  // still on the stack, and QML aborts. Start the drag after the handler returns.
  QTimer::singleShot(0, this, [this, type] {
    auto mime = std::make_unique<QMimeData>();
    mime->setData("application/x-nodetool-node-type", type.toUtf8());
    QDrag drag(this);
    drag.setMimeData(mime.release());  // QDrag owns the mime data from here.
    drag.exec(Qt::CopyAction, Qt::CopyAction);
  });
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
    QStringList outputs;
    for (const auto &port : model_.ports(id, QtNodes::PortType::Out)) { outputs.append(port.toObject()["name"].toString()); }
    options.outputOrder.insert(model_.resourceId(id), outputs);
  }
  const auto result = node_editor::layout::autoLayoutCommand(document_.graph(), sizes, options);
  if (!result.ok) { message_ = result.error; schedulePanelChanged(); return; }
  // The web resizes a group to fit the children it laid out, in the same undo step.
  QJsonObject command = result.command;
  if (!result.groupSizes.isEmpty()) {
    QJsonArray commands{result.command};
    for (auto it = result.groupSizes.cbegin(); it != result.groupSizes.cend(); ++it) {
      auto ui = document_.node(it.key())["ui_properties"].toObject();
      ui["width"] = it.value().width();
      ui["height"] = it.value().height();
      commands.append(QJsonObject{{"op", "setNodeField"}, {"id", it.key()}, {"field", "ui_properties"}, {"value", ui}});
    }
    command = {{"op", "batch"}, {"commands", commands}};
  }
  if (apply(command)) {
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
  // A Workflow or App node's select commits a reference. The node stores the
  // id once the source and its graph have loaded.
  const auto picker = childPicker(document_.node(nodeId)["type"].toString());
  if (!picker.property.isEmpty() && name == picker.property && value.metaType().id() == QMetaType::QVariantMap) {
    const auto reference = value.toMap();
    const auto data = document_.node(nodeId)["data"].toObject();
    if (reference.value("id").toString() == data[picker.property].toString() && !data[picker.snapshotKey].toObject()["graph"].toObject().isEmpty()) { return false; }
    loadChildSource(nodeId, picker.kind, reference.value("id").toString());
    return true;
  }
  const bool changed = apply({{"op", "setProperty"}, {"id", nodeId}, {"name", name}, {"value", QJsonValue::fromVariant(value)}});
  if (changed) {
    const bool numeric = value.metaType().id() == QMetaType::Double
        || value.metaType().id() == QMetaType::Float || value.metaType().id() == QMetaType::Int;
    scheduleInstantRerun(nodeId, {}, false, numeric);
  }
  return changed;
}
void EditorWindow::scheduleInstantRerun(const QString &node, const QJsonObject &draft, bool cardBody, bool immediate) {
    const InstantEdit edit{node, draft, !instantUpdate_};
    if (edit.localOnly && !cardBody) { return; }
    // Like Run selected, a rerun needs the server or the in-process runner.
    const auto canRun = [this, local = edit.localOnly] {
        return session_.localRunnerReady() || (!local && session_.connected());
    };
    if (!canRun()) { return; }
    if (runActive()) {
        // An in-process run settles in milliseconds, so the latest edit reruns
        // after it, as the web's live sliders coalesce. A server run keeps the
        // edit for the next run. A run that plays live audio took the edit as
        // a live property change, and a rerun after it would play again.
        if (session_.runsInProcess(run_) && !liveRunPlays_) {
            instantPending_ = edit;
            ++instantUpdateGeneration_;
        }
        return;
    }
    const auto generation = ++instantUpdateGeneration_;
    const auto credentials = credentialsEpoch_;
    const auto workflowId = document_.snapshot()["id"].toString();
    auto execute = [this, edit, generation, credentials, workflowId, canRun] {
        if (generation != instantUpdateGeneration_ || credentials != credentialsEpoch_
            || workflowId != document_.snapshot()["id"].toString() || !canRun() || runActive()) {
            return;
        }
        instantRerun(edit);
    };
    if (immediate) {
        execute();
    } else {
        QTimer::singleShot(300, this, std::move(execute));
    }
}
void EditorWindow::instantRerun(const InstantEdit &edit) {
    auto snapshot = document_.snapshot();
    if (document_.node(edit.node).isEmpty()) { return; }
    auto graph = snapshot["graph"].toObject();
    if (!edit.draft.isEmpty()) {
        auto nodes = graph["nodes"].toArray();
        for (auto value : nodes) {
            auto node = value.toObject();
            if (node["id"].toString() != edit.node) { continue; }
            auto data = node["data"].toObject();
            data[edit.draft["name"].toString()] = edit.draft["value"];
            node["data"] = data;
            value = node;
            break;
        }
        graph["nodes"] = nodes;
        snapshot["graph"] = graph;
    }
    QHash<QString, QStringList> downstream;
    for (const auto &value : graph["edges"].toArray()) {
        const auto edge = value.toObject();
        downstream[edge["source"].toString()].append(edge["target"].toString());
    }
    QStringList targets{edit.node};
    QSet<QString> visited{edit.node};
    for (qsizetype i = 0; i < targets.size(); ++i) {
        for (const auto &target : downstream.value(targets[i])) {
            if (!visited.contains(target)) {
                visited.insert(target);
                targets.append(target);
            }
        }
    }
    if (edit.localOnly) {
        // Only the prefix the runner supports previews, so a server node further
        // down leaves the nodes before it live (web browserRunnablePrefix).
        QHash<QString, QJsonObject> nodes;
        for (const auto &value : graph["nodes"].toArray()) { nodes.insert(value.toObject()["id"].toString(), value.toObject()); }
        QHash<QString, QStringList> upstream;
        for (const auto &value : graph["edges"].toArray()) {
            const auto edge = value.toObject();
            if (visited.contains(edge["source"].toString())) { upstream[edge["target"].toString()].append(edge["source"].toString()); }
        }
        QSet<QString> supported, runnable;
        for (const auto &target : std::as_const(targets)) {
            if (session_.runsLocally(nodes.value(target))) { supported.insert(target); }
        }
        for (bool grown = true; grown;) {
            grown = false;
            for (const auto &target : std::as_const(targets)) {
                if (runnable.contains(target) || !supported.contains(target)) { continue; }
                const auto sources = upstream.value(target);
                if (std::all_of(sources.cbegin(), sources.cend(), [&](const QString &source) { return runnable.contains(source); })) {
                    runnable.insert(target);
                    grown = true;
                }
            }
        }
        targets.removeIf([&](const QString &target) { return !runnable.contains(target); });
        if (targets.isEmpty()) { return; }
    }
    QString id;
    {
      const QScopedValueRollback marking(submittingPreview_, true);
      id = session_.runPreview(snapshot, targets, metadata_, edit.localOnly);
    }
    if (!id.isEmpty() && edit.localOnly) { setScrubbing(true); }
}
void EditorWindow::trackLiveRun(const QString &id) {
    liveRun_ = id;
    liveProperties_.clear();
    liveRunPlays_ = false;
    if (id.isEmpty()) { return; }
    for (const auto &value : document_.nodes()) {
        const auto node = value.toObject();
        liveProperties_.insert(node["id"].toString(), node["data"].toObject());
        if (node["type"] == "nodetool.audio.realtime.AudioOutput") { liveRunPlays_ = true; }
    }
}
void EditorWindow::sendLiveEdits() {
    if (liveRun_.isEmpty()) { return; }
    for (auto known = liveProperties_.begin(); known != liveProperties_.end(); ++known) {
        const auto node = document_.node(known.key());
        // A removed node keeps its values in the run.
        if (node.isEmpty()) { continue; }
        const auto data = node["data"].toObject();
        if (data == *known) { continue; }
        QJsonObject changed;
        for (auto it = data.begin(); it != data.end(); ++it) {
            if (known->value(it.key()) != it.value()) { changed.insert(it.key(), it.value()); }
        }
        *known = data;
        if (!changed.isEmpty()) { session_.updateNodeProperties(liveRun_, known.key(), changed); }
    }
}
void EditorWindow::sendLiveDraft(const QString &node, const QString &name, const QJsonValue &value) {
    const auto known = liveProperties_.find(node);
    if (liveRun_.isEmpty() || known == liveProperties_.end()) { return; }
    // The run now has the draft. The next document change sends the saved
    // value again when the draft was not committed.
    known->insert(name, value);
    session_.updateNodeProperties(liveRun_, node, {{name, value}});
}
void EditorWindow::previewCardEdit(const QJsonArray &commands) {
    // Card body controls edit one node's properties. Such an edit previews
    // like a live slider body's (web hooks/nodes/useLiveSliderWriter.ts).
    QString node;
    for (const auto &value : commands) {
        const auto command = value.toObject();
        const auto id = command["id"].toString();
        if (command["op"] != "setProperty" || (!node.isEmpty() && node != id)) { return; }
        node = id;
    }
    if (!node.isEmpty()) { scheduleInstantRerun(node, {}, true, true); }
}
void EditorWindow::setScrubbing(bool scrubbing) {
    if (scrubbing_ == scrubbing) { return; }
    scrubbing_ = scrubbing;
    scene_->setReducedMotion(canvasReducedMotion_ || instantUpdate_ || scrubbing_);
    schedulePanelChanged();
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
    ensureProjected();
  fitActive_ = true;
  applyFit();
  emit zoomChanged();
}
QRectF EditorWindow::unobstructedViewport() const {
  if (!tabOwner_) { return activeEditor_->unobstructedViewport(); }
  QRectF area = view_->viewport()->rect();
  // A toolbar floating over its card covers only that card, so it takes nothing from the canvas.
  if (selectionOverlay_ && selectionOverlay_->isVisible() && !selectionToolbarFloating_) {
    const auto bottom = selectionOverlay_->geometry().bottom() + 8.0;
    if (bottom < area.height() / 2) { area.setTop(bottom); }
  }
  if (!toolbarOverlay_ || !toolbarOverlay_->isVisible()) { return area; }
  const auto toolbarTop = toolbarOverlay_->geometry().top() - 8.0;
  // On a very short canvas the toolbar has to overlap the graph.
  if (toolbarTop > area.top() + area.height() / 2) { area.setBottom(toolbarTop); }
  return area;
}
EditorWindow::ViewTarget EditorWindow::fitTarget() const {
  QRectF bounds;
  for (auto id : model_.allNodeIds()) {
    const auto margin = node_metrics::handleDiameter / 2;
    bounds |= scene_->nodeGraphicsObject(id)->mapRectToScene(QRectF(QPointF(0, 0), QSizeF(model_.layout(id).size))).adjusted(-margin, -margin, margin, margin);
  }
  const auto area = unobstructedViewport();
  if (bounds.isEmpty() || area.isEmpty()) { return {1.0, QPointF(0, 0)}; }
  // React Flow's fitView padding of 0.1. The native editor stops at 100%.
  const auto padded = bounds.size() * 1.1;
  const auto zoom = std::clamp(std::min(area.width() / padded.width(), area.height() / padded.height()), 0.12, 1.0);
  return {zoom, centerOnArea(bounds.center(), zoom)};
}
void EditorWindow::applyFit() {
  const auto target = fitTarget();
  moveViewTo(target.zoom, target.center, 0);
}
void EditorWindow::revealSelection() { revealNode(selected_); }
void EditorWindow::revealNode(const QString &resourceId) {
  const auto modelId = [&]() -> std::optional<QtNodes::NodeId> {
    for (auto id : model_.allNodeIds()) {
      if (model_.resourceId(id) == resourceId) { return id; }
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
  const QPointF move(delta(rect.left(), rect.right(), area.left(), area.right()), delta(rect.top(), rect.bottom(), area.top(), area.bottom()));
  if (move.isNull()) { return; }
  const double zoom = view_->transform().m11();
  const auto center = view_->viewportTransform().inverted().map(QRectF(view_->viewport()->rect()).center());
  // A programmatic selection has no pointer gesture to follow, so the view lands at once.
  moveViewTo(zoom, center + move / zoom, 0);
}
int EditorWindow::inspectorInset() const {
  if (!inspectorDock_ || inspectorDock_->isHidden() || inspectorDock_->isFloating()) { return 0; }
  return inspectorDock_->width();
}
void EditorWindow::clearInspectorOverlap(int inset, bool instant) {
  const auto toRect = [&](QtNodes::NodeId id) {
    const auto item = scene_->nodeGraphicsObject(id);
    const auto rect = view_->viewportTransform().mapRect(item->mapRectToScene(QRectF(QPointF(0, 0), QSizeF(model_.layout(id).size))));
    return ::node_editor::ScreenRect{rect.left(), rect.right()};
  };
  std::vector<::node_editor::ScreenRect> nodes;
  std::vector<::node_editor::ScreenRect> selected;
  for (const auto id : model_.allNodeIds()) {
    if (!scene_->nodeGraphicsObject(id)) { continue; }
    nodes.push_back(toRect(id));
    if (scene_->nodeGraphicsObject(id)->isSelected()) { selected.push_back(nodes.back()); }
  }
  // The canvas was this much wider before the inspector took its share.
  const auto dx = ::node_editor::inspectorClearancePan(nodes, selected, view_->viewport()->width() + inset, inset);
  if (dx == 0) { return; }
  fitActive_ = false;
  auto *bar = view_->horizontalScrollBar();
  const int from = bar->value();
  const int to = from - int(std::lround(dx));
  const auto animation = qobject_cast<QAbstractAnimation *>(viewAnimation_.data());
  // A find or locate move already owns the viewport.
  if (animation && animation->state() == QAbstractAnimation::Running) { return; }
  if (viewAnimation_) { viewAnimation_->deleteLater(); }
  if (instant || canvasReducedMotion_) {
    bar->setValue(to);
    emit zoomChanged();
    return;
  }
  // The web pans over 200 ms, the normal motion token, with React Flow's default cubic ease.
  auto *pan = new QVariantAnimation(this);
  viewAnimation_ = pan;
  pan->setObjectName("inspector-pan-animation");
  pan->setDuration(motionNormalMs_);
  pan->setEasingCurve(QEasingCurve::InOutCubic);
  pan->setStartValue(from);
  pan->setEndValue(to);
  // A scroll by the user or by other code ends the pan, as a d3-zoom pan
  // gesture interrupts a React Flow viewport transition. Without this, the
  // next step moves the view back.
  pan->setProperty("expected", from);
  connect(pan, &QVariantAnimation::valueChanged, pan, [this, pan](const QVariant &value) {
    auto *bar = view_->horizontalScrollBar();
    if (bar->value() != pan->property("expected").toInt()) {
      pan->stop();
      pan->deleteLater();
      return;
    }
    bar->setValue(value.toInt());
    pan->setProperty("expected", bar->value());
    emit zoomChanged();
  });
  connect(pan, &QVariantAnimation::finished, pan, &QObject::deleteLater);
  pan->start();
}
void EditorWindow::scheduleViewportSettle(bool refit) {
  refitRequested_ = refitRequested_ || refit;
  if (settlePending_) { return; }
  settlePending_ = true;
  // Runs after a dock change has laid out and resized the canvas.
  QMetaObject::invokeMethod(this, [this] {
    settlePending_ = false;
    layoutOverlays();
    // A background tab keeps its viewport. Showing it again is not a dock change.
    if (!isVisible()) { return; }
    const auto size = view_->viewport()->size();
    const bool resized = size != settledViewport_;
    settledViewport_ = size;
    const auto inset = inspectorInset();
    const bool opened = inset > settledInspectorInset_;
    settledInspectorInset_ = inset;
    // Selecting a node never refits. The viewport follows a dock or window
    // resize, or an explicit request, and only while fit mode is on.
    const bool refitNow = fitActive_ && (refitRequested_ || (resized && !opened));
    refitRequested_ = false;
    if (refitNow) {
      applyFit();
      emit zoomChanged();
    }
    const bool programmatic = revealPending_;
    if (revealPending_) {
      revealPending_ = false;
      if (!fitActive_) { revealSelection(); }
    }
    // The web overlays the inspector and pans only when it covers a node.
    if (opened && !refitNow) { clearInspectorOverlap(inset, programmatic); }
  }, Qt::QueuedConnection);
}
void EditorWindow::openFileInTab(const QString &path) {
    if (!tabOwner_) { activeEditor_->openFileInTab(path); return; }
    auto owner = tabOwner_;
    for (int i = 0; i < owner->tabs_.size(); ++i) {
        if (QFileInfo(owner->tabs_[i]->file_).absoluteFilePath() == QFileInfo(path).absoluteFilePath()) { owner->activateSurface(i); return; }
    }
    if (!file_.isEmpty() || !document_.nodes().isEmpty() || hasUnsavedChanges() || session_.serverBound()) owner->newTab();
    owner->activeEditor_->openFile(path);
}
void EditorWindow::openExample(const QString &resource) {
    if (!tabOwner_) { activeEditor_->openExample(resource); return; }
    auto owner = tabOwner_;
    if (!file_.isEmpty() || !document_.nodes().isEmpty() || hasUnsavedChanges() || session_.serverBound()) owner->newTab();
    auto *editor = owner->activeEditor_;
    // The resource path is read-only, so the tab keeps no file and Save asks for one.
    if (editor->openFile(resource)) {
        editor->file_.clear();
        editor->refresh();
    }
}
void EditorWindow::toggleExamples() {
    if (!tabOwner_) { activeEditor_->toggleExamples(); return; }
    if (!examplesDock_) { return; }
    // The examples, the library and the workflow browser share the left side,
    // as views of the web left panel.
    if (examplesDock_->isHidden()) {
        showBrowser(false);
        catalogPanel_->hide();
        if (libraryDock_) { libraryDock_->hide(); }
        examplesDock_->show();
        if (exampleGallery_.connected() && !exampleGallery_.loading()) { exampleGallery_.refresh(); }
    } else {
        examplesDock_->hide();
    }
    schedulePanelChanged();
    scheduleViewportSettle();
}
QVariantList EditorWindow::bundledExamples() {
    QVariantList examples;
    for (const auto &entry : QDir(QStringLiteral(":/editor/examples")).entryInfoList({QStringLiteral("*.json")}, QDir::Files)) {
        QFile file(entry.filePath());
        if (!file.open(QIODevice::ReadOnly)) { continue; }
        const auto workflow = QJsonDocument::fromJson(file.readAll()).object();
        QStringList tags;
        for (const auto &tag : workflow["tags"].toArray()) { tags.append(tag.toString()); }
        examples.append(QVariantMap{{"resource", entry.filePath()},
                                    {"name", workflow["name"].toString(entry.baseName())},
                                    {"description", workflow["description"].toString()},
                                    {"tags", tags}});
    }
    return examples;
}
void EditorWindow::addExampleActions(QMenu *menu) {
    struct Example { QString section, name, description, resource; };
    QList<Example> examples;
    for (const auto &value : bundledExamples()) {
        const auto example = value.toMap();
        auto section = example["tags"].toStringList().value(0, tr("Other"));
        if (!section.isEmpty()) { section[0] = section[0].toUpper(); }
        examples.append({section, example["name"].toString(), example["description"].toString(), example["resource"].toString()});
    }
    std::ranges::sort(examples, [](const Example &a, const Example &b) {
        return a.section != b.section ? a.section < b.section : a.name.localeAwareCompare(b.name) < 0;
    });
    menu->setToolTipsVisible(true);
    QString section;
    for (const auto &example : examples) {
        if (example.section != section) {
            section = example.section;
            menu->addSection(section);
        }
        auto *item = menu->addAction(example.name, this, [this, resource = example.resource] { openExample(resource); });
        item->setToolTip(example.description);
    }
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
  return openDocument(f.readAll(), path);
}
bool EditorWindow::openDocument(const QByteArray &json, const QString &file) {
  node_editor::WorkflowDocument candidate;
  auto r = candidate.loadJson(json);
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
  file_ = file;
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
    ensureProjected();
  if (epoch != documentEpoch_ || credentials != credentialsEpoch_ || readOnly() || document_.node(id).isEmpty()) return;
  const auto node = document_.node(id);
  if (command.startsWith("color:")) {
    const auto color = command.mid(6);
    apply({{"op", node["type"].toString().endsWith(".Group") ? "setGroupColor" : "setCommentColor"}, {"id", id}, {"value", color.isEmpty() ? QJsonValue(QJsonValue::Null) : QJsonValue(color)}});
    return;
  }
  if (node["type"].toString() != "nodetool.workflows.base_node.Group" && node["type"].toString() != "nodetool.workflows.Group") return;
  if (command == "run") {
    if (runActive() || !(session_.connected() || session_.localRunnerReady())) return;
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
    ensureProjected();
  if (contextAction(name)) { return; }
  if (name == "Chat about node") { chatAboutSelection(); return; }
  if (name == "Toggle collapse") {
    // useToggleCollapse.ts: the first card's next state drives the whole selection, in one undo step.
    if (readOnly()) { return; }
    QStringList cards;
    for (const auto &id : selectedIds()) {
      const auto type = document_.node(id)["type"].toString();
      if (!type.endsWith(".Group") && !type.endsWith(".Comment") && !type.endsWith(".Reroute")) { cards.append(id); }
    }
    if (cards.isEmpty()) { return; }
    const bool next = !document_.node(cards.first())["ui_properties"].toObject()["collapsed"].toBool();
    QJsonArray commands;
    for (const auto &id : cards) {
      auto ui = document_.node(id)["ui_properties"].toObject();
      if (next) { ui["collapsed"] = true; } else { ui.remove("collapsed"); }
      commands.append(QJsonObject{{"op", "setNodeField"}, {"id", id}, {"field", "ui_properties"}, {"value", ui}});
    }
    apply({{"op", "batch"}, {"commands", commands}});
    return;
  }
  if (name == "Command menu" || name == "Keyboard shortcuts") { showActionMenu(name == "Command menu" ? "command" : "shortcuts", view_->viewport()->mapToGlobal(unobstructedViewport().center().toPoint())); return; }
  if (name == "Disable toggle") { action(selectionMostlyDisabled() ? "Enable selected" : "Disable selected"); return; }
  if (name == "Select all") {
    // Each setSelected emits selectionChanged, and every listener does work
    // that grows with the graph. Notify once for the whole selection.
    QSignalBlocker blocker(scene_);
    for (auto id : model_.allNodeIds()) { if (auto *item = scene_->nodeGraphicsObject(id)) { item->setSelected(true); } }
    blocker.unblock();
    emit scene_->selectionChanged();
    return;
  }
  if (name == "Settings") { openSettings(); return; }
  if (name == "Cut") { if (menuActionEnabled(name)) { action("Copy"); action("Delete"); } return; }
  if (name == "Version history" || name == "Workflow metadata") {
    showWorkflowDetails(name == "Version history" ? "versions" : "metadata"); return;
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
  if (name == "Run trace") { showRunTrace(); return; }
  if (name == "Canvas uploads") { showCanvasDrops(); return; }
  if (name == "Save local copy as") { saveLocalCopyAs(); return; }
  if (name == "Arrange selection") {
    MenuBuilder menu;
    for (auto it = selectionActions.cbegin(); it != selectionActions.cend(); ++it) {
      const auto command = it.key();
      menu.item(command, command, {}, [this, command] { action(command); },
                RowOptions{.enabled = !readOnly() && selectedCount() >= 2});
    }
    EntryMenuRequest request;
    request.kind = "arrange-selection-menu";
    request.global = QCursor::pos();
    request.entries = menu.entries();
    request.actions = menu.actions();
    showEntryMenu(request);
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
  if (name == "Find node") { showFindPanel(); return; }
  if (name == "Node info") { toggleNodeInfo(); return; }
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
      // CommentNode.tsx edits the text in place on the card.
      for (const auto graphId : model_.allNodeIds()) {
        if (model_.resourceId(graphId) == id) { inlineTitle_->activate(graphId); break; }
      }
    }
    return;
  }
  if (name == "Run selected" || name == "Disable selected" || name == "Enable selected") {
    if (readOnly()) { message_ = readOnlyReason(); schedulePanelChanged(); return; }
    const auto ids = selectedIds();
    if (ids.isEmpty()) { message_ = tr("Select nodes first."); schedulePanelChanged(); return; }
    if (name == "Run selected") {
      if (runActive() && !singleRunnableCardSelected()) { message_ = tr("Stop the active workflow before running the selection."); schedulePanelChanged(); return; }
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
  if (name == "Toggle panel") {
    // The web rail's last entry opens or closes the left panel.
    if (browserVisible()) {
      showBrowser(false);
      return;
    }
    if (examplesVisible()) {
      toggleExamples();
      return;
    }
    action("Toggle nodes");
    return;
  }
  if (name == "Toggle mini-map") {
    setMiniMapVisible(!miniMapVisible());
    return;
  }
  if (name == "Queue") {
    toggleQueue();
    return;
  }
  if (name == "Toggle nodes") {
    if (browserVisible()) { showBrowser(false); catalogPanel_->show(); return; }
    if (examplesVisible()) { toggleExamples(); catalogPanel_->show(); return; }
    catalogAutoHidden_ = false;
    catalogPanel_->setVisible(!catalogVisible());
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
      instantPending_.reset();
      scene_->setReducedMotion(canvasReducedMotion_ || instantUpdate_ || scrubbing_);
      schedulePanelChanged();
      return;
  }
  if (name == "More") {
    showMoreMenu();
    return;
  }
  if (name == "Comfy target") {
    showComfyTargetMenu();
    return;
  }
  if (name == "Zoom in" || name == "Zoom out") {
    zoomBy(name == "Zoom in" ? 1.2 : 1 / 1.2);
    return;
  }
  if (name == "Zoom presets") {
    MenuBuilder menu;
    for (double zoom : {0.25, 0.5, 0.75, 1., 1.5, 2.}) {
      const auto label = QString::number(qRound(zoom * 100)) + "%";
      menu.item("zoom:" + label, label, {}, [this, zoom] {
        // The menu is a user surface, so the preset animates.
        const QScopedValueRollback user(userViewInput_, true);
        zoomTo(zoom);
      }, RowOptions{.checked = std::abs(view_->transform().m11() - zoom) < .01});
    }
    EntryMenuRequest request;
    request.kind = "zoom-presets-menu";
    request.global = viewportOverlay_->mapToGlobal(QPoint(0, 0));
    request.entries = menu.entries();
    request.actions = menu.actions();
    request.guardDocument = false;
    showEntryMenu(request);
    return;
  }
  if (name == "Fit selection") {
    fitSelection();
    return;
  }
  if (name == "Focus node") {
    focusSelectedNode();
    return;
  }
  if (name == "Reset zoom") {
    zoomTo(1.0);
    return;
  }
  // The web zoom50, zoom100 and zoom200 shortcuts.
  if (name == "Zoom to 50%" || name == "Zoom to 100%" || name == "Zoom to 200%") {
    zoomTo(name.mid(8).chopped(1).toDouble() / 100.0);
    return;
  }
  if (name == "Add node") {
    openNodeMenu();
    return;
  }
  // Keyboard node navigation (web hooks/useNodeFocus.ts): focus moves without
  // changing the selection, and Enter selects the focused node.
  static const QHash<QString, node_editor::FocusDirection> focusMoves{
      {"Focus next node", node_editor::FocusDirection::Next}, {"Focus previous node", node_editor::FocusDirection::Previous},
      {"Focus node above", node_editor::FocusDirection::Up}, {"Focus node below", node_editor::FocusDirection::Down},
      {"Focus node left", node_editor::FocusDirection::Left}, {"Focus node right", node_editor::FocusDirection::Right}};
  if (focusMoves.contains(name) || name == "Focus back") {
    if (name == "Focus back") {
      model_.focusBack();
    } else {
      QHash<QString, QPointF> positions;
      for (const auto id : model_.allNodeIds()) { positions.insert(model_.resourceId(id), model_.nodeData(id, QtNodes::NodeRole::Position).toPointF()); }
      QVector<node_editor::FocusCandidate> nodes;
      for (const auto &value : document_.nodes()) {
        const auto resource = value.toObject()["id"].toString();
        if (positions.contains(resource)) { nodes.append({resource, positions.value(resource)}); }
      }
      model_.setFocusedNode(node_editor::nextFocus(nodes, model_.focusedNode(), focusMoves.value(name)));
    }
    if (!model_.focusedNode().isEmpty()) { revealNode(model_.focusedNode()); }
    return;
  }
  if (name == "Select focused node") {
    selectNode(model_.focusedNode());
    return;
  }
  // ADD_NODE_HOTKEYS: Shift+P, G, V and L add their node at the pointer, or
  // in the visible center when the pointer is off the canvas.
  if (const auto type = quickAddNodeType(name); !type.isEmpty()) {
    if (readOnly()) { return; }
    const auto pointer = view_->viewport()->mapFromGlobal(QCursor::pos());
    const auto point = view_->viewport()->rect().contains(pointer) ? view_->mapToScene(pointer)
                                                                 : view_->mapToScene(unobstructedViewport().center().toPoint());
    addNodeAt(type, point, true);
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
  if (name == "Library") {
    // The library and the workflow browser share the left side, as in the web left panel.
    const bool show = libraryDock_ && libraryDock_->isHidden();
    if (show) {
      showBrowser(false); catalogPanel_->hide();
      if (examplesDock_) { examplesDock_->hide(); }
      libraryDock_->show(); library_.refresh();
    }
    else if (libraryDock_) { libraryDock_->hide(); }
    schedulePanelChanged();
    scheduleViewportSettle();
    return;
  }
  if (name == "Examples") {
    toggleExamples();
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
    session_.save();
    return;
  }
  // The web run toolbar of a subgraph tab runs and stops the workflow (FloatingToolBar.tsx).
  if ((name == "Run" || name == "Stop") && inlineChild_ && childParent_) {
    flushChild();
    workflowHost()->action(name);
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
        ensureProjected();
  } else if (name == "Redo") {
    document_.redo();
        ensureProjected();
  } else if (name == "Fit") {
    fitView();
  } else if (name == "Open file") {
    auto p = QFileDialog::getOpenFileName(this, tr("Open workflow"), {},
                                          tr("Workflow (*.json)"));
    if (!p.isEmpty()) {
      openFileInTab(p);
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
    // The web saves a "Before execution" checkpoint and waits for its reply before it runs
    // (useFloatingToolbarActions.ts handleRun). The run reads the document after that wait.
    session_.checkpointBeforeRun([this](bool documentUnchanged) {
      if (!documentUnchanged) { return; }
      const auto id = session_.run(document_.snapshot());
      if (!id.isEmpty()) { run_ = id; }
    });
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
  // The catalog panel and the canvas column are watched only for these events. The
  // keyboard handling below is for the canvas.
  if (catalogPanel_ && object == catalogPanel_) {
    if (event->type() != QEvent::Show && event->type() != QEvent::Hide) { return false; }
    if (event->type() == QEvent::Show) {
      layoutCatalog();
      // NodeLibrary.tsx focuses its search when the library opens.
      catalogPanel_->setFocus(Qt::OtherFocusReason);
      if (auto *root = catalogPanel_->rootObject()) { QMetaObject::invokeMethod(root, "focusSearch"); }
    } else if (catalogPanel_->hasFocus() || catalogPanel_->isAncestorOf(QApplication::focusWidget())) {
      view_->setFocus(Qt::OtherFocusReason);
    }
    schedulePanelChanged();
    return false;
  }
  if (nodeMenu_ && object == nodeMenu_) {
    // A hidden menu returns the keyboard to the canvas.
    if (event->type() == QEvent::Hide && (nodeMenu_->hasFocus() || nodeMenu_->isAncestorOf(QApplication::focusWidget()))) {
      view_->setFocus(Qt::OtherFocusReason);
    }
    return false;
  }
  if (dockHost_ && object == dockHost_->centralWidget()) {
    if (event->type() == QEvent::Resize || event->type() == QEvent::Move) {
      layoutCatalog();
      if (nodeMenuVisible()) { placeNodeMenu(nodeMenu_->pos()); }
    }
    return false;
  }
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
    // A pane press closes the web node menu (usePaneEvents.ts handlePaneClick).
    cancelCatalogPlacement();
    if (mouse->button() == Qt::LeftButton && !mouse->modifiers().testAnyFlags(Qt::ShiftModifier | Qt::ControlModifier | Qt::MetaModifier)) {
      lineage_->setSelectedLinkIds({});
    }
    // Applied per press so that every open tab follows the one setting.
    view_->setDragMode(mouseNavigation() ? QGraphicsView::ScrollHandDrag : QGraphicsView::RubberBandDrag);
    if (mouseNavigation() && mouse->button() == Qt::LeftButton && !view_->itemAt(mouse->position().toPoint())) { fitActive_ = false; cancelViewAnimation(); }
    if (mouse->button() == Qt::MiddleButton) {
      const auto hit = view_->itemAt(mouse->position().toPoint());
      if (hit && hit->toGraphicsObject() && hit->toGraphicsObject()->parent() == lineage_) { return false; }
      // A middle click on a wire deletes it (web hooks/handlers/useEdgeHandlers.ts:116-126).
      middleEdge_.clear();
      if (auto wire = qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(hit); wire && !wire->connectionState().requiresPort() && !readOnly()) {
        middleEdge_ = model_.edge(wire->connectionId())["id"].toString();
        middlePress_ = mouse->position().toPoint();
      }
      panning_ = true;
      fitActive_ = false;
      cancelViewAnimation();
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
    const auto mouse = static_cast<QMouseEvent *>(event);
    const auto edge = std::exchange(middleEdge_, QString());
    if (!edge.isEmpty() && mouse->button() == Qt::MiddleButton && (mouse->position().toPoint() - middlePress_).manhattanLength() < QApplication::startDragDistance()) {
      apply({{"op", "removeEdge"}, {"id", edge}});
    }
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
      const auto outcome = scene_->takeDragOutcome();
      if (!positions.isEmpty()) {
        fitActive_ = false;
        // The drag's group changes and its new positions are one undo step.
        for (const auto &command : dragGroupCommands(positions, outcome.group, outcome.detach)) { gestureCommands_.append(command); }
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
        // apply() resets the gesture state, so the commands are taken first.
        const auto commands = std::exchange(gestureCommands_, {});
        if (apply({{"op", "batch"}, {"commands", commands}})) { previewCardEdit(commands); }
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
    // Enter is free for the canvas until navigation has focused a node.
    if (command == "Select focused node" && model_.focusedNode().isEmpty()) { command.clear(); }
    if (command == "Add node" && !readOnly()) {
      // Space opens the node menu where the pointer is (web useNodeEditorShortcuts.ts).
      const auto pointer = view_->viewport()->mapFromGlobal(QCursor::pos());
      if (view_->viewport()->rect().contains(pointer)) { armCatalogPlacement(view_->mapToScene(pointer)); }
    }
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
    motionNormalMs_ = roles.value("motionNormal", motionNormalMs_).toInt();
    scene_->setReducedMotion(canvasReducedMotion_ || instantUpdate_ || scrubbing_);
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
  const auto px = [&](const char *name) { return roles.value(name).toInt(); };
  // Menus render through Ui.ContextMenu. The QMenus left are the application
  // menu bar's and the Examples menu, and the native tooltip that
  // Ui.TooltipHost routes to (QToolTip) takes a widget style sheet too.
  setStyleSheet(QStringLiteral("QMenu { background: %1; color: %2; border: %3px solid %4; border-radius: 8px; padding: 4px; font-family: \"%5\"; font-size: 13px; }"
                               "QMenu::item { padding: 6px 24px 6px 12px; border-radius: 6px; }"
                               "QMenu::item:selected { background: %9; }"
                               "QMenu::item:disabled { color: %10; }"
                               "QMenu::separator { height: 1px; background: %4; margin: 4px 0; }"
                               "QToolTip { background: %1; color: %2; border: %3px solid %4; font-family: \"%5\"; font-size: %6px; padding: %7px %8px; }")
                    .arg(css(color("overlay")), css(color("text")), QString::number(px("borderWidth")), css(color("border")), roles.value("sans").toString(),
                         QString::number(px("captionSize")), QString::number(px("spaceXs")), QString::number(px("spaceMd")), css(color("field")))
                    .arg(css(color("secondary"))));
  // The application menu bar belongs to the window that owns the tabs. Where the
  // platform has no global menu bar, it draws above the tab strip in these colors.
  if (tabOwner_) {
    tabOwner_->menuBar()->setStyleSheet(styleSheet() + QStringLiteral(
        "QMenuBar { background: %1; color: %2; font-family: \"%3\"; font-size: 13px; border-bottom: 1px solid %4; }"
        "QMenuBar::item { padding: 4px 10px; background: transparent; border-radius: 6px; }"
        "QMenuBar::item:selected { background: %5; }")
        .arg(css(color("panel")), css(color("text")), roles.value("sans").toString(), css(color("border")), css(color("field"))));
  }
  const auto theme = CanvasTheme::fromRoles(roles);
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
void EditorWindow::layoutCatalog() {
  if (!catalogPanel_ || !dockHost_ || !dockHost_->centralWidget() || !catalogPanel_->rootObject()) { return; }
  const auto area = dockHost_->centralWidget()->geometry();
  const int width = std::min(qCeil(catalogPanel_->rootObject()->implicitWidth()), area.width());
  catalogPanel_->setGeometry(area.left(), area.top(), width, area.height());
  catalogPanel_->raise();
}
void EditorWindow::placeStatusBar() {
  if (!statusBar_ || !statusColumn_ || !outputDock_ || !outputDock_->widget()) { return; }
  auto *panelLayout = qobject_cast<QBoxLayout *>(outputDock_->widget()->layout());
  if (!panelLayout) { return; }
  if (!outputDock_->isHidden()) {
    if (panelLayout->indexOf(statusBar_) < 0) {
      statusColumn_->removeWidget(statusBar_);
      panelLayout->insertWidget(0, statusBar_);
    }
  } else if (statusColumn_->indexOf(statusBar_) < 0) {
    panelLayout->removeWidget(statusBar_);
    statusColumn_->addWidget(statusBar_);
  }
  statusBar_->show();
}
void EditorWindow::resizeEvent(QResizeEvent *event) {
  if (!tabOwner_) { QMainWindow::resizeEvent(event); return; }
  QMainWindow::resizeEvent(event);
  nodeCatalog_.setWindowHeight(height());
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
        catalogPanel_->show();
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
            catalogPanel_->show();
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
    if (name == "runtimes") {
        setup_.showAllRuntimes();
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
    dialog->setObjectName("setup-dialog");
    dialog->setWindowTitle(tr("Runtimes and packs"));
    auto *content = createOverlayDialog(dialog, engine_, {{"controller", QVariant::fromValue(&setup_)}},
                                        QUrl("qrc:/qt/qml/NodeTool/NodeEditor/SetupPanel.qml"));
    if (content->rootObject()) {
        connect(content->rootObject(), SIGNAL(closeRequested()), dialog,
                SLOT(close()));
    }
    connect(dialog, &QDialog::finished, &setup_,
            &node_editor::SetupController::cancel);
    showOverlayDialog(dialog, content, this, content->sizeHint());
    if (name == "templates") {
        setup_.browseTemplates();
    } else {
        setup_.refresh();
    }
}

// Projection is coalesced to once per turn. Imperative entry points that read the
// scene in the same turn as a document command project first. QML property
// getters do not, so bindings re-evaluated per command cannot force projection.
void nodetool::EditorWindow::ensureProjected() const {
    if (refreshPending_ && tabOwner_) {
        const_cast<EditorWindow *>(this)->refresh();
    }
}

void nodetool::EditorWindow::requestRefresh() {
    if (refreshPending_) {
        return;
    }
    refreshPending_ = true;
    QTimer::singleShot(0, this, [this] {
        syncPackSetup();
        if (refreshPending_) {
            refresh();
        }
    });
    // The panel flush runs a still pending projection first, so panels follow
    // an edit in the next pass with one emit.
    schedulePanelChanged();
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
