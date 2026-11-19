#pragma once

#include "ui/CanvasCapture.h"
#include <qtnodes/Definitions.hpp>
#include <QCursor>
#include <QList>
#include <QObject>
#include <QRectF>
#include <QTransform>
#include <functional>
#include <memory>
#include <optional>

class QWidget;

namespace nodetool {
class EditorSceneApi;

// UI thread only. Reads and mutates the canvas's current selection.
class CanvasSelection : public QObject {
  Q_OBJECT
public:
  using QObject::QObject;
  virtual QList<QtNodes::NodeId> nodes() const = 0;
  virtual QList<QtNodes::ConnectionId> edges() const = 0;
  virtual qsizetype count() const = 0;
  virtual bool contains(QtNodes::NodeId id) const = 0;
  virtual void clear() = 0;
  virtual void setNode(QtNodes::NodeId id, bool selected) = 0;
  // Publishes one selection notification for the batch.
  virtual void selectNodes(const QList<QtNodes::NodeId> &ids, bool replace) = 0;

signals:
  void selectionChanged();
};

// UI thread only. A handle to a note attached to a card.
class CanvasNote {
public:
  virtual ~CanvasNote() = default;
  virtual void updateCardGeometry(QSizeF size) = 0;
  virtual void setVisible(bool visible) = 0;
};

// UI thread only. Scene coordinates are graph units. Viewport coordinates
// are logical pixels relative to the input surface, before window translation.
class CanvasSurface : public QObject {
  Q_OBJECT
public:
  enum class ZoomAnchor { Center, Pointer };
  using QObject::QObject;

  virtual QPointF mapToScene(QPoint viewportPoint) const = 0;
  virtual QPoint mapFromScene(QPointF scenePoint) const = 0;
  virtual QRect mapFromScene(QRectF sceneRect) const = 0;
  virtual QRectF visibleSceneRect() const = 0;
  virtual QTransform viewportTransform() const = 0;
  virtual double zoom() const = 0;
  virtual QPointF center() const = 0;
  virtual void centerOn(QPointF position) = 0;
  virtual void setView(double zoom, QPointF center) = 0;
  virtual void scaleBy(double factor, ZoomAnchor anchor) = 0;
  virtual void ensureVisible(QRectF sceneRect, int margin) = 0;
  virtual void panBy(QPoint pixels) = 0;
  virtual int horizontalOffset() const = 0;
  virtual void setHorizontalOffset(int offset) = 0;

  virtual bool hasNode(QtNodes::NodeId id) const = 0;
  // Card body in scene coordinates, and full graphics bounds including handles.
  virtual QRectF nodeRect(QtNodes::NodeId id) const = 0;
  virtual QRectF nodeBounds(QtNodes::NodeId id) const = 0;
  virtual QRectF edgeBounds(const QtNodes::ConnectionId &id) const = 0;
  virtual QPointF nodeOrigin(QtNodes::NodeId id) const = 0;
  virtual QPointF mapFromNode(QtNodes::NodeId id, QPointF local) const = 0;
  virtual QRectF mapRectFromNode(QtNodes::NodeId id, QRectF local) const = 0;
  virtual QPointF mapToNode(QtNodes::NodeId id, QPointF scenePoint) const = 0;
  virtual double nodeOpacity(QtNodes::NodeId id) const = 0;
  // Visible cards in front-to-back stacking order.
  virtual QList<QtNodes::NodeId> visibleNodes() const = 0;
  // Pick in stacking order. When includeDecorations is set, a hit on a
  // card's child also counts as a hit on that card.
  virtual QtNodes::NodeId nodeAt(QPoint viewportPoint, bool includeDecorations = false) const = 0;
  virtual bool hasItemAt(QPoint viewportPoint) const = 0;
  virtual bool lineageAt(QPoint viewportPoint) const = 0;
  virtual std::optional<QtNodes::ConnectionId> edgeAt(QPoint viewportPoint) const = 0;

  // The scene behind this canvas, for the theme, motion and gesture state.
  virtual EditorSceneApi &scene() const = 0;
  virtual CanvasSelection &selection() const = 0;
  virtual bool rubberBandActive() const = 0;
  virtual void setHandDrag(bool enabled) = 0;
  virtual void requestRepaint() = 0;
  virtual void setCursor(const QCursor &cursor) = 0;
  virtual void setFocus(Qt::FocusReason reason = Qt::OtherFocusReason) = 0;
  virtual QImage capture(canvas_capture::Mode mode) const = 0;
  virtual QImage renderCard(QtNodes::NodeId id) const = 0;
  virtual std::unique_ptr<CanvasNote> addNote(QtNodes::NodeId id, const QString &text,
                                             const QString &name, std::function<void()> edit,
                                             std::function<void()> remove) = 0;

  // Widget composition for the current shell and QuickWidget overlays.
  virtual QWidget &hostWidget() const = 0;
  virtual QWidget &viewportWidget() const = 0;

signals:
  void sceneChanged();
  void viewportMoved();
  void rubberBandChanged(bool active);
  // A press and release on a card, and a double-click on one.
  void nodeClicked(QtNodes::NodeId id);
  void nodeDoubleClicked(QtNodes::NodeId id);
  // The dimmed set changed, so overlays that follow card opacity update.
  void branchDimmingChanged();
};

}
