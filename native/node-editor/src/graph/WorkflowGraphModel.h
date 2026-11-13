#pragma once
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointF>
#include <QRectF>
#include "CardBodies.h"
#include "NodeLayout.h"
#include "CardMedia.h"
#include "RerouteTypes.h"
#include <unordered_map>
#include <QSize>
#include <QPointer>
#include <QImage>
#include <QSet>
#include <QElapsedTimer>
#include <QTimer>
#include "../run/NodeRuntimeModel.h"
#include "../run/UntakenBranch.h"
#include <QtNodes/AbstractGraphModel>
#include <functional>
namespace nodetool {
// Presentation only. The host commits through WorkflowDocument, then projects
// its snapshot. A projection of the same workflow, catalog and read-only state
// diffs against the previous one and emits the fine-grained QtNodes signals,
// so unchanged node items and their cached layouts survive. Other projections
// emit modelReset(). UI thread only.
class WorkflowGraphModel final : public QtNodes::AbstractGraphModel {
  Q_OBJECT
public:
  explicit WorkflowGraphModel(QObject *parent = nullptr);
  void project(const QJsonObject &snapshot, const QJsonArray &catalog = {},
               bool readOnly = false);
  // The next projection resets the scene, as for a replaced document.
  void resetOnNextProjection() { projected_ = false; }
  std::function<bool(const QJsonObject &)> commit;
  std::function<bool(const QJsonObject &)> validateConnection;
  void setRuntimeModel(node_editor::NodeRuntimeModel *runtime);
  QJsonObject runtimeState(QtNodes::NodeId id) const;
  bool runtimeConnected() const;
  QJsonObject runtimeEdgeState(QtNodes::ConnectionId id) const;
  // The web's flow animation: the edge reported message_sent or its source node
  // is starting or running. Control edges never animate.
  bool runtimeWireFlowing(QtNodes::ConnectionId id) const;
  // An Agent control edge (ControlEdge.tsx): drawn amber and dashed from the bottom of
  // the controller to the top of the controlled node.
  bool isControlWire(QtNodes::ConnectionId id) const;
  // Canonical ports and connections survive even when their body renders no handle.
  bool portVisible(QtNodes::NodeId id, QtNodes::PortType side, QtNodes::PortIndex index) const;
  bool wireVisible(QtNodes::ConnectionId id) const;
  int stackingOrder(QtNodes::NodeId id) const { return stackingOrder_.value(id); }
  // Items an If or Switch left unexecuted in the selected run, from edge updates.
  node_editor::UntakenBranch untakenBranch() const;
  void setRuntimePreview(const QString &nodeId, const QImage &image);
  QImage runtimePreview(QtNodes::NodeId id) const;
  // A status alone changes no card size. The web shows no status text on a card.
  bool hasRuntimeOutput(QtNodes::NodeId id) const;
  // The image value leaving a node's output handle: its run result, or the
  // value an Image constant or Image input holds. Null when none is known.
  QJsonValue upstreamImage(const QString &node, const QString &handle) const;
  // Whether the card shows its running ring. A change between running and idle
  // shows once it holds for runningDelayMs, so a burst of short preview runs
  // does not flicker the ring.
  bool runningShown(QtNodes::NodeId id) const { return runningShown_.contains(resourceId(id)); }
  static constexpr int runningDelayMs = 300;
  void setCanvasMediaNodes(const QSet<QString> &nodes);
  // The secrets the account has set. Until `known`, no card warns about a
  // missing key, as useApiKeyValidation waits for the credential check.
  // The node keyboard navigation has reached (web NodeFocusStore): drawn with
  // a dashed warning edge and a "Focused" badge. History keeps the last 20.
  QString focusedNode() const { return focusedNode_; }
  void setFocusedNode(const QString &resourceId);
  // Steps back to the previously focused node. False when there is none.
  bool focusBack();
  qsizetype focusHistorySize() const { return focusHistory_.size(); }
  // `secretKeys` lists every secret the server knows, configured or not.
  void setConfiguredSecrets(const QStringList &keys, bool known, const QStringList &secretKeys = {});
  // Thumbnails and load states of the media values cards show, from CardMediaLoader.
  void setCardMedia(const QString &nodeId, const QString &property, int index, const CardMediaItem &item);
  void clearCardMedia();
  QRectF canvasPlaybackRect(QtNodes::NodeId id) const;
  // Card-local result bounds used by the raster/text painter, before image
  // aspect fitting. Empty for invalid, collapsed, group, comment or reroute nodes.
  QRectF canvasResultRect(QtNodes::NodeId id) const;
  // Card layouts built since construction; unchanged cards reuse theirs.
  quint64 layoutBuildCount() const { return layoutBuilds_; }
signals:
  void projectionAboutToChange();
  // Emitted after every projection, after modelReset() or the incremental signals.
  void projectionChanged();
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
  // The Resize Image lock links width and height. Like the web's lock it is view
  // state: it stores the aspect ratio at the moment it closes and never enters
  // the document.
  bool dimensionsLinked(QtNodes::NodeId id) const { return dimensionLinks_.contains(resourceId(id)); }
  void setDimensionsLinked(QtNodes::NodeId id, bool linked);
  // The Before/After and Mask preview tabs are view state too, as the web
  // bodies' useState, and never enter the document or undo.
  void setPreviewTab(QtNodes::NodeId id, const QString &tab);
  // The command that writes a property, with the linked other dimension in the
  // same batch so one undo step reverts both.
  QJsonObject propertyCommand(QtNodes::NodeId id, const QString &name, const QJsonValue &value) const;
  // DataframeProperty.tsx's Add column: appends the first free "Column N" as a string column.
  QJsonObject addDataframeColumnCommand(QtNodes::NodeId id, const QString &name) const;
  // The edge batch a Crop body control makes (see isCropControl), empty when
  // the crop stays the same.
  QJsonObject cropControlCommand(QtNodes::NodeId id, const QString &name, const QVariant &value) const;
  // Applies a Crop body control: the aspect becomes the body tab, and changed
  // edges commit as one step.
  void setCropControl(QtNodes::NodeId id, const QString &name, const QVariant &value);
  // The media drop zone row under a card-local point, or -1.
  int dropZoneAt(QtNodes::NodeId id, const QPointF &point) const;
  bool readOnly() const { return readOnly_; }
  QJsonObject uiProperties(QtNodes::NodeId id) const { return nodes_.value(id)["ui_properties"].toObject(); }
  QVector<QtNodes::NodeId> descendants(QtNodes::NodeId id) const;
  void moveDescendants(const QHash<QtNodes::NodeId, QPointF> &before);
  QJsonValue comment(QtNodes::NodeId id) const;
  bool bypassed(QtNodes::NodeId id) const;
  bool collapsed(QtNodes::NodeId id) const;
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
  QHash<QtNodes::NodeId, int> stackingOrder_;
  void deriveProjection(const QJsonArray &nodes);
  void invalidateNode(QtNodes::NodeId id);
  QHash<QtNodes::NodeId, QJsonObject> nodes_;
  QHash<QString, QtNodes::NodeId> ids_;
  QJsonArray edges_, catalog_;
  // Catalog positions by node type, so card queries skip a scan of thousands of entries.
  QHash<QString, int> catalogIndex_;
  QJsonObject catalogEntry(const QJsonValue &type) const;
  // Edges that touch each resource id, which its ports and layout read.
  QHash<QString, QJsonArray> incident_;
  QString workflowId_;
  bool projected_ = false;
  mutable quint64 layoutBuilds_ = 0;
  mutable QHash<QtNodes::NodeId, QJsonArray> inputs_, outputs_;
  mutable QHash<QtNodes::NodeId, NodeLayout> layouts_;
  QHash<QtNodes::NodeId, std::unordered_set<QtNodes::ConnectionId>> adjacency_;
  QPointer<node_editor::NodeRuntimeModel> runtime_;
  QHash<QString, QImage> previews_;
  QHash<QString, ImageHistogram> histograms_;
  QSet<QString> canvasMediaNodes_;
  QSet<QString> configuredSecrets_;
  bool secretsKnown_ = false;
  QSet<QString> secretKeys_;
  QString focusedNode_;
  QStringList focusHistory_;
  // How many input nodes carry each name, for InputNodeNameWarning.tsx.
  QHash<QString, int> inputNames_;
  CardMediaStore cardMedia_;
  // Rebuilds the cards that show the image leaving this node.
  void refreshSourceReaders(const QString &node);
  void refreshRuntimeNode(const QString &id);
  void trackRunning(const QString &id);
  void settleRunning();
  QSet<QString> runningShown_;
  // The nodes whose live running state differs from the shown one, with the
  // runningClock_ time of the change.
  QHash<QString, qint64> runningSince_;
  QElapsedTimer runningClock_;
  // A member. It fires when the earliest pending change has held.
  QTimer runningTimer_;
  QHash<QString, double> dimensionLinks_;
  QHash<QString, QString> previewTabs_;
  // Names Set Variable nodes publish, read by the Prompt and Get Variable bodies.
  QStringList graphVariables_;
  QHash<QtNodes::NodeId, QPointF> positions_;
  QHash<QtNodes::NodeId, int> depths_;
  QHash<QtNodes::NodeId, QVector<QtNodes::NodeId>> children_;
  ForwardDisplayTypes displayTypes_;
  std::unordered_map<QtNodes::ConnectionId,QJsonObject> edgeByConnection_;
  bool readOnly_ = false;
  QtNodes::NodeId next_ = 0;
};
} // namespace nodetool
