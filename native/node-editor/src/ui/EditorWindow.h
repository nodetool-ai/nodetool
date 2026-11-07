#pragma once
#include <QElapsedTimer>
#include <QHash>
#include <QTimer>
#include <optional>
#include "server/SetupController.h"
#include "server/PackSetup.h"
#include "document/WorkflowDocument.h"
#include "graph/WorkflowGraphModel.h"
#include "server/WorkflowSession.h"
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
#include "server/WorkflowVersions.h"
#include "runtime/ChatSession.h"
#include <QJsonArray>
#include <QMainWindow>
#include <QPointer>
class QTimer;
class QMenu;
class QDialog;
class QQmlEngine;
class QQuickWidget;
class QDockWidget;
class QGraphicsView;
class QStackedWidget;
namespace nodetool {
namespace node_editor { class LineageLayer; }
class EditorScene;
class InlinePropertyPresenter;
class InlineTitlePresenter;
class CanvasMediaPresenter;
class CanvasDropController;
class CompatibleNodePicker;
class EditorWindow final : public QMainWindow {
  Q_OBJECT
  Q_PROPERTY(bool guideStarted READ guideStarted NOTIFY panelChanged)
  Q_PROPERTY(QVariantList guideReadiness READ guideReadiness NOTIFY panelChanged)
  Q_PROPERTY(bool guideVisible READ guideVisible NOTIFY panelChanged)
  Q_PROPERTY(bool emptyCanvas READ emptyCanvas NOTIFY panelChanged)
  Q_PROPERTY(nodetool::node_editor::SetupController* setup READ setup CONSTANT)
    Q_PROPERTY(nodetool::node_editor::PackSetup* packSetup READ packSetup CONSTANT)
  Q_PROPERTY(QVariantList workflowTabs READ workflowTabs NOTIFY tabsChanged)
    Q_PROPERTY(QVariantList canvasStrips READ canvasStrips NOTIFY tabsChanged)
  Q_PROPERTY(int activeTab READ activeTab NOTIFY tabsChanged)
    Q_PROPERTY(QString projectName READ projectName NOTIFY tabsChanged)
  Q_PROPERTY(QString selection READ selection NOTIFY panelChanged)
  Q_PROPERTY(quint64 documentEpoch READ documentEpoch NOTIFY documentEpochChanged)
  Q_PROPERTY(quint64 credentialsEpoch READ credentialsEpoch NOTIFY credentialsEpochChanged)
  Q_PROPERTY(int selectedCount READ selectedCount NOTIFY panelChanged)
  Q_PROPERTY(bool selectionDisabled READ selectionDisabled NOTIFY panelChanged)
  Q_PROPERTY(bool selectionMostlyDisabled READ selectionMostlyDisabled NOTIFY panelChanged)
  Q_PROPERTY(QVariantList catalog READ catalog NOTIFY catalogChanged)
  Q_PROPERTY(QVariantList properties READ properties NOTIFY panelChanged)
  Q_PROPERTY(bool readOnly READ readOnly NOTIFY panelChanged)
  Q_PROPERTY(QString readOnlyReason READ readOnlyReason NOTIFY panelChanged)
  Q_PROPERTY(QString saveState READ saveState NOTIFY panelChanged)
  Q_PROPERTY(QString serverSaveState READ serverSaveState NOTIFY panelChanged)
  Q_PROPERTY(bool serverSyncAvailable READ serverSyncAvailable NOTIFY panelChanged)
  Q_PROPERTY(bool serverSyncNeedsAttention READ serverSyncNeedsAttention NOTIFY panelChanged)
  Q_PROPERTY(bool hasUnsavedChanges READ hasUnsavedChanges NOTIFY panelChanged)
  Q_PROPERTY(QString connectionState READ connectionState NOTIFY panelChanged)
  Q_PROPERTY(QString message READ message NOTIFY panelChanged)
  Q_PROPERTY(nodetool::node_editor::DynamicPortsController* dynamicPorts READ dynamicPorts CONSTANT)
  Q_PROPERTY(nodetool::node_editor::GenerationHistory* generationHistory READ generationHistory CONSTANT)
  Q_PROPERTY(QString pinnedGeneration READ pinnedGeneration NOTIFY panelChanged)
  Q_PROPERTY(QStringList replayGenerations READ replayGenerations NOTIFY panelChanged)
  Q_PROPERTY(bool browserVisible READ browserVisible NOTIFY panelChanged)
  Q_PROPERTY(QVariantList outputMedia READ outputMedia NOTIFY mediaChanged)
  Q_PROPERTY(bool runActive READ runActive NOTIFY panelChanged)
  Q_PROPERTY(bool outputVisible READ outputVisible NOTIFY panelChanged)
  Q_PROPERTY(bool catalogVisible READ catalogVisible NOTIFY panelChanged)
  // Space or a pane double-click arms the catalog to add at that canvas point, as the web node menu does.
  Q_PROPERTY(bool catalogAtPointer READ catalogAtPointer NOTIFY catalogPlacementChanged)
  // Recently added node types, which the catalog ranks first (web stores/RecentNodesStore.ts).
  Q_PROPERTY(QStringList catalogRecent READ catalogRecent NOTIFY catalogRecentChanged)
  Q_PROPERTY(bool inspectorVisible READ inspectorVisible NOTIFY panelChanged)
  Q_PROPERTY(QString workflowName READ workflowName NOTIFY panelChanged)
  Q_PROPERTY(QString graphSummary READ graphSummary NOTIFY panelChanged)
  Q_PROPERTY(QVariantMap selectionInfo READ selectionInfo NOTIFY panelChanged)
  Q_PROPERTY(int zoomPercent READ zoomPercent NOTIFY zoomChanged)
  Q_PROPERTY(QVariantList catalogCategories READ catalogCategories CONSTANT)
  Q_PROPERTY(bool miniMapVisible READ miniMapVisible NOTIFY panelChanged)
  Q_PROPERTY(QVariantMap systemStats READ systemStats NOTIFY panelChanged)
  Q_PROPERTY(QString connectionStatus READ connectionStatus NOTIFY panelChanged)
  Q_PROPERTY(int nodeCount READ nodeCount NOTIFY panelChanged)
  Q_PROPERTY(int edgeCount READ edgeCount NOTIFY panelChanged)
  Q_PROPERTY(int queuedCount READ queuedCount NOTIFY panelChanged)
  Q_PROPERTY(bool queueAvailable READ queueAvailable NOTIFY panelChanged)
    Q_PROPERTY(bool canUndo READ canUndo NOTIFY panelChanged)
    Q_PROPERTY(bool canRedo READ canRedo NOTIFY panelChanged)
    Q_PROPERTY(QString documentSaveStatus READ documentSaveStatus NOTIFY panelChanged)
    Q_PROPERTY(bool workflowRenamable READ workflowRenamable NOTIFY panelChanged)
    Q_PROPERTY(bool chatVisible READ chatVisible NOTIFY panelChanged)
public:
    nt::chat::ChatSession *chatSession();
    Q_INVOKABLE void askAgent(const QString &message);
    Q_SLOT void askRunAgent(const QString &runId, const QString &spanId = {});
    Q_SLOT void toggleChat();
    Q_INVOKABLE void beginChatGeometry();
    Q_INVOKABLE void resetChatPosition();
    Q_INVOKABLE void changeChatGeometry(int dx, int dy, int edges, bool finished);
  explicit EditorWindow(QWidget *parent = nullptr);
  ~EditorWindow() override;
  bool guideStarted() const { return guideStarted_; }
  bool guideVisible() const { return session_.connected() && setup_.firstWorkflowEligible() && !guideDismissed_ && (emptyCanvas() || guideStarted_); }
  QVariantList guideReadiness() const;
  bool emptyCanvas() const { return document_.nodes().isEmpty(); }
  node_editor::SetupController *setup() { return &setup_; }
    node_editor::PackSetup *packSetup() { return tabOwner_ ? &tabOwner_->packSetup_ : &packSetup_; }
    void syncPackSetup();
  Q_INVOKABLE void setupAction(const QString &name);
  QVariantList workflowTabs() const;
  int activeTab() const;
    QVariantList canvasStrips() const;
    Q_INVOKABLE void activateSurface(int index);
    Q_INVOKABLE bool closeSurface(int index);
    void flushChild();
    void closeChildSurfaces();
  Q_INVOKABLE void newTab();
  Q_INVOKABLE void activateTab(int index);
  Q_INVOKABLE bool closeTab(int index);
    // Workspace tab indices count the tabs of the active project, as the web
    // tab bar shows them. See web/src/stores/WorkspaceTabsStore.ts.
    QString projectName() const;
    Q_INVOKABLE void dropTab(int source, int target, bool after);
    Q_INVOKABLE void showTabMenu(int index, const QPointF &global);
    Q_INVOKABLE void showProjectMenu(const QPointF &global);
    Q_INVOKABLE void closeOtherTabs(int index);
    Q_INVOKABLE void closeAllTabs();
    Q_INVOKABLE void renameTab(int index, const QString &name);
    Q_INVOKABLE void showTabToolTip(const QString &text, const QPointF &global);
    Q_INVOKABLE void setTabStripOffset(qreal offset);
    Q_INVOKABLE qreal tabStripOffset() const;
    void selectAdjacentTab(int step);
    void selectProject(const QString &project);
  Q_INVOKABLE void openChild();
  void showLinkedWorkflows();
  void syncChild();
  void refreshChildReferences();
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
  Q_INVOKABLE bool pinGeneration(const QString &id);
  Q_INVOKABLE bool toggleReplayGeneration(const QString &id);
  Q_INVOKABLE bool clearReplayGenerations();
  node_editor::DynamicPortsController *dynamicPorts() { return activeEditor() == this ? &dynamicPorts_ : activeEditor()->dynamicPorts(); }
  node_editor::WorkflowBrowser *workflowBrowser() { return activeEditor() == this ? &browser_ : activeEditor()->workflowBrowser(); }
  bool browserVisible() const;
  Q_INVOKABLE void openWorkflow(const QString &id);
  Q_INVOKABLE void deleteWorkflow(const QString &id, const QString &name);
  QVariantList outputMedia() const { return activeEditor() == this ? outputMedia_ : activeEditor()->outputMedia(); }
  bool runActive() const;
  bool outputVisible() const;
  bool catalogVisible() const;
  bool inspectorVisible() const;
  QString workflowName() const;
  QString graphSummary() const;
  QVariantList catalogCategories() const;
  bool miniMapVisible() const;
  // The web hides the mini-map until the user turns it on, and keeps the choice
  // for every workflow. See web/src/stores/MiniMapStore.ts.
  Q_INVOKABLE void setMiniMapVisible(bool visible);
  QVariantMap systemStats() const;
  // The connection as the web status bar names it: connected, offline or idle.
  QString connectionStatus() const;
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
    Q_INVOKABLE void renameWorkflow(const QString &name);
    bool chatVisible() const;
  QVariantMap selectionInfo() const;
  int zoomPercent() const;
    EditorScene *scene() const {
        if (activeEditor() != this) {
            return activeEditor()->scene();
        }
        ensureProjected();
        return scene_;
    }
  Q_INVOKABLE void authoredAction(const QString &id, const QString &command, quint64 epoch, quint64 credentials);
  Q_INVOKABLE void styleOutputMarkdown(QObject *document, const QColor &link, const QColor &codeSurface, const QFont &codeFont);
  Q_INVOKABLE QString iconPath(const QString &name) const;
  Q_INVOKABLE void showToolTip(const QString &text);
  bool readOnly() const { return !readOnlyReason().isEmpty(); }
  QString readOnlyReason() const;
  Q_INVOKABLE void presentation(const QVariantMap &roles);
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
  bool saveFile(const QString &path);
  Q_INVOKABLE void addNode(const QString &type);
  Q_INVOKABLE void dragNode(const QString &type);
  bool catalogAtPointer() const { return activeEditor() == this ? catalogPoint_.has_value() : activeEditor()->catalogAtPointer(); }
  Q_INVOKABLE void cancelCatalogPlacement();
  Q_INVOKABLE void focusCanvas();
  QStringList catalogRecent() const;
  Q_INVOKABLE void setProperty(const QString &name, const QVariant &value);
  Q_INVOKABLE bool commitProperty(const QString &nodeId, const QString &name, const QVariant &value);
  Q_INVOKABLE bool removeProperty(const QString &nodeId, const QString &name);
  Q_INVOKABLE void action(const QString &name);
  // The More button of the card toolbar opens the node context menu below it.
  Q_INVOKABLE void showNodeMenu(const QPointF &global);
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
  void tabsChanged();
    void tabRenameRequested(int index);
  void documentEpochChanged();
  void credentialsEpochChanged();
  void panelChanged();
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
  void showDynamicPortDialog(const QString &id, bool output, const QString &name, const QRectF &sceneAnchor);
  void clearDynamicPortDialogs();
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
  // Web useAddConnectedNode: a node of `type` beside `sourceId`'s output, wired into `targetPort`.
  bool addConnectedNode(const QString &sourceId, const QString &outputName, const QString &type, const QString &targetPort);
  void autoLayout(bool selectedOnly);
  void refresh();
  void showBrowser(bool visible);
  void loadBrowser();
  void syncRuntimePreviews();
  QStringList selectedIds() const;
  QList<bool> selectedRunnableStates() const;
  bool singleRunnableCardSelected() const;
  QQuickWidget *panel(const QString &file);
  Q_SLOT void layoutOverlays();
  void syncInspector();
  // Applies a node click or a programmatic selection to the inspector. It does
  // nothing when the selection change already synced the inspector.
  void inspectNode(const QString &resourceId);
  // Each panelChanged() makes QML evaluate every panel binding again. All
  // changes in one event-loop pass share one deferred emit.
  void schedulePanelChanged();
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
  bool contextAction(const QString &name);
  bool selectConnected(const QString &direction);
  void selectSameType(const QString &nodeId);
  void convertNodeType(const QString &nodeId, const QString &type, const QString &inputName);
  QPointer<QQuickWidget> contextMenuHost_;
  QPointer<QQuickWidget> findPanel_;
  QPointer<QObject> viewAnimation_;

