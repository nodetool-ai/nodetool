#pragma once
#include <QElapsedTimer>
#include <QHash>
#include <QSet>
#include <QTimer>
#include <optional>
#include "interfaces/DocumentTabs.h"
#include "interfaces/GenerationActivity.h"
#include "interfaces/NodeCatalog.h"
#include "interfaces/NodeInfo.h"
#include "interfaces/NodeInspector.h"
#include "interfaces/Notifications.h"
#include "interfaces/PanelLayout.h"
#include "interfaces/StatusModel.h"
#include "interfaces/EditorCommands.h"
#include "interfaces/Selection.h"
#include "interfaces/RunState.h"
#include "interfaces/Viewport.h"
#include "interfaces/FirstWorkflowGuide.h"
#include "interfaces/ChatWindow.h"
#include "interfaces/WorkflowHeader.h"
#include "server/SetupController.h"
#include "server/PackSetup.h"
#include "document/WorkflowDocument.h"
#include "graph/WorkflowGraphModel.h"
#include "server/WorkflowSession.h"
#include "run/BugReport.h"
#include "run/RunOutputModel.h"
#include "run/RunTraceController.h"
#include "run/NodeRuntimeModel.h"
#include "media/MediaResolver.h"
#include "properties/DynamicPortsController.h"
#include "properties/ModelPickerController.h"
#include "properties/AssetPickerController.h"
#include "properties/ResourcePickerController.h"
#include "properties/DocumentPickerController.h"
#include "server/WorkflowBrowser.h"
#include "library/LibraryBrowser.h"
#include "server/WorkflowVersions.h"
#include "runtime/ChatSession.h"
#include <QDateTime>
#include <QJsonArray>
#include "run/PreviewSourceAssets.h"
#include <QMainWindow>
#include <QPointer>
class QTimer;
class QMenu;
class QDialog;
class QQmlEngine;
class QQuickWidget;
class QDockWidget;
class QBoxLayout;
class QGraphicsView;
class QStackedWidget;
namespace nodetool {
namespace node_editor { class LineageLayer; }
class EditorScene;
class InlinePropertyPresenter;
class InlineTitlePresenter;
class CanvasMediaPresenter;
class CardMediaLoader;
class CanvasDropController;
class CompatibleNodePicker;
class EditorWindow final : public QMainWindow {
  Q_OBJECT
  Q_PROPERTY(bool emptyCanvas READ emptyCanvas NOTIFY panelChanged)
  Q_PROPERTY(nodetool::node_editor::SetupController* setup READ setup CONSTANT)
  Q_PROPERTY(QString saveState READ saveState NOTIFY panelChanged)
  Q_PROPERTY(QString serverSaveState READ serverSaveState NOTIFY panelChanged)
  Q_PROPERTY(bool serverSyncAvailable READ serverSyncAvailable NOTIFY panelChanged)
  Q_PROPERTY(bool serverSyncNeedsAttention READ serverSyncNeedsAttention NOTIFY panelChanged)
  Q_PROPERTY(bool hasUnsavedChanges READ hasUnsavedChanges NOTIFY panelChanged)
  Q_PROPERTY(QVariantList outputMedia READ outputMedia NOTIFY mediaChanged)
  Q_PROPERTY(bool runActive READ runActive NOTIFY panelChanged)
  // Space or a pane double-click arms the catalog to add at that canvas point, as the web node menu does.
  Q_PROPERTY(bool catalogAtPointer READ catalogAtPointer NOTIFY catalogPlacementChanged)
  Q_PROPERTY(QString graphSummary READ graphSummary NOTIFY panelChanged)
public:
    nt::chat::ChatSession *chatSession();
    Q_INVOKABLE void askAgent(const QString &message);
    Q_SLOT void askRunAgent(const QString &runId, const QString &spanId = {});
    Q_SLOT void toggleChat();
    // web/src/config/shortcuts.ts newChat and focusChatComposer, handled by
    // ChatView.tsx. Both open the chat when it is closed.
    void newChatConversation();
    void focusChatComposer();
    void beginChatGeometry();
    void resetChatPosition();
    void changeChatGeometry(int dx, int dy, int edges, bool finished);
  explicit EditorWindow(QWidget *parent = nullptr);
  ~EditorWindow() override;
  bool guideStarted() const { return guideStarted_; }
  bool guideVisible() const { return session_.connected() && setup_.firstWorkflowEligible() && !guideDismissed_ && (emptyCanvas() || guideStarted_); }
  QVariantList guideReadiness() const;
  bool emptyCanvas() const { return document_.nodes().isEmpty(); }
  node_editor::SetupController *setup() { return &setup_; }
    node_editor::PackSetup *packSetup() { return tabOwner_ ? &tabOwner_->packSetup_ : &packSetup_; }
    // The Generations panel's list, shared by every tab and held by the root window.
    node_editor::GenerationActivity *generationActivity() { return tabOwner_ ? &tabOwner_->generations_ : &generations_; }
    // The root window has no panels of its own, so it returns the active tab's.
    node_editor::NodeCatalog *nodeCatalog() { return activeEditor() == this ? &nodeCatalog_ : activeEditor()->nodeCatalog(); }
    node_editor::DocumentTabs *documentTabs() { return activeEditor() == this ? &documentTabs_ : activeEditor()->documentTabs(); }
    node_editor::Notifications *notificationList() { return activeEditor() == this ? &notificationList_ : activeEditor()->notificationList(); }
    node_editor::WorkflowHeader *workflowHeader() { return activeEditor() == this ? &workflowHeader_ : activeEditor()->workflowHeader(); }
    node_editor::StatusModel *statusModel() { return activeEditor() == this ? &statusModel_ : activeEditor()->statusModel(); }
    node_editor::PanelLayout *panelLayout() { return activeEditor() == this ? &panelLayout_ : activeEditor()->panelLayout(); }
    node_editor::EditorCommands *editorCommands() { return activeEditor() == this ? &editorCommands_ : activeEditor()->editorCommands(); }
    node_editor::Viewport *viewport() { return activeEditor() == this ? &viewport_ : activeEditor()->viewport(); }
    node_editor::FirstWorkflowGuide *firstWorkflowGuide() { return activeEditor() == this ? &firstWorkflowGuide_ : activeEditor()->firstWorkflowGuide(); }
    node_editor::RunState *runState() { return activeEditor() == this ? &runState_ : activeEditor()->runState(); }
    node_editor::NodeInspector *nodeInspector() { return activeEditor() == this ? &nodeInspector_ : activeEditor()->nodeInspector(); }
    void syncPackSetup();
  void setupAction(const QString &name);
  QVariantList workflowTabs() const;
  int activeTab() const;
    QVariantList canvasStrips() const;
    void activateSurface(int index);
    bool closeSurface(int index);
    void flushChild();
    void closeChildSurfaces();
  void newTab();
  void activateTab(int index);
  bool closeTab(int index);
    // Workspace tab indices count the tabs of the active project, as the web
    // tab bar shows them. See web/src/stores/WorkspaceTabsStore.ts.
    QString projectName() const;
    void dropTab(int source, int target, bool after);
    void showTabMenu(int index, const QPointF &global);
    void showProjectMenu(const QPointF &global);
    Q_INVOKABLE void closeOtherTabs(int index);
    Q_INVOKABLE void closeAllTabs();
    void renameTab(int index, const QString &name);
    void showTabToolTip(const QString &text, const QPointF &global);
    void setTabStripOffset(qreal offset);
    qreal tabStripOffset() const;
    void selectAdjacentTab(int step);
    void selectProject(const QString &project);
  Q_INVOKABLE void openChild();
  void showLinkedWorkflows();
  void syncChild();
  void refreshChildReferences();
  // WorkflowLoader and AppLoader: loads the picked workflow or app and stores
  // its id and a copy of its graph on the node in one undo step.
  void loadChildSource(const QString &nodeId, const QString &kind, const QString &sourceId);
  // ComfyWorkflowLoader.tsx: the Run ComfyUI Workflow node's load dialog.
  void showComfyWorkflowDialog(const QString &nodeId);
  // CompositorEditorModal.tsx: the Compositor node's layout editor.
  void showCompositorLayoutDialog(const QString &nodeId);
  void restoreTabs();
  void persistTabs() const;
  EditorWindow *activeEditor() const;

