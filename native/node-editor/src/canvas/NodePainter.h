#pragma once

#include "CanvasStyle.h"
#include "graph/CardBodyPainter.h"
#include <QJsonObject>

namespace nodetool::canvas {
struct HandlePaintState {
  QPointF position;
  QColor color;
  bool collect = false;
  bool hovered = false;
  bool focused = false;
  // Positive accepts the draft, negative rejects it, zero means no draft.
  int connectable = 0;
};

enum class CardKind { Node, Reroute, Group, Comment };

// UI thread only. The caller keeps layout and theme alive for the paint call.
struct CardPaintState {
  const CanvasTheme &theme;
  const NodeLayout &layout;
  QRectF bounds;
  CardKind kind = CardKind::Node;
  double zoom = 1;
  double groupOpacity = 1;
  double animationPhase = 0;
  double runningAngle = 90;
  bool groupDropTarget = false;
  bool selected = false;
  bool focused = false;
  bool readOnly = false;
  bool bypassed = false;
  bool grouped = false;
  bool runningShown = false;
  bool runtimeConnected = false;
  bool headerActionHovered = false;
  bool footerHovered = false;
  QJsonValue comment;
  QJsonObject runtime;
  QRectF outputRect;
  QImage preview;
  CardBodyPaintState body;
  QList<HandlePaintState> handles;
};

// UI thread only. Paints a card in card-local coordinates.
class NodePainter {
public:
  static void paint(QPainter *painter, const CardPaintState &state);
  // The card-local rectangles whose pixels follow the animation clock: the
  // running ring when it has more than one colour, and the pulsing status
  // text. Empty when nothing on the card changes from frame to frame.
  static QList<QRectF> animatedRegion(const CardPaintState &state);
};
} // namespace nodetool::canvas
