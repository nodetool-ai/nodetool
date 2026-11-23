#pragma once

#include "CanvasStyle.h"

class QPainter;
class QRect;
class QSGGeometry;

namespace nodetool::canvas {
// Value state built on the UI thread and copied into software render nodes
// during scene graph sync. Endpoints and the hit stroke use the painter's local
// coordinates.
struct WirePaintState {
  QPointF out;
  QPointF in;
  QColor sourceColor;
  QColor targetColor;
  double zoom = 1;
  double animationPhase = 0;
  int counter = 0;
  bool visible = true;
  bool control = false;
  bool draft = false;
  bool draftFromOutput = false;
  bool selected = false;
  bool endpointSelected = false;
  bool hovered = false;
  bool bypassed = false;
  bool streaming = false;
  bool flowing = false;
  bool messageSent = false;
  bool connecting = false;
  bool animationActive = false;
  bool operator==(const WirePaintState &) const = default;
};

// Stateless painter reading only its value arguments. Safe to call from
// software QSGRenderNode::render() as well as UI-thread rasterization.
class WirePainter {
public:
  static void paint(QPainter *painter, const CanvasTheme &theme, const WirePaintState &state);
  // Overload accepting an optional pre-resolved device-pixel clip rectangle to
  // avoid repeated clip queries when painting many wires in one software batch.
  static void paint(QPainter *painter, const CanvasTheme &theme, const WirePaintState &state, const QRect *deviceClip);
  // Populates a ColoredPoint2D DrawTriangles geometry (UnsignedShortType) in
  // scene coordinates with analytic edge antialiasing of width `feather`
  // (in scene units, typically 1 / (zoom * dpr)).
  static void buildGeometry(QSGGeometry &geometry, const CanvasTheme &theme, const WirePaintState &state,
                            double feather);
  static QPainterPath hitStroke(const WirePaintState &state);
  // The centre line that paint() strokes, empty for a hidden wire.
  static QPainterPath path(const WirePaintState &state);
};
} // namespace nodetool::canvas