  node_editor::WorkflowDocument *document() { return activeEditor() == this ? &document_ : activeEditor()->document(); }
  quint64 documentEpoch() const { return activeEditor() == this ? documentEpoch_ : activeEditor()->documentEpoch(); }
  quint64 credentialsEpoch() const { return activeEditor() == this ? credentialsEpoch_ : activeEditor()->credentialsEpoch(); }
  node_editor::WorkflowSession *session() { return activeEditor() == this ? &session_ : activeEditor()->session(); }
  node_editor::RunOutputModel *runOutput() { return activeEditor() == this ? &runOutput_ : activeEditor()->runOutput(); }
  node_editor::GenerationHistory *generationHistory() { return session()->generationHistory(); }
  QString pinnedGeneration() const;
  QStringList replayGenerations() const;
  bool pinGeneration(const QString &id);
  bool toggleReplayGeneration(const QString &id);
  bool clearReplayGenerations();
  node_editor::DynamicPortsController *dynamicPorts() { return activeEditor() == this ? &dynamicPorts_ : activeEditor()->dynamicPorts(); }
  node_editor::WorkflowBrowser *workflowBrowser() { return activeEditor() == this ? &browser_ : activeEditor()->workflowBrowser(); }
  bool browserVisible() const;
  bool libraryVisible() const;
  void openWorkflow(const QString &id);
  void deleteWorkflow(const QString &id, const QString &name);
  QVariantList outputMedia() const { return activeEditor() == this ? outputMedia_ : activeEditor()->outputMedia(); }
  bool runActive() const;
  // The run queue the queue overlay shows through RunState. A change shows once the queue holds
  // for shownQueueDelayMs, so a burst of short preview runs does not flicker it.
  // The toolbars and the inspector read the same debounced state.
  QVariantList shownQueue() const { return shownQueue_; }
  bool shownRunActive() const { return shownActivity_.second; }
  static constexpr int shownQueueDelayMs = 300;
  bool outputVisible() const;
  bool catalogVisible() const;
  bool inspectorVisible() const;
  QString workflowName() const;
  QString graphSummary() const;
  bool miniMapVisible() const;
  // The web hides the mini-map until the user turns it on, and keeps the choice
  // for every workflow. See web/src/stores/MiniMapStore.ts.
  void setMiniMapVisible(bool visible);
  QString miniMapColorMode() const;
  // Accepts "default" and "type", keeps the choice for every workflow and remembers it.
  void setMiniMapColorMode(const QString &mode);
  // The color settings menu ("colors") or the node type legend ("legend"), below
  // the given global point, which is the bottom right of the button that opened it.
  void showMiniMapPopup(const QString &kind, const QPointF &anchorGlobal);
  void closeMiniMapPopup();
  bool zoomIsPreset() const;
  QVariantMap systemStats() const;
  // The connection as the web status bar names it: connected, connecting, offline or idle.
  QString connectionStatus() const;
  // "Reconnecting… (attempt N)" while the session retries and "Connection failed" after it gave up.
  QString connectionDetail() const;
  int nodeCount() const;
  int edgeCount() const;
  int queuedCount() const;
  bool queueAvailable() const;
    bool canUndo() const;
    bool canRedo() const;
    // The document bar's save readout, as web/src/components/ui_primitives/SaveStatus.tsx
    // names it: saved, saving, dirty, error or readOnly, plus the server's
    // conflict and deleted states.
    QString documentSaveStatus() const;
    bool workflowRenamable() const;
    void renameWorkflow(const QString &name);
    bool chatVisible() const;
    QVariantList notifications() const;
    int unreadNotifications() const;
    // Adds a notification for every tab. type is error, warning, info or success.
    void notify(const QString &type, const QString &content);
    // Opens the notification list below the bell and marks every notification read.
    void showNotifications(const QPointF &global);
    // The web settings page of the connected server (SettingsHeaderButton.tsx).
    void openSettings();
    void copyText(const QString &text);
    // Opens the prefilled GitHub issue the web Report controls open, with this
    // tab's workflow and latest run filled in when the context has none.
    void reportBug(node_editor::BugReportContext context);
    // The per-run cost the server's preflight reports: available, caption.
    QVariantMap costEstimate() const;
    // Runs the selection `runs` times, each after the previous one completes
    // (web hooks/nodes/useRunSelectedNodes.ts).
    void runSelectedNodes(int runs);
    // The inspector's repeated Run selected: current and total, or empty.
    QVariantMap runProgress() const;
    bool traceVisible() const;
    bool versionsVisible() const;
    // The queue overlay lists its jobs: opened from the status bar or expanded.
    bool queueVisible() const;
    bool generationsVisible() const;
    // Loads the account's generations.list page into the Generations panel.
    void refreshGenerations();
    // Opens a workflow document ({name, graph}) in a new unsaved tab.
    void openWorkflowDocument(const QJsonObject &workflow);
    // Opens the Report issue for a failed job in the queue history.
    void reportJob(const QString &jobId);
    // A status bar tab: opens its panel, or closes it when it is the open one (PanelBottom.tsx).
    void toggleStatusView(const QString &view);
  QVariantMap selectionInfo() const;
  int zoomPercent() const;
    EditorScene *scene() const {
        if (activeEditor() != this) {
            return activeEditor()->scene();
        }
        ensureProjected();
        return scene_;
    }
  void authoredAction(const QString &id, const QString &command, quint64 epoch, quint64 credentials);
  Q_INVOKABLE void showToolTip(const QString &text);
  bool readOnly() const { return !readOnlyReason().isEmpty(); }
  QString readOnlyReason() const;
  void presentation(const QVariantMap &roles);
  bool confirmOpen();
  QString selection() const { return activeEditor() == this ? selected_ : activeEditor()->selection(); }
  int selectedCount() const { return activeEditor() == this ? selectedIds().size() : activeEditor()->selectedCount(); }
  bool selectionDisabled() const;
  bool selectionMostlyDisabled() const;
  QVariantList catalog() const;
  QVariantList properties() const;
  QString saveState() const;
  QString serverSaveState() const;
  bool serverSyncAvailable() const { if (activeEditor() != this) return activeEditor()->serverSyncAvailable(); return !session_.serverUrl().isEmpty() || serverSyncNeedsAttention(); }
  bool serverSyncNeedsAttention() const { if (activeEditor() != this) return activeEditor()->serverSyncNeedsAttention(); return session_.conflictPending() || session_.autosaveState() == "error"; }
    bool hasUnsavedChanges() const {
        if (activeEditor() != this) {
            return activeEditor()->hasUnsavedChanges();
        }
        if (inlineChild_ && childParent_) {
            return childParent_->hasUnsavedChanges() || document_.graph() != syncedChildGraph_;
        }
        return !document_.undoStack()->isClean() || session_.conflictPending()
            || (session_.serverBound() && session_.dirty());
    }
  QString connectionState() const { if (activeEditor() != this) return activeEditor()->connectionState(); return session_.connected() ? tr("Connected") : tr("Disconnected"); }
  QString localFilePath() const { return activeEditor() == this ? file_ : activeEditor()->localFilePath(); }
  QString message() const { return activeEditor() == this ? message_ : activeEditor()->message(); }
  bool openFile(const QString &path);
  // Opens a workflow file in its own tab, or switches to the tab that has it.
  void openFileInTab(const QString &path);
  // Opens a bundled example (a file under :/editor/examples) in its own tab, as an
  // unsaved workflow, so Save asks for a path.
  void openExample(const QString &resource);
  bool saveFile(const QString &path);
  void addNode(const QString &type);
  void dragNode(const QString &type);
  bool catalogAtPointer() const { return activeEditor() == this ? catalogPoint_.has_value() : activeEditor()->catalogAtPointer(); }
  Q_INVOKABLE void cancelCatalogPlacement();
  Q_INVOKABLE void focusCanvas();
  // The floating node menu (web components/node_menu/NodeMenu.tsx). It opens at
  // the armed pointer point, or in the canvas center without one.
  void openNodeMenu();
  void closeNodeMenu();
  // The menu header drag moves the menu inside the canvas area.
  void moveNodeMenu(qreal dx, qreal dy);
  bool nodeMenuVisible() const;
  QStringList catalogRecent() const;
  QStringList catalogFavorites() const;
  void toggleCatalogFavorite(const QString &type);
  void clearCatalogFavorites();
  void clearCatalogRecent();
  Q_INVOKABLE void setProperty(const QString &name, const QVariant &value);
  bool commitProperty(const QString &nodeId, const QString &name, const QVariant &value);
  bool removeProperty(const QString &nodeId, const QString &name);
  Q_INVOKABLE void action(const QString &name);
  // An action that the user started from a button, menu or key. Zoom, fit and Focus
  // moves then animate as the web does. action() alone moves the view at once, so
  // harnesses and tests that read the result straight away see the final view.
  void userAction(const QString &name);
  // The More button of the card toolbar opens the node context menu below it.
  void showNodeMenu(const QPointF &global);
  // Fits every node into the canvas area the floating toolbar leaves free, and
  // keeps it fitted across panel changes until the user moves the view.
  void fit();
  QRectF unobstructedViewport() const;
  bool selectNode(const QString &resourceId);
  // Theme.Scheme values are Dark 2 and Light 3 in NodeTool.UiPrimitives.
  void setDarkTheme(bool dark);
  void setCatalog(const QJsonArray &metadata);
  QString shortcutCommand(int key, Qt::KeyboardModifiers modifiers) const;
signals:
  void catalogPlacementChanged();
  void catalogRecentChanged();
  void catalogFavoritesChanged();
  void notificationsChanged();
  void costEstimateChanged();
  void tabsChanged();
  void documentEpochChanged();
  void credentialsEpochChanged();
  void panelChanged();
  void shownQueueChanged();
  void mediaChanged();
  void zoomChanged();
  void catalogChanged();
  // Tests observe that one selection change syncs the inspector once.
  void inspectorSynced();

protected:
  bool eventFilter(QObject *, QEvent *) override;
  void closeEvent(QCloseEvent *) override;
  void resizeEvent(QResizeEvent *) override;

private slots:
  void saveLocalCopyAs();
private:
  // An edit to rerun: the node, an uncommitted value of one of its properties
  // ({"name", "value"}, empty for a committed edit), and whether only an
  // in-process run may serve it.
  struct InstantEdit {
    QString node;
    QJsonObject draft;
    bool localOnly = false;
  };
  // Reruns an edited node and every node downstream of it. Upstream nodes
  // reuse their current generation (web buildDownstreamRunGraph).
  void instantRerun(const InstantEdit &edit);
  // Instant Update reruns every property edit. Without it, an edit from a card
  // body control still previews when the rerun runs in process, as the web's
  // live slider bodies do (web hooks/nodes/useLiveSliderWriter.ts).
  void scheduleInstantRerun(const QString &node, const QJsonObject &draft, bool cardBody, bool immediate);
  void previewCardEdit(const QJsonArray &commands);
  // Live property changes: a property edit made while a run is in progress
  // goes to that run, so a node that reads its properties while it runs,
  // such as a synthesis node, follows the edit at once.
  // Starts to track run `id` with the document's saved properties.
  void trackLiveRun(const QString &id);
  // Sends the saved properties that differ from what the tracked run has.
  void sendLiveEdits();
  // Sends one value that is not in the document yet, such as a slider draft.
  void sendLiveDraft(const QString &node, const QString &name, const QJsonValue &value);
  void setScrubbing(bool scrubbing);
  void showDynamicPortDialog(const QString &id, bool output, const QString &name, const QRectF &sceneAnchor);
  void clearDynamicPortDialogs();
  void showDynamicTypeMenu(const QString &id, const QString &name, const QRectF &sceneAnchor);
  QPointer<QDialog> dynamicPortDialog_;
  EditorWindow(QWidget *parent, EditorWindow *tabOwner);
  EditorWindow *tabOwner_ = nullptr;
  std::optional<QPointF> catalogPoint_;
  QString middleEdge_;
  QPoint middlePress_;
  void armCatalogPlacement(const QPointF &scenePosition);
  void rememberRecentNode(const QString &type);
  QList<EditorWindow *> tabs_;
  EditorWindow *activeEditor_ = nullptr;
  QStackedWidget *tabStack_ = nullptr;
  QString requestedWorkflow_;
  QPointer<EditorWindow> childParent_;
  QString childNode_;
    bool inlineChild_ = false;
    QPointer<EditorWindow> shownSurface_;
    QTimer *childWriteTimer_ = nullptr;
  QJsonObject syncedChildGraph_;
  quint64 childParentEpoch_ = 0;
  bool childSyncing_ = false;
  QUrl tabsOrigin_;
  QString tabsToken_, tabsUser_;
  bool tabsDark_ = true;
  void notifyTabs();
    QList<EditorWindow *> visibleTabs() const;
    QString projectKey() const;
    QString activeProject() const;
    void closeTabs(const QList<EditorWindow *> &targets, EditorWindow *keep);
    void installTabShortcuts();
    void harvestProjects(const QJsonArray &projects);
    void populateProjectMenu();
    QQuickWidget *tabBarWidget() const;
    QString assignedProject_;
    QJsonArray projects_;
    QString projectsAccount_;
    QHash<QString, QPointer<EditorWindow>> projectActive_;
    QPointer<QMenu> projectMenu_;
    QVariantList tabSignature_;
    qreal tabStripOffset_ = 0;
    bool discardApproved_ = false;
  bool confirmTabClose(bool closeAfterSave = false);
  bool closeAfterServerSave_ = false;
  quint64 documentEpoch_ = 0;
  quint64 credentialsEpoch_ = 0;
  void showWorkflowDetails(const QString &kind);
  void showServerSync();
  void showRunTrace();
  void showGenerations();
  // Loads a workflow document into this tab, with `file` as its file or none.
  bool openDocument(const QByteArray &json, const QString &file);
  void toggleQueue();
  void showCanvasDrops();
  QPointer<QDialog> canvasDropDialog_;
  bool canvasDropsPending_ = false;
  QPointer<QDialog> serverSyncDialog_;
  bool conflictPresented_ = false;
  void syncLineage();
  void scheduleLineage();
  bool lineagePending_ = false;
  node_editor::LineageLayer *lineage_ = nullptr;
  bool apply(const QJsonObject &command);
  bool knownNodeType(const QString &type) const;
  // clearOverlap moves the new card vertically off the top-level cards it would cover,
  // as a node menu add does (web hooks/useCreateNode.ts resolveVerticalOverlap).
  bool addNodeAt(const QString &type, const QPointF &position, bool clearOverlap = false);
  // The node type a quick-add command ("Add Prompt") creates, or empty.
  static QString quickAddNodeType(const QString &command) {
    if (command == QLatin1String("Add Prompt")) { return QStringLiteral("nodetool.text.Prompt"); }
    if (command == QLatin1String("Add Text to Image")) { return QStringLiteral("nodetool.image.TextToImage"); }
    if (command == QLatin1String("Add Text to Video")) { return QStringLiteral("nodetool.video.TextToVideo"); }
    if (command == QLatin1String("Add Agent")) { return QStringLiteral("nodetool.agents.Agent"); }
    return {};
  }
  // Web useAddConnectedNode: a node of `type` beside `sourceId`'s output, wired into `targetPort`.
  bool addConnectedNode(const QString &sourceId, const QString &outputName, const QString &type, const QString &targetPort);
  void autoLayout(bool selectedOnly);
  void refresh();
  void showBrowser(bool visible);
  void loadBrowser();
  // Lists the bundled examples by their first tag, as a popup menu at the cursor.
  void showExamplesMenu();
  // Adds an entry per bundled example to the menu, grouped by first tag. An entry opens
  // its example on this window, which passes it to the active tab.
  void addExampleActions(QMenu *menu);
  // The menu bar of the window that owns the tabs (EditorAppMenu.cpp).
  void installApplicationMenu();
  void showSystemInformation();
  void syncRuntimePreviews();
  void syncSourcePreviews();
  QStringList selectedIds() const;
  QList<bool> selectedRunnableStates() const;
  bool singleRunnableCardSelected() const;
  QQuickWidget *panel(const QString &file, const QVariantMap &properties = {});
  void syncNodeCatalog();
  void syncNodeInspector();
  void syncDocumentTabs();
  void syncNotifications();
  void syncChrome();
  // Copies the shown queue and the session state into the run interfaces.
  void syncRuns();
  // Copies the zoom and the mini-map color mode into the viewport interface.
  void syncViewport();
  Q_SLOT void layoutOverlays();
  void syncInspector();
  // Applies a node click or a programmatic selection to the inspector. It does
  // nothing when the selection change already synced the inspector.
  void inspectNode(const QString &resourceId);
  // Each panelChanged() makes QML evaluate every panel binding again. All
  // changes in one event-loop pass share one deferred emit.
  Q_SLOT void schedulePanelChanged();
  void flushPanelChanged();
  bool panelChangePending_ = false;
  // GenerationHistory copies the full document. Selection changes reuse it.
  bool historyWorkflowStale_ = true;
  bool selectingNode_ = false;
  void zoomBy(double factor);
  void zoomUnderCursor(double factor);
  void panBy(QPoint delta);
  static bool mouseNavigation();
  void applyFit();
  void revealSelection();
  // Moves the view the least distance that shows the card whole.
  void revealNode(const QString &resourceId);
  // The view that fits every node, as the zoom and the scene point at the viewport center.
  struct ViewTarget { double zoom = 1; QPointF center; };
  ViewTarget fitTarget() const;
  // Moves the view to the zoom and viewport-center scene point. It animates over
  // durationMs with the web's cubic ease, and lands at once for a zero duration,
  // reduced motion or a hidden window. Any earlier move is dropped.
  void moveViewTo(double zoom, const QPointF &viewCenter, int durationMs);
  void cancelViewAnimation();
  // The viewport center that puts a scene point in the middle of the canvas the overlays leave free.
  QPointF centerOnArea(const QPointF &scenePoint, double zoom) const;
  void zoomTo(double zoom);
  void fitView();
  void fitSelection();
  // The duration of a viewport move: the given one for an action that the user started, otherwise zero.
  int viewMs(int durationMs) const { return userViewInput_ ? durationMs : 0; }
  bool userViewInput_ = false;
  void focusSelectedNode();
  // ui_primitives Metrics.motionNormal, delivered with the presentation roles.
  int motionNormalMs_ = 200;
  // Queues one pass after a dock or window resize. A refit request makes fit
  // mode fit again. A selection alone never changes the zoom.
  void scheduleViewportSettle(bool refit = false);
  // The width the docked inspector takes from the canvas, or 0 when hidden.
  int inspectorInset() const;
  // The web slides the inspector over the canvas and pans only when it covers a
  // node, never changing the zoom (hooks/useClearInspectorOverlap.ts).
  // A programmatic selection has no pointer gesture to follow, so it pans at once.
  void clearInspectorOverlap(int inset, bool instant);
  bool fitActive_ = false;
  bool settlePending_ = false;
  bool refitRequested_ = false;
  bool revealPending_ = false;
  QSize settledViewport_;
  int settledInspectorInset_ = 0;
  void showMoreMenu();
  // Opens the chat with a draft that names the selected nodes (useChatAboutNodes.ts).
  void chatAboutSelection();
  // Floats the selection toolbar over the selected card, or at the top center of
  // the canvas for a group, a comment or several nodes.
  void positionSelectionToolbar();
  // NodeSelectionToolbar.tsx delays the card toolbar 200 ms (useDelayedVisibility) so a
  // click that starts a drag does not flash it. Each selected card has its own delay,
  // which restarts when the card is deselected or dragged.
  QHash<QString, qint64> toolbarSelectedAt_;
  QElapsedTimer toolbarClock_;
  QTimer toolbarDelay_;
  QJsonArray dragGroupCommands(const QJsonObject &positions, QtNodes::NodeId group, bool detach);
  void showActionMenu(const QString &kind, const QPoint &position);
  bool menuActionEnabled(const QString &name) const;
  // Context menus are Quick popups on a transparent overlay (EditorMenus.cpp).
  friend class ContextMenuBuilder;
  void showContextMenu(const QString &kind, const QPoint &globalPosition, const QString &nodeId = {}, const QString &edgeId = {}, const QPointF &scenePosition = {});
  void showFindPanel();
  void revealFound(const QString &resourceId);
  // NodeInfoPanel.tsx: Ctrl+I shows the first selected node's info beside it.
  void toggleNodeInfo();
  void closeNodeInfo();
  void syncNodeInfo();
  void positionNodeInfo();
  // Opens the node menu at a namespace path, with a search term.
  void openNodeMenuAt(const QStringList &path, const QString &term);
  void focusNode(const QString &resourceId);
  bool contextAction(const QString &name);
  bool selectConnected(const QString &direction);
  void selectSameType(const QString &nodeId);
  void convertNodeType(const QString &nodeId, const QString &type, const QString &inputName);
  QPointer<QQuickWidget> contextMenuHost_;
  QPointer<QQuickWidget> findPanel_;
  QPointer<QObject> viewAnimation_;

