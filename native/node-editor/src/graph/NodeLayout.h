#pragma once
#include <QColor>
#include <QSize>
#include <QRectF>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QVector>

namespace nodetool {
// Measurements from web/src/components/node and web/src/styles. The native
// painter and the visual comparison both read them from here.
namespace node_metrics {
inline constexpr int defaultWidth = 280;
inline constexpr int rerouteWidth = 60;
inline constexpr int rerouteHeight = 20;
inline constexpr int rerouteLabelGap = 6;
inline constexpr int radius = 8;
inline constexpr int borderWidth = 1;
inline constexpr int padding = 8;
inline constexpr int micro = 2;
inline constexpr int headerHeight = 24;
inline constexpr int titleOffset = 28;
inline constexpr int disabledBadgeWidth = 70;
// web/src/styles/vars.css --node-collapsed-height and --node-collapsed-min-width.
inline constexpr int collapsedHeight = 40;
inline constexpr int collapsedMinimumWidth = 140;
// web/src/styles/nodes.states.css bypassed card and edge opacity.
inline constexpr double disabledOpacity = 0.8;
inline constexpr double disabledWireOpacity = 0.5;
inline constexpr int contentTop = 37;
inline constexpr int rowHeight = 18;
inline constexpr int handleRowStep = 28;
inline constexpr int inlineRowGap = 6;
inline constexpr int fieldHeight = 29;
inline constexpr int multilineFieldHeight = 65;
inline constexpr int previewHeight = 80;
// ContentCardBody's top padding places its preview below the handle column.
inline constexpr int contentPreviewTop = 47;
// NumberInput's small editor, below the label on Integer Input.
inline constexpr int integerFieldHeight = 28;
inline constexpr int integerFieldBottomGap = 3;
inline constexpr int playbackHeight = 180;
// web/src/components/node/NodeProgress.tsx in a content card: the band below
// the body holds a count label above a 6 px bar inset 11 px from each side.
inline constexpr int progressHeight = 47;
inline constexpr int progressLabelTop = 44;
inline constexpr int progressBarTop = 25;
inline constexpr int progressBarHeight = 6;
inline constexpr int progressBarInset = 11;
// Bespoke card bodies, measured on the web capture of the window parity fixture.
// A bespoke body starts below the header and the body's 2 px padding.
inline constexpr int bodyTop = 35;
// web/src/components/node_types/editing/PromptComposerBody.tsx
inline constexpr int composerHeight = 90;
inline constexpr int composerPadding = 6;
inline constexpr int composerLineHeight = 17;
inline constexpr int variableBarHeight = 30;
inline constexpr int chipHeight = 16;
inline constexpr int chipPadding = 8;
inline constexpr int chipRadius = 4;
inline constexpr int segmentPadding = 12;
inline constexpr int chipGap = 4;
// The CheckerDropzone empty states of OutputNode.tsx and PreviewNode.tsx.
inline constexpr int outputPlaceholderHeight = 80;
inline constexpr int outputMinimumHeight = 150;
inline constexpr int previewNodeWidth = 400;
inline constexpr int previewNodeHeight = 300;
inline constexpr double headerHandleY = 21;
// The image preview, select, slider and mode switch of BlurBody.tsx and
// ResizeImageBody.tsx.
inline constexpr int imagePreviewHeight = 90;
inline constexpr int controlGap = 10;
inline constexpr int controlHeight = 24;
inline constexpr int controlLabelWidth = 36;
inline constexpr int sliderRowHeight = 18;
inline constexpr int sliderTrack = 4;
inline constexpr double sliderThumb = 12;
inline constexpr int sliderValueWidth = 32;
inline constexpr int dimensionLabelHeight = 12;
inline constexpr int lockWidth = 28;
// NodeModelChips.tsx and AddDynamicOutputButton.tsx under a content card.
inline constexpr int modelChipHeight = 30;
inline constexpr int actionHeight = 28;
inline constexpr int actionGap = 7;
// The media drop zone of an image input value.
inline constexpr int dropZoneGap = 5;
inline constexpr int dropZoneHeight = 46;
inline constexpr int iconSize = 16;
inline constexpr int fieldRadius = 6;
inline constexpr double handleDiameter = 12;
inline constexpr double handleRing = 2;
inline constexpr double wireWidth = 1.5;
inline constexpr double wireSelectedWidth = 2;
inline constexpr double wireHoverWidth = 4;
inline constexpr double wireGlowWidth = 6;
inline constexpr double wireOpacity = 0.5;
inline constexpr double wireGlowOpacity = 0.25;
// The web's edge hover drop-shadow, 0 0 3px at 15 percent white. A wider faint stroke stands in for the blur.
inline constexpr double wireHoverGlowOpacity = 0.1;
inline constexpr double wireHoverGlowSpread = 3;
inline constexpr double wireHitWidth = 10;
// The web's streaming-edge width while a message flows, and its stream count pill padding.
inline constexpr double wireStreamingWidth = 4;
inline constexpr double wireBadgePaddingX = 8;
inline constexpr double wireBadgePaddingY = 2;
// The web's ControlEdge.tsx: an amber 8 4 dash, 2 wide at 0.7 opacity and 3 wide at full opacity when selected.
inline constexpr double controlWireWidth = 2;
inline constexpr double controlWireSelectedWidth = 3;
inline constexpr double controlWireOpacity = 0.7;
inline constexpr double controlWireDashOn = 8;
inline constexpr double controlWireDashOff = 4;
inline constexpr double controlWireHitWidth = 12;
// The web's not-run opacity for an item on the untaken side of an If or Switch.
inline constexpr double notRunOpacity = 0.4;
// The longest control offset QtNodes' fixed connection bounds can contain.
inline constexpr double wireMaxReverseOffset = 200;
// QtNodes grows connection bounds by its PointDiameter setting. This covers the
// hit stroke plus the short reverse wires whose offset exceeds its control points.
inline constexpr double wireBoundsMargin = 16;
inline constexpr double gridGap = 25;
inline constexpr double gridCross = 3;
inline constexpr int fontTitle = 13;
inline constexpr int fontLabel = 13;
inline constexpr int fontValue = 11;
} // namespace node_metrics

// Composer, Slider, Segmented, Lock, ModelChip, Action and DropZone rows belong
// to the bespoke bodies. Their controls sit in NodeRow::rect.
enum class NodeRowKind { Handle, Label, Field, Multiline, Number, Toggle, Preview,
                         Composer, Slider, Segmented, Lock, ModelChip, Action, DropZone };

// The body a card draws, chosen by node type as the web's bespoke body registry does.
enum class CardBody { Generic, Content, Prompt, Output, Preview, Blur, ResizeImage };

struct NodeRow {
  NodeRowKind kind = NodeRowKind::Label;
  QString label;
  QString propertyName;
  // Dynamic input label and its visible rename control, in card coordinates.
  QRectF renameLabelRect;
  QRectF renameButtonRect;
  QString value;
  QString typeName;
  bool conditionalUnavailable = false;
  bool placeholder = false;
  bool checked = false;
  bool choice = false;
  bool bare = false;
  double y = 0;
  double height = 0;
  double fieldY = 0;
  int port = -1;
  // A bespoke control's bounds in card coordinates.
  QRectF rect;
  // A mode switch's segment bounds, in card coordinates.
  QVector<QRectF> parts;
  QString icon;
  // Segment labels, slider bounds or the composer's known variable names.
  QStringList options;
  QVariantList optionValues;
  int selected = -1;
  double minimum = 0;
  double maximum = 0;
  double step = 1;
  double number = 0;
  // The command an Action row requests: "addVariable" or "addOutput".
  QString action;
};

struct NodeLayout {
  QSize size{node_metrics::defaultWidth, 72};
  QSize minimumSize{150, 40};
  QString title;
  // A shared Material path name for the inspector and catalog.
  QString icon;
  // The web data type icon the card header draws, from web/src/config/IconForType.tsx.
  QString typeIcon;
  CardBody body = CardBody::Generic;
  // A bespoke body paints a run result here instead of growing the card.
  QRectF resultRect;
  QColor accent;
  // The running ring's conic stops: output then property type colors, five
  // entries, as getNodeColors in web/src/components/node/BaseNode.tsx.
  QVector<QColor> runningColors;
  bool unknown = false;
    // A header-only strip: every handle sits on its midline and no body draws.
    bool collapsed = false;
    bool subgraph = false;
    bool addOutput = false;
    bool runningProgress = false;
    // A running card other than a subgraph with a known total shows a progress band.
    bool progressBand = false;
    QRectF outputFormRect() const { return QRectF(node_metrics::padding, footerRect().y() - node_metrics::handleRowStep * (runningProgress ? 2 : 1), size.width() - 2 * node_metrics::padding, node_metrics::handleRowStep); }
    QString childCount;
    QRectF footerRect() const { return QRectF(0, size.height() - node_metrics::handleRowStep, size.width(), node_metrics::handleRowStep); }
  QVector<NodeRow> rows;
  QVector<double> inputY;
  QVector<double> outputY;
};

// Port colors from web/src/config/data_types.ts.
QColor typeColor(const QString &type);
QString typeIcon(const QString &type);
QString iconPath(const QString &name);
// The web header icon key for a type name, as iconMap in web/src/config/IconForType.tsx.
QString webTypeIcon(const QString &type);
// The web data type SVG with its currentColor replaced, or empty when none exists.
QByteArray webTypeIconSvg(const QString &key, const QColor &color);
// "first_name" becomes "First name", as the web's property labels do.
QString displayName(const QString &name);
} // namespace nodetool
