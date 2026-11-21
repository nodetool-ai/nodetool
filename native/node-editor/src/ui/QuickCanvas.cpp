#include "ui/QuickCanvas.h"

#include "canvas/ConnectionItem.h"
#include "canvas/GraphCanvas.h"
#include "canvas/LineageItem.h"
#include "canvas/NodeItem.h"
#include "graph/NodeLayout.h"
#include "graph/WorkflowGraphModel.h"
#include <QAbstractTextDocumentLayout>
#include <QApplication>
#include <QContextMenuEvent>
#include <QCursor>
#include <QHelpEvent>
#include <QPainter>
#include <QPainterPath>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QTextDocument>
#include <QToolTip>
#include <algorithm>

namespace nodetool {
using namespace QtNodes;
namespace {

// UI thread only. A note under a card on the Quick canvas, painted as
// QtNodesNote paints its QGraphicsObject. Its handle owns it; its visual
// parent is the card item, and the scene borrows it for hit tests.
class NoteItem final : public canvas::CanvasItem {
public:
  NoteItem(canvas::NodeItem &card, const QString &text, const QSizeF &size, const CanvasTheme &theme, bool reroute)
      : CanvasItem(*card.canvasScene(), Kind::Decoration, &card), theme_(theme), reroute_(reroute) {
    setCanvasButtons(Qt::LeftButton);
    setAcceptsCanvasHover(true);
    setPointerCursor(reroute_ ? Qt::ArrowCursor : Qt::IBeamCursor);
    QFont font(theme.sansFamily);
    font.setPixelSize(node_metrics::fontValue);
    document_.setDefaultFont(font);
    document_.setDocumentMargin(0);
    document_.setPlainText(text);
    if (reroute_) {
      auto option = document_.defaultTextOption();
      option.setAlignment(Qt::AlignHCenter);
      option.setWrapMode(QTextOption::WrapAtWordBoundaryOrAnywhere);
      document_.setDefaultTextOption(option);
    }
    naturalWidth_ = document_.idealWidth() + (reroute_ ? 16 : 44);
    setZ(1);
    updateCardGeometry(size);
  }
  std::function<void()> edit, remove;

  void updateCardGeometry(const QSizeF &size) {
    const auto width = reroute_ ? std::clamp(naturalWidth_, 20.0, 130.0)
                                : std::clamp(naturalWidth_, 120.0, std::max(120.0, size.width() - 16));
    if (width != width_) {
      width_ = width;
      document_.setTextWidth(width_ - (reroute_ ? 16 : 44));
      height_ = reroute_ ? document_.size().height() + 4 : std::max(30.0, document_.size().height() + 16);
    }
    setPosition(QPointF(reroute_ ? (size.width() - width_) / 2 : 8, size.height() + (reroute_ ? 6 : 10)));
    setSize(QSizeF(width_, height_));
    reindex();
    markDirty();
  }
  QRectF sceneBoundingRect() const override { return QRectF(0, -4, width_, height_ + 4).translated(scenePosition()); }

  void mousePress(canvas::CanvasMouseEvent &event) override {
    event.accept();
    if (!reroute_ && removeRect().contains(event.scenePos - scenePosition())) {
      const auto callback = remove;
      if (callback) { callback(); }
    }
  }
  void mouseDoubleClick(canvas::CanvasMouseEvent &event) override {
    event.accept();
    if (reroute_ || !removeRect().contains(event.scenePos - scenePosition())) {
      const auto callback = edit;
      if (callback) { callback(); }
    }
  }
  void hoverEnter(const canvas::CanvasMouseEvent &) override {
    hovered_ = true;
    markDirty();
  }
  void hoverLeave(const canvas::CanvasMouseEvent &) override {
    hovered_ = false;
    markDirty();
  }

