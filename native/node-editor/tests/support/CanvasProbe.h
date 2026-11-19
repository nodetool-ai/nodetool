#pragma once

#include "canvas/ConnectionItem.h"
#include "canvas/GraphCanvas.h"
#include "canvas/NodeItem.h"
#include "graph/EditorScene.h"
#include "ui/CanvasSurface.h"
#include "ui/EditorWindow.h"
#include "ui/QtNodesCanvas.h"
#include "ui/QuickCanvas.h"
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionState.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QGraphicsView>
#include <QGraphicsObject>
#include <QPainter>
#include <QPointer>
#include <QPixmap>
#include <QPolygon>
#include <QQuickWidget>
#include <QTest>
#include <QWidget>
#include <optional>

namespace nodetool::test {

// A wire as either canvas shows it, in scene coordinates.
struct WireProbe {
  QPointF out;
  QPointF in;
  bool selected = false;
  bool shown = true;
  bool draft = false;
  double opacity = 1;
  QPainterPath shape;
  QRectF bounds;
};

// UI thread only. A card on either canvas with the QGraphicsItem calls the
// tests read, answered through CanvasSurface. It borrows the surface.
class CardHandle {
public:
  CardHandle(CanvasSurface *surface, QtNodes::NodeId id) : surface_(surface), id_(id) {}
  explicit operator bool() const { return surface_ && surface_->hasNode(id_); }
  // Lets tests keep the pointer syntax of the QGraphicsObject they read before.
  const CardHandle *operator->() const { return this; }
  QtNodes::NodeId nodeId() const { return id_; }
  QRectF sceneBoundingRect() const { return surface_->nodeBounds(id_); }
  QRectF boundingRect() const { return sceneBoundingRect().translated(-pos()); }
  QPointF pos() const { return surface_->nodeOrigin(id_); }
  QPointF scenePos() const { return pos(); }
  QTransform sceneTransform() const { return QTransform::fromTranslate(pos().x(), pos().y()); }
  QPointF mapToScene(QPointF local) const { return surface_->mapFromNode(id_, local); }
  QPointF mapToScene(qreal x, qreal y) const { return mapToScene(QPointF(x, y)); }
  QRectF mapRectToScene(QRectF local) const { return surface_->mapRectFromNode(id_, local); }
  QPointF mapFromScene(QPointF scene) const { return surface_->mapToNode(id_, scene); }
  bool isSelected() const { return surface_->selection().contains(id_); }
  void setSelected(bool selected) const { surface_->selection().setNode(id_, selected); }
  double opacity() const { return surface_->nodeOpacity(id_); }
  bool isVisible() const { return surface_->hasNode(id_); }
  // QGraphicsItem::zValue, or the Quick item's z, which orders the same way.
  double zValue() const {
    if (auto *scene = dynamic_cast<EditorScene *>(&surface_->scene())) {
      const auto *item = scene->nodeGraphicsObject(id_);
      return item ? item->zValue() : 0;
    }
    const auto *quick = dynamic_cast<QuickCanvas *>(surface_);
    const auto *item = quick ? quick->graphCanvas().scene().nodeItem(id_) : nullptr;
    return item ? item->z() : 0;
  }
  bool hovered() const {
    if (auto *scene = dynamic_cast<EditorScene *>(&surface_->scene())) {
      const auto *item = scene->nodeGraphicsObject(id_);
      return item && item->nodeState().hovered();
    }
    const auto *quick = dynamic_cast<QuickCanvas *>(surface_);
    const auto *item = quick ? quick->graphCanvas().scene().nodeItem(id_) : nullptr;
    return item && item->nodeState().hovered();
  }

private:
  CanvasSurface *surface_;
  QtNodes::NodeId id_;
};

inline CardHandle card(EditorWindow &window, QtNodes::NodeId id) { return {&window.canvas(), id}; }

// UI thread only. A wire on either canvas with the QGraphicsItem calls the
// tests read. Coordinates are the item's own: QtNodes places a wire item at
// its port, the Quick canvas at the scene origin. It borrows the window.
class WireHandle {
public:
  WireHandle(EditorWindow *window, QtNodes::ConnectionId id) : window_(window), id_(id) {}
  explicit operator bool() const { return window_ && (qtNodes() || quick()); }
  const WireHandle *operator->() const { return this; }
  QtNodes::ConnectionId connectionId() const { return id_; }
  double opacity() const { return qtNodes() ? qtNodes()->opacity() : quick()->opacity(); }
  bool isSelected() const { return qtNodes() ? qtNodes()->isSelected() : quick()->isSelected(); }
  void setSelected(bool selected) const {
    if (auto *item = qtNodes()) {
      item->setSelected(selected);
    } else if (auto *item = quick()) {
      item->canvasScene()->setSelected(*item, selected);
    }
  }
  bool isVisible() const { return qtNodes() ? qtNodes()->isVisible() : quick()->shown(); }
  QPainterPath shape() const { return qtNodes() ? qtNodes()->shape() : quick()->hitPath(); }
  QRectF boundingRect() const { return qtNodes() ? qtNodes()->boundingRect() : quick()->boundingRect(); }
  QPointF endPoint(QtNodes::PortType side) const { return qtNodes() ? qtNodes()->endPoint(side) : quick()->endPoint(side); }
  QPointF mapToScene(QPointF point) const { return qtNodes() ? qtNodes()->mapToScene(point) : point; }
  bool hovered() const { return qtNodes() ? qtNodes()->connectionState().hovered() : quick()->connectionState().hovered(); }

private:
  QtNodes::ConnectionGraphicsObject *qtNodes() const {
    auto *scene = window_ ? window_->qtNodesScene() : nullptr;
    return scene ? scene->connectionGraphicsObject(id_) : nullptr;
  }
  canvas::ConnectionItem *quick() const {
    auto *surface = window_ ? dynamic_cast<QuickCanvas *>(&window_->canvas()) : nullptr;
    return surface ? surface->graphCanvas().scene().connectionItem(id_) : nullptr;
  }
  EditorWindow *window_;
  QtNodes::ConnectionId id_;
};

inline WireHandle wire(EditorWindow &window, QtNodes::ConnectionId id) { return {&window, id}; }

// UI thread only. A card's note item on either canvas, found by object name.
// The guarded pointer goes null when the card or its presenter drops the note.
class NoteHandle {
public:
  explicit NoteHandle(QObject *note = nullptr) : note_(note) {}
  explicit operator bool() const { return !note_.isNull(); }
  bool isNull() const { return note_.isNull(); }
  const NoteHandle *operator->() const { return this; }
  QRectF boundingRect() const {
    if (auto *item = graphics()) { return item->boundingRect(); }
    auto *item = quick();
    return item ? item->sceneBoundingRect().translated(-item->scenePosition()) : QRectF{};
  }
  QRectF sceneBoundingRect() const {
    if (auto *item = graphics()) { return item->sceneBoundingRect(); }
    return quick() ? quick()->sceneBoundingRect() : QRectF{};
  }
  QPointF pos() const { return graphics() ? graphics()->pos() : quick() ? quick()->position() : QPointF{}; }
  QPointF scenePos() const { return graphics() ? graphics()->scenePos() : quick() ? quick()->scenePosition() : QPointF{}; }
  QPointF mapToScene(QPointF local) const { return graphics() ? graphics()->mapToScene(local) : scenePos() + local; }
  bool isVisible() const { return graphics() ? graphics()->isVisible() : quick() && quick()->isVisible() && quick()->shown(); }

private:
  QGraphicsObject *graphics() const { return qobject_cast<QGraphicsObject *>(note_.data()); }
  canvas::CanvasItem *quick() const { return dynamic_cast<canvas::CanvasItem *>(note_.data()); }
  QPointer<QObject> note_;
};

inline NoteHandle note(EditorWindow &window, const QString &name) {
  if (auto *scene = window.qtNodesScene()) {
    for (auto *entry : scene->items()) {
      if (auto *object = dynamic_cast<QGraphicsObject *>(entry); object && object->objectName() == name) { return NoteHandle(object); }
    }
    return NoteHandle();
  }
  if (auto *quick = dynamic_cast<QuickCanvas *>(&window.canvas())) {
    for (auto *card : quick->graphCanvas().scene().nodeItems()) {
      for (auto *child : card->childItems()) {
        if (child->objectName() == name) { return NoteHandle(child); }
      }
    }
  }
  return NoteHandle();
}

QImage grabCanvasViewport(EditorWindow &window);

// UI thread only. The QGraphicsView calls the tests read, answered through
// CanvasSurface on either canvas. It borrows the window.
class ViewHandle {
public:
  explicit ViewHandle(EditorWindow &window) : window_(&window) {}
  const ViewHandle *operator->() const { return this; }
  explicit operator bool() const { return true; }
  CanvasSurface &surface() const { return window_->canvas(); }
  QWidget *viewport() const { return &surface().viewportWidget(); }
  QPoint mapFromScene(QPointF point) const { return surface().mapFromScene(point); }
  QPoint mapFromScene(qreal x, qreal y) const { return mapFromScene(QPointF(x, y)); }
  // QGraphicsView::mapFromScene(QRectF) maps the corners. The polygon's
  // bounding rectangle is the canvas's mapped rectangle.
  QPolygon mapFromScene(const QRectF &rect) const {
    const auto mapped = surface().mapFromScene(rect);
    // QPolygon(QRect) would add the width; the corners keep the inclusive bounds.
    return QPolygon({mapped.topLeft(), mapped.topRight(), mapped.bottomRight(), mapped.bottomLeft()});
  }
  QPointF mapToScene(QPoint point) const { return surface().mapToScene(point); }
  QPolygonF mapToScene(const QRect &rect) const {
    return QPolygonF(QRectF(mapToScene(rect.topLeft()), mapToScene(rect.bottomRight() + QPoint(1, 1))));
  }
  void centerOn(QPointF point) const { surface().centerOn(point); }
  void centerOn(qreal x, qreal y) const { centerOn(QPointF(x, y)); }
  void centerOn(const CardHandle &card) const { centerOn(card.sceneBoundingRect().center()); }
  QTransform transform() const { return QTransform::fromScale(surface().zoom(), surface().zoom()); }
  QTransform viewportTransform() const { return surface().viewportTransform(); }
  void setTransform(const QTransform &transform) const { surface().setView(transform.m11(), surface().center()); }
  void resetTransform() const { setTransform(QTransform()); }
  void scale(qreal sx, qreal) const { surface().scaleBy(sx, CanvasSurface::ZoomAnchor::Center); }
  QPixmap grab() const { return QPixmap::fromImage(grabCanvasViewport(*window_)); }
  QPixmap grab(const QRect &area) const { return QPixmap::fromImage(grabCanvasViewport(*window_).copy(area)); }
  QRect rect() const { return viewport()->rect(); }
  QWidget *widget() const { return &surface().hostWidget(); }
  // QGraphicsView::fitInView with its 2 pixel margin.
  void fitInView(const QRectF &rect, Qt::AspectRatioMode) const {
    const auto area = QRectF(viewport()->rect()).adjusted(2, 2, -2, -2);
    surface().setView(std::min(area.width() / rect.width(), area.height() / rect.height()), rect.center());
  }
  // The scroll bar values of QGraphicsView: the scene point at the
  // viewport's top left, times the zoom.
  class ScrollHandle {
  public:
    ScrollHandle(CanvasSurface &surface, Qt::Orientation orientation) : surface_(surface), orientation_(orientation) {}
    const ScrollHandle *operator->() const { return this; }
    int value() const {
      const auto origin = surface_.mapToScene(QPoint(0, 0)) * surface_.zoom();
      return qRound(orientation_ == Qt::Horizontal ? origin.x() : origin.y());
    }
    void setValue(int value) const {
      const auto delta = value - this->value();
      surface_.panBy(orientation_ == Qt::Horizontal ? QPoint(-delta, 0) : QPoint(0, -delta));
    }

