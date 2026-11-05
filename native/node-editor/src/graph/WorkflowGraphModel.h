#pragma once
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointF>
#include <QRectF>
#include "NodeLayout.h"
#include "RerouteTypes.h"
#include <unordered_map>
#include <QSize>
#include <QPointer>
#include <QImage>
#include <QSet>
#include "../run/NodeRuntimeModel.h"
#include <QtNodes/AbstractGraphModel>
#include <functional>
namespace nodetool {
// Presentation only. The host commits through WorkflowDocument, then projects
// its snapshot.
class WorkflowGraphModel final : public QtNodes::AbstractGraphModel {
  Q_OBJECT
public:
  explicit WorkflowGraphModel(QObject *parent = nullptr);
  void project(const QJsonObject &snapshot, const QJsonArray &catalog = {},
               bool readOnly = false);
  std::function<bool(const QJsonObject &)> commit;
  std::function<bool(const QJsonObject &)> validateConnection;
  void setRuntimeModel(node_editor::NodeRuntimeModel *runtime);
  QJsonObject runtimeState(QtNodes::NodeId id) const;
  bool runtimeConnected() const;
  QJsonObject runtimeEdgeState(QtNodes::ConnectionId id) const;
  void setRuntimePreview(const QString &nodeId, const QImage &image);
  QImage runtimePreview(QtNodes::NodeId id) const;
  void setCanvasMediaNodes(const QSet<QString> &nodes);
  QRectF canvasPlaybackRect(QtNodes::NodeId id) const;
signals:
  void projectionAboutToChange();
  void runtimeChanged();
public:
  QString resourceId(QtNodes::NodeId id) const;
  QtNodes::NodeFlags nodeFlags(QtNodes::NodeId) const override {
    return readOnly_ ? QtNodes::NodeFlag::Locked : QtNodes::NodeFlag::NoFlags;
  }
  // Geometry and row content of the node card, rebuilt when the document changes.
  const NodeLayout &layout(QtNodes::NodeId id) const;
  QJsonObject metadata(QtNodes::NodeId id) const;
  bool isGroup(QtNodes::NodeId id) const;
  bool isComment(QtNodes::NodeId id) const;
  bool isReroute(QtNodes::NodeId id) const;
  QString rerouteHandleType(QtNodes::NodeId id) const;
  QString effectiveSourceType(QtNodes::NodeId id, QtNodes::PortIndex port) const;
  QColor wirePortColor(QtNodes::ConnectionId id, QtNodes::PortType side) const;
  int depth(QtNodes::NodeId id) const { return depths_.value(id); }
  QJsonObject nodeSnapshot(QtNodes::NodeId id) const { return nodes_.value(id); }
  QJsonArray edgeSnapshot() const { return edges_; }
  QVariantMap inlineDescriptor(QtNodes::NodeId id, const QString &name) const;
  QRectF inlineFieldRect(QtNodes::NodeId id, const QString &name) const;
  bool readOnly() const { return readOnly_; }
  QJsonObject uiProperties(QtNodes::NodeId id) const { return nodes_.value(id)["ui_properties"].toObject(); }
  QVector<QtNodes::NodeId> descendants(QtNodes::NodeId id) const;
  void moveDescendants(const QHash<QtNodes::NodeId, QPointF> &before);
  QJsonValue comment(QtNodes::NodeId id) const;
  bool bypassed(QtNodes::NodeId id) const;
  using QtNodes::AbstractGraphModel::portData;
  QtNodes::NodeId newNodeId() override;
  std::unordered_set<QtNodes::NodeId> allNodeIds() const override;
  std::unordered_set<QtNodes::ConnectionId>
      allConnectionIds(QtNodes::NodeId) const override;
  std::unordered_set<QtNodes::ConnectionId>
      connections(QtNodes::NodeId, QtNodes::PortType,
                  QtNodes::PortIndex) const override;
  bool connectionExists(QtNodes::ConnectionId) const override;
  QtNodes::NodeId addNode(QString const type = {}) override;
  bool connectionPossible(QtNodes::ConnectionId) const override;
  void addConnection(QtNodes::ConnectionId) override;
  bool nodeExists(QtNodes::NodeId) const override;
  QVariant nodeData(QtNodes::NodeId, QtNodes::NodeRole) const override;
  bool setNodeData(QtNodes::NodeId, QtNodes::NodeRole, QVariant) override;
  QVariant portData(QtNodes::NodeId, QtNodes::PortType, QtNodes::PortIndex,
                    QtNodes::PortRole) const override;
  bool setPortData(QtNodes::NodeId, QtNodes::PortType, QtNodes::PortIndex,
                   QVariant const &, QtNodes::PortRole) override {
    return false;
  }
  bool deleteConnection(QtNodes::ConnectionId) override;
  bool deleteNode(QtNodes::NodeId) override;
  QJsonObject edge(QtNodes::ConnectionId) const;
  QJsonArray ports(QtNodes::NodeId, QtNodes::PortType) const;

private:
  QHash<QtNodes::NodeId, QJsonObject> nodes_;
  QHash<QString, QtNodes::NodeId> ids_;
  QJsonArray edges_, catalog_;
  mutable QHash<QtNodes::NodeId, QJsonArray> inputs_, outputs_;
  mutable QHash<QtNodes::NodeId, NodeLayout> layouts_;
  QHash<QtNodes::NodeId, std::unordered_set<QtNodes::ConnectionId>> adjacency_;
  QPointer<node_editor::NodeRuntimeModel> runtime_;
  QHash<QString, QImage> previews_;
  QSet<QString> canvasMediaNodes_;
  QString runtimeJob_;
  void refreshRuntimeNode(const QString &id);
  QHash<QtNodes::NodeId, QPointF> positions_;
  QHash<QtNodes::NodeId, int> depths_;
  QHash<QtNodes::NodeId, QVector<QtNodes::NodeId>> children_;
  ForwardDisplayTypes displayTypes_;
  std::unordered_map<QtNodes::ConnectionId,QJsonObject> edgeByConnection_;
  bool readOnly_ = false;
  QtNodes::NodeId next_ = 0;
};
} // namespace nodetool
