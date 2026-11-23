#pragma once

#include <QColor>
#include <QFont>
#include <QPainterPath>
#include <QVariantMap>

class QPainter;

namespace nodetool {
// web AxisMarker.tsx: the origin lines run this many screen pixels, in
// c_editor_axis_color from paletteDark.ts or paletteLight.ts.
inline constexpr double axisMarkerLength = 80000;
inline QColor axisMarkerColor(bool dark) { return dark ? QColor("#17181B") : QColor("#E4E4E7"); }

// The grid spacing in scene units: 25, doubled until a cell is 12 px on screen.
double gridGap(double zoom);
// EditorScene::drawBackground at a zoom: the canvas colour, the crosses and
// the origin axes. QtNodes lists the crosses of the exposed scene rectangle,
// up to its right and bottom edges. This draws the ones that reach area, a
// part of exposed, so that painting a part makes the same pixels.
// Thread-safe: it reads only its arguments.
void paintGrid(QPainter &painter, const QRectF &exposed, const QRectF &area, double zoom, const QColor &canvas,
               const QColor &grid, const QColor &axis);

// Colors and font families the canvas receives from Qt Quick. The web's node
// background, canvas grid, and translucent controls are native-editor roles.
struct CanvasTheme {
  // Every color is invalid until fromRoles fills it. Ui.Theme in native/ui_primitives is the only source of values.
  QColor canvas;
  QColor grid;
  QColor node;
  QColor reroutePaper;
  QColor rerouteBorder;
  QColor divider;
  QColor field;
  QColor textPrimary;
  QColor textSecondary;
  QColor checker;
  QColor subgraphAccent;
  QColor primary;
  // web palette secondary.main, the node progress bar.
  QColor progress;
  // web palette success.main and warning.main, the prompt variable chips.
  QColor success;
  QColor warning;
  // Ui.Theme.statusInfo, the keyword color of painted code.
  QColor info;
  // ControlEdge.tsx CONTROL_EDGE_COLOR, a fixed amber in both themes.
  QColor controlWire;
  // A card inside a group: the edge, and the fill that replaces the card color.
  QColor groupHeader;
  QColor groupFill;
  // The card title while zoomed out.
  QColor zoomedTitle;
  // The selected edge of a Preview and of an Output card.
  QColor previewSelected;
  QColor outputSelected;
  QColor selectionShadow;
  // Media on cards: the web's c_scrim behind badges and asset actions with its
  // grey 100 ink, and the alpha surface behind an image.
  QColor mediaScrim;
  QColor mediaScrimInk;
  QColor alphaBase;
  QColor alphaChecker;
  QString sansFamily{"Inter"};
  QString monoFamily{"JetBrains Mono"};
  bool operator==(const CanvasTheme &) const = default;
  // Reads every member from the presentation map that EditorCommands::present receives.
  static CanvasTheme fromRoles(const QVariantMap &roles);
};

double groupLabelScale(double zoom);
// nodes.states.css .bypassed: filter saturate(0.2) over the card.
inline constexpr double disabledSaturation = 0.2;
// The Disabled chip of a bypassed card header: NodeHeader.tsx's compact outlined
// MuiChip, 24 px high with 8 px of label padding and a 1 px border and a 6 px left
// margin (.bypass-badge). It sits at the right end of the header, centered on it.
inline constexpr double disabledChipHeight = 24;
inline constexpr double disabledChipPadding = 8;
inline constexpr double disabledChipMargin = 6;
QRectF disabledChipRect(const QRectF &header, double textWidth);
// The web's branch-dimmed opacity for a node or wire off the selected branch,
// styles/nodes.zoomed.css. Related items keep full opacity.
inline constexpr double branchDimmedOpacity = 0.6;
// web config/constants.ts ZOOMED_OUT: at or below this zoom the web hides handles and
// property rows, thickens wires and rings a selected card (nodes.zoomed.css).
inline constexpr double zoomedOutThreshold = 0.35;
inline constexpr double zoomedOutBodyOpacity = 0.85;
// Edge styles of handle_edge_tooltip.css and nodes.zoomed.css, in user units, not stroke widths.
// .streaming-edge is 3 wide at 0.8 opacity dashed 30 3 (8 when selected). A flowing edge is
// dashed 14 10 (4 2 under reduced motion) and scrolls 120 px a second. A bypassed edge is 5 5.
// Overview zoom draws an edge 6 wide.
inline constexpr double streamingWireOpacity = 0.8;
inline constexpr double streamingWireWidth = 3;
inline constexpr double zoomedWireWidth = 6;
inline constexpr double flowDashOn = 14;
inline constexpr double flowDashOff = 10;
inline constexpr double flowReducedDashOn = 4;
inline constexpr double flowReducedDashOff = 2;
inline constexpr double streamingDashOn = 30;
inline constexpr double streamingDashOff = 3;
inline constexpr double streamingSelectedDash = 8;
inline constexpr double bypassedDash = 5;
inline constexpr double flowSpeed = 120;
// web/src/components/node/CommentNode.tsx scale-to-fit floor for a card height.
inline constexpr int commentMinimumHeight = 40;
// The web's handle hover, styles/handle_edge_tooltip.css: scale 1.3, opacity 0.9.
inline constexpr double handleHoverScale = 1.3;
inline constexpr double handleHoverOpacity = 0.9;
// While a wire is dragged, compatible handles grow and the rest fade, shrink and
// lose their color, and settled wires dim (web styles/handle_edge_tooltip.css .is-connecting).
inline constexpr double handleConnectableScale = 1.2;
// vars.css --node-handle-core-radius and --node-handle-core-feather of a collect handle.
inline constexpr double handleCollectCore = 2;
inline constexpr double handleCollectFeather = 2.5;
inline constexpr double handleBlockedOpacity = 0.15;
inline constexpr double handleBlockedScaleX = 0.4;
inline constexpr double handleBlockedScaleY = 0.6;
inline constexpr double wireConnectingOpacity = 0.15;
inline constexpr double connectingWireWidth = 2.5;
inline constexpr double connectingGlowWidth = 6;
inline constexpr double connectingGlowOpacity = 0.15;
inline constexpr double connectingDotRadius = 6;
// The running ring's conic start angle in CSS degrees after elapsedMs: 90 to
// 450 over MOTION.pulse (2s ease-in-out), as runningGradientAnimation.
double runningRingAngle(qint64 elapsedMs);
QPainterPath wireCurve(const QPointF &out, const QPointF &in);
// React Flow's getBezierPath from the bottom of a controller to the top of the node it controls.
QPainterPath controlWireCurve(const QPointF &bottom, const QPointF &top);

// BaseNode's focused badge extends above the card.
inline constexpr double focusBadgeOffset = 20;

QFont canvasFont(const CanvasTheme &theme, int pixels, QFont::Weight weight);
struct NodeLayout;
QRectF reportErrorRect(const QJsonObject &runtime, const NodeLayout &layout);
} // namespace nodetool