    node_editor::PackSetup packSetup_;
    // The root window's generations, which every tab's Generations panel reads
    // through generationActivity(). Owned by value, UI thread, destroyed with
    // the root window after its tabs and their panels.
    node_editor::GenerationActivity generations_;
    // What this tab's Catalog and NodeMenu panels read and do. Owned by value,
    // UI thread, destroyed with the tab after its panels (~EditorWindow deletes
    // them first).
    node_editor::NodeCatalog nodeCatalog_;
    // What this tab's Inspector panel, its property fields and its History tab
    // read and do. Owned by value, UI thread, destroyed with the tab after its
    // panels.
    node_editor::NodeInspector nodeInspector_;
    // What this tab's node info overlay (NodeInfoPanel.qml) reads and does.
    // Owned by value, UI thread, destroyed with the tab after its panels.
    node_editor::NodeInfo nodeInfo_;
    // What this tab's TabBar and CanvasTabStrip panels read and do, and what
    // its TabBar and notification list read about notifications. The tab
    // state lives in the root window; each tab copies it into its own objects.
    // Owned by value, UI thread, destroyed with the tab after its panels.
    node_editor::DocumentTabs documentTabs_;
    node_editor::Notifications notificationList_;
    // What this tab's HeaderRow reads about the document, and what its Rail
    // and HeaderRow read about open panels. Owned by value, UI thread,
    // destroyed with the tab after its panels.
    node_editor::WorkflowHeader workflowHeader_;
    node_editor::PanelLayout panelLayout_;
    // What this tab's StatusBar reads about the server and the graph. Owned by
    // value, UI thread, destroyed with the tab after its panels.
    node_editor::StatusModel statusModel_;
    // What this tab's canvas Toolbar, SelectionToolbar and group controls
    // read about commands, the selection and runs. Owned by value, UI thread,
    // destroyed with the tab.
    node_editor::EditorCommands editorCommands_;
    node_editor::Selection selection_;
    node_editor::RunState runState_;
    // What this tab's zoom readout, mini-map buttons and their popups read
    // about the view. Owned by value, UI thread, destroyed with the tab.
    node_editor::Viewport viewport_;
    // What this tab's first-workflow guide reads and does. Owned by value, UI
    // thread, destroyed with the tab.
    node_editor::FirstWorkflowGuide firstWorkflowGuide_;
    QUrl packOrigin_;
    QString packToken_, packUser_;
  node_editor::SetupController setup_;
  QPointer<QDialog> setupDialog_;
  bool guideStarted_ = false, guideDismissed_ = false;
  QQuickWidget *setupGuide_ = nullptr;
  QQmlEngine *engine_ = nullptr;
  QMainWindow *dockHost_ = nullptr;
  // The node library overlays the canvas column, as the fixed web left panel does.
  QPointer<QQuickWidget> catalogPanel_;
  // A child of dockHost_ over the canvas. Qt parent ownership deletes it.
  QPointer<QQuickWidget> nodeMenu_;
  void layoutCatalog();
  // Keeps the node menu inside the canvas area at `topLeft`, in dockHost_ coordinates.
  void placeNodeMenu(QPoint topLeft);
  // The status bar is the bottom panel's tab strip while the Output panel is open (PanelBottom.tsx).
  QQuickWidget *statusBar_ = nullptr;
  QBoxLayout *statusColumn_ = nullptr;
  void placeStatusBar();
  QVariantList notifications_;
  QDateTime notificationsSeen_;
  QPointer<QQuickWidget> notificationPopup_;
  QVariantMap costEstimate_;
  QTimer *costTimer_ = nullptr;
  void requestCostEstimate();
  void initializePanels();
  int runsTotal_ = 0, runsCurrent_ = 0;
  QString runsJob_;
  QDockWidget *inspectorDock_ = nullptr;
    nt::chat::ChatSession chat_;
    // What this tab's chat window (EditorChat.qml) asks of its frame. Owned by
    // value, UI thread, destroyed with the tab.
    node_editor::ChatWindow chatWindow_;
    QQuickWidget *chatOverlay_ = nullptr;
    bool chatVisible_ = false;
    void initializeChat();
    void initializeChatTools();
    void syncChatContext();
    void layoutChat(const QSize &available);
    void ensureChatConnected();
    QUrl chatOrigin_;
    QString chatToken_;
    bool chatConnected_ = false;

