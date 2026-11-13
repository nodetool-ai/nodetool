#pragma once
#include <QColor>
#include "IconPaths.h"
#include "TypeStyle.h"
#include <QImage>
#include <QSize>
#include <QRectF>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QVector>
#include <optional>

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
// Card warning bands: 8 px padding around an 11 px caption, and the Connect
// provider button 1.8 em high with 16 px side margins (ApiKeyValidation.tsx).
inline constexpr int warningBandHeight = 30;
inline constexpr int warningButtonHeight = 20;
inline constexpr int warningButtonInset = 16;
// The CheckerDropzone empty states of OutputNode.tsx and PreviewNode.tsx.
inline constexpr int outputPlaceholderHeight = 80;
inline constexpr int outputMinimumHeight = 150;
inline constexpr int previewNodeWidth = 400;
inline constexpr int previewNodeHeight = 300;
inline constexpr double headerHandleY = 21;
// The select, slider and mode switch of BlurBody.tsx and ResizeImageBody.tsx.
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
// The preset name under an image size's boxes, ImageSizeProperty.tsx's matched-preset-label.
inline constexpr int imageSizeCaptionHeight = 12;
// DataframeProperty.tsx: the Add column tab, its drop zone and the table preview under it.
inline constexpr int dataframeButtonHeight = 22;
inline constexpr int dataframeDropHeight = 64;
inline constexpr int dataframeTableHeight = 65;
inline constexpr int actionHeight = 28;
inline constexpr int actionGap = 7;
// The image editing bodies in web/src/components/node_types/editing share one
// column: a 96 px preview-area, 2 px gaps between blocks, and a zero-height
// outputs-row followed by the body padding, card padding and border.
inline constexpr int imageBodyPreviewHeight = 96;
inline constexpr int bodyGap = 2;
inline constexpr int imageBodyBottom = 13;
// AdjustmentSlider's 24 px slider-wrap, a bare NodeSlider's 20 px root, the
// compact NodeSelect, a quiet ToggleGroup and the 20 px ColorPicker button.
inline constexpr int adjustmentRowHeight = 24;
inline constexpr int nodeSliderHeight = 20;
inline constexpr int selectHeight = 24;
inline constexpr int toggleHeight = 24;
inline constexpr int swatchSize = 20;
// AdjustmentSlider's value cell is at least 40 px, its label lines 1.3 em, and
// its slider column takes 1.4 fr against the label's 1 fr.
inline constexpr int adjustmentValueWidth = 40;
inline constexpr double adjustmentSliderFraction = 1.4;
// BESPOKE_DEFAULT_HEIGHTS in web/src/components/node_types/editing/bespokeNodeSizes.ts.
inline constexpr int liftGammaGainHeight = 580;
inline constexpr int splitToningHeight = 380;
inline constexpr int generatorHeight = 460;
inline constexpr double adjustmentLabelLineHeight = 1.3;
// GetVariableBody's 1.4 em explanation text and its 4 px block gap.
inline constexpr double hintLineHeight = 1.4;
inline constexpr int getVariableGap = 4;
// CompareImagesNode.tsx: the card is at least 300 by 250 and its comparer fills the padded body.
inline constexpr int compareMinimumWidth = 300;
inline constexpr int compareMinimumHeight = 250;
// ConstantStringNode.tsx: a text area 4 px below the header, at least 60 px,
// with 6 px padding and 11 px text on 1.2 em lines. The card grows to fit
// its text up to 600 px and is at least 200 px wide.
inline constexpr int stringGap = 4;
inline constexpr int stringTextMinimum = 60;
inline constexpr int stringTextPadding = 6;
inline constexpr double stringLineHeight = 1.2;
inline constexpr int stringMaximumHeight = 600;
inline constexpr int stringMinimumWidth = 200;
// A small ToolbarIconButton in a header: 4 px padding around a 13 px icon,
// 2 px apart and 4 px from the header's right edge.
inline constexpr int headerButtonSize = 21;
inline constexpr int headerButtonIcon = 13;
inline constexpr int headerButtonInset = 4;
// A small StateIconButton: 5 px padding around a 20 px icon.
inline constexpr int iconButtonSize = 30;
inline constexpr int iconButtonIcon = 20;
// RotateAndFlipBody.tsx: the degree readout is at least 48 px wide.
inline constexpr int angleReadoutWidth = 48;
// DynamicSchemaNodeShell.tsx: the content column is at least 120 px tall. The
// hint is padded 4 px by 6 px, and the footer caption 2 px by 4 px, 2 px below the inputs.
inline constexpr int schemaContentMinimum = 120;
inline constexpr int schemaHintPaddingX = 6;
inline constexpr int schemaHintPaddingY = 4;
inline constexpr int schemaFooterPadding = 2;
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
                         Composer, Slider, Segmented, Lock, ModelChip, Action, DropZone, Swatch, ImageSize,
                         BodyCaption, ListItem, CollectionTile, Knob, Waveform, Envelope, Caption };

