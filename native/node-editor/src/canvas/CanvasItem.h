#pragma once

#include <QColor>
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
//
// An item holds two tile grids. The published grid is what the renderers
// draw. The staged grid collects tiles for a different raster grid (a new
// scale or device phase) and replaces the published grid in one step, so the
// item never shows a partly painted grid. Content revisions say whether a
// tile still shows the item: a full invalidation makes every tile stale, and
// a region invalidation marks only the tiles it touches, with the area to
// repaint.
class CanvasImageItem : public QQuickItem {
public:
  explicit CanvasImageItem(QQuickItem *parent = nullptr);

  static constexpr int tileSide = 512;
  struct RasterGeometry {
    QRect device;
    QPointF phase;
    double scale;
    QPointF viewportPhase;
    bool tiled = false;
    qsizetype bytes() const { return qsizetype(device.width()) * device.height() * 4; }
    // Where the tile is drawn, in item coordinates.
    QRectF localRect() const;
    // The item area the tile's pixels were painted from.
    QRectF paintRect() const;
    bool operator==(const RasterGeometry &) const = default;
    bool sameGrid(const RasterGeometry &other) const {
      return scale == other.scale && phase == other.phase && viewportPhase == other.viewportPhase && tiled == other.tiled;
    }
  };
  struct Tile {
    RasterGeometry geometry;
    QImage pixels;
    quint64 revision;
    double zoom;
    // Item coordinates to repaint at the current revision, from region invalidations.
    QRectF damage;
    // Bounding box of non-transparent pixels inside pixels; empty skips drawing.
    QRect contentRect;
    // Valid when every pixel in the tile shares one premultiplied color (e.g.
    // interior group tiles), allowing SoftwareCanvasNode to fill without scaling.
    QColor solidColor;
    // Empty tiles have a smaller retained cost but still consume cache space.
    qsizetype bytes() const { return pixels.sizeInBytes() + sizeof(Tile); }
  };

  virtual void paintRaster(QPainter &painter, double zoom) const = 0;
  // Whether painting can touch the item area. A long wire's tiles that miss
  // its path stay empty without being painted.
  virtual bool mayPaint(const QRectF &) const { return true; }
  const QHash<QPoint, Tile> &tiles() const { return tiles_; }
  void setIndividualSoftwareRendering(bool enabled);
  void setTile(QPoint key, Tile tile);
  void removeTile(QPoint key);
  const QHash<QPoint, Tile> &stagedTiles() const { return staged_; }
  void stageTile(QPoint key, Tile tile) { staged_.insert(key, std::move(tile)); }
  void removeStagedTile(QPoint key) { staged_.remove(key); }
  void discardStagedTiles() { staged_.clear(); }
  void publishStagedTiles();
  void clearImage();
  bool hasImage() const;
  qsizetype rasterBytes() const;
  quint64 rasterRevision() const { return revision_; }
  // Whether the tile shows the item's current content.
  bool tileCurrent(const Tile &tile) const { return tile.revision == revision_ && tile.damage.isEmpty(); }
  void invalidateImage() { ++revision_; }
  // Only the parts of the item inside the rectangles changed. Tiles outside
  // them stay current, and tiles inside them repaint those parts.
  void invalidateRegion(const QList<QRectF> &region);

  static RasterGeometry rasterGeometry(const QRectF &rect, QPointF sceneOrigin, double scale, QPointF viewportPhase);
  // The geometry of rect on an existing grid, with that grid's item phase.
  static RasterGeometry rasterGeometryOnGrid(const QRectF &rect, const RasterGeometry &grid);
  // Paints a tile. With a base image, only the damaged item area is painted
  // again, on a copy of the base. A detached spare of the tile's size is
  // painted over instead of allocating a new image.
  static QImage rasterize(const RasterGeometry &geometry, double dpr, const std::function<void(QPainter &)> &paint,
                          const QImage &base = {}, const QRectF &damage = {}, QImage spare = {});
  static QRectF alignedImageRect(const QRectF &windowRect, double dpr);
  // Where a tile is drawn in window coordinates. A tile at the display's
  // scale is drawn 1:1 from its rounded top-left, even when it keeps an older
  // sub-pixel phase. Other tiles stretch to the rounded edges of their area.
  static QRectF tileTarget(const QRectF &windowRect, const QImage &pixels, double dpr);

protected:
  bool individualSoftwareRendering_ = false;
  QSGNode *updatePaintNode(QSGNode *old, UpdatePaintNodeData *) override;
  void geometryChange(const QRectF &geometry, const QRectF &previous) override;
  void releaseResources() override;
  void itemChange(ItemChange change, const ItemChangeData &value) override;

private:
  QHash<QPoint, Tile> tiles_;
  QHash<QPoint, Tile> staged_;
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
  // Asks the raster pass to repaint only the given item rectangles.
  void markDirty(const QList<QRectF> &region);
  // True when the item renders directly with GPU vector geometry instead of CPU tiles.
  virtual bool isVectorPainted() const { return false; }

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
