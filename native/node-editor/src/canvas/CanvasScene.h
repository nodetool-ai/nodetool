// Adapted from QtNodes include/QtNodes/internal/BasicGraphicsScene.hpp and
// src/BasicGraphicsScene.cpp at commit 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: the scene is a QObject over a Qt Quick content layer instead of a
// QGraphicsScene. It keeps the item maps, the model slots and the draft
// connection, and adds what QGraphicsScene supplied: selection, a grid index
// for hit tests, mouse grab and hover delivery. It has no undo stack, no
// orientation, no scene menu and no clipboard.
#pragma once

#include "canvas/CanvasItem.h"
#include "canvas/GridIndex.h"
#include "canvas/WirePainter.h"
#include <qtnodes/ConnectionIdHash.hpp>
#include <qtnodes/Definitions.hpp>
#include <QHash>
#include <QObject>
#include <QPainterPath>
#include <QPointer>
#include <QSet>
#include <memory>
#include <optional>
#include <unordered_map>

class QPainter;

namespace QtNodes {
class AbstractGraphModel;
class AbstractNodeGeometry;
}

namespace nodetool::canvas {
class ConnectionItem;
class NodeItem;

// UI thread only. Owns one NodeItem per model node and one ConnectionItem per
// model connection through std::unique_ptr. Their visual parent is the content
// layer, which the scene borrows; the layer outlives the scene. The model
// outlives the scene. Connections from the model use the scene as context, so
// they end with it.
class CanvasScene : public QObject {
  Q_OBJECT
public:
  CanvasScene(QtNodes::AbstractGraphModel &model, QQuickItem &layer, QObject *parent = nullptr);
  ~CanvasScene() override;

  QtNodes::AbstractGraphModel &graphModel() { return model_; }
  const QtNodes::AbstractGraphModel &graphModel() const { return model_; }
  QtNodes::AbstractNodeGeometry &nodeGeometry() { return *geometry_; }
  const QtNodes::AbstractNodeGeometry &nodeGeometry() const { return *geometry_; }
  void setNodeGeometry(std::unique_ptr<QtNodes::AbstractNodeGeometry> geometry);
  QQuickItem &layer() const { return layer_; }

  NodeItem *nodeItem(QtNodes::NodeId id) const;
  ConnectionItem *connectionItem(const QtNodes::ConnectionId &id) const;
  QList<NodeItem *> nodeItems() const;
  QList<ConnectionItem *> connectionItems() const;

  // From the moment of creation a draft connection grabs the mouse and waits
  // for the button release.
  ConnectionItem &makeDraftConnection(const QtNodes::ConnectionId &incomplete);
  void resetDraftConnection();
  ConnectionItem *draftConnection() const { return draft_.get(); }

  // Painting and the connection shape, supplied by the editor scene.
  virtual void paintNode(QPainter &painter, const NodeItem &item, double zoom) const = 0;
  virtual void paintConnection(QPainter &painter, const ConnectionItem &item, double zoom) const = 0;
  virtual QPainterPath connectionStroke(const ConnectionItem &item) const = 0;
  // The centre line the connection painter strokes, and whether the painted
  // marks can reach farther than half the widest stroke from it.
  virtual QPainterPath connectionPath(const ConnectionItem &) const { return {}; }
  virtual bool connectionPaintsOffPath(const ConnectionItem &) const { return true; }
  // GPU vector geometry support for RHI wires without off-path badges.
  virtual bool supportsVectorConnections() const { return false; }
  virtual std::optional<WirePaintState> connectionPaintState(const ConnectionItem &, double) const {
    return std::nullopt;
  }
  virtual const CanvasTheme *vectorTheme() const { return nullptr; }
  // The logical zoom of the view, which painting reads.
  double zoom() const { return zoom_; }
  void setZoom(double zoom) { zoom_ = zoom; }

  // Selection, kept on the items as QGraphicsScene keeps it.
  QList<QtNodes::NodeId> selectedNodes() const;
  QList<QtNodes::ConnectionId> selectedConnections() const;
  qsizetype selectionCount() const { return selected_.size(); }
  bool isSelected(const CanvasItem &item) const { return selected_.contains(item.indexKey()); }
  void setSelected(CanvasItem &item, bool selected);
  void clearSelection();
  // QGraphicsScene::setSelectionArea with Qt::IntersectsItemShape.
  void setSelectionArea(const QPainterPath &area, Qt::ItemSelectionOperation operation);
  // Holds selectionChanged back until the outermost batch ends.
  // Blocking this object's signals drops selection notifications, as
  // blocking a QGraphicsScene drops its selectionChanged.
  QObject &selectionGate() { return selectionGate_; }
  class SelectionBatch {
  public:
    explicit SelectionBatch(CanvasScene &scene);
    ~SelectionBatch();
    SelectionBatch(const SelectionBatch &) = delete;
    SelectionBatch &operator=(const SelectionBatch &) = delete;

