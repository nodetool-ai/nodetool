#pragma once
#include "NodeLayout.h"
#include <QHash>
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
};

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
