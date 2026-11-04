#pragma once
#include "document/WorkflowDocument.h"
#include "graph/WorkflowGraphModel.h"
#include "server/WorkflowSession.h"
#include "run/RunOutputModel.h"
#include "run/NodeRuntimeModel.h"
#include "media/MediaResolver.h"
#include <QJsonArray>
#include <QMainWindow>
class QQmlEngine;
class QQuickWidget;
class QDockWidget;
class QGraphicsView;
namespace nodetool {
class EditorScene;
class EditorWindow final : public QMainWindow {
  Q_OBJECT
  Q_PROPERTY(QString selection READ selection NOTIFY panelChanged)
  Q_PROPERTY(QVariantList catalog READ catalog NOTIFY panelChanged)
  Q_PROPERTY(QVariantList properties READ properties NOTIFY panelChanged)
  Q_PROPERTY(bool readOnly READ readOnly NOTIFY panelChanged)
  Q_PROPERTY(QString readOnlyReason READ readOnlyReason NOTIFY panelChanged)
  Q_PROPERTY(QString saveState READ saveState NOTIFY panelChanged)
  Q_PROPERTY(QString connectionState READ connectionState NOTIFY panelChanged)
  Q_PROPERTY(QString message READ message NOTIFY panelChanged)
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
  explicit EditorWindow(QWidget *parent = nullptr);
  ~EditorWindow() override;
  node_editor::WorkflowDocument *document() { return &document_; }
  node_editor::WorkflowSession *session() { return &session_; }
  node_editor::RunOutputModel *runOutput() { return &runOutput_; }
  QVariantList outputMedia() const { return outputMedia_; }
  bool runActive() const;
  bool outputVisible() const;
  bool catalogVisible() const;
  bool inspectorVisible() const;
  QString workflowName() const;
  QString graphSummary() const;
  QVariantMap selectionInfo() const;
  int zoomPercent() const;
  EditorScene *scene() const { return scene_; }
  Q_INVOKABLE QString iconPath(const QString &name) const;
  Q_INVOKABLE void showToolTip(const QString &text);
  bool readOnly() const { return !readOnlyReason().isEmpty(); }
  QString readOnlyReason() const;
  Q_INVOKABLE void presentation(const QVariantMap &roles);
  bool confirmOpen();
  QString selection() const { return selected_; }
  QVariantList catalog() const;
  QVariantList properties() const;
  QString saveState() {
    return session_.saving()                  ? tr("Saving to server")
           : document_.undoStack()->isClean() ? tr("Saved")
                                              : tr("Unsaved");
  }
  QString connectionState() const { return session_.connected() ? tr("Connected") : tr("Disconnected"); }
  QString localFilePath() const { return file_; }
  QString message() const { return message_; }
  bool openFile(const QString &path);
  bool saveFile(const QString &path);
  Q_INVOKABLE void addNode(const QString &type);
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
signals:
  void panelChanged();
  void mediaChanged();
  void zoomChanged();

protected:
  bool eventFilter(QObject *, QEvent *) override;
  void closeEvent(QCloseEvent *) override;
  void resizeEvent(QResizeEvent *) override;

private:
  bool apply(const QJsonObject &command);
  void refresh();
  void syncRuntimePreviews();
  QStringList selectedIds() const;
  QQuickWidget *panel(const QString &file);
  void layoutOverlays();
  void syncInspector();
  void zoomBy(double factor);
  void applyFit();
  void revealSelection();
  void scheduleViewportSettle();
  bool fitActive_ = false;
  bool settlePending_ = false;
  void showMoreMenu();
  QQmlEngine *engine_ = nullptr;
  QMainWindow *dockHost_ = nullptr;
  QDockWidget *catalogDock_ = nullptr;
  QDockWidget *inspectorDock_ = nullptr;
  QQuickWidget *toolbarOverlay_ = nullptr;
  QQuickWidget *viewportOverlay_ = nullptr;
  bool inspectorDismissed_ = false;
  bool catalogAutoHidden_ = false;
  node_editor::WorkflowDocument document_;
  node_editor::WorkflowSession session_;
  node_editor::RunOutputModel runOutput_;
  node_editor::NodeRuntimeModel runtime_;
  node_editor::MediaResolver mediaResolver_;
  QDockWidget *outputDock_ = nullptr;
  WorkflowGraphModel model_;
  EditorScene *scene_;
  QGraphicsView *view_;
  QJsonArray metadata_;
  QString selected_, message_, file_, run_;
  QVariantList outputMedia_;
  QHash<QString, QVariant> runtimePreviewSources_;
  QString previewRun_;
  bool refreshPending_ = false;
  bool gesture_ = false;
  bool panning_ = false;
  QPoint panPosition_;
  QJsonArray gestureCommands_;
};
} // namespace nodetool