  private:
    CanvasScene &scene_;
  };

  // Shown items whose shape contains the point, topmost first.
  QList<CanvasItem *> itemsAt(const QPointF &scenePoint) const;
  // Shown items whose bounds intersect the area, in no order.
  QList<CanvasItem *> itemsIn(const QRectF &sceneArea) const;
  // The topmost shown card whose shape contains the point (locateNodeAt).
  NodeItem *nodeAt(const QPointF &scenePoint) const;

  // QGraphicsScene's mouse delivery. The press returns whether an item took it.
  bool deliverPress(CanvasMouseEvent &event, bool doubleClick);
  void deliverMove(CanvasMouseEvent &event);
  void deliverRelease(CanvasMouseEvent &event);
  bool deliverKey(QKeyEvent &event);
  void deliverHover(const CanvasMouseEvent &event);
  void clearHover();
  void cancelMouseGrab();
  CanvasItem *mouseGrabber() const { return grabber_; }
  void grabMouse(CanvasItem &item);
  void ungrabMouse(CanvasItem &item);
  CanvasItem *focusItem() const { return focus_; }
  void setFocusItem(CanvasItem *item);
  // The view's ScrollHandDrag mode keeps the selection on a press on the pane.
  void setHandDrag(bool handDrag) { handDrag_ = handDrag; }

  // Item registry for hit tests and the index. CanvasItem calls these.
  void registerItem(CanvasItem &item);
  void unregisterItem(CanvasItem &item);
  void updateIndex(CanvasItem &item);
  // Updates the draft wire's index entry and asks the view to repaint only it,
  // without invalidating viewport coverage or notifying the mini-map.
  void draftMoved(CanvasItem &item);
  // Asks the view for a raster pass and repaint.
  void requestRaster();
  // Coalesces QGraphicsScene::changed for the mini-map and other listeners.
  void notifyChanged();
  quint64 nextKey() { return ++keys_; }
  quint64 indexRevision() const { return indexRevision_; }
  QRectF itemBounds(quint64 key) const { return index_.bounds(key); }
  CanvasItem *item(quint64 key) const { return items_.value(key); }

signals:
  void nodeClicked(QtNodes::NodeId id);
  void nodeDoubleClicked(QtNodes::NodeId id);
  void nodeSelected(QtNodes::NodeId id);
  void nodeHovered(QtNodes::NodeId id, QPoint screenPosition);
  void nodeHoverLeft(QtNodes::NodeId id);
  void connectionHovered(QtNodes::ConnectionId id, QPoint screenPosition);
  void connectionHoverLeft(QtNodes::ConnectionId id);
  void nodeMoved(QtNodes::NodeId id, const QPointF &position);
  void modified(CanvasScene *scene);
  void selectionChanged();
  // Items changed position, size or content.
  void changed();
  void rasterRequested();
  void draftRasterRequested();

public slots:
  void onConnectionDeleted(const QtNodes::ConnectionId &id);
  void onConnectionCreated(const QtNodes::ConnectionId &id);
  void onNodeDeleted(QtNodes::NodeId id);
  void onNodeCreated(QtNodes::NodeId id);
  void onNodePositionUpdated(QtNodes::NodeId id);
  void onNodeUpdated(QtNodes::NodeId id);
  void onNodeClicked(QtNodes::NodeId id);
  void onModelReset();

protected:
  // A selected item is going away.
  void forgetItem(CanvasItem &item);

private:
  void traverseGraphAndPopulateGraphicsObjects();
  void updateAttachedNodes(const QtNodes::ConnectionId &id, QtNodes::PortType side);
  void selectionTouched();
  void emitChanged();
  void setHoverItem(CanvasItem *item, CanvasItem *child, const CanvasMouseEvent &event);

  QtNodes::AbstractGraphModel &model_;
  QQuickItem &layer_;
  std::unique_ptr<QtNodes::AbstractNodeGeometry> geometry_;
  std::unordered_map<QtNodes::NodeId, std::unique_ptr<NodeItem>> nodes_;
  std::unordered_map<QtNodes::ConnectionId, std::unique_ptr<ConnectionItem>> connections_;
  std::unique_ptr<ConnectionItem> draft_;
  QHash<quint64, CanvasItem *> items_;
  GridIndex index_;
  QSet<quint64> selected_;
  QObject selectionGate_;
  int selectionBatch_ = 0;
  bool selectionDirty_ = false;
  CanvasItem *grabber_ = nullptr;
  CanvasItem *hover_ = nullptr;
  CanvasItem *hoverChild_ = nullptr;
  CanvasItem *focus_ = nullptr;
  CanvasItem *lastGrabber_ = nullptr;
  bool nodeDrag_ = false;
  bool handDrag_ = false;
  bool changedPending_ = false;
  bool destroying_ = false;
  double zoom_ = 1;
  quint64 keys_ = 0;
  quint64 indexRevision_ = 0;
};

} // namespace nodetool::canvas
