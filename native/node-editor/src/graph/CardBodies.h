#pragma once
#include <array>
#include <optional>
#include "NodeLayout.h"
#include <QHash>
#include <QImage>
#include <QJsonArray>
#include <QJsonObject>
#include <QVariantMap>
#include <QTextLayout>
#include <QVector>
#include <memory>
#include <vector>

namespace nodetool {
// The body a node type draws, as the bespoke registry in
// web/src/components/node_types/editing/bespokeRegistry.ts, ReactFlowWrapper.tsx
// and the content card registry route it.
CardBody cardBodyFor(const QString &type, const QJsonObject &metadata);

// A bespoke body draws its own handles. Connected hidden properties retain
// canonical ports, while the scene suppresses their paint and hit targets.
bool drawsOwnHandles(CardBody body);
bool bespokeHandle(CardBody body, const QJsonObject &metadata, const QString &name);

// Model pickers shown on the card, as resolveModelChipNames in web/src/utils/exposedInputs.ts.
bool isModelTypeName(const QString &type);
QStringList modelChipNames(const QJsonObject &metadata, const QJsonObject &ui);

// The header icon type, as BaseNode, OutputNode and PreviewNode pass iconType.
QString headerIconType(CardBody body, const QJsonObject &metadata);

// A schema-driven provider node of DynamicSchemaNodeShell.tsx: fal, kie or
// replicate. Its card keeps the generic rows and adds the model to the title,
// a hint while no schema is loaded, a footer and the provider's edge color.
struct SchemaProvider {
    QString label;
    QColor accent;
    // The ui_properties field naming the model, and a prefix the title drops.
    QString detailKey;
    QString titlePrefix;
    QString description;
    QString instructions;
};
// The provider of a node type, or an empty label for any other node.
SchemaProvider schemaProvider(const QString &type);
// The title detail, as the shell's titleDetail, and the footer caption.
QString schemaTitleDetail(const SchemaProvider &provider, const QJsonObject &ui);
QString schemaFooter(const SchemaProvider &provider, const QJsonObject &ui);

// computeHistogramFromRgba: 256 bins of R, G, B and Rec. 709 luminance.
struct ImageHistogram {
    std::array<std::array<quint32, 256>, 4> bins{};
};
ImageHistogram imageHistogram(const QImage &image);

// PainterBody's tool state. The web keeps it in the body, not in the node,
// so it is view state here too. The undo and redo stacks hold earlier
// mask_data values, at most painterHistory of each.
struct PainterView {
    bool eraser = false;
    double size = 24;
    double opacity = 1;
    double fade = 1;
    QString color = QStringLiteral("#ffffff");
    QStringList undo;
    QStringList redo;
};
inline constexpr int painterHistory = 30;
// The Painter controls that edit PainterView, committed through
// WorkflowGraphModel::setCardControl as the Crop controls are.
inline constexpr auto painterSizeControl = "@painter:size";
inline constexpr auto painterOpacityControl = "@painter:opacity";
inline constexpr auto painterFadeControl = "@painter:fade";
inline constexpr auto painterColorControl = "@painter:color";
bool isPainterControl(const QString &name);
// A Crop or Painter control: a card value with a row name but no property.
bool isCardControl(const QString &name);

struct CardBodyInput {
    QJsonObject node;
    QJsonObject metadata;
    QJsonArray inputs;
    int outputCount = 0;
    QHash<QString, QVariantMap> fields;
    bool dimensionsLinked = false;
    // Names published by Set Variable nodes anywhere in the workflow, sorted.
    QStringList graphVariables;
    // The selected preview tab of a Before/After or Mask body, or the Levels
    // channel, empty for its default.
    QString previewTab;
    // The image arriving at each image handle, for a body that reads its source.
    QHash<QString, CardMediaItem> sources;
    // The histogram of the node's result image, for the Levels body.
    std::optional<ImageHistogram> histogram;
    // The Painter's tool state and its decoded mask_data.
    PainterView painter;
    QImage paintMask;
};

// Bodies that show or measure the image arriving at their image handles, as
// useUpstreamValue in the web's CanvasResizeBody and PasteBody.
bool readsBodySources(CardBody body);
// The card media key of a body source, apart from the node's own property values.
QString bodySourceKey(const QString &handle);

// CropBody.tsx: the crop in image pixels as a Crop row holds it, the same crop
// on the card, the handle under a card-local point ("move" inside the crop,
// "nw", "n" and so on at a handle, empty elsewhere), the handle radius on the
// card, and the crop a drag by delta image pixels makes from start, clamped
// and rounded as writeRect.
QRectF cropEdges(const NodeRow &row);
QRectF cropOnCard(const NodeRow &row, const QRectF &crop);
double cropHandleRadius(const NodeRow &row);
QString cropHandleAt(const NodeRow &row, const QRectF &crop, const QPointF &local);
// A non-zero ratio holds width / height while a handle is dragged, as the
// aspect select's lock does. A move keeps the size whatever the ratio.
QRectF cropDragged(const QString &handle, const QRectF &start, const QPointF &delta, const QSizeF &bounds, double ratio = 0);
// The aspect select's options: "free" first, then the ratios as "W:H" keys.
QStringList cropAspectKeys();
// width / height for an aspect key, or 0 for "free" and unknown keys.
double cropAspectRatio(const QString &key);
// The Crop body's controls are card values, not node properties. These names
// mark their rows, and the inline editor commits them through
// cropControlled instead of writing a property.
inline constexpr auto cropAspectControl = "@crop:aspect";
inline constexpr auto cropWidthControl = "@crop:width";
inline constexpr auto cropHeightControl = "@crop:height";
bool isCropControl(const QString &name);
// The crop the aspect select or a width or height box makes from crop, as
// handleAspectChange, handleWidthChange and handleHeightChange in CropBody.tsx.
// ratio is the selected aspect for the width and height boxes.
// PainterBody: the canvas size (the source image's, else canvas_width and
// canvas_height, else 512) and the mask after a stroke drawn at full alpha in
// stroke is laid on mask at the brush opacity, or cut out of it for the eraser.
QSize painterCanvasSize(const CardBodyInput &input);
QImage paintedMask(const QImage &mask, const QImage &stroke, const QSize &canvas, double opacity, bool eraser);
QRectF cropControlled(const QString &control, const QVariant &value, const QRectF &crop, const QSizeF &bounds, double ratio);

// Lays out a bespoke body: its rows, port positions, result area and size. A
// body whose web preview-area flexes grows it to fill an authored height or
// the web default height, and records the growth in NodeLayout::flexHeight.
void layoutBespokeBody(NodeLayout &layout, const CardBodyInput &input);

// The type of a Set Variable node, whose name the Prompt and Get Variable bodies offer.
inline constexpr auto setVariableType = "nodetool.variable.SetVariable";
// Every variable name defined by a Set Variable node, as collectVariableNames
// in web/src/components/node_types/editing/variableGraph.ts.
QStringList graphVariableNames(const QJsonArray &nodes);
// Bodies whose layout reads the graph's variable names.
bool readsGraphVariables(CardBody body);

// Lays out a text area's text as a pre-wrap textarea wraps it: each paragraph
// wraps at the width on its own, an empty one still takes a line, and lines
// sit lineHeight apart from the top. The Constant String body sizes and paints with it.
std::vector<std::unique_ptr<QTextLayout>> textAreaLayouts(const QString &text, const QFont &font, double width, double lineHeight);

// A slider row's track, the value under a card-local x, and the value label.
QRectF sliderTrack(const NodeRow &row);
double sliderValueAt(const NodeRow &row, double x);
QString sliderText(const NodeRow &row, double value);

// A prompt token holds plain text, a variable expression inside {{ }}, or a
// full asset/entity URI, as tokenizePromptLine in promptComposer/promptTokens.ts.
struct PromptToken {
    QString text;
    bool variable = false;
    QString mentionScheme;
};
QVector<PromptToken> promptTokens(const QString &line);
QStringList promptVariables(const QString &text);
} // namespace nodetool
