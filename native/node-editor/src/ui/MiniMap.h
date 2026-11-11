#pragma once
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QGraphicsView>
#include <QMouseEvent>
#include <QPainter>
#include <QScrollBar>
#include <QTimer>
#include <QWidget>
#include <QHash>
#include <QPair>
#include <QStringList>
#include <functional>
#include <cmath>
#include <QWheelEvent>

namespace nodetool {
// The web node categories of utils/ColorUtils.ts getNodeTypeCategory, in the
// order the mini-map legend lists them (MiniMapNavigator.tsx legendItems).
inline const QStringList &miniMapCategories() {
  static const QStringList categories{"input", "constant", "processing", "group", "comment", "output"};
  return categories;
}
// getNodeTypeCategory: the checks run in this order, so a type that mentions
// both "group" and "output" is a group.
inline QString miniMapCategory(const QString &type) {
  if (type.isEmpty()) { return "processing"; }
  if (type.startsWith("nodetool.input.")) { return "input"; }
  if (type.startsWith("nodetool.constant.")) { return "constant"; }
  if (type.contains(".Group") || type.contains("group")) { return "group"; }
  if (type.contains(".Comment") || type.contains("comment")) { return "comment"; }
  if (type.contains("output") || type.contains("Output")) { return "output"; }
  return "processing";
}
// getNodeCategoryColor, light and dark.
inline QColor miniMapCategoryColor(const QString &category, bool dark) {
  static const QHash<QString, QPair<QString, QString>> colors{
      {"input", {"#3b82f6", "#60a5fa"}}, {"constant", {"#8b5cf6", "#a78bfa"}}, {"processing", {"#64748b", "#94a3b8"}},
      {"group", {"#6366f1", "#818cf8"}}, {"comment", {"#22c55e", "#4ade80"}}, {"output", {"#f59e0b", "#fbbf24"}}};
  const auto pair = colors.value(category, colors.value("processing"));
  return QColor(dark ? pair.second : pair.first);
}
// Scene notifications coalesce geometry collection. Navigation changes only the
// view scroll bars, never the graph model or document history.
class MiniMap final : public QWidget {
public:
  MiniMap(WorkflowGraphModel &model, EditorScene &scene, QGraphicsView &view)
      : QWidget(&view), model_(model), scene_(scene), view_(view) {
    setObjectName("mini-map");
    setAccessibleName(tr("Mini-map navigator"));
    setFixedSize(200, 150); // React Flow MiniMap defaults.
    connect(&scene, &QGraphicsScene::changed, this, [this] { schedule(); });
    connect(view.horizontalScrollBar(), &QScrollBar::valueChanged, this, [this] { update(); });
    connect(view.verticalScrollBar(), &QScrollBar::valueChanged, this, [this] { update(); });
    schedule();
  }
  // True while the web "Color by type" mode is on (createMinimapNodeColorFn useTypeColors).
  std::function<bool()> colorByType;
  std::function<void()> navigated;
  std::function<void()> zoomed;
  void schedule() {
    if (pending_) { return; }
    pending_ = true;
    QTimer::singleShot(0, this, [this] {
      pending_ = false;
      rects_.clear(); bounds_ = {};
      for (auto id : model_.allNodeIds()) {
        if (auto item = scene_.nodeGraphicsObject(id)) {
          const auto rect = item->mapRectToScene(QRectF(QPointF(), model_.layout(id).size));
          rects_.push_back({rect, item->isSelected(), model_.isGroup(id), model_.isComment(id), model_.nodeSnapshot(id)["type"].toString()}); bounds_ |= rect;
        }
      }
      setProperty("nodeCount", rects_.size());
      update();
    });
  }
protected:
  void paintEvent(QPaintEvent *) override {
    const auto &theme = scene_.theme();
    QPainter painter(this); painter.setRenderHint(QPainter::Antialiasing);
    const bool dark = theme.canvas.lightnessF() < .5;
    const QColor paper = dark ? QColor("#0a0b0d") : QColor("#27272a");
    const QColor border = dark ? QColor(255,255,255,51) : QColor(0,0,0,26);
    painter.setPen(border); painter.setBrush(paper);
    painter.drawRoundedRect(QRectF(rect()).adjusted(.5,.5,-.5,-.5),8,8);
    const auto viewport = view_.mapToScene(view_.viewport()->rect()).boundingRect();
    world_ = bounds_.united(viewport);
    world_.adjust(-world_.width() * .05, -world_.height() * .05, world_.width() * .05, world_.height() * .05);
    scale_ = std::min(width() / std::max(1., world_.width()), height() / std::max(1., world_.height()));
    offset_ = QPointF(width()/2., height()/2.) - world_.center() * scale_;
    const auto mapped = [this](QRectF r) { return QRectF(r.topLeft()*scale_+offset_, r.size()*scale_); };
    const bool byType = colorByType && colorByType();
    for (const auto &node : rects_) {
      painter.setPen(QPen(node.selected ? theme.primary : QColor(dark ? "#5c606a" : "#cdcdd3"), 2));
      // createMinimapNodeColorFn: the selection is always primary. The default mode
      // colors only groups and notes apart, and "Color by type" colors every category.
      const QColor fill = node.selected ? theme.primary
          : byType ? miniMapCategoryColor(miniMapCategory(node.type), dark)
          : node.group ? QColor(dark ? "#6366f1" : "#818cf8") : node.comment ? QColor("#22c55e") : QColor(dark ? "#94a3b8" : "#64748b");
      painter.setBrush(fill); painter.drawRoundedRect(mapped(node.rect), 8*scale_,8*scale_);
    }
    QPainterPath mask; mask.addRect(rect()); mask.addRect(mapped(viewport));
    auto maskColor = dark ? QColor(Qt::black) : QColor(Qt::white); maskColor.setAlphaF(.6);
    painter.fillPath(mask, maskColor);
    painter.setPen(theme.primary); painter.setBrush(Qt::NoBrush); painter.drawRect(mapped(viewport));
  }
  void wheelEvent(QWheelEvent *event) override {
    const double current = view_.transform().m11();
    const double zoom = std::clamp(current * std::pow(1.2, event->angleDelta().y()/120.), .1, 5.);
    if (navigated) { navigated(); }
    view_.setTransformationAnchor(QGraphicsView::AnchorViewCenter);
    view_.scale(zoom/current,zoom/current);
    if (zoomed) { zoomed(); }
    update(); event->accept();
  }
  void mousePressEvent(QMouseEvent *event) override {
    if (event->button() == Qt::LeftButton) { navigate(event->position()); event->accept(); }
  }
  void mouseMoveEvent(QMouseEvent *event) override {
    if (event->buttons() & Qt::LeftButton) { navigate(event->position()); event->accept(); }
  }
private:
  void navigate(QPointF point) { if (scale_ > 0) { if (navigated) { navigated(); } view_.centerOn((point-offset_)/scale_); } }
  struct NodeRect { QRectF rect; bool selected; bool group; bool comment; QString type; };
  WorkflowGraphModel &model_;
  EditorScene &scene_;
  QGraphicsView &view_;
  QVector<NodeRect> rects_;
  QRectF bounds_, world_;
  QPointF offset_;
  double scale_ = 1;
  bool pending_ = false;
};
}
