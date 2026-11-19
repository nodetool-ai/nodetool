#pragma once
#include <QObject>
#include <memory>
#include <unordered_map>
#include <QHash>
#include <QPointer>
#include <QVariantList>
#include <QVariantMap>
#include <QSet>
#include <QRegion>
#include <QVector>
#include <QtNodes/Definitions>
class QQmlEngine;
class QQuickWidget;
class QQuickItem;
class QQuickWindow;
namespace nodetool {
class CanvasSurface;
class CanvasOverlay;
namespace node_editor { class MediaResolver; }
class WorkflowGraphModel;
class EditorSceneApi;
// Interactive media lives in viewport Quick widgets, never graphics proxies.
// The resolver is borrowed: its owner, EditorWindow, outlives this presenter.
class CanvasMediaPresenter final : public QObject {
  Q_OBJECT
public:
  CanvasMediaPresenter(WorkflowGraphModel &model, EditorSceneApi &scene,
                       CanvasSurface &canvas, QQmlEngine *engine,
                       node_editor::MediaResolver &resolver, QObject *parent = nullptr);
  ~CanvasMediaPresenter() override;
  QList<QQuickWidget *> activeWidgets() const;
  QList<QQuickItem *> activeItems() const;
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
  struct Entry { CanvasOverlay *widget; QVariantMap source; };
  WorkflowGraphModel &model_;
  CanvasSurface &canvas_;
  QPointer<QQmlEngine> engine_;
  node_editor::MediaResolver &resolver_;
  QHash<QString, QVariantMap> sources_;
  // Quick roots have unique owners. The entry indexes below borrow their
  // adapters while scenes and model callbacks are on the UI thread.
  std::unordered_map<CanvasOverlay *, std::unique_ptr<CanvasOverlay>> overlays_;
  CanvasOverlay *createOverlay(QtNodes::NodeId node, const QString &file, const QString &name,
                                const QVariantMap &properties);
  void retireOverlay(CanvasOverlay &overlay);
  QHash<QString, Entry> active_;
  // Players of the video and audio values cards show, by node and property.
  struct CardPlayer { CanvasOverlay *widget; QtNodes::NodeId id; QString property; bool list; QVariantList items; QVariantList geometry; };
  QHash<QString, CardPlayer> players_;
  // Nodes whose cards show a video or audio value, updated as their layouts change.
  QSet<QtNodes::NodeId> playerNodes_;
  QSet<QtNodes::NodeId> dirtyPlayerNodes_;
  bool allPlayerNodesDirty_ = true;
  void updatePlayerNodes();
  void showPlayers(QtNodes::NodeId node, const QRect &viewport, const QTransform &transform, double zoom,
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
  QObject retiredQuickRoots_;
};
}
