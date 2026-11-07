#pragma once
#include "NodeLayout.h"
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QVariantMap>
#include <QVector>

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

struct CardBodyInput {
    QJsonObject node;
    QJsonObject metadata;
    QJsonArray inputs;
    int outputCount = 0;
    QHash<QString, QVariantMap> fields;
    bool dimensionsLinked = false;
};

// Lays out a Prompt, Output, Preview, Blur or Resize Image body: its rows, port
// positions, result area and natural size. The caller applies a user resize.
void layoutBespokeBody(NodeLayout &layout, const CardBodyInput &input);

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
