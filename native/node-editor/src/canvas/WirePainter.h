#pragma once

#include "CanvasStyle.h"

class QPainter;

namespace nodetool::canvas {
// UI thread only. Endpoints and the hit stroke use the painter's local coordinates.
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
};

// UI thread only.
class WirePainter {
public:
  static void paint(QPainter *painter, const CanvasTheme &theme, const WirePaintState &state);
  static QPainterPath hitStroke(const WirePaintState &state);
  // The centre line that paint() strokes, empty for a hidden wire.
  static QPainterPath path(const WirePaintState &state);
};
} // namespace nodetool::canvas
