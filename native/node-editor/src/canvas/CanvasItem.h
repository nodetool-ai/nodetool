#pragma once

#include <QHash>
#include <QImage>
#include <QPointer>
#include <QQuickItem>
#include <functional>
#include <optional>
#include <utility>

class QKeyEvent;
class QPainter;

namespace nodetool::canvas {
class CanvasScene;

// UI thread only. Owns the tile images. Scene graph sync borrows them while
// the UI thread is blocked. The scene graph owns the returned nodes and textures.
class CanvasImageItem : public QQuickItem {
public:
  explicit CanvasImageItem(QQuickItem *parent = nullptr);

  static constexpr int tileSide = 512;
  struct RasterGeometry {
    QRect device;
    QPointF phase;
    double scale;
    QPointF viewportPhase;
    qsizetype bytes() const { return qsizetype(device.width()) * device.height() * 4; }
    QRectF localRect() const;
    bool operator==(const RasterGeometry &) const = default;
  };
  struct Tile {
    RasterGeometry geometry;
    QImage pixels;
    quint64 revision;
    double zoom;
    // Empty tiles have a smaller retained cost but still consume cache space.
    qsizetype bytes() const { return pixels.sizeInBytes() + sizeof(Tile); }
  };

  virtual void paintRaster(QPainter &painter, double zoom) const = 0;
  const QHash<QPoint, Tile> &tiles() const { return tiles_; }
  void setTile(QPoint key, Tile tile);
  void removeTile(QPoint key);
  void clearImage();
  bool hasImage() const;
  qsizetype rasterBytes() const;
  quint64 rasterRevision() const { return revision_; }
  void invalidateImage() { ++revision_; }

  static RasterGeometry rasterGeometry(const QRectF &rect, QPointF sceneOrigin, double scale, QPointF viewportPhase);
  static QImage rasterize(const RasterGeometry &geometry, double dpr, const std::function<void(QPainter &)> &paint);
  static QRectF alignedImageRect(const Tile &tile, const QRectF &windowRect, double dpr);

protected:
  QSGNode *updatePaintNode(QSGNode *old, UpdatePaintNodeData *) override;
  void geometryChange(const QRectF &geometry, const QRectF &previous) override;
  void releaseResources() override;
  void itemChange(ItemChange change, const ItemChangeData &value) override;

private:
  QHash<QPoint, Tile> tiles_;
  quint64 revision_ = 0;
};

// UI thread only. The QGraphicsSceneMouseEvent fields the Quick canvas items read.
struct CanvasMouseEvent {
  QPointF scenePos;
  QPointF lastScenePos;
  QPointF buttonDownScenePos;
  QPoint screenPos;
  Qt::MouseButton button = Qt::NoButton;
  Qt::MouseButtons buttons = Qt::NoButton;
  Qt::KeyboardModifiers modifiers = Qt::NoModifier;
  bool accepted = true;
  void accept() { accepted = true; }
  void ignore() { accepted = false; }
};

// UI thread only. A canvas item that the scene hit tests, indexes and sends
// pointer events to, as QGraphicsScene does for its items. The scene borrows
// the item while it is registered. Cards and connections are owned by the
// scene. Notes and lineage links are owned by their presenters; the scene
// detaches them when it is destroyed first.
class CanvasItem : public CanvasImageItem {
public:
  enum class Kind { Node, Connection, Lineage, Decoration };
  CanvasItem(CanvasScene &scene, Kind kind, QQuickItem *parent);
  ~CanvasItem() override;

  Kind kind() const { return kind_; }
  quint64 indexKey() const { return key_; }
  CanvasScene *canvasScene() const { return scene_; }
  void detachScene() { scene_ = nullptr; }

  // The item's hit area in scene coordinates, which the grid index stores.
  virtual QRectF sceneBoundingRect() const = 0;
  // The shape test of QGraphicsItem::shape(). The default is the bounds.
  virtual QRectF rasterBounds() const { return sceneBoundingRect().translated(-scenePosition()); }
  std::optional<Qt::CursorShape> pointerCursor() const { return cursor_; }
  void setPointerCursor(std::optional<Qt::CursorShape> cursor) { cursor_ = cursor; }
  virtual bool hitTest(const QPointF &scenePoint) const;
  // The card-local or scene origin of the item: the sum of the positions
  // from the content layer down to the item.
  QPointF scenePosition() const;

  // Model visibility, kept apart from culling, which uses QQuickItem's flag.
  bool shown() const { return shown_; }
  void setShown(bool shown);
  // Shown, attached to the content layer, and every parent shown.
  bool effectivelyShown() const;

  Qt::MouseButtons canvasButtons() const { return buttons_; }
  void setCanvasButtons(Qt::MouseButtons buttons) { buttons_ = buttons; }
  bool acceptsCanvasHover() const { return hover_; }
  void setAcceptsCanvasHover(bool hover) { hover_ = hover; }

  // QGraphicsItem's mouse handlers. An event arrives accepted; an item that
  // does not want it calls ignore().
  virtual void mousePress(CanvasMouseEvent &event) { event.ignore(); }
  virtual void mouseMove(CanvasMouseEvent &) {}
  virtual void mouseRelease(CanvasMouseEvent &) {}
  virtual void mouseDoubleClick(CanvasMouseEvent &event) { mousePress(event); }
  virtual void hoverEnter(const CanvasMouseEvent &) {}
  virtual void hoverMove(const CanvasMouseEvent &) {}
  virtual void hoverLeave(const CanvasMouseEvent &) {}
  virtual bool keyPress(QKeyEvent &) { return false; }

  // Stacking: the z of the item's top-level ancestor, then the depth below it,
  // so that a card's decorations sort directly above the card.
  std::pair<double, int> stackKey() const;
  // Updates the item's entry in the scene's grid index.
  void reindex();
  // Asks the raster pass for a new image.
  void markDirty();

protected:
  void itemChange(ItemChange change, const ItemChangeData &value) override;

private:
  CanvasScene *scene_;
  Kind kind_;
  quint64 key_ = 0;
  Qt::MouseButtons buttons_ = Qt::AllButtons;
  bool hover_ = false;
  bool shown_ = true;
  std::optional<Qt::CursorShape> cursor_;
};

} // namespace nodetool::canvas
