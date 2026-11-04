#pragma once
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointF>
#include "NodeLayout.h"
#include <QSize>
#include <QPointer>
#include <QImage>
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
signals:
  void runtimeChanged();
public:
  QString resourceId(QtNodes::NodeId id) const;
  QtNodes::NodeFlags nodeFlags(QtNodes::NodeId) const override {
    return readOnly_ ? QtNodes::NodeFlag::Locked : QtNodes::NodeFlag::NoFlags;
  }
  // Geometry and row content of the node card, rebuilt when the document changes.
  const NodeLayout &layout(QtNodes::NodeId id) const;
  QJsonObject metadata(QtNodes::NodeId id) const;
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
  QString runtimeJob_;
  void refreshRuntimeNode(const QString &id);
  bool readOnly_ = false;
  QtNodes::NodeId next_ = 0;
};
} // namespace nodetool