// The body a card draws, chosen by node type as the web's bespoke body registry does.
enum class CardBody { Generic, Content, Prompt, Output, Preview, Blur, ResizeImage,
                      Adjustment, SimpleFilter, Scale, Offset, Pad, Outline, DropShadow, ColorOverlay,
                      ChromaKey, Channels, Mask, HslAdjust, Generator, GetVariable,
                      CompareImages, ConstantString, RotateFlip, Resize, Fit, Paste,
                      ExtractVideoFrame, ListGenerator, Collection, SynthModule, AudioOut };

// One media value on a card: an image, video or audio reference and, for an
// image, the thumbnail CardMediaLoader decoded. rect is card-local.
enum class CardMediaState { Unrequested, Loading, Ready, Failed };
struct CardMediaItem {
  QVariant locator;
  // The asset id or uri the item loads, so a changed value loads again.
  QString identity;
  CardMediaState state = CardMediaState::Unrequested;
  QImage image;
  // The image's or video's own size, before scaling.
  QSize natural;
  QRectF rect;
};

struct NodeRow {
  NodeRowKind kind = NodeRowKind::Label;
  QString label;
  QString propertyName;
  // Dynamic input label and its visible rename control, in card coordinates.
  QRectF renameLabelRect;
  QRectF renameButtonRect;
  // The web's slot type chip, which retypes an unconnected input of a
  // user-owned node, and the remove control of every dynamic input.
  QRectF typeChipRect;
  QString typeChip;
  QRectF removeButtonRect;
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
  // A slider's label and value cells, and the grid gap between its columns,
  // when they differ from the Blur row.
  double labelWidth = 0;
  double valueWidth = 0;
  double columnGap = 0;
  // A bespoke label wraps within its rect at this font size, or the 11 px caption when 0.
  bool wrap = false;
  int textSize = 0;
  // A bipolar slider fills from zero and signs positive values.
  bool bipolar = false;
  // A synth knob sweeps its range on a log scale and formats its value in unit
  // ("hz", "s", "ms", "db", "x" or none). accent names the module's palette key.
  bool logScale = false;
  QString unit;
  QString accent;
  // A card warning band (ApiKeyValidation.tsx, InputNodeNameWarning.tsx): a
  // centered uppercase caption in warning ink on a faint warning fill. An
  // Action row with it draws the filled warning button.
  bool warning = false;
  // A slider thumb turns primary once its value leaves this default, as
  // AdjustmentSlider's changed flag. A bare NodeSlider keeps a neutral thumb.
  bool tracksDefault = false;
  double defaultNumber = 0;
  // The command an Action row requests: "addVariable" or "addOutput". A
  // Segmented row with "previewTab" switches the body's preview, not a property.
  QString action;
  // A media drop zone's value kind ("image", "video" or "audio") and items. A
  // list draws its items in a grid above listZone, its own drop zone.
  QString mediaKind;
  QVector<CardMediaItem> media;
  bool mediaList = false;
  QRectF listZone;
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
  // How far a flexible preview grew to fill an authored or default card height.
  // The card's minimum height excludes it.
  int flexHeight = 0;
  QColor accent;
  // An unselected edge color other than the divider, such as a provider node's tinted edge.
  QColor edge;
  // The running ring's conic stops: output then property type colors, five
  // entries, as getNodeColors in web/src/components/node/BaseNode.tsx.
  QVector<QColor> runningColors;
  bool unknown = false;
    // A header-only strip: every handle sits on its midline and no body draws.
    bool collapsed = false;
    bool subgraph = false;
    // A header button at the right of the title, such as the ComfyUI runner's
    // workflow loader. Empty for a card without one.
    QString headerAction;
    QRectF headerActionRect() const {
        // A 16 px icon in 4 px padding, 4 px from the card's right edge, centered on the header.
        const double side = node_metrics::iconSize + 8;
        const double top = node_metrics::borderWidth + node_metrics::padding + (node_metrics::headerHeight - side) / 2.0;
        return QRectF(size.width() - node_metrics::borderWidth - 4 - side, top, side, side);
    }
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
  // The card and its visible handles. The view asks for it on every move and
  // paint, so it is computed once per layout.
  mutable std::optional<QRectF> bounds;
};

// The web header icon key for a type name, as iconMap in web/src/config/IconForType.tsx.
QString webTypeIcon(const QString &type);
// The web data type SVG with its currentColor replaced, or empty when none exists.
QByteArray webTypeIconSvg(const QString &key, const QColor &color);
// "first_name" becomes "First name", as the web's property labels do.
QString displayName(const QString &name);
} // namespace nodetool
