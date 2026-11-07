#pragma once
#include <QObject>
#include <QHash>
#include <QPointer>
#include <QVariantList>
#include <QVariantMap>
#include <QSet>
#include <QRegion>
#include <QVector>
#include <QtNodes/Definitions>
class QGraphicsView;
namespace QtNodes { class NodeGraphicsObject; }
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
  // The output name of the node's current image result, empty when it has none (web OutputQuickActionButtons).
  QString imageOutputName(const QString &nodeId) const;
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
private slots:
  // A card player decoded its video's size, which sets the card's video height.
  void reportNaturalSize(const QString &key, int index, int width, int height);
private:
  struct Entry { QPointer<QQuickWidget> widget; QVariantMap source; };
  WorkflowGraphModel &model_;
  EditorScene &scene_;
  QGraphicsView &view_;
  QPointer<QQmlEngine> engine_;
  QHash<QString, QVariantMap> sources_;
  QHash<QString, Entry> active_;
  // Players of the video and audio values cards show, by node and property.
  struct CardPlayer { QPointer<QQuickWidget> widget; QtNodes::NodeId id; QString property; bool list; QVariantList items; QVariantList geometry; };
  QHash<QString, CardPlayer> players_;
  // Nodes whose cards show a video or audio value, updated as their layouts change.
  QSet<QtNodes::NodeId> playerNodes_;
  QSet<QtNodes::NodeId> dirtyPlayerNodes_;
  bool allPlayerNodesDirty_ = true;
  void updatePlayerNodes();
  void showPlayers(QtNodes::NodeGraphicsObject &node, const QRect &viewport, const QTransform &transform, double zoom,
                   const QRegion &covered, QSet<QString> &visible, QList<QQuickWidget *> &stacking);
  void retirePlayer(const QString &key);
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
