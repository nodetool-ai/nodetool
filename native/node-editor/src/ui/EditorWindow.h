#pragma once
#include <optional>
#include "server/SetupController.h"
#include "server/PackSetup.h"
#include "document/WorkflowDocument.h"
#include "graph/WorkflowGraphModel.h"
#include "server/WorkflowSession.h"
#include "run/RunOutputModel.h"
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
  Q_PROPERTY(QString selection READ selection NOTIFY panelChanged)
  Q_PROPERTY(quint64 documentEpoch READ documentEpoch NOTIFY documentEpochChanged)
  Q_PROPERTY(quint64 credentialsEpoch READ credentialsEpoch NOTIFY credentialsEpochChanged)
  Q_PROPERTY(int selectedCount READ selectedCount NOTIFY panelChanged)
  Q_PROPERTY(bool selectionDisabled READ selectionDisabled NOTIFY panelChanged)
  Q_PROPERTY(QVariantList catalog READ catalog NOTIFY panelChanged)
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
  Q_PROPERTY(bool inspectorVisible READ inspectorVisible NOTIFY panelChanged)
  Q_PROPERTY(QString workflowName READ workflowName NOTIFY panelChanged)
  Q_PROPERTY(QString graphSummary READ graphSummary NOTIFY panelChanged)
  Q_PROPERTY(QVariantMap selectionInfo READ selectionInfo NOTIFY panelChanged)
  Q_PROPERTY(int zoomPercent READ zoomPercent NOTIFY zoomChanged)
public:
    nt::chat::ChatSession *chatSession();
    Q_INVOKABLE void askAgent(const QString &message);
    Q_INVOKABLE void askRunAgent(const QString &runId);
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
  QVariantMap selectionInfo() const;
  int zoomPercent() const;
  EditorScene *scene() const { return activeEditor() == this ? scene_ : activeEditor()->scene(); }
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
  bool saveFile(const QString &path);
  Q_INVOKABLE void addNode(const QString &type);
  Q_INVOKABLE void dragNode(const QString &type);
  Q_INVOKABLE void setProperty(const QString &name, const QVariant &value);
  Q_INVOKABLE bool commitProperty(const QString &nodeId, const QString &name, const QVariant &value);
  Q_INVOKABLE bool removeProperty(const QString &nodeId, const QString &name);
  Q_INVOKABLE void action(const QString &name);
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
  void tabsChanged();
  void documentEpochChanged();
  void credentialsEpochChanged();
  void panelChanged();
  void mediaChanged();
  void zoomChanged();

protected:
  bool eventFilter(QObject *, QEvent *) override;
  void closeEvent(QCloseEvent *) override;
  void resizeEvent(QResizeEvent *) override;

private slots:
  void saveLocalCopyAs();
private:
  EditorWindow(QWidget *parent, EditorWindow *tabOwner);
  EditorWindow *tabOwner_ = nullptr;
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
  bool confirmTabClose(bool closeAfterSave = false);
  bool closeAfterServerSave_ = false;
  quint64 documentEpoch_ = 0;
  quint64 credentialsEpoch_ = 0;
  void showWorkflowDetails(const QString &kind);
  void showServerSync();
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
  bool addNodeAt(const QString &type, const QPointF &position);
  void autoLayout(bool selectedOnly);
  void refresh();
  void showBrowser(bool visible);
  void loadBrowser();
  void syncRuntimePreviews();
  QStringList selectedIds() const;
  QQuickWidget *panel(const QString &file);
  Q_SLOT void layoutOverlays();
  void syncInspector();
  void zoomBy(double factor);
  void zoomUnderCursor(double factor);
  void panBy(QPoint delta);
  static bool mouseNavigation();
  void applyFit();
  void revealSelection();
  void scheduleViewportSettle();
  bool fitActive_ = false;
  bool settlePending_ = false;
  void showMoreMenu();
  void showActionMenu(const QString &kind, const QPoint &position);
  bool menuActionEnabled(const QString &name) const;

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
  InlinePropertyPresenter *inlinePresenter_ = nullptr;
  InlineTitlePresenter *inlineTitle_ = nullptr;
  CanvasMediaPresenter *canvasMedia_ = nullptr;
  CanvasDropController *canvasDrops_ = nullptr;
  CompatibleNodePicker *compatiblePicker_ = nullptr;
  QQuickWidget *viewportOverlay_ = nullptr;
  bool inspectorDismissed_ = false;
  bool catalogAutoHidden_ = false;
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
    bool documentSyncPending_ = false;
    void flushDocumentSync();
  void invalidateGesture();
  quint64 gestureEpoch_ = 0;
  bool gesture_ = false;
  QHash<QString, QPointF> gesturePositions_;
  bool panning_ = false;
  bool rubberBandSelectionPending_ = false;
  std::optional<QPointF> lastPaste_;
  QPoint pasteMenuPosition_;
  QPoint panPosition_;
  QJsonArray gestureCommands_;
};
} // namespace nodetool