  void paintRaster(QPainter &painter, double) const override {
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setPen(QPen(theme_.divider, node_metrics::borderWidth));
    auto background = reroute_ ? theme_.node : theme_.field;
    if (reroute_) { background.setAlphaF(0.85); }
    painter.setBrush(background);
    const auto radius = reroute_ ? node_metrics::micro : node_metrics::radius;
    painter.drawRoundedRect(QRectF(0, 0, width_, height_), radius, radius);
    if (!reroute_) {
      QPainterPath tail;
      tail.moveTo(16, 0);
      tail.lineTo(20, -4);
      tail.lineTo(24, 0);
      painter.drawPath(tail);
    }
    QAbstractTextDocumentLayout::PaintContext context;
    context.palette.setColor(QPalette::Text, theme_.textSecondary);
    painter.save();
    painter.translate(reroute_ ? 8 : 12, reroute_ ? 2 : 8);
    document_.documentLayout()->draw(&painter, context);
    painter.restore();
    if (hovered_ && !reroute_) {
      painter.setPen(QPen(theme_.textSecondary, node_metrics::borderWidth));
      const auto center = removeRect().center();
      painter.drawLine(center + QPointF(-3, -3), center + QPointF(3, 3));
      painter.drawLine(center + QPointF(-3, 3), center + QPointF(3, -3));
    }
  }

private:
  QRectF removeRect() const { return {width_ - 26, 6, 18, 18}; }
  // A copy: the note can outlive the scene whose theme it was given.
  CanvasTheme theme_;
  QTextDocument document_;
  double width_ = 0, height_ = 30, naturalWidth_ = 120;
  bool hovered_ = false, reroute_ = false;
};

// UI thread only. Owns the note item until the presenter drops the handle.
class NoteHandle final : public CanvasNote {
public:
  explicit NoteHandle(std::unique_ptr<NoteItem> note) : note_(std::move(note)) {}
  void updateCardGeometry(QSizeF size) override { note_->updateCardGeometry(size); }
  void setVisible(bool visible) override {
    note_->setShown(visible);
    note_->setVisible(visible);
  }

private:
  std::unique_ptr<NoteItem> note_;
};

} // namespace

QuickCanvas::QuickCanvas(WorkflowGraphModel &model, QWidget &parent, QQmlEngine *engine) : model_(model) {
  // The shell owns the QQuickWidget through the Qt parent tree. It is both
  // the host and the viewport: it takes the keys a QGraphicsView takes, and
  // overlays share the GraphCanvas scene graph.
  auto *widget = engine ? new QQuickWidget(engine, &parent) : new QQuickWidget(&parent);
  widget->setObjectName(QStringLiteral("quick-canvas"));
  widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
  widget->setFocusPolicy(Qt::StrongFocus);
  widget->setAcceptDrops(true);
  widget->setMouseTracking(true);
  // QQuickWidget recreates its offscreen window on reparent under RHI and only
  // carries its registered root item across. The widget owns this host item.
  auto *root = new QQuickItem();
  root->setParent(widget);
  widget->setContent(QUrl(), nullptr, root);
  host_ = widget;
  widget_ = widget;
  canvas_ = std::make_unique<canvas::GraphCanvas>(model);
  canvas_->setOverlayFocusCheck([host = QPointer<QQuickWidget>(widget)] {
    const auto *focus = QApplication::focusWidget();
    return host && focus && focus != host && host->isAncestorOf(focus);
  });
  canvas_->setClip(true);
  canvas_->setParentItem(root);
  canvas_->setSize(widget->size());
  widget->installEventFilter(this);
  auto &graph = *canvas_;
  auto &scene = graph.scene();
  connect(&graph, &canvas::GraphCanvas::pointerCursorChanged, widget_, &QWidget::setCursor);
  connect(&scene, &canvas::CanvasScene::changed, this, &CanvasSurface::sceneChanged);
  connect(&graph, &canvas::GraphCanvas::viewportMoved, this, &CanvasSurface::viewportMoved);
  connect(&graph, &canvas::GraphCanvas::rubberBandChanged, this, &CanvasSurface::rubberBandChanged);
  connect(&scene, &canvas::CanvasScene::nodeClicked, this, &CanvasSurface::nodeClicked);
  connect(&scene, &canvas::CanvasScene::nodeDoubleClicked, this, &CanvasSurface::nodeDoubleClicked);
  connect(&scene, &canvas::EditorCanvasScene::branchDimmingChanged, this, &CanvasSurface::branchDimmingChanged);
}

QuickCanvas::~QuickCanvas() {
  if (widget_) { widget_->removeEventFilter(this); }
  // The items release their textures while the window still exists.
  canvas_.reset();
}

canvas::CanvasScene &QuickCanvas::canvasScene() const { return canvas_->scene(); }
QQuickWidget &QuickCanvas::quickWidget() const { return *widget_; }

canvas::GraphCanvas &QuickCanvas::graph() const {
  // The widget's size is current before its Resize event reaches any filter,
  // as a QGraphicsView viewport's is, so the canvas follows it on every call.
  if (widget_ && canvas_->size() != QSizeF(widget_->size())) { canvas_->setSize(widget_->size()); }
  return *canvas_;
}

QPointF QuickCanvas::mapToScene(QPoint point) const { return graph().viewport().mapToScene(point); }
QPoint QuickCanvas::mapFromScene(QPointF point) const { return graph().viewport().mapFromScene(point); }
QRect QuickCanvas::mapFromScene(QRectF rect) const { return graph().viewport().mapFromScene(rect); }
QRectF QuickCanvas::visibleSceneRect() const { return graph().viewport().visibleSceneRect(); }
QTransform QuickCanvas::viewportTransform() const { return graph().viewport().viewportTransform(); }
double QuickCanvas::zoom() const { return graph().viewport().zoom(); }
QPointF QuickCanvas::center() const {
  return viewportTransform().inverted().map(QRectF(QRect(QPoint(), graph().viewport().size())).center());
}
void QuickCanvas::centerOn(QPointF position) { graph().centerOn(position); }
void QuickCanvas::setView(double zoom, QPointF center) { graph().setView(zoom, center); }
void QuickCanvas::scaleBy(double factor, ZoomAnchor anchor) {
  const bool pointer = anchor == ZoomAnchor::Pointer && widget_->underMouse();
  graph().scaleBy(factor, pointer, widget_->mapFromGlobal(QCursor::pos()));
}
void QuickCanvas::ensureVisible(QRectF rect, int margin) { graph().ensureVisible(rect, margin); }
void QuickCanvas::panBy(QPoint pixels) {
  const auto scroll = graph().viewport().scroll();
  graph().setScroll(scroll.x() - pixels.x(), scroll.y() - pixels.y());
}
int QuickCanvas::horizontalOffset() const { return graph().viewport().scroll().x(); }
void QuickCanvas::setHorizontalOffset(int offset) { graph().setScroll(offset, graph().viewport().scroll().y()); }

bool QuickCanvas::hasNode(NodeId id) const { return canvas_->scene().nodeItem(id) != nullptr; }
QRectF QuickCanvas::nodeRect(NodeId id) const { return mapRectFromNode(id, QRectF(QPointF(), model_.layout(id).size)); }
QRectF QuickCanvas::nodeBounds(NodeId id) const {
  const auto *node = canvas_->scene().nodeItem(id);
  return node ? node->sceneBoundingRect() : QRectF{};
}
QRectF QuickCanvas::edgeBounds(const ConnectionId &id) const {
  const auto *edge = canvas_->scene().connectionItem(id);
  return edge ? edge->boundingRect() : QRectF{};
}
QPointF QuickCanvas::nodeOrigin(NodeId id) const {
  const auto *node = canvas_->scene().nodeItem(id);
  return node ? node->scenePosition() : QPointF{};
}
QPointF QuickCanvas::mapFromNode(NodeId id, QPointF local) const {
  const auto *node = canvas_->scene().nodeItem(id);
  return node ? node->scenePosition() + local : QPointF{};
}
QRectF QuickCanvas::mapRectFromNode(NodeId id, QRectF local) const {
  const auto *node = canvas_->scene().nodeItem(id);
  return node ? local.translated(node->scenePosition()) : QRectF{};
}
QPointF QuickCanvas::mapToNode(NodeId id, QPointF point) const {
  const auto *node = canvas_->scene().nodeItem(id);
  return node ? point - node->scenePosition() : QPointF{};
}
double QuickCanvas::nodeOpacity(NodeId id) const {
  const auto *node = canvas_->scene().nodeItem(id);
  return node ? node->opacity() : 0.0;
}

QList<NodeId> QuickCanvas::visibleNodes() const {
  QList<canvas::NodeItem *> nodes;
  for (auto *item : canvas_->scene().itemsIn(visibleSceneRect())) {
    if (auto *node = dynamic_cast<canvas::NodeItem *>(item)) { nodes.append(node); }
  }
  std::sort(nodes.begin(), nodes.end(), [](const auto *a, const auto *b) { return a->z() > b->z(); });
  QList<NodeId> ids;
  for (const auto *node : nodes) { ids.append(node->nodeId()); }
  return ids;
}

NodeId QuickCanvas::nodeAt(QPoint point, bool includeDecorations) const {
  const auto scenePoint = mapToScene(point);
  if (!includeDecorations) {
    // QGraphicsScene::items with Qt::IntersectsItemBoundingRect.
    QList<canvas::NodeItem *> nodes;
    for (auto *item : canvas_->scene().itemsIn(QRectF(scenePoint, QSizeF(0, 0)))) {
      auto *node = dynamic_cast<canvas::NodeItem *>(item);
      if (node && node->sceneBoundingRect().contains(scenePoint)) { nodes.append(node); }
    }
    if (nodes.isEmpty()) { return InvalidNodeId; }
    return (*std::max_element(nodes.cbegin(), nodes.cend(), [](const auto *a, const auto *b) { return a->z() < b->z(); }))
        ->nodeId();
  }
  for (auto *item : canvas_->scene().itemsAt(scenePoint)) {
    for (QQuickItem *step = item; step; step = step->parentItem()) {
      if (auto *node = dynamic_cast<canvas::NodeItem *>(step)) { return node->nodeId(); }
    }
  }
  return InvalidNodeId;
}

bool QuickCanvas::hasItemAt(QPoint point) const { return !canvas_->scene().itemsAt(mapToScene(point)).isEmpty(); }

bool QuickCanvas::lineageAt(QPoint point) const {
  const auto items = canvas_->scene().itemsAt(mapToScene(point));
  return !items.isEmpty() && items.first()->kind() == canvas::CanvasItem::Kind::Lineage;
}

std::optional<ConnectionId> QuickCanvas::edgeAt(QPoint point) const {
  const auto items = canvas_->scene().itemsAt(mapToScene(point));
  const auto *wire = items.isEmpty() ? nullptr : dynamic_cast<const canvas::ConnectionItem *>(items.first());
  if (wire && !wire->connectionState().requiresPort()) { return wire->connectionId(); }
  return std::nullopt;
}

EditorSceneApi &QuickCanvas::scene() const { return canvas_->scene(); }
CanvasSelection &QuickCanvas::selection() const { return canvas_->selection(); }
bool QuickCanvas::rubberBandActive() const { return canvas_->rubberBandActive(); }
void QuickCanvas::setHandDrag(bool enabled) { canvas_->setHandDrag(enabled); }
void QuickCanvas::requestRepaint() {
  // QGraphicsView repaints its cached items and the foreground.
  emit canvas_->scene().foregroundChanged();
}
void QuickCanvas::setCursor(const QCursor &cursor) { widget_->setCursor(cursor); }
void QuickCanvas::setFocus(Qt::FocusReason reason) {
  widget_->setFocus(reason);
  canvas_->focusCanvas(reason);
}

QImage QuickCanvas::capture(canvas_capture::Mode mode) const {
  canvas_->flushRaster();
  // Renders the pending frame now, so the widget paints the current scene.
  if (widget_->isVisible()) { widget_->grabFramebuffer(); }
  return canvas_capture::capture(*host_->window(), mode);
}

QImage QuickCanvas::renderCard(NodeId id) const {
  if (!hasNode(id)) { return {}; }
  const auto rect = nodeRect(id);
  if (rect.isEmpty()) { return {}; }
  QImage image(rect.size().toSize(), QImage::Format_ARGB32_Premultiplied);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setRenderHint(QPainter::TextAntialiasing);
  // QGraphicsScene::render maps the source rectangle onto the image.
  painter.translate(-rect.topLeft());
  canvas_->renderScene(painter, rect, 1);
  return image;
}

std::unique_ptr<CanvasNote> QuickCanvas::addNote(NodeId id, const QString &text, const QString &name,
                                                 std::function<void()> edit, std::function<void()> remove) {
  auto *card = canvas_->scene().nodeItem(id);
  if (!card) { return {}; }
  auto note = std::make_unique<NoteItem>(*card, text, model_.layout(id).size, canvas_->scene().theme(), model_.isReroute(id));
  note->setObjectName(name);
  note->edit = std::move(edit);
  note->remove = std::move(remove);
  return std::make_unique<NoteHandle>(std::move(note));
}

QWidget &QuickCanvas::hostWidget() const { return *host_; }
QWidget &QuickCanvas::viewportWidget() const { return *widget_; }

bool QuickCanvas::eventFilter(QObject *object, QEvent *event) {
  if (object != widget_) { return CanvasSurface::eventFilter(object, event); }
  switch (event->type()) {
  case QEvent::Resize:
    canvas_->setSize(widget_->size());
    break;
  case QEvent::Show:
    graph().setViewShown(true);
    break;
  case QEvent::Hide:
    canvas_->setViewShown(false);
    break;
  case QEvent::UngrabMouse:
    canvas_->cancelPointerGrab();
    break;
  case QEvent::MouseMove: {
    auto &move = *static_cast<QMouseEvent *>(event);
    if (canvas_->moveGrabbedCard(move)) { return true; }
    if (move.buttons() == Qt::NoButton) { canvas_->notePointerMove(); }
    break;
  }
  case QEvent::MouseButtonDblClick:
    canvas_->expectDoubleClick();
    break;
  case QEvent::ContextMenu: {
    const auto &menu = *static_cast<QContextMenuEvent *>(event);
    canvas_->contextMenu(menu.pos(), menu.globalPos(), menu.modifiers());
    event->accept();
    return true;
  }
  case QEvent::ToolTip: {
    const auto &help = *static_cast<QHelpEvent *>(event);
    QString text;
    const auto items = canvas_->scene().itemsAt(mapToScene(help.pos()));
    for (const auto *item : items) {
      if (const auto *node = dynamic_cast<const canvas::NodeItem *>(item)) {
        text = canvas_->scene().toolTip(node->nodeId());
      } else if (const auto *link = dynamic_cast<const canvas::LineageItem *>(item)) {
        text = link->toolTip();
      }
      if (!text.isEmpty()) { break; }
    }
    if (text.isEmpty()) {
      QToolTip::hideText();
      event->ignore();
    } else {
      QToolTip::showText(help.globalPos(), text, widget_);
    }
    return true;
  }
  default:
    break;
  }
  return false;
}

} // namespace nodetool