  private:
    CanvasSurface &surface_;
    Qt::Orientation orientation_;
  };
  ScrollHandle horizontalScrollBar() const { return {surface(), Qt::Horizontal}; }
  ScrollHandle verticalScrollBar() const { return {surface(), Qt::Vertical}; }
  // Both canvases use QtNodesCanvas's fixed scene rectangle.
  QRectF sceneRect() const { return {-32767, -32767, 65534, 65534}; }
  void setSceneRect(const QRectF &) const {}
  void setSceneRect(qreal, qreal, qreal, qreal) const {}
  // ScrollHandDrag while mouse navigation is on, otherwise RubberBandDrag.
  QGraphicsView::DragMode dragMode() const {
    if (auto *view = qobject_cast<QGraphicsView *>(&surface().hostWidget())) { return view->dragMode(); }
    const auto *quick = dynamic_cast<QuickCanvas *>(&surface());
    return quick && quick->graphCanvas().handDrag() ? QGraphicsView::ScrollHandDrag : QGraphicsView::RubberBandDrag;
  }

private:
  EditorWindow *window_;
};

inline ViewHandle view(EditorWindow &window) { return ViewHandle(window); }

// QGraphicsScene::itemsBoundingRect over the cards and wires of either canvas.
inline QRectF itemsBoundingRect(EditorWindow &window) {
  auto &surface = window.canvas();
  auto &model = window.scene()->graphModel();
  QRectF bounds;
  for (const auto id : model.allNodeIds()) {
    bounds |= surface.nodeBounds(id);
    for (const auto &wire : model.allConnectionIds(id)) { bounds |= surface.edgeBounds(wire); }
  }
  return bounds;
}

// UI thread only. Reads and drives either canvas through CanvasSurface and,
// where the seam has no call for it, through each canvas's own items. Point
// arguments of the pointer helpers are viewport-local. The window outlives it.
class CanvasProbe {
public:
  explicit CanvasProbe(EditorWindow &window) : window_(window) {}

