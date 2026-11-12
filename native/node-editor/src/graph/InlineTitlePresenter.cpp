#include "InlineTitlePresenter.h"
#include "EditorScene.h"
#include "WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include <QApplication>
#include <QAbstractTextDocumentLayout>
#include <QGraphicsObject>
#include <QGraphicsSceneMouseEvent>
#include <QGraphicsView>
#include <QKeyEvent>
#include <QPainter>
#include <QPainterPath>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QScrollBar>
#include <QSet>
#include <QTextDocument>
#include <QTimer>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <algorithm>
#include <cmath>
namespace nodetool {
namespace {
class TitleEditorWidget final : public QQuickWidget {
public:
  TitleEditorWidget(QQmlEngine *engine, QWidget *parent) : QQuickWidget(engine, parent) {}
protected:
  bool event(QEvent *event) override {
    if (event->type() == QEvent::ShortcutOverride) { event->accept(); return true; }
    return QQuickWidget::event(event);
  }
  void keyPressEvent(QKeyEvent *event) override { QQuickWidget::keyPressEvent(event); event->accept(); }
  void keyReleaseEvent(QKeyEvent *event) override { QQuickWidget::keyReleaseEvent(event); event->accept(); }
};
class NoteItem final : public QGraphicsObject {
public:
  NoteItem(const QString &text, const QSizeF &size, EditorScene &scene, QGraphicsItem *parent, bool reroute = false)
      : QGraphicsObject(parent), scene_(scene), reroute_(reroute) {
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
    if (!reroute_ && removeRect().contains(event->pos())) { if (remove) remove(); }
  }
  void mouseDoubleClickEvent(QGraphicsSceneMouseEvent *event) override {
    event->accept(); if ((reroute_ || !removeRect().contains(event->pos())) && edit) edit();
  }
private:
  QRectF removeRect() const { return {width_ - 26, 6, 18, 18}; }
  EditorScene &scene_;
  QTextDocument document_;
  double width_ = 0, height_ = 30, naturalWidth_ = 120;
  bool hovered_ = false, reroute_ = false;
};
}
InlineTitlePresenter::InlineTitlePresenter(WorkflowGraphModel &model, EditorScene &scene,
    QGraphicsView &view, QQmlEngine *engine, QObject *parent)
    : QObject(parent), model_(model), scene_(scene), view_(view), engine_(engine) {
  connect(&scene_, &EditorScene::titleEditRequested, this, &InlineTitlePresenter::activate);
  connect(&model_, &WorkflowGraphModel::projectionAboutToChange, this, [this] { cancel(); clearNotes(); clearControls(); });
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, [this] { QTimer::singleShot(0, this, &InlineTitlePresenter::refresh); });
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, [this](QtNodes::NodeId id) {
    if (const auto note = notes_.value(id); note && model_.nodeExists(id))
      static_cast<NoteItem *>(note.data())->updateCardGeometry(model_.layout(id).size);
    reposition();
  });
  connect(&model_, &WorkflowGraphModel::nodePositionUpdated, this, [this](QtNodes::NodeId) { reposition(); });
  connect(&scene_, &QGraphicsScene::selectionChanged, this, [this] { if (active() && !current()) cancel(); });
  connect(view.horizontalScrollBar(), &QScrollBar::valueChanged, this, &InlineTitlePresenter::reposition);
  connect(view.verticalScrollBar(), &QScrollBar::valueChanged, this, &InlineTitlePresenter::reposition);
  qApp->installEventFilter(this);
  QTimer::singleShot(0, this, &InlineTitlePresenter::refresh);
}
InlineTitlePresenter::~InlineTitlePresenter() {
  qApp->removeEventFilter(this); cancel(); clearNotes(); clearControls();
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  for (const auto &widget : retired_) delete widget.data();
}
// native-rules #2: naked delete on a Qt child that also has a parent or scene owner
void InlineTitlePresenter::clearNotes() { for (const auto &note : notes_) delete note.data(); notes_.clear(); }
void InlineTitlePresenter::clearControls() {
  for (const auto &widget : controls_) { if (widget) { widget->hide(); widget->setEnabled(false); widget->deleteLater(); } }
  controls_.clear();
}
void InlineTitlePresenter::repositionControls() {
  auto *editor = qobject_cast<EditorWindow *>(parent());
  if (!editor) return;
  const auto pointer = view_.mapFromGlobal(QCursor::pos());
  for (auto it = controls_.begin(); it != controls_.end(); ++it) {
    auto *widget = it.value().data();
    auto *item = scene_.nodeGraphicsObject(it.key());
    if (!widget || !item) continue;
    const auto bounds = view_.viewportTransform().mapRect(QRectF(item->scenePos(), model_.layout(it.key()).size));
    const bool group = model_.isGroup(it.key());
    const auto zoom = std::clamp(std::abs(view_.transform().m11()), 0.08, 8.0);
    const auto scale = group ? std::pow(zoom, 0.45) : zoom;
    const auto height = 28 * scale;
    const auto header = QRectF(bounds.left(), bounds.top() - 5 - 32 * scale, bounds.width(), 5 + 32 * scale);
    const bool hovered = (group ? header : bounds).contains(pointer);
    const auto width = (group ? 64 : 28) * scale;
    widget->setGeometry(qRound(bounds.right() - width - (group ? 0 : 8 * zoom)), qRound(group ? bounds.top() - 5 - 30 * scale : bounds.top() + 8 * zoom), qCeil(width), qCeil(height));
    if (widget->rootObject()) widget->rootObject()->setScale(scale);
    widget->setVisible((hovered || item->isSelected() || widget->underMouse() || (widget->rootObject() && widget->rootObject()->property("menuOpen").toBool())) && view_.viewport()->rect().intersects(widget->geometry()));
    widget->raise();
  }
}
void InlineTitlePresenter::refresh() {
  clearControls();
  auto *editor = qobject_cast<EditorWindow *>(parent());
  QSet<QString> bypassedParents, parents;
  for (const auto id : model_.allNodeIds()) {
    parents.insert(model_.nodeSnapshot(id)["parent_id"].toString());
    if (model_.bypassed(id)) bypassedParents.insert(model_.nodeSnapshot(id)["parent_id"].toString());
  }
  if (editor && engine_) for (const auto id : model_.allNodeIds()) {
    if (!model_.isGroup(id) && !model_.isComment(id)) continue;
    auto *widget = new QQuickWidget(engine_, view_.viewport());
    controls_.insert(id, widget);
    widget->setObjectName("authored-controls-" + model_.resourceId(id));
    widget->setClearColor(Qt::transparent);
    widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
    widget->setInitialProperties({{"hasChildren", parents.contains(model_.resourceId(id))}, {"bypassed", bypassedParents.contains(model_.resourceId(id))}, {"host", QVariant::fromValue(editor)}, {"resourceId", model_.resourceId(id)},
      {"group", model_.isGroup(id)}, {"epoch", QVariant::fromValue(editor->documentEpoch())},
      {"credentials", QVariant::fromValue(editor->credentialsEpoch())}});
    widget->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/AuthoredControls.qml"));
  }
  clearNotes();
  for (const auto id : model_.allNodeIds()) {
    if (model_.isGroup(id) || model_.isComment(id) || model_.nodeData(id, QtNodes::NodeRole::Type).toString() == "nodetool.code.Code") continue;
    const auto text = model_.uiProperties(id)["title"].toString();
    auto *parent = scene_.nodeGraphicsObject(id); if (text.isEmpty() || !parent) continue;
    auto *note = new NoteItem(text, model_.layout(id).size, scene_, parent, model_.isReroute(id));
    note->setObjectName((model_.isReroute(id) ? "reroute-label-" : "node-note-") + model_.resourceId(id)); notes_.insert(id, note);
    if (!model_.readOnly()) {
      note->edit = [this, id] { activate(id); };
      note->remove = [this, id] { activate(id); commit({}, generation_); };
    }
  }
  reposition();
}
bool InlineTitlePresenter::current() const {
  if (!active() || model_.readOnly() || !model_.nodeExists(node_)) return false;
  auto *item = scene_.nodeGraphicsObject(node_);
  const auto stored = comment_ ? model_.comment(node_).toString()
      : (group_ || header_) ? model_.layout(node_).title : model_.uiProperties(node_)["title"].toString();
  return item && item->isSelected() && scene_.selectedItems().size() == 1 && stored == text_;
}
void InlineTitlePresenter::activate(QtNodes::NodeId id) {
  cancel();
  if (!engine_ || model_.readOnly() || !model_.nodeExists(id)) return;
  // Rich-text comments keep their formatting, which only the web editor writes.
  if (model_.isComment(id) && !model_.comment(id).isString()) return;
  auto *item = scene_.nodeGraphicsObject(id); if (!item) return;
  const auto viewZoom = std::clamp(std::abs(view_.transform().m11()), 0.08, 8.0);
  view_.ensureVisible(model_.isGroup(id) ? scene_.groupLabelRect(id, viewZoom) : item->sceneBoundingRect(), 16, 16);
  scene_.clearSelection(); item->setSelected(true); emit scene_.nodeSelected(id);
  node_ = id; group_ = model_.isGroup(id); reroute_ = model_.isReroute(id); comment_ = model_.isComment(id);
  header_ = model_.nodeData(id, QtNodes::NodeRole::Type).toString() == "nodetool.code.Code"; requestedHeight_ = 100;
  text_ = comment_ ? model_.comment(id).toString() : (group_ || header_) ? model_.layout(id).title : model_.uiProperties(id)["title"].toString();
  if (!current()) { cancel(); return; }
  emit activated();
  auto *widget = new TitleEditorWidget(engine_, view_.viewport()); widget_ = widget;
  widget->setObjectName("inline-title-overlay"); widget->setClearColor(Qt::transparent);
  widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
  widget->setInitialProperties({{"presenter", QVariant::fromValue(this)}, {"activationToken", generation_}});
  reposition(); widget->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/InlineTitleEditor.qml"));
  if (widget->status() == QQuickWidget::Error) { cancel(); return; }
  widget->show(); widget->raise(); widget->setFocus(Qt::MouseFocusReason); emit changed();
  const auto token = generation_;
  QTimer::singleShot(0, this, [this, token] { if (token == generation_ && widget_ && current()) QMetaObject::invokeMethod(widget_->rootObject(), "activate"); });
}
void InlineTitlePresenter::validateDocument(const node_editor::WorkflowDocument &document) {
    if (!active()) {
        return;
    }
    const auto node = document.node(model_.resourceId(node_));
    const auto previous = model_.nodeSnapshot(node_);
    const auto title = [](const QJsonObject &value) {
        return QJsonArray{value["type"], value["ui_properties"].toObject()["title"],
            value["data"].toObject()["headline"], value["data"].toObject()["comment"]};
    };
    if (node.isEmpty() || document.isReadOnly() || title(node) != title(previous)) {
        cancel();
    }
}
void InlineTitlePresenter::cancel() {
  if (const auto note = notes_.value(node_)) note->setVisible(true);
  ++generation_; committing_ = false; pending_.clear(); node_ = QtNodes::InvalidNodeId; text_.clear();
  if (widget_) { auto old = widget_; widget_.clear(); old->hide(); old->setEnabled(false); retired_.removeIf([](const auto &entry) { return entry.isNull(); }); retired_.append(old); old->deleteLater(); }
  emit changed();
}
void InlineTitlePresenter::commit(const QString &text, int token) {
  if (token != generation_ || committing_ || !current()) return;
  pending_ = text; committing_ = true;
  QTimer::singleShot(0, this, [this, token] { if (token == generation_) flush(); });
}
void InlineTitlePresenter::flush() {
  if (!committing_ || !current()) return;
  const auto id = model_.resourceId(node_); auto text = pending_; const auto previous = text_;
  // resolveCodeNodeTitle: a blank draft or the metadata title stores nothing, so the header follows the metadata.
  if (header_) {
    const auto fallback = model_.metadata(node_)["title"].toString(QStringLiteral("Code"));
    text = text.trimmed() == fallback ? QString{} : text.trimmed();
  }
  const auto stored = header_ ? model_.uiProperties(node_)["title"].toString() : previous;
  cancel(); if (text != (header_ ? stored : previous) && commitTitle) commitTitle(id, text);
  view_.setFocus(Qt::OtherFocusReason);
}
void InlineTitlePresenter::setEditorHeight(double logicalHeight, int token) {
  if (token != generation_ || singleLine() || comment_ || !current() || !std::isfinite(logicalHeight) || logicalHeight <= 0) return;
  const auto height = std::clamp(logicalHeight, 32.0, 1000000.0);
  if (std::abs(height - requestedHeight_) < 0.5) return;
  requestedHeight_ = height;
  reposition();
}
void InlineTitlePresenter::reposition() {
  repositionControls();
  if (!widget_) return;
  if (!current()) { cancel(); return; }
  if (const auto note = notes_.value(node_)) note->setVisible(false);
  auto *item = scene_.nodeGraphicsObject(node_); if (!item) { cancel(); return; }
  const auto viewZoom = std::clamp(std::abs(view_.transform().m11()), 0.08, 8.0);
  zoom_ = group_ ? viewZoom * groupLabelScale(viewZoom) : viewZoom;
  QRectF sceneRect;
  if (group_) sceneRect = scene_.groupLabelRect(node_, viewZoom);
  else if (comment_) sceneRect = QRectF(item->scenePos(), model_.layout(node_).size);
  else if (header_) sceneRect = QRectF(item->scenePos() + QPointF(node_metrics::borderWidth + node_metrics::padding + node_metrics::titleOffset - 4, node_metrics::borderWidth + node_metrics::padding - 2),
      QSizeF(std::max(60, model_.layout(node_).size.width() - 2 * (node_metrics::borderWidth + node_metrics::padding) - node_metrics::titleOffset), node_metrics::headerHeight + 4));
  else if (reroute_) sceneRect = QRectF(item->scenePos() + QPointF((model_.layout(node_).size.width() - 116) / 2.0, model_.layout(node_).size.height() + 6), QSizeF(116, 26));
  else sceneRect = QRectF(item->scenePos() + QPointF(8, model_.layout(node_).size.height() + 10), QSizeF(std::max(120, model_.layout(node_).size.width() - 16), requestedHeight_));
  rect_ = view_.viewportTransform().mapRect(sceneRect);
  if (!group_ && !comment_ && !header_) {
    auto available = QRectF(view_.viewport()->rect());
    if (availableViewport) available = available.intersected(availableViewport());
    available = available.adjusted(8, 8, -8, -8);
    if (available.isEmpty()) { cancel(); return; }
    rect_.setSize(QSizeF(std::min(rect_.width(), available.width()), std::min(rect_.height(), available.height())));
    rect_.moveLeft(std::clamp(rect_.left(), available.left(), std::max(available.left(), available.right() - rect_.width())));
    rect_.moveTop(std::clamp(rect_.top(), available.top(), std::max(available.top(), available.bottom() - rect_.height())));
  }
  widget_->setGeometry(view_.viewport()->rect());
  widget_->setMask(QRegion(rect_.toAlignedRect()).intersected(QRegion(view_.viewport()->rect())));
  if (!view_.viewport()->rect().intersects(rect_.toAlignedRect())) { cancel(); return; }
  widget_->raise(); emit geometryChanged();
}
bool InlineTitlePresenter::eventFilter(QObject *object, QEvent *event) {
  if (event->type() == QEvent::MouseMove || event->type() == QEvent::Resize || event->type() == QEvent::Wheel)
    QTimer::singleShot(0, this, &InlineTitlePresenter::repositionControls);
  if (active() && widget_) {
    if (event->type() == QEvent::ShortcutOverride) {
      if (const auto *item = qobject_cast<QQuickItem *>(object); item && item->window() == widget_->quickWindow()) { event->accept(); return true; }
      for (auto *target = object; target; target = target->parent())
        if (target == widget_ || target == widget_->quickWindow() || target == widget_->rootObject()) { event->accept(); return true; }
    }
    if (object == view_.viewport() || object == &view_) {
      if (event->type() == QEvent::Resize || event->type() == QEvent::Wheel) QTimer::singleShot(0, this, &InlineTitlePresenter::reposition);
      if (event->type() == QEvent::MouseButtonPress) { if (widget_->rootObject()) QMetaObject::invokeMethod(widget_->rootObject(), "finish"); flush(); }
    }
  }
  return QObject::eventFilter(object, event);
}
}