    node_editor::PackSetup packSetup_;
    QUrl packOrigin_;
    QString packToken_, packUser_;
  node_editor::SetupController setup_;
  QPointer<QDialog> setupDialog_;
  bool guideStarted_ = false, guideDismissed_ = false;
  QQuickWidget *setupGuide_ = nullptr;
  QQmlEngine *engine_ = nullptr;
  QMainWindow *dockHost_ = nullptr;
  QDockWidget *catalogDock_ = nullptr;
  QDockWidget *inspectorDock_ = nullptr;
    nt::chat::ChatSession chat_;
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
  QQuickWidget *selectionOverlay_ = nullptr;
  // True while the selection toolbar floats over its card instead of the canvas top.
  bool selectionToolbarFloating_ = false;
  InlinePropertyPresenter *inlinePresenter_ = nullptr;
  InlineTitlePresenter *inlineTitle_ = nullptr;
  CanvasMediaPresenter *canvasMedia_ = nullptr;
  CanvasDropController *canvasDrops_ = nullptr;
  CompatibleNodePicker *compatiblePicker_ = nullptr;
  QQuickWidget *viewportOverlay_ = nullptr;
  bool inspectorDismissed_ = false;
  bool catalogAutoHidden_ = false;
  bool miniMapVisible_ = false;
  node_editor::WorkflowDocument document_;
  node_editor::DynamicPortsController dynamicPorts_;
  node_editor::WorkflowBrowser browser_;
  QDockWidget *browserDock_ = nullptr;
  bool browserRestoreCatalog_ = false;
  bool browserLoadingProjects_ = false;
  quint64 browserEpoch_ = 0;
  node_editor::WorkflowSession session_;
  node_editor::WorkflowVersions versions_{&session_, &document_};
  node_editor::RunOutputModel runOutput_;
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