  CanvasSurface &surface() const { return window_.canvas(); }
  QWidget *viewport() const { return &surface().viewportWidget(); }
  QRect nodeRectInWindow(QtNodes::NodeId id) const {
    if (!surface().hasNode(id)) { return {}; }
    const auto rect = surface().mapFromScene(surface().nodeRect(id));
    return {viewport()->mapTo(&window_, rect.topLeft()), rect.size()};
  }
  QPoint cardPoint(QtNodes::NodeId id, QPointF local) const {
    return surface().mapFromScene(surface().mapFromNode(id, local));
  }
  QPoint scenePoint(QPointF scene) const { return surface().mapFromScene(scene); }
  void click(QPoint point, Qt::MouseButton button = Qt::LeftButton,
             Qt::KeyboardModifiers modifiers = Qt::NoModifier) const {
    QTest::mouseClick(viewport(), button, modifiers, point);
  }
  void press(QPoint point, Qt::MouseButton button, Qt::KeyboardModifiers modifiers = Qt::NoModifier) const {
    QTest::mousePress(viewport(), button, modifiers, point);
  }
  void release(QPoint point, Qt::MouseButton button, Qt::KeyboardModifiers modifiers = Qt::NoModifier) const {
    QTest::mouseRelease(viewport(), button, modifiers, point);
  }
  void move(QPoint point) const { QTest::mouseMove(viewport(), point); }
  QImage renderCard(QtNodes::NodeId id) const { return surface().renderCard(id); }

