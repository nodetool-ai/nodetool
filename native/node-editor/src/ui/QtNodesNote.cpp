#include "ui/QtNodesCanvas.h"

#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QAbstractTextDocumentLayout>
#include <QGraphicsObject>
#include <QGraphicsSceneMouseEvent>
#include <QPainter>
#include <QPainterPath>
#include <QPointer>
#include <QTextDocument>
#include <algorithm>

namespace nodetool {
namespace {
// UI thread only. Owned by its card while attached.
class NoteItem final : public QGraphicsObject {
public:
  NoteItem(const QString &text, const QSizeF &size, EditorScene &scene, bool reroute)
      : scene_(scene), reroute_(reroute) {
    setAcceptHoverEvents(true);
    setAcceptedMouseButtons(Qt::LeftButton);
    setCursor(reroute_ ? Qt::ArrowCursor : Qt::IBeamCursor);
    QFont font(scene.theme().sansFamily); font.setPixelSize(node_metrics::fontValue);
    document_.setDefaultFont(font); document_.setDocumentMargin(0); document_.setPlainText(text);
    if (reroute_) {
      auto option = document_.defaultTextOption();
      option.setAlignment(Qt::AlignHCenter);
      option.setWrapMode(QTextOption::WrapAtWordBoundaryOrAnywhere);
      document_.setDefaultTextOption(option);
    }
    naturalWidth_ = document_.idealWidth() + (reroute_ ? 16 : 44);
    updateCardGeometry(size);
    setZValue(1);
  }
  void updateCardGeometry(const QSizeF &size) {
    const auto width = reroute_ ? std::clamp(naturalWidth_, 20.0, 130.0) : std::clamp(naturalWidth_, 120.0, std::max(120.0, size.width() - 16));
    if (width != width_) {
      prepareGeometryChange(); width_ = width; document_.setTextWidth(width_ - (reroute_ ? 16 : 44));
      height_ = reroute_ ? document_.size().height() + 4 : std::max(30.0, document_.size().height() + 16);
    }
    setPos(reroute_ ? (size.width() - width_) / 2 : 8, size.height() + (reroute_ ? 6 : 10));
    update();
  }
  std::function<void()> edit, remove;
  QRectF boundingRect() const override { return {0, -4, width_, height_ + 4}; }
  QRectF surfaceRect() const { return {0, 0, width_, height_}; }
  void paint(QPainter *painter, const QStyleOptionGraphicsItem *, QWidget *) override {
    const auto theme = scene_.theme();
    painter->setPen(QPen(theme.divider, node_metrics::borderWidth));
    auto background = reroute_ ? theme.node : theme.field;
    if (reroute_) { background.setAlphaF(0.85); }
    painter->setBrush(background);
    const auto radius = reroute_ ? node_metrics::micro : node_metrics::radius;
    painter->drawRoundedRect(surfaceRect(), radius, radius);
    if (!reroute_) {
      QPainterPath tail; tail.moveTo(16, 0); tail.lineTo(20, -4); tail.lineTo(24, 0);
      painter->drawPath(tail);
    }
    QAbstractTextDocumentLayout::PaintContext context; context.palette.setColor(QPalette::Text, theme.textSecondary);
    painter->save(); painter->translate(reroute_ ? 8 : 12, reroute_ ? 2 : 8); document_.documentLayout()->draw(painter, context); painter->restore();
    if (hovered_ && !reroute_) {
      painter->setPen(QPen(theme.textSecondary, node_metrics::borderWidth));
      const auto center = removeRect().center();
      painter->drawLine(center + QPointF(-3, -3), center + QPointF(3, 3));
      painter->drawLine(center + QPointF(-3, 3), center + QPointF(3, -3));
    }
  }
protected:
  void hoverEnterEvent(QGraphicsSceneHoverEvent *) override { hovered_ = true; update(); }
  void hoverLeaveEvent(QGraphicsSceneHoverEvent *) override { hovered_ = false; update(); }
  void mousePressEvent(QGraphicsSceneMouseEvent *event) override {
    event->accept();
    if (!reroute_ && removeRect().contains(event->pos())) {
      const auto callback = remove;
      if (callback) { callback(); }
    }
  }
  void mouseDoubleClickEvent(QGraphicsSceneMouseEvent *event) override {
    event->accept();
    if (reroute_ || !removeRect().contains(event->pos())) {
      const auto callback = edit;
      if (callback) { callback(); }
    }
  }
private:
  QRectF removeRect() const { return {width_ - 26, 6, 18, 18}; }
  EditorScene &scene_;
  QTextDocument document_;
  double width_ = 0, height_ = 30, naturalWidth_ = 120;
  bool hovered_ = false, reroute_ = false;
};

// UI thread only. Tracks removal by the card or detaches the item when the
// presenter drops its handle.
class NoteHandle final : public CanvasNote {
public:
  explicit NoteHandle(NoteItem &note) : note_(&note) {}
  ~NoteHandle() override {
    if (!note_) { return; }
    note_->setParentItem(nullptr);
    if (auto *scene = note_->scene()) { scene->removeItem(note_); }
    const std::unique_ptr<NoteItem> detached(note_.data());
  }
  void updateCardGeometry(QSizeF size) override {
    if (note_) { note_->updateCardGeometry(size); }
  }
  void setVisible(bool visible) override {
    if (note_) { note_->setVisible(visible); }
  }

private:
  QPointer<NoteItem> note_;
};

}

std::unique_ptr<CanvasNote> QtNodesCanvas::addNote(QtNodes::NodeId id, const QString &text,
                                                 const QString &name, std::function<void()> edit,
                                                 std::function<void()> remove) {
  auto *card = graphicsNode(scene_, id);
  if (!card) { return {}; }
  const auto &model = static_cast<const WorkflowGraphModel &>(scene_.graphModel());
  auto note = std::make_unique<NoteItem>(text, model.layout(id).size, scene_, model.isReroute(id));
  note->setObjectName(name);
  note->edit = std::move(edit);
  note->remove = std::move(remove);
  auto handle = std::make_unique<NoteHandle>(*note);
  note.release()->setParentItem(card);
  return handle;
}

}
