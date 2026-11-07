#pragma once
#include <QObject>
#include <QHash>
#include <QPointer>
#include <QVariantList>
#include <QVariantMap>
#include <QVector>
#include <QtNodes/Definitions>
class QGraphicsView;
class QQmlEngine;
class QQuickWidget;
class QQuickWindow;
namespace nodetool {
class WorkflowGraphModel;
class EditorScene;
// Interactive media lives in viewport Quick widgets, never graphics proxies.
class CanvasMediaPresenter final : public QObject {
  Q_OBJECT
public:
  CanvasMediaPresenter(WorkflowGraphModel &model, EditorScene &scene,
                       QGraphicsView &view, QQmlEngine *engine,
                       QObject *parent = nullptr);
  ~CanvasMediaPresenter() override;
  QList<QQuickWidget *> activeWidgets() const;
  bool canViewImage(const QString &nodeId) const;
  bool viewImage(const QString &nodeId);
public slots:
  void setSources(const QVariantList &sources);
  void setCollections(const QVariantList &collections);
  void refresh();
  void clear();
signals:
  void changed();
protected:
  bool eventFilter(QObject *object, QEvent *event) override;
private:
  struct Entry { QPointer<QQuickWidget> widget; QVariantMap source; };
  WorkflowGraphModel &model_;
  EditorScene &scene_;
  QGraphicsView &view_;
  QPointer<QQmlEngine> engine_;
  QHash<QString, QVariantMap> sources_;
  QHash<QString, Entry> active_;
  QVector<QPointer<QQuickWidget>> retired_;
  QPointer<QQuickWindow> imageViewer_;
  QString imageViewerNode_;
  QVariantMap imageViewerSource_;
  quint64 serial_ = 0;
  bool scheduled_ = false;
  void schedule();
  bool canOpenImageViewer(QtNodes::NodeId id) const;
  bool openImageViewer(QtNodes::NodeId id);
  void closeImageViewer();
  void applySources(const QHash<QString, QVariantMap> &sources);
  void retire(const QString &id);
  void releaseWidgets();
};
}