  // Read the current Quick framebuffer. The QWidget backing store can
  // still hold a previous frame until its scheduled widget blit.
  QImage grabViewport() const {
    if (auto *quick = quickCanvas()) {
      quick->graphCanvas().flushRaster();
      if (quick->quickWidget().isVisible()) { return quick->quickWidget().grabFramebuffer(); }
    }
    return viewport()->grab().toImage();
  }
  // The host widget with its overlays as it is painted now.
  QImage grabHost() const {
    grabViewport();
    return surface().hostWidget().grab().toImage();
  }
  // QGraphicsScene::render of a scene area onto an image of the given size.
  QImage renderScene(const QRectF &sceneArea, QSize size) const {
    QImage image(size, QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);
    QPainter painter(&image);
    painter.setRenderHint(QPainter::Antialiasing);
    if (auto *scene = window_.qtNodesScene()) {
      scene->render(&painter, QRectF(QPointF(), QSizeF(size)), sceneArea);
    } else if (auto *quick = quickCanvas()) {
      painter.scale(size.width() / sceneArea.width(), size.height() / sceneArea.height());
      painter.translate(-sceneArea.topLeft());
      quick->graphCanvas().renderScene(painter, sceneArea, size.width() / sceneArea.width());
    }
    return image;
  }

  bool selected(QtNodes::NodeId id) const { return surface().selection().contains(id); }
  void select(QtNodes::NodeId id, bool selected) const { surface().selection().setNode(id, selected); }
  double opacity(QtNodes::NodeId id) const { return surface().nodeOpacity(id); }
  QPointF port(QtNodes::NodeId id, QtNodes::PortType side, QtNodes::PortIndex index) const {
    return surface().mapFromNode(id, surface().scene().nodeGeometry().portPosition(id, side, index));
  }
  // Whether card a stacks above card b where both are on screen.
  bool above(QtNodes::NodeId a, QtNodes::NodeId b) const {
    const auto order = surface().visibleNodes();
    const auto ai = order.indexOf(a), bi = order.indexOf(b);
    return ai >= 0 && bi >= 0 && ai < bi;
  }
  // The item stacking value: QGraphicsItem::zValue, or the Quick item's z.
  double z(QtNodes::NodeId id) const {
    if (auto *scene = window_.qtNodesScene()) {
      const auto *item = scene->nodeGraphicsObject(id);
      return item ? item->zValue() : 0;
    }
    const auto *item = quickCanvas() ? quickCanvas()->graphCanvas().scene().nodeItem(id) : nullptr;
    return item ? item->z() : 0;
  }
  // The object of a card, which stays the same while the card survives a projection.
  const QObject *cardObject(QtNodes::NodeId id) const {
    if (auto *scene = window_.qtNodesScene()) { return scene->nodeGraphicsObject(id); }
    return quickCanvas() ? quickCanvas()->graphCanvas().scene().nodeItem(id) : nullptr;
  }
  // The card's bounds in scene coordinates as its item reports them.
  QRectF cardItemBounds(QtNodes::NodeId id) const { return surface().nodeBounds(id); }