    QRect chatGesture_;
    bool chatGeometryActive_ = false;
    QList<QPointer<EditorWindow>> retainedChatHosts_;
    QPoint chatOffset_;
    QSize chatSize_{420, 2000};
  QQuickWidget *toolbarOverlay_ = nullptr;
  QQuickWidget *queueOverlay_ = nullptr;
  quint64 instantUpdateGeneration_ = 0;
  bool canvasReducedMotion_ = false;
  bool instantUpdate_ = false;
  // The latest edit made while an in-process run was active. It reruns when
  // that run settles, so the result follows the last edit.
  std::optional<InstantEdit> instantPending_;
  // The run that takes live property changes, or empty.
  QString liveRun_;
  // The saved properties of each node as liveRun_ has them: the document's
  // values when the run was submitted, then each value sent to it. A node
  // added after the submit is absent, because the run does not have it.
  QHash<QString, QJsonObject> liveProperties_;
  // Whether liveRun_ plays live audio until it is stopped.
  bool liveRunPlays_ = false;
  // True from a card slider preview until its last rerun settles. Running
  // animations stay still meanwhile, as the web's live-scrubbing class does.
  bool scrubbing_ = false;
  // True while instantRerun submits a preview run. runSubmitted fires inside
  // that call, so it can mark the run as silent.
  bool submittingPreview_ = false;
  // Preview runs not yet terminal. Their progress sets no message.
  QSet<QString> previewRuns_;
  // Whether any run, and a run of this workflow, is active in a queue.
  QPair<bool, bool> queueActivity(const QVariantList &queue) const;
  void updateShownQueue(bool settled);
  QVariantList shownQueue_;
  QPair<bool, bool> shownActivity_{false, false};
  QVariantList pendingQueue_;
  // Parented to this window. It fires when a queue change has held.
  QTimer *shownQueueTimer_ = nullptr;
  QQuickWidget *selectionOverlay_ = nullptr;
  // The node info panel, a child of view_ deleted by ~EditorWindow before
  // nodeInfo_. nodeInfoId_ is the node it shows, empty while it is hidden.
  QQuickWidget *nodeInfoOverlay_ = nullptr;
  QString nodeInfoId_;
  // True while the selection toolbar floats over its card instead of the canvas top.
  bool selectionToolbarFloating_ = false;
  InlinePropertyPresenter *inlinePresenter_ = nullptr;
  InlineTitlePresenter *inlineTitle_ = nullptr;
  CanvasMediaPresenter *canvasMedia_ = nullptr;
  CardMediaLoader *cardMediaLoader_ = nullptr;
  CanvasDropController *canvasDrops_ = nullptr;
  CompatibleNodePicker *compatiblePicker_ = nullptr;
  QQuickWidget *viewportOverlay_ = nullptr;
  QQuickWidget *miniMapControls_ = nullptr;
  QPointer<QQuickWidget> miniMapPopup_;
  QString miniMapColorMode_ = "default";
  bool inspectorDismissed_ = false;
  bool catalogAutoHidden_ = false;
  bool miniMapVisible_ = false;
  node_editor::WorkflowDocument document_;
  node_editor::DynamicPortsController dynamicPorts_;
  node_editor::WorkflowBrowser browser_;
  node_editor::LibraryBrowser library_;
  QDockWidget *browserDock_ = nullptr;
  QDockWidget *libraryDock_ = nullptr;
  bool browserRestoreCatalog_ = false;
  bool browserLoadingProjects_ = false;
  quint64 browserEpoch_ = 0;
  node_editor::WorkflowSession session_;
  node_editor::WorkflowVersions versions_{&session_, &document_};
  node_editor::RunOutputModel runOutput_;
  // Values that Preview nodes show without a run: the `value` of a wired input or constant node.
  node_editor::RunOutputModel sourcePreviews_;
  node_editor::PreviewSourceAssets previewAssets_;
  QJsonArray sourcePreviewValues_;
  node_editor::RunTraceController runTrace_;
  node_editor::NodeRuntimeModel runtime_;
  node_editor::MediaResolver mediaResolver_;
  node_editor::ModelPickerController modelPicker_;
  node_editor::AssetPickerController assetPicker_;
  node_editor::ResourcePickerController resourcePicker_;
    node_editor::DocumentPickerController documentPicker_;
  QDockWidget *outputDock_ = nullptr;
  WorkflowGraphModel model_;
  EditorScene *scene_ = nullptr;
  QGraphicsView *view_ = nullptr;
  QJsonArray metadata_;
  // Code snippets keyed by their menu node type, read from the generated
  // resource on the first catalog (scripts/generate-code-snippets.mjs).
  QHash<QString, QJsonObject> codeSnippets_;
  QString selected_, message_, file_, run_;
  QVariantList outputMedia_;
  QHash<QString, QVariant> runtimePreviewSources_;
  QString previewRun_;
  bool refreshPending_ = false;
    bool syncingSession_ = false;
    bool documentReplaced_ = false;
    void requestRefresh();
    void ensureProjected() const;
  void invalidateGesture();
  quint64 gestureEpoch_ = 0;
  bool gesture_ = false;
  QHash<QString, QPointF> gesturePositions_;
  bool panning_ = false;
  bool rubberBandSelectionPending_ = false;
  QTimer *runPanelTimer_ = nullptr;
  std::optional<QPointF> lastPaste_;
  QPoint pasteMenuPosition_;
  QPoint panPosition_;
  QJsonArray gestureCommands_;
};
} // namespace nodetool
