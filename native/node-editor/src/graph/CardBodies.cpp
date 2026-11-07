#include "CardBodies.h"
#include <QFont>
#include <QFontMetricsF>
#include <QObject>
#include <QRegularExpression>
#include <QSet>
#include <algorithm>
#include <cmath>

namespace nodetool {
namespace {
namespace nm = node_metrics;

QString typeName(const QJsonValue &port) {
    const auto type = port.toObject()["type"];
    return type.isString() ? type.toString() : type.toObject()["type"].toString();
}

int portIndex(const QJsonArray &inputs, const QString &name) {
    for (int i = 0; i < inputs.size(); ++i) {
        if (inputs[i].toObject()["name"].toString() == name) {
            return i;
        }
    }
    return -1;
}

double textWidth(const QString &text) {
    QFont font(QStringLiteral("Inter"));
    font.setPixelSize(nm::fontLabel);
    return QFontMetricsF(font).horizontalAdvance(text);
}

// Places a port's handle on the card edge when the port exists.
void placePort(NodeLayout &layout, const QJsonArray &inputs, const QString &name, double y) {
    const auto index = portIndex(inputs, name);
    if (index >= 0) {
        layout.inputY[index] = y;
    }
}

NodeRow controlRow(NodeRowKind kind, const QString &name, const QString &label, const QRectF &rect) {
    NodeRow row;
    row.kind = kind;
    row.propertyName = name;
    row.label = label;
    row.rect = rect;
    row.y = rect.y();
    row.height = rect.height();
    row.fieldY = rect.y();
    return row;
}

NodeRow labelRow(const QString &text, const QRectF &rect) {
    auto row = controlRow(NodeRowKind::Label, {}, text, rect);
    row.bare = true;
    return row;
}

// The empty state of an image preview, an Output or a Preview card.
NodeRow placeholderRow(const QString &message, const QString &icon, const QRectF &rect) {
    auto row = controlRow(NodeRowKind::Preview, {}, {}, rect);
    row.value = message;
    row.icon = icon;
    return row;
}

QVariant fieldValue(const QVariantMap &field) {
    const auto value = field.value("value");
    return value.isValid() && !value.isNull() ? value : field.value("defaultValue");
}

// A select with its label to the left, as the Blur type control.
NodeRow selectRow(const QVariantMap &field, const QString &name, const QString &label, const QRectF &rect) {
    auto row = controlRow(NodeRowKind::Field, name, label, rect);
    row.choice = true;
    const auto value = fieldValue(field).toString();
    row.value = displayName(value);
    row.placeholder = value.isEmpty();
    row.conditionalUnavailable = false;
    return row;
}

NodeRow sliderRow(const QVariantMap &field, const QString &name, const QString &label, const QRectF &rect,
                  double minimum, double maximum, double step, const QString &format) {
    auto row = controlRow(NodeRowKind::Slider, name, label, rect);
    row.minimum = minimum;
    row.maximum = maximum;
    row.step = step;
    row.number = std::clamp(fieldValue(field).toDouble(), minimum, maximum);
    row.value = format;
    row.checked = field.value("connected").toBool();
    return row;
}

NodeRow numberBox(const QVariantMap &field, const QString &name, const QRectF &rect) {
    auto row = controlRow(NodeRowKind::Field, name, {}, rect);
    row.bare = true;
    const auto value = fieldValue(field);
    row.value = value.isValid() ? QString::number(value.toDouble()) : QString{};
    row.placeholder = !value.isValid();
    return row;
}

void layoutPrompt(NodeLayout &layout, const CardBodyInput &input) {
    const auto width = double(layout.size.width());
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    const auto field = input.fields.value(QStringLiteral("prompt"));
    const auto prompt = fieldValue(field).toString();
    const auto dynamic = input.node["dynamic_properties"].toObject();
    auto composer = controlRow(NodeRowKind::Composer, QStringLiteral("prompt"), QStringLiteral("Prompt"),
                               QRectF(x, nm::bodyTop, width - 2 * x, nm::composerHeight));
    composer.value = prompt;
    composer.placeholder = prompt.isEmpty();
    composer.options = dynamic.keys();
    // A connected prompt is read-only. The web still draws its text at full contrast.
    composer.checked = field.value("connected").toBool();
    layout.rows.append(composer);
    // Retain the canonical endpoint position even though the prompt handle is hidden.
    placePort(layout, input.inputs, QStringLiteral("prompt"), nm::contentTop + nm::rowHeight / 2.0);
    auto y = nm::bodyTop + nm::composerHeight + nm::micro;
    const QRectF bar(x, y, width - 2 * x, nm::variableBarHeight);
    auto chipX = x;
    if (!promptVariables(prompt).isEmpty()) {
        const auto label = QObject::tr("Variables");
        layout.rows.append(labelRow(label, QRectF(chipX, bar.y(), textWidth(label), bar.height())));
        chipX += textWidth(label) + nm::chipGap;
    }
    for (const auto &name : dynamic.keys()) {
        const auto text = QStringLiteral("{{ %1 }}").arg(name);
        auto chip = controlRow(NodeRowKind::Action, {}, text,
                               QRectF(chipX, bar.center().y() - nm::chipHeight / 2.0, textWidth(text) + 2 * nm::chipPadding, nm::chipHeight));
        chip.action = QStringLiteral("insertVariable");
        chip.value = name;
        chip.bare = true;
        layout.rows.append(chip);
        chipX = chip.rect.right() + nm::chipGap;
    }
    const auto addLabel = QObject::tr("Add another variable");
    const auto buttonWidth = std::min(bar.right() - chipX, textWidth(addLabel) + nm::iconSize + 4 * nm::chipPadding);
    auto add = controlRow(NodeRowKind::Action, {}, addLabel,
                          QRectF(chipX, bar.center().y() - nm::actionHeight / 2.0, buttonWidth, nm::actionHeight));
    add.action = QStringLiteral("addVariable");
    layout.rows.append(add);
    y = bar.bottom();
    // Each variable is a dynamic input row with its own handle, as the composer's NodeInputs.
    for (int i = 0; i < input.inputs.size(); ++i) {
        const auto name = input.inputs[i].toObject()["name"].toString();
        if (!dynamic.contains(name)) {
            continue;
        }
        NodeRow row;
        row.kind = NodeRowKind::Handle;
        row.label = name;
        row.typeName = typeName(input.inputs[i]);
        row.port = i;
        row.y = y + nm::micro + nm::rowHeight / 2.0;
        layout.inputY[i] = row.y;
        layout.rows.append(row);
        y += nm::handleRowStep;
    }
    layout.size.setHeight(int(std::ceil(y + nm::micro + nm::padding + nm::borderWidth)));
}

void layoutOutput(NodeLayout &layout, const CardBodyInput &input) {
    const auto width = double(layout.size.width());
    const auto inset = double(nm::borderWidth + nm::padding);
    placePort(layout, input.inputs, QStringLiteral("value"), nm::contentTop + nm::rowHeight / 2.0);
    const QRectF area(inset, nm::contentTop, width - 2 * inset, nm::outputPlaceholderHeight);
    layout.rows.append(placeholderRow(QObject::tr("Run to see the output"), QStringLiteral("output"), area));
    layout.resultRect = area;
    layout.size.setHeight(std::max<int>(nm::outputMinimumHeight, int(std::ceil(area.bottom() + inset))));
}

void layoutPreview(NodeLayout &layout, const CardBodyInput &input) {
    const auto ui = input.node["ui_properties"].toObject();
    if (ui["width"].toDouble() <= 0) {
        layout.size.setWidth(nm::previewNodeWidth);
    }
    const auto height = ui["height"].toDouble();
    layout.size.setHeight(height > 0 ? int(height) : nm::previewNodeHeight);
    // PreviewNode puts its value handle and its output in the header row.
    placePort(layout, input.inputs, QStringLiteral("value"), nm::headerHandleY);
    for (auto &y : layout.outputY) {
        y = nm::headerHandleY;
    }
    const auto inset = double(nm::borderWidth + nm::padding);
    const QRectF area(inset, nm::contentTop, layout.size.width() - 2 * inset,
                      std::max(0.0, layout.size.height() - nm::contentTop - inset));
    layout.rows.append(placeholderRow(QObject::tr("Run to preview connected data"), QStringLiteral("visibility"), area));
    layout.resultRect = area;
}

// The image preview at the top of the Blur and Resize Image bodies, with the
// image handle over its left edge.
double imagePreview(NodeLayout &layout, const CardBodyInput &input) {
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    const QRectF area(x, nm::bodyTop, layout.size.width() - 2 * x, nm::imagePreviewHeight);
    layout.rows.append(placeholderRow(QObject::tr("Connect an image, then run"), QStringLiteral("image"), area));
    layout.resultRect = area;
    placePort(layout, input.inputs, QStringLiteral("image"), nm::contentTop + nm::rowHeight / 2.0);
    return area.bottom();
}

void layoutBlur(NodeLayout &layout, const CardBodyInput &input) {
    const auto width = double(layout.size.width());
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    auto y = imagePreview(layout, input) + nm::controlGap;
    const QRectF select(x + nm::controlLabelWidth, y, width - 2 * x - nm::controlLabelWidth, nm::controlHeight);
    layout.rows.append(selectRow(input.fields.value(QStringLiteral("blur_type")), QStringLiteral("blur_type"), QObject::tr("Type"), select));
    placePort(layout, input.inputs, QStringLiteral("blur_type"), select.center().y());
    y = select.bottom() + nm::dropZoneGap;
    const QRectF slider(x, y, width - 2 * x, nm::sliderRowHeight);
    const auto size = input.fields.value(QStringLiteral("size"));
    layout.rows.append(sliderRow(size, QStringLiteral("size"), QObject::tr("Size"), slider, 0, 100, 1, QStringLiteral("%1")));
    placePort(layout, input.inputs, QStringLiteral("size"), slider.center().y());
    layout.size.setHeight(int(std::ceil(slider.bottom() + nm::padding + nm::padding + nm::borderWidth)));
}

void layoutResizeImage(NodeLayout &layout, const CardBodyInput &input) {
    const auto width = double(layout.size.width());
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    auto y = imagePreview(layout, input) + nm::padding - 1;
    const auto modeField = input.fields.value(QStringLiteral("mode"));
    const auto mode = fieldValue(modeField).toString().isEmpty() ? QStringLiteral("dimensions") : fieldValue(modeField).toString();
    auto modes = controlRow(NodeRowKind::Segmented, QStringLiteral("mode"), QObject::tr("Resize mode"),
                            QRectF(x, y, width - 2 * x, nm::controlHeight));
    modes.options = {QObject::tr("Scale"), QObject::tr("Dimensions"), QObject::tr("Fit")};
    modes.optionValues = {QStringLiteral("scale"), QStringLiteral("dimensions"), QStringLiteral("fit")};
    modes.selected = int(modes.optionValues.indexOf(QVariant(mode)));
    auto segmentX = modes.rect.x();
    for (const auto &label : modes.options) {
        const auto segment = QRectF(segmentX, modes.rect.y(), textWidth(label) * nm::fontValue / nm::fontLabel + 2 * nm::segmentPadding, modes.rect.height());
        modes.parts.append(segment);
        segmentX = segment.right();
    }
    modes.checked = modeField.value("connected").toBool();
    layout.rows.append(modes);
    placePort(layout, input.inputs, QStringLiteral("mode"), modes.rect.center().y());
    if (mode == QStringLiteral("scale")) {
        y = modes.rect.bottom() + nm::padding;
        const QRectF slider(x, y, width - 2 * x, nm::sliderRowHeight);
        layout.rows.append(sliderRow(input.fields.value(QStringLiteral("scale")), QStringLiteral("scale"), QObject::tr("Scale"),
                                     slider, 0.1, 10, 0.1, QStringLiteral("%1×")));
        placePort(layout, input.inputs, QStringLiteral("scale"), slider.center().y());
        layout.size.setHeight(int(std::ceil(slider.bottom() + nm::padding + nm::padding + nm::borderWidth)));
        return;
    }
    const auto lock = mode == QStringLiteral("dimensions") ? double(nm::lockWidth) : double(nm::micro) * 2;
    const auto boxWidth = (width - 2 * x - lock) / 2;
    y = modes.rect.bottom() + nm::micro;
    layout.rows.append(labelRow(QObject::tr("Width"), QRectF(x, y, boxWidth, nm::dimensionLabelHeight)));
    layout.rows.append(labelRow(QObject::tr("Height"), QRectF(x + boxWidth + lock, y, boxWidth, nm::dimensionLabelHeight)));
    y += nm::dimensionLabelHeight + nm::borderWidth;
    const QRectF widthBox(x, y, boxWidth, nm::controlHeight);
    const QRectF heightBox(widthBox.right() + lock, y, boxWidth, nm::controlHeight);
    layout.rows.append(numberBox(input.fields.value(QStringLiteral("width")), QStringLiteral("width"), widthBox));
    layout.rows.append(numberBox(input.fields.value(QStringLiteral("height")), QStringLiteral("height"), heightBox));
    placePort(layout, input.inputs, QStringLiteral("width"), widthBox.center().y());
    placePort(layout, input.inputs, QStringLiteral("height"), heightBox.center().y());
    if (mode == QStringLiteral("dimensions")) {
        auto link = controlRow(NodeRowKind::Lock, {}, input.dimensionsLinked ? QObject::tr("Unlock aspect ratio") : QObject::tr("Lock aspect ratio"),
                               QRectF(widthBox.right(), y, lock, nm::controlHeight));
        link.checked = input.dimensionsLinked;
        link.icon = input.dimensionsLinked ? QStringLiteral("link") : QStringLiteral("linkOff");
        layout.rows.append(link);
    }
    auto bottom = widthBox.bottom();
    if (mode == QStringLiteral("fit")) {
        const auto presetY = bottom + nm::padding;
        const auto label = QObject::tr("Presets");
        layout.rows.append(labelRow(label, QRectF(x, presetY, textWidth(label), nm::chipHeight)));
        auto presetX = x + textWidth(label) + nm::chipGap;
        for (const auto size : {256, 512, 768, 1024}) {
            const auto text = QString::number(size);
            auto preset = controlRow(NodeRowKind::Action, {}, text,
                                     QRectF(presetX, presetY, textWidth(text) + 2 * nm::micro, nm::chipHeight));
            preset.action = QStringLiteral("resizePreset");
            preset.number = size;
            preset.bare = true;
            preset.checked = fieldValue(input.fields.value(QStringLiteral("width"))).toInt() == size
                && fieldValue(input.fields.value(QStringLiteral("height"))).toInt() == size;
            layout.rows.append(preset);
            presetX = preset.rect.right() + nm::chipGap;
        }
        bottom = presetY + nm::chipHeight;
    }
    layout.size.setHeight(int(std::ceil(bottom + nm::padding + nm::padding + nm::borderWidth)));
}
} // namespace

CardBody cardBodyFor(const QString &type, const QJsonObject &metadata) {
    if (type == QStringLiteral("nodetool.text.Prompt")) {
        return CardBody::Prompt;
    }
    if (type == QStringLiteral("nodetool.output.Output")) {
        return CardBody::Output;
    }
    if (type == QStringLiteral("nodetool.workflows.base_node.Preview")) {
        return CardBody::Preview;
    }
    if (type == QStringLiteral("nodetool.image.Blur")) {
        return CardBody::Blur;
    }
    if (type == QStringLiteral("nodetool.image.ResizeImage")) {
        return CardBody::ResizeImage;
    }
    return metadata["body"] == QStringLiteral("content_card") ? CardBody::Content : CardBody::Generic;
}

bool drawsOwnHandles(CardBody body) {
    return body != CardBody::Generic && body != CardBody::Content;
}

bool bespokeHandle(CardBody body, const QJsonObject &metadata, const QString &name) {
    switch (body) {
    case CardBody::Prompt:
        return false;
    case CardBody::Output:
    case CardBody::Preview:
        return name == QStringLiteral("value");
    case CardBody::Blur:
    case CardBody::ResizeImage:
        return name == QStringLiteral("image");
    default:
        return metadata["input_fields"].toArray().contains(name);
    }
}

bool isModelTypeName(const QString &type) {
    return type.endsWith(QStringLiteral("_model")) || type.startsWith(QStringLiteral("hf.")) || type.startsWith(QStringLiteral("tjs."));
}

QStringList modelChipNames(const QJsonObject &metadata, const QJsonObject &ui) {
    QSet<QString> placed;
    for (const auto &list : {metadata["inline_fields"].toArray(), metadata["input_fields"].toArray(), ui["exposed_inputs"].toArray(),
                             ui["exposed_inputs_labeled"].toArray(), ui["exposed_inputs_hidden"].toArray()}) {
        for (const auto &name : list) {
            placed.insert(name.toString());
        }
    }
    QStringList names;
    for (const auto &property : metadata["properties"].toArray()) {
        const auto name = property.toObject()["name"].toString();
        if (isModelTypeName(typeName(property)) && !placed.contains(name)) {
            names.append(name);
        }
    }
    return names;
}

QString headerIconType(CardBody body, const QJsonObject &metadata) {
    if (body == CardBody::Preview) {
        return QStringLiteral("preview");
    }
    const auto outputs = metadata["outputs"].toArray();
    const auto properties = metadata["properties"].toArray();
    if (body != CardBody::Output && !outputs.isEmpty()) {
        return typeName(outputs.first());
    }
    return properties.isEmpty() ? QStringLiteral("any") : typeName(properties.first());
}

void layoutBespokeBody(NodeLayout &layout, const CardBodyInput &input) {
    switch (layout.body) {
    case CardBody::Prompt:
        layoutPrompt(layout, input);
        break;
    case CardBody::Output:
        layoutOutput(layout, input);
        break;
    case CardBody::Preview:
        layoutPreview(layout, input);
        break;
    case CardBody::Blur:
        layoutBlur(layout, input);
        break;
    case CardBody::ResizeImage:
        layoutResizeImage(layout, input);
        break;
    default:
        break;
    }
}

QRectF sliderTrack(const NodeRow &row) {
    const auto left = row.rect.x() + nm::controlLabelWidth;
    const auto right = row.rect.right() - nm::sliderValueWidth - nm::chipGap;
    return QRectF(left, row.rect.center().y() - nm::sliderTrack / 2.0, std::max(0.0, right - left), nm::sliderTrack);
}

double sliderValueAt(const NodeRow &row, double x) {
    const auto track = sliderTrack(row);
    const auto fraction = track.width() > 0 ? std::clamp((x - track.x()) / track.width(), 0.0, 1.0) : 0.0;
    auto value = row.minimum + fraction * (row.maximum - row.minimum);
    if (row.step > 0) {
        value = row.minimum + std::round((value - row.minimum) / row.step) * row.step;
    }
    return std::clamp(value, row.minimum, row.maximum);
}

QString sliderText(const NodeRow &row, double value) {
    const auto decimals = row.step < 1 ? 2 : 0;
    return row.value.arg(QString::number(value, 'f', decimals));
}

QVector<PromptToken> promptTokens(const QString &line) {
    static const QRegularExpression variable(QStringLiteral("(asset://[A-Za-z0-9._~/-]+)|(entity://[A-Za-z0-9._~-]+)|\\{\\{\\s*([^}]+?)\\s*\\}\\}"));
    QVector<PromptToken> tokens;
    qsizetype cursor = 0;
    auto match = variable.globalMatch(line);
    while (match.hasNext()) {
        const auto found = match.next();
        if (found.capturedStart() > cursor) {
            tokens.append({line.mid(cursor, found.capturedStart() - cursor), false, {}});
        }
        if (!found.captured(1).isEmpty() || !found.captured(2).isEmpty()) {
            auto uri = found.captured(0);
            while (uri.endsWith(QLatin1Char('.'))) {
                uri.chop(1);
            }
            tokens.append({uri, false, found.captured(1).isEmpty() ? QStringLiteral("entity") : QStringLiteral("asset")});
            cursor = found.capturedStart() + uri.size();
        } else {
            tokens.append({found.captured(3).trimmed(), true, {}});
            cursor = found.capturedEnd();
        }
    }
    if (cursor < line.size()) {
        tokens.append({line.mid(cursor), false, {}});
    }
    return tokens;
}

QStringList promptVariables(const QString &text) {
    QStringList names;
    for (const auto &line : text.split(QLatin1Char('\n'))) {
        for (const auto &token : promptTokens(line)) {
            if (token.variable && !names.contains(token.text)) {
                names.append(token.text);
            }
        }
    }
    return names;
}
} // namespace nodetool