  std::optional<WireProbe> wire(const QtNodes::ConnectionId &id) const {
    if (auto *scene = window_.qtNodesScene()) {
      auto *item = scene->connectionGraphicsObject(id);
      if (!item) { return std::nullopt; }
      return WireProbe{item->mapToScene(item->endPoint(QtNodes::PortType::Out)),
                       item->mapToScene(item->endPoint(QtNodes::PortType::In)), item->isSelected(), item->isVisible(),
                       item->connectionState().requiresPort(), item->opacity(), item->mapToScene(item->shape()),
                       item->sceneBoundingRect()};
    }
    auto *item = quickCanvas() ? quickCanvas()->graphCanvas().scene().connectionItem(id) : nullptr;
    if (!item) { return std::nullopt; }
    return WireProbe{item->endPoint(QtNodes::PortType::Out), item->endPoint(QtNodes::PortType::In), item->isSelected(),
                     item->shown(), item->connectionState().requiresPort(), item->opacity(), item->hitPath(),
                     item->boundingRect()};
  }
  void selectWire(const QtNodes::ConnectionId &id, bool selected) const {
    if (auto *scene = window_.qtNodesScene()) {
      if (auto *item = scene->connectionGraphicsObject(id)) { item->setSelected(selected); }
    } else if (auto *quick = quickCanvas()) {
      if (auto *item = quick->graphCanvas().scene().connectionItem(id)) { quick->graphCanvas().scene().setSelected(*item, selected); }
    }
  }
  // The wire being dragged, if any.
  std::optional<WireProbe> draft() const {
    if (auto *scene = window_.qtNodesScene()) {
      auto *item = qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(scene->mouseGrabberItem());
      if (!item || !item->connectionState().requiresPort()) { return std::nullopt; }
      return WireProbe{item->mapToScene(item->endPoint(QtNodes::PortType::Out)),
                       item->mapToScene(item->endPoint(QtNodes::PortType::In)), item->isSelected(), item->isVisible(), true,
                       item->opacity(), item->mapToScene(item->shape()), item->sceneBoundingRect()};
    }
    auto *item = quickCanvas() ? quickCanvas()->graphCanvas().scene().draftConnection() : nullptr;
    if (!item) { return std::nullopt; }
    return WireProbe{item->endPoint(QtNodes::PortType::Out), item->endPoint(QtNodes::PortType::In), false, item->shown(), true,
                     item->opacity(), item->hitPath(), item->boundingRect()};
  }
  // Whether a pointer press is still held by an item of the canvas.
  bool grabbed() const {
    if (auto *scene = window_.qtNodesScene()) { return scene->mouseGrabberItem() != nullptr; }
    return quickCanvas() && quickCanvas()->graphCanvas().scene().mouseGrabber() != nullptr;
  }
  // Whether the wire being dragged draws above the card's item.
  bool draftAbove(QtNodes::NodeId card) const {
    if (auto *scene = window_.qtNodesScene()) {
      auto *item = qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(scene->mouseGrabberItem());
      auto *node = scene->nodeGraphicsObject(card);
      return item && node && item->zValue() > node->zValue();
    }
    auto &scene = quickCanvas()->graphCanvas().scene();
    auto *item = scene.draftConnection();
    auto *node = scene.nodeItem(card);
    return item && node && item->z() > node->z();
  }
  QuickCanvas *quickCanvas() const { return dynamic_cast<QuickCanvas *>(&surface()); }

private:
  EditorWindow &window_;
};

inline QImage grabCanvasViewport(EditorWindow &window) { return CanvasProbe(window).grabViewport(); }

// QGraphicsScene::render(painter, target, source) on either canvas.
inline void renderScene(EditorWindow &window, QPainter &painter, const QRectF &target, const QRectF &source) {
  if (auto *scene = window.qtNodesScene()) {
    scene->render(&painter, target, source);
    return;
  }
  auto *quick = dynamic_cast<QuickCanvas *>(&window.canvas());
  if (!quick) { return; }
  // KeepAspectRatio, centered in the target, as QGraphicsScene::render does.
  const double scale = std::min(target.width() / source.width(), target.height() / source.height());
  painter.save();
  painter.translate(target.center() - QPointF(source.width(), source.height()) * scale / 2);
  painter.scale(scale, scale);
  painter.translate(-source.topLeft());
  painter.setClipRect(source);
  quick->graphCanvas().renderScene(painter, source, scale);
  painter.restore();
}

}
