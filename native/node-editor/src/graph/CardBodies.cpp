#include "CardBodies.h"
#include "SynthModules.h"
#include <QFont>
#include <QFontMetricsF>
#include <QTextLayout>
#include <QObject>
#include <QRegularExpression>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <tuple>

namespace nodetool {
namespace {
namespace nm = node_metrics;

QString typeName(const QJsonValue &port) {
    const QJsonValue type = port.toObject()["type"];
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

QFont bodyFont(int pixels, bool medium = false, bool mono = false) {
    QFont font(mono ? QStringLiteral("JetBrains Mono") : QStringLiteral("Inter"));
    font.setPixelSize(pixels);
    font.setWeight(medium ? QFont::Medium : QFont::Normal);
    return font;
}

double captionWidth(const QString &text, bool medium = false, bool mono = false) {
    return QFontMetricsF(bodyFont(nm::fontValue, medium, mono)).horizontalAdvance(text);
}

// The height of text wrapped at a width, in lines of lineHeight em.
double wrappedHeight(const QString &text, const QFont &font, double width, double lineHeight) {
    const QFontMetricsF metrics(font);
    const auto bounds = metrics.boundingRect(QRectF(0, 0, std::max(1.0, width), 1e6), Qt::TextWordWrap, text);
    const auto lines = std::max(1.0, std::round(bounds.height() / metrics.lineSpacing()));
    return lines * font.pixelSize() * lineHeight;
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
    // Set Variable names resolve at run time, so the composer treats them as known.
    composer.options = dynamic.keys();
    for (const auto &name : input.graphVariables) {
        if (!composer.options.contains(name)) {
            composer.options.append(name);
        }
    }
    // A connected prompt is read-only. The web still draws its text at full contrast.
    composer.checked = field.value("connected").toBool();
    layout.rows.append(composer);
    // Retain the canonical endpoint position even though the prompt handle is hidden.
    placePort(layout, input.inputs, QStringLiteral("prompt"), nm::contentTop + nm::rowHeight / 2.0);
    auto y = nm::bodyTop + nm::composerHeight + nm::micro;
    // The variable bar is a wrapping flex row, so an item that does not fit
    // starts a new line below the last.
    const auto right = width - x;
    auto line = QRectF(x, y, width - 2 * x, nm::variableBarHeight);
    auto chipX = x;
    const auto place = [&](double itemWidth) {
        if (chipX > x && chipX + itemWidth > right) {
            // A wrapped line holds the 28 px button 2 px below the last.
            line.translate(0, nm::actionHeight + nm::micro);
            chipX = x;
        }
        const auto left = chipX;
        chipX += itemWidth + nm::chipGap;
        return left;
    };
    if (!promptVariables(prompt).isEmpty()) {
        const auto label = QObject::tr("Variables");
        const auto left = place(textWidth(label));
        layout.rows.append(labelRow(label, QRectF(left, line.y(), textWidth(label), line.height())));
    }
    // The node's own inputs come first, then the Set Variable names it lacks,
    // which the web accents as coming from elsewhere in the graph.
    for (const auto &name : composer.options) {
        const auto text = QStringLiteral("{{ %1 }}").arg(name);
        const auto chipWidth = std::min(right - x, textWidth(text) + 2 * nm::chipPadding);
        const auto left = place(chipWidth);
        auto chip = controlRow(NodeRowKind::Action, {}, text,
                               QRectF(left, line.center().y() - nm::chipHeight / 2.0, chipWidth, nm::chipHeight));
        chip.action = QStringLiteral("insertVariable");
        chip.value = name;
        chip.bare = true;
        chip.checked = !dynamic.contains(name);
        layout.rows.append(chip);
    }
    const auto addLabel = QObject::tr("Add another variable");
    const auto buttonWidth = std::min(right - x, textWidth(addLabel) + nm::iconSize + 4 * nm::chipPadding);
    const auto addLeft = place(buttonWidth);
    auto add = controlRow(NodeRowKind::Action, {}, addLabel,
                          QRectF(addLeft, line.center().y() - nm::actionHeight / 2.0, buttonWidth, nm::actionHeight));
    add.action = QStringLiteral("addVariable");
    layout.rows.append(add);
    y = line.bottom();
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
    // BlurBody.tsx and ResizeImageBody.tsx: .preview-area minHeight 96.
    const QRectF area(x, nm::bodyTop, layout.size.width() - 2 * x, nm::imageBodyPreviewHeight);
    layout.rows.append(placeholderRow(QObject::tr("Connect an image, then run"), QStringLiteral("image"), area));
    layout.resultRect = area;
    placePort(layout, input.inputs, QStringLiteral("image"), nm::contentTop + nm::rowHeight / 2.0);
    return area.bottom();
}

void layoutBlur(NodeLayout &layout, const CardBodyInput &input) {
    const auto width = double(layout.size.width());
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    // The body's 2 px gap and the controls grid's 2 px top padding.
    auto y = imagePreview(layout, input) + nm::bodyGap + nm::bodyGap;
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

// The two number boxes of ResizeImageBody, ResizeBody, FitBody and PasteBody:
// 12 px labels over 24 px boxes, with the aspect lock between them when `lock`
// is set. The boxes edit width and height unless other names are given.
// Returns the bottom of the boxes.
double dimensionRow(NodeLayout &layout, const CardBodyInput &input, double y, bool lock,
                    const QStringList &names = {QStringLiteral("width"), QStringLiteral("height")},
                    const QStringList &labels = {QObject::tr("Width"), QObject::tr("Height")}) {
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    const auto gap = lock ? double(nm::lockWidth) : double(nm::micro) * 2;
    const auto boxWidth = (layout.size.width() - 2 * x - gap) / 2;
    layout.rows.append(labelRow(labels[0], QRectF(x, y, boxWidth, nm::dimensionLabelHeight)));
    layout.rows.append(labelRow(labels[1], QRectF(x + boxWidth + gap, y, boxWidth, nm::dimensionLabelHeight)));
    y += nm::dimensionLabelHeight + nm::borderWidth;
    const QRectF widthBox(x, y, boxWidth, nm::controlHeight);
    const QRectF heightBox(widthBox.right() + gap, y, boxWidth, nm::controlHeight);
    layout.rows.append(numberBox(input.fields.value(names[0]), names[0], widthBox));
    layout.rows.append(numberBox(input.fields.value(names[1]), names[1], heightBox));
    placePort(layout, input.inputs, names[0], widthBox.center().y());
    placePort(layout, input.inputs, names[1], heightBox.center().y());
    if (lock) {
        auto link = controlRow(NodeRowKind::Lock, {}, input.dimensionsLinked ? QObject::tr("Unlock aspect ratio") : QObject::tr("Lock aspect ratio"),
                               QRectF(widthBox.right(), y, gap, nm::controlHeight));
        link.checked = input.dimensionsLinked;
        link.icon = input.dimensionsLinked ? QStringLiteral("link") : QStringLiteral("linkOff");
        layout.rows.append(link);
    }
    return widthBox.bottom();
}

// The 256, 512, 768 and 1024 chips that set both dimensions at once. Returns their bottom.
double presetRow(NodeLayout &layout, const CardBodyInput &input, double bottom) {
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
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
    return presetY + nm::chipHeight;
}

void layoutResizeImage(NodeLayout &layout, const CardBodyInput &input) {
    const auto width = double(layout.size.width());
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    auto y = imagePreview(layout, input) + nm::bodyGap;
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
    auto bottom = dimensionRow(layout, input, modes.rect.bottom() + nm::micro, mode == QStringLiteral("dimensions"));
    if (mode == QStringLiteral("fit")) {
        bottom = presetRow(layout, input, bottom);
    }
    layout.size.setHeight(int(std::ceil(bottom + nm::padding + nm::padding + nm::borderWidth)));
}

// ResizeBody.tsx: the Resize Image dimension row with its lock, below the preview.
void layoutResize(NodeLayout &layout, const CardBodyInput &input) {
    const auto bottom = dimensionRow(layout, input, imagePreview(layout, input) + nm::bodyGap, true);
    layout.size.setHeight(int(std::ceil(bottom + nm::padding + nm::padding + nm::borderWidth)));
}

// PasteBody.tsx: the base and paste handles, and Left and Top in the dimension row.
void layoutPaste(NodeLayout &layout, const CardBodyInput &input) {
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    const QRectF area(x, nm::bodyTop, layout.size.width() - 2 * x, nm::imageBodyPreviewHeight);
    layout.rows.append(placeholderRow(QObject::tr("Connect Image and Paste, then run"), QStringLiteral("image"), area));
    layout.resultRect = area;
    placePort(layout, input.inputs, QStringLiteral("image"), nm::contentTop + nm::rowHeight / 2.0);
    placePort(layout, input.inputs, QStringLiteral("paste"), nm::contentTop + nm::rowHeight / 2.0 + nm::handleRowStep);
    const auto bottom = dimensionRow(layout, input, area.bottom() + nm::bodyGap, false, {QStringLiteral("left"), QStringLiteral("top")},
                                     {QObject::tr("Left"), QObject::tr("Top")});
    layout.size.setHeight(int(std::ceil(bottom + nm::padding + nm::padding + nm::borderWidth)));
}

// FitBody.tsx: the dimension row without a lock, then the size presets.
void layoutFit(NodeLayout &layout, const CardBodyInput &input) {
    const auto bottom = presetRow(layout, input, dimensionRow(layout, input, imagePreview(layout, input) + nm::bodyGap, false));
    layout.size.setHeight(int(std::ceil(bottom + nm::padding + nm::padding + nm::borderWidth)));
}

// A web preview-area is flex 1 1 auto, so a card taller than its natural size
// grows the preview and keeps every control below it at the bottom.
void growPreview(NodeLayout &layout, const CardBodyInput &input, int fallbackHeight = 0) {
    const auto authored = input.node["ui_properties"].toObject()["height"].toDouble();
    const auto target = authored > 0 ? int(authored) : fallbackHeight;
    const auto extra = std::max(0, target - layout.size.height());
    if (extra == 0 || layout.resultRect.isEmpty()) {
        return;
    }
    const auto bottom = layout.resultRect.bottom();
    for (auto &row : layout.rows) {
        if (row.rect == layout.resultRect) {
            row.rect.setHeight(row.rect.height() + extra);
            row.height = row.rect.height();
            continue;
        }
        if (row.rect.top() < bottom) {
            continue;
        }
        row.rect.translate(0, extra);
        row.y += extra;
        row.fieldY += extra;
        for (auto &part : row.parts) {
            part.translate(0, extra);
        }
    }
    for (auto &y : layout.inputY) {
        if (y > bottom) {
            y += extra;
        }
    }
    layout.resultRect.setHeight(layout.resultRect.height() + extra);
    layout.flexHeight = extra;
    layout.size.setHeight(layout.size.height() + extra);
}

// humanize in AdjustmentBody.tsx and GeneratorBody.tsx: underscores become
// spaces and each word starts upper case.
QString humanize(const QString &name) {
    auto text = QString(name).replace(QLatin1Char('_'), QLatin1Char(' '));
    for (qsizetype i = 0; i < text.size(); ++i) {
        if (text[i].isLetterOrNumber() && (i == 0 || !text[i - 1].isLetterOrNumber())) {
            text[i] = text[i].toUpper();
        }
    }
    return text;
}

QString propertyType(const QJsonObject &property) {
    return typeName(property);
}

struct SliderSpec {
    QString name;
    QString label;
    double minimum = 0;
    double maximum = 1;
    double step = 0.01;
    double fallback = 0;
    bool bipolar = false;
};

// toSliderSpecs in AdjustmentBody.tsx and the slider specs of GeneratorBody.tsx:
// one slider per float or int property with a numeric min and max.
QVector<SliderSpec> metadataSliders(const QJsonObject &metadata) {
    QVector<SliderSpec> specs;
    const auto type = metadata["node_type"].toString();
    for (const auto &value : metadata["properties"].toArray()) {
        const auto property = value.toObject();
        const auto kind = propertyType(property);
        if (kind != QStringLiteral("float") && kind != QStringLiteral("int")) {
            continue;
        }
        SliderSpec spec;
        spec.name = property["name"].toString();
        spec.label = property["title"].toString(humanize(spec.name));
        spec.step = kind == QStringLiteral("int") ? 1 : 0.01;
        spec.fallback = property["default"].isDouble() ? property["default"].toDouble() : 0;
        bool ranged = property["min"].isDouble() && property["max"].isDouble();
        spec.minimum = property["min"].toDouble();
        spec.maximum = property["max"].toDouble();
        // GeneratorBody's PARAM_OVERRIDES for GaussianNoise, whose metadata omits the range.
        if (type == QStringLiteral("lib.image.draw.GaussianNoise") && spec.name == QStringLiteral("mean")) {
            spec.minimum = -1;
            spec.maximum = 1;
            spec.fallback = 0;
            ranged = true;
        } else if (type == QStringLiteral("lib.image.draw.GaussianNoise") && spec.name == QStringLiteral("stddev")) {
            spec.minimum = 0;
            spec.maximum = 3;
            spec.fallback = 1;
            ranged = true;
        }
        if (!ranged) {
            continue;
        }
        spec.bipolar = spec.minimum < 0 && spec.maximum > 0;
        specs.append(spec);
    }
    return specs;
}

// The single column of an image editing body, from the top of its preview-area.
struct Column {
    NodeLayout &layout;
    const CardBodyInput &input;
    double x = nm::borderWidth + nm::padding + nm::micro;
    double width = 0;
    double y = nm::bodyTop;

    Column(NodeLayout &target, const CardBodyInput &source)
        : layout(target), input(source), width(target.size.width() - 2 * x) {}

    void preview(const QString &message, const QString &icon = QStringLiteral("image")) {
        const QRectF area(x, y, width, nm::imageBodyPreviewHeight);
        layout.rows.append(placeholderRow(message, icon, area));
        layout.resultRect = area;
        y = area.bottom();
    }

    // HandleColumn: one 18 px row per image handle, 28 px apart, from 4 px into the body.
    void handles(const QStringList &names) {
        for (int i = 0; i < names.size(); ++i) {
            placePort(layout, input.inputs, names[i], nm::contentTop + nm::rowHeight / 2.0 + i * nm::handleRowStep);
        }
    }

    double number(const QString &name, double fallback) const {
        const auto value = fieldValue(input.fields.value(name));
        return value.isValid() && value.canConvert<double>() ? value.toDouble() : fallback;
    }

    // A ColorPicker value is a { type: "color", value } object.
    QString color(const QString &name) const {
        const auto value = fieldValue(input.fields.value(name));
        return value.typeId() == QMetaType::QVariantMap ? value.toMap().value("value").toString() : value.toString();
    }

    void finish(int fallbackHeight = 0) {
        layout.size.setHeight(int(std::ceil(y + nm::imageBodyBottom)));
        growPreview(layout, input, fallbackHeight);
    }
};

// A grid of label, control and value cells, as the .controls block of the
// image editing bodies. A fractional grid is AdjustmentSlider's
// minmax(0, 1fr) minmax(48px, 1.4fr) auto. Otherwise the label column fits
// its widest label, as minmax(0, auto) minmax(40px, 1fr) auto.
struct Grid {
    bool fractional = true;
    double columnGap = 6;
    double rowGap = 4;
    double padY = 4;
    double padX = 4;
    double valueMinimum = nm::adjustmentValueWidth;
    // A bare NodeSlider is 20 px tall and keeps a neutral thumb.
    bool bareSliders = false;
    // Labels in the medium weight, as adjustmentSliderStyles.
    bool mediumLabels = true;
    QString valueSuffix;

    struct Item {
        enum Kind { Slider, Swatch, Select } kind = Slider;
        SliderSpec slider;
        QString name;
        QString label;
        QStringList options;
        QVariantList values;
    };
    QVector<Item> items;

    void slider(const SliderSpec &spec) { items.append({Item::Slider, spec, spec.name, spec.label, {}, {}}); }
    void swatch(const QString &name, const QString &label) { items.append({Item::Swatch, {}, name, label, {}, {}}); }
    void select(const QString &name, const QString &label, const QStringList &options, const QVariantList &values) {
        items.append({Item::Select, {}, name, label, options, values});
    }

    QString valueText(const Item &item, double value) const {
        NodeRow row;
        row.step = item.slider.step;
        row.bipolar = item.slider.bipolar;
        row.value = QStringLiteral("%1") + valueSuffix;
        return sliderText(row, value);
    }

    void place(Column &column) const {
        const auto inner = column.width - 2 * padX;
        const auto left = column.x + padX;
        double valueWidth = valueMinimum;
        double labelWidth = 0;
        for (const auto &item : items) {
            labelWidth = std::max(labelWidth, captionWidth(item.label, mediumLabels));
            if (item.kind != Item::Slider) {
                continue;
            }
            const auto current = std::clamp(column.number(item.name, item.slider.fallback), item.slider.minimum, item.slider.maximum);
            // AdjustmentSlider's value cell has 4 px padding on each side.
            const auto padding = bareSliders ? 0.0 : 2.0 * nm::chipGap;
            for (const auto value : {item.slider.minimum, item.slider.maximum, current}) {
                valueWidth = std::max(valueWidth, captionWidth(valueText(item, value), false, true) + padding);
            }
        }
        if (fractional) {
            labelWidth = (inner - valueWidth - 2 * columnGap) / (1 + nm::adjustmentSliderFraction);
        }
        auto y = column.y + padY;
        for (int i = 0; i < items.size(); ++i) {
            const auto &item = items[i];
            if (i > 0) {
                y += rowGap;
            }
            if (item.kind == Item::Swatch) {
                auto row = controlRow(NodeRowKind::Swatch, item.name, item.label,
                                      QRectF(left + labelWidth + columnGap, y, nm::swatchSize, nm::swatchSize));
                row.value = column.color(item.name);
                row.parts = {QRectF(left, y, labelWidth, nm::swatchSize)};
                row.checked = column.input.fields.value(item.name).value("connected").toBool();
                column.layout.rows.append(row);
                y += nm::swatchSize;
                continue;
            }
            if (item.kind == Item::Select) {
                const QRectF rect(left + labelWidth + columnGap, y, inner - labelWidth - columnGap, nm::selectHeight);
                auto row = selectRow(column.input.fields.value(item.name), item.name, item.label, rect);
                row.options = item.options;
                row.optionValues = item.values;
                const auto index = item.values.indexOf(fieldValue(column.input.fields.value(item.name)));
                if (index >= 0) {
                    row.value = item.options.value(index);
                }
                column.layout.rows.append(row);
                y += nm::selectHeight;
                continue;
            }
            auto height = double(bareSliders ? nm::nodeSliderHeight : nm::adjustmentRowHeight);
            if (fractional) {
                height = std::max(height, wrappedHeight(item.label, bodyFont(nm::fontValue, mediumLabels), labelWidth, nm::adjustmentLabelLineHeight));
            }
            const auto field = column.input.fields.value(item.name);
            auto row = sliderRow(field, item.name, item.label, QRectF(left, y, inner, height), item.slider.minimum, item.slider.maximum,
                                 item.slider.step, QStringLiteral("%1") + valueSuffix);
            row.number = std::clamp(column.number(item.name, item.slider.fallback), item.slider.minimum, item.slider.maximum);
            row.labelWidth = labelWidth;
            row.valueWidth = valueWidth;
            row.columnGap = columnGap;
            row.bipolar = item.slider.bipolar;
            row.tracksDefault = !bareSliders;
            row.defaultNumber = item.slider.fallback;
            row.wrap = fractional;
            column.layout.rows.append(row);
            y += height;
        }
        column.y = y + padY;
    }
};

// A flex row with a label on the left and a ColorPicker on the right, padded 2 px by 4 px.
void colorRow(Column &column, const QString &name, const QString &label) {
    const auto padX = double(nm::chipGap);
    const auto top = column.y + nm::micro;
    auto row = controlRow(NodeRowKind::Swatch, name, label,
                          QRectF(column.x + column.width - padX - nm::swatchSize, top, nm::swatchSize, nm::swatchSize));
    row.value = column.color(name);
    row.parts = {QRectF(column.x + padX, top, column.width - 2 * padX - nm::swatchSize, nm::swatchSize)};
    row.checked = column.input.fields.value(name).value("connected").toBool();
    column.layout.rows.append(row);
    column.y = top + nm::swatchSize + nm::micro;
}

// A quiet ToggleGroup: 24 px options 2 px apart. Equal options fill the row,
// as fullWidth. Flexible options grow from their label, as flex 1 1 auto.
// Otherwise each option fits its label with 8 px padding.
enum class ToggleFit { Equal, Flexible, Content };
NodeRow toggleRow(Column &column, double left, const QString &name, const QStringList &labels, const QVariantList &values,
                  int selected, ToggleFit fit, bool mono) {
    const auto right = column.x + column.width;
    auto row = controlRow(NodeRowKind::Segmented, name, {}, QRectF(left, column.y, right - left, nm::toggleHeight));
    row.options = labels;
    row.optionValues = values;
    row.selected = selected;
    row.bare = mono;
    const auto gaps = nm::micro * std::max<qsizetype>(0, labels.size() - 1);
    QVector<double> widths;
    double used = 0;
    for (const auto &label : labels) {
        const auto padding = fit == ToggleFit::Content ? 2.0 * nm::padding : 2.0 * nm::micro;
        widths.append(captionWidth(label, false, mono) + padding);
        used += widths.last();
    }
    const auto free = std::max(0.0, row.rect.width() - gaps - used);
    auto x = left;
    for (int i = 0; i < labels.size(); ++i) {
        auto width = widths[i];
        if (fit == ToggleFit::Equal) {
            width = (row.rect.width() - gaps) / labels.size();
        } else if (fit == ToggleFit::Flexible) {
            width += free / labels.size();
        }
        row.parts.append(QRectF(x, column.y, width, nm::toggleHeight));
        x += width + nm::micro;
    }
    if (fit == ToggleFit::Content) {
        row.rect.setRight(x - nm::micro);
    }
    return row;
}

void layoutAdjustment(NodeLayout &layout, const CardBodyInput &input) {
    Column column(layout, input);
    QStringList images;
    for (const auto &value : input.metadata["properties"].toArray()) {
        if (propertyType(value.toObject()) == QStringLiteral("image")) {
            images.append(value.toObject()["name"].toString());
        }
    }
    column.handles(images);
    column.preview(QObject::tr("Connect an image, then run"));
    column.y += nm::bodyGap;
    Grid grid;
    for (const auto &spec : metadataSliders(input.metadata)) {
        grid.slider(spec);
    }
    grid.place(column);
    // bespokeNodeSizes.ts gives two slider-heavy adjustments a taller default.
    const auto type = input.metadata["node_type"].toString();
    column.finish(type == QStringLiteral("lib.image.color_grading.LiftGammaGain") ? nm::liftGammaGainHeight
                  : type == QStringLiteral("lib.image.color_grading.SplitToning") ? nm::splitToningHeight : 0);
}

// SimpleFilterBody.tsx and MaskBody.tsx: a preview whose tab bar picks which image it shows.
void layoutTabbedPreview(NodeLayout &layout, const CardBodyInput &input, const QStringList &handles, const QStringList &labels,
                         const QStringList &tabs, const QStringList &messages, const QString &fallbackTab, double padTop) {
    Column column(layout, input);
    column.handles(handles);
    const auto tab = tabs.contains(input.previewTab) ? input.previewTab : fallbackTab;
    const auto index = int(tabs.indexOf(tab));
    column.preview(messages.value(index));
    column.y += nm::bodyGap + padTop;
    QVariantList values;
    for (const auto &value : tabs) {
        values.append(value);
    }
    auto row = toggleRow(column, column.x, {}, labels, values, index, ToggleFit::Flexible, true);
    row.action = QStringLiteral("previewTab");
    layout.rows.append(row);
    column.y += nm::toggleHeight;
    column.finish();
}

void layoutSimpleFilter(NodeLayout &layout, const CardBodyInput &input) {
    layoutTabbedPreview(layout, input, {QStringLiteral("image")}, {QObject::tr("Before"), QObject::tr("After")},
                        {QStringLiteral("before"), QStringLiteral("after")},
                        {QObject::tr("Connect an image"), QObject::tr("Run the node to see the result")}, QStringLiteral("after"), 0);
}

void layoutMask(NodeLayout &layout, const CardBodyInput &input) {
    layoutTabbedPreview(layout, input, {QStringLiteral("image1"), QStringLiteral("image2"), QStringLiteral("mask")},
                        {QObject::tr("Img 1"), QObject::tr("Img 2"), QObject::tr("Mask"), QObject::tr("Result")},
                        {QStringLiteral("image1"), QStringLiteral("image2"), QStringLiteral("mask"), QStringLiteral("result")},
                        {QObject::tr("Connect image 1"), QObject::tr("Connect image 2"), QObject::tr("Connect a mask"), QObject::tr("Run the node to composite")},
                        QStringLiteral("result"), 0);
}

// The image column shared by the fixed-control bodies: handle, preview and gap.
Column imageColumn(NodeLayout &layout, const CardBodyInput &input) {
    Column column(layout, input);
    column.handles({QStringLiteral("image")});
    column.preview(QObject::tr("Connect an image, then run"));
    column.y += nm::bodyGap;
    return column;
}

// The Blur, Scale and HSL Adjust grid: minmax(0, auto) minmax(40px, 1fr) auto, 4 px gaps, padded 2 px by 4 px.
Grid autoGrid(double rowGap, bool bareSliders, double valueMinimum) {
    Grid grid;
    grid.fractional = false;
    grid.columnGap = nm::chipGap;
    grid.rowGap = rowGap;
    grid.padY = nm::micro;
    grid.bareSliders = bareSliders;
    grid.mediumLabels = !bareSliders;
    grid.valueMinimum = valueMinimum;
    return grid;
}

void layoutScale(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    // ScaleBody.tsx: a 0 to 10 slider in 0.1 steps, shown as "1.00×".
    auto grid = autoGrid(nm::chipGap, true, nm::sliderValueWidth);
    grid.valueSuffix = QStringLiteral("×");
    grid.slider({QStringLiteral("scale"), QObject::tr("Scale"), 0, 10, 0.1, 1, false});
    grid.place(column);
    column.finish();
}

void layoutOffset(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    // OffsetBody.tsx: two AdjustmentSlider rows 2 px apart, then the wrap row.
    Grid grid;
    grid.columnGap = nm::chipGap;
    grid.rowGap = nm::micro;
    grid.padY = nm::micro;
    grid.slider({QStringLiteral("dx"), QObject::tr("Offset X"), -1, 1, 0.01, 0, true});
    grid.slider({QStringLiteral("dy"), QObject::tr("Offset Y"), -1, 1, 0.01, 0, true});
    grid.place(column);
    // The wrap row spans the grid after a 2 px row gap, which takes the place of
    // the grid's bottom padding, and its own 2 px top padding.
    column.y += nm::micro;
    const auto label = QObject::tr("Wrap").toUpper();
    const auto left = column.x + grid.padX;
    auto eyebrow = labelRow(label, QRectF(left, column.y, captionWidth(label), nm::toggleHeight));
    layout.rows.append(eyebrow);
    const auto wrap = std::clamp(int(std::round(column.number(QStringLiteral("wrap"), 1))), 0, 2);
    auto row = toggleRow(column, left + eyebrow.rect.width() + nm::chipGap, QStringLiteral("wrap"),
                         {QObject::tr("Clamp"), QObject::tr("Repeat"), QObject::tr("Mirror")}, {0, 1, 2}, wrap, ToggleFit::Content, false);
    row.checked = input.fields.value(QStringLiteral("wrap")).value("connected").toBool();
    layout.rows.append(row);
    column.y += nm::toggleHeight + grid.padY;
    column.finish();
}

// Pad and Chroma Key put the color in the grid, ahead of their sliders.
void layoutSwatchGrid(NodeLayout &layout, const CardBodyInput &input, const QString &colorName, const QString &colorLabel,
                      const QVector<SliderSpec> &sliders) {
    auto column = imageColumn(layout, input);
    auto grid = autoGrid(nm::micro, false, nm::adjustmentValueWidth);
    grid.swatch(colorName, colorLabel);
    for (const auto &spec : sliders) {
        grid.slider(spec);
    }
    grid.place(column);
    column.finish();
}

// Outline, Drop Shadow and Color Overlay put the color in its own row above the grid.
void layoutColorRowBody(NodeLayout &layout, const CardBodyInput &input, const QString &colorLabel, const QVector<SliderSpec> &sliders) {
    auto column = imageColumn(layout, input);
    colorRow(column, QStringLiteral("color"), colorLabel);
    column.y += nm::bodyGap;
    auto grid = autoGrid(nm::micro, false, nm::adjustmentValueWidth);
    for (const auto &spec : sliders) {
        grid.slider(spec);
    }
    grid.place(column);
    column.finish();
}

void layoutChannels(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    // ChannelsBody.tsx: a full-width R G B A L toggle below 2 px of padding.
    column.y += nm::micro;
    const QVariantList channels{QStringLiteral("red"), QStringLiteral("green"), QStringLiteral("blue"), QStringLiteral("alpha"), QStringLiteral("luminance")};
    const auto field = input.fields.value(QStringLiteral("channel"));
    const auto current = fieldValue(field).toString();
    const auto selected = channels.indexOf(current.isEmpty() ? QStringLiteral("luminance") : current);
    auto row = toggleRow(column, column.x, QStringLiteral("channel"), {QStringLiteral("R"), QStringLiteral("G"), QStringLiteral("B"),
                         QStringLiteral("A"), QStringLiteral("L")}, channels, int(selected), ToggleFit::Equal, false);
    row.checked = field.value("connected").toBool();
    layout.rows.append(row);
    column.y += nm::toggleHeight;
    column.finish();
}

void layoutHslAdjust(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    // HSLAdjustBody.tsx: a Range select, then Hue, Sat and Lum sliders from -1 to 1.
    auto grid = autoGrid(nm::micro, true, nm::sliderValueWidth);
    QStringList labels;
    QVariantList values;
    for (const auto *range : {"all", "reds", "oranges", "yellows", "greens", "cyans", "blues", "purples", "magentas"}) {
        values.append(QString::fromLatin1(range));
        labels.append(displayName(QString::fromLatin1(range)));
    }
    grid.select(QStringLiteral("color_range"), QObject::tr("Range"), labels, values);
    grid.slider({QStringLiteral("hue_shift"), QObject::tr("Hue"), -1, 1, 0.01, 0, true});
    grid.slider({QStringLiteral("saturation"), QObject::tr("Sat"), -1, 1, 0.01, 0, true});
    grid.slider({QStringLiteral("luminance"), QObject::tr("Lum"), -1, 1, 0.01, 0, true});
    grid.place(column);
    column.finish();
}

void layoutGenerator(NodeLayout &layout, const CardBodyInput &input) {
    Column column(layout, input);
    // GeneratorBody.tsx: no image input and no icon in the empty preview.
    column.preview(QObject::tr("Run to preview"), QStringLiteral("none"));
    column.y += nm::bodyGap;
    for (const auto &value : input.metadata["properties"].toArray()) {
        const auto property = value.toObject();
        if (propertyType(property) != QStringLiteral("color")) {
            continue;
        }
        const auto name = property["name"].toString();
        colorRow(column, name, property["title"].toString(humanize(name)));
        column.y += nm::bodyGap;
    }
    Grid grid;
    for (const auto &spec : metadataSliders(input.metadata)) {
        grid.slider(spec);
    }
    grid.place(column);
    column.finish(nm::generatorHeight);
}

void layoutGetVariable(NodeLayout &layout, const CardBodyInput &input) {
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    const auto width = layout.size.width() - 2 * x;
    placePort(layout, input.inputs, QStringLiteral("trigger"), nm::contentTop + nm::rowHeight / 2.0);
    const auto hint = [&](const QString &text, double y) {
        const auto font = bodyFont(nm::fontValue);
        auto row = labelRow(text, QRectF(x + nm::micro, y + nm::micro, width - 2 * nm::micro,
                                          wrappedHeight(text, font, width - 2 * nm::micro, nm::hintLineHeight)));
        row.wrap = true;
        layout.rows.append(row);
        return row.rect.bottom() + nm::micro;
    };
    auto y = hint(QObject::tr("Reads a variable published by any Set Variable node in this workflow. It waits for the first "
                              "value, then streams every value the setter publishes — no ordering wire needed."), double(nm::bodyTop));
    y += nm::getVariableGap;
    const auto field = input.fields.value(QStringLiteral("name"));
    const auto current = fieldValue(field).toString();
    QStringList labels;
    QVariantList values;
    // A stored name whose Set Variable node is gone stays visible and selected.
    if (!current.isEmpty() && !input.graphVariables.contains(current)) {
        labels.append(QObject::tr("%1 (no Set Variable node)").arg(current));
        values.append(current);
    }
    for (const auto &name : input.graphVariables) {
        labels.append(name);
        values.append(name);
    }
    if (labels.isEmpty()) {
        y = hint(QObject::tr("No variables defined yet. Add a Set Variable node to this workflow to choose one."), y);
    } else {
        // SelectField: a 13 px Label 4 px above a 28 px small select.
        const auto label = QObject::tr("Variable");
        auto caption = labelRow(label, QRectF(x, y, width, nm::rowHeight + nm::micro));
        caption.textSize = nm::fontLabel;
        layout.rows.append(caption);
        y = caption.rect.bottom() + nm::chipGap;
        auto picker = selectRow(field, QStringLiteral("name"), label, QRectF(x, y, width, nm::handleRowStep));
        picker.bare = true;
        picker.options = labels;
        picker.optionValues = values;
        const auto index = values.indexOf(current);
        picker.value = index >= 0 ? labels.value(index) : QString{};
        picker.placeholder = index < 0;
        layout.rows.append(picker);
        y = picker.rect.bottom();
    }
    // The 4 px gap before the outputs-row, the body padding, the card padding and the border.
    layout.size.setHeight(int(std::ceil(y + nm::getVariableGap + nm::micro + nm::padding + nm::borderWidth)));
}

void layoutCompareImages(NodeLayout &layout, const CardBodyInput &input) {
    // The card has no content that sizes it, so it takes its 300 by 250 minimum.
    const auto ui = input.node["ui_properties"].toObject();
    layout.size.setWidth(std::max(nm::compareMinimumWidth, ui["width"].toInt()));
    layout.size.setHeight(std::max(nm::compareMinimumHeight, ui["height"].toInt()));
    layout.minimumSize.setWidth(nm::compareMinimumWidth);
    layout.flexHeight = layout.size.height() - nm::compareMinimumHeight;
    // Both handles start under the header on the 28 px pitch, level with the outputs.
    placePort(layout, input.inputs, QStringLiteral("image_a"), nm::contentTop + nm::rowHeight / 2.0);
    placePort(layout, input.inputs, QStringLiteral("image_b"), nm::contentTop + nm::rowHeight / 2.0 + nm::handleRowStep);
    const auto inset = double(nm::borderWidth + nm::padding);
    const QRectF area(inset, nm::contentTop, layout.size.width() - 2 * inset, layout.size.height() - nm::contentTop - inset);
    layout.rows.append(placeholderRow(QObject::tr("Connect two images, then run"), QStringLiteral("compare"), area));
    layout.resultRect = area;
}

} // namespace

std::vector<std::unique_ptr<QTextLayout>> textAreaLayouts(const QString &text, const QFont &font, double width, double lineHeight) {
    std::vector<std::unique_ptr<QTextLayout>> layouts;
    double y = 0;
    // Each paragraph wraps on its own, and an empty one, such as after a trailing newline, still takes a line.
    for (const auto &paragraph : text.split(QLatin1Char('\n'))) {
        auto layout = std::make_unique<QTextLayout>(paragraph, font);
        QTextOption option;
        option.setWrapMode(QTextOption::WrapAtWordBoundaryOrAnywhere);
        layout->setTextOption(option);
        layout->beginLayout();
        for (auto line = layout->createLine(); line.isValid(); line = layout->createLine()) {
            line.setLineWidth(std::max(1.0, width));
            // Center the line in its line box, as CSS line-height does.
            line.setPosition(QPointF(0, y + (lineHeight - line.height()) / 2));
            y += lineHeight;
        }
        layout->endLayout();
        layouts.push_back(std::move(layout));
    }
    return layouts;
}

namespace {
// A header icon button, such as Constant String's Open editor and Copy, or the
// Rotate and Flip toggles. `number` turns the icon, as the Flip V icon is the
// Flip icon at 90 degrees.
NodeRow iconAction(const QString &action, const QString &name, const QString &icon, const QString &label, const QRectF &rect) {
    auto row = controlRow(NodeRowKind::Action, name, label, rect);
    row.action = action;
    row.icon = icon;
    return row;
}

void layoutConstantString(NodeLayout &layout, const CardBodyInput &input) {
    layout.size.setWidth(std::max(nm::stringMinimumWidth, layout.size.width()));
    layout.minimumSize.setWidth(nm::stringMinimumWidth);
    const auto width = double(layout.size.width());
    const auto inset = double(nm::borderWidth + nm::padding);
    // The value handle and the first output sit on the header line.
    placePort(layout, input.inputs, QStringLiteral("value"), nm::headerHandleY);
    for (auto &y : layout.outputY) {
        y = nm::headerHandleY;
    }
    const auto button = double(nm::headerButtonSize);
    const auto top = inset + (nm::headerHeight - button) / 2;
    const QRectF copy(width - inset - nm::headerButtonInset - button, top, button, button);
    const QRectF expand(copy.x() - nm::micro - button, top, button, button);
    // The buttons name their property in `value`, so the text area keeps the
    // property's inline editor bounds.
    for (const auto &[action, icon, label, rect] : {std::tuple{QStringLiteral("expandEditor"), QStringLiteral("openInFull"), QObject::tr("Open editor"), expand},
                                                    std::tuple{QStringLiteral("copyValue"), QStringLiteral("contentCopy"), QObject::tr("Copy"), copy}}) {
        auto row = iconAction(action, {}, icon, label, rect);
        row.value = QStringLiteral("value");
        layout.rows.append(row);
    }
    // The text area auto-grows to its wrapped text, as the web's scrollHeight measure.
    const auto field = input.fields.value(QStringLiteral("value"));
    const auto text = fieldValue(field).toString();
    const auto font = bodyFont(nm::fontValue);
    int lines = 0;
    for (const auto &paragraph : textAreaLayouts(text, font, width - 2 * inset - 2 * nm::stringTextPadding, nm::fontValue * nm::stringLineHeight)) {
        lines += paragraph->lineCount();
    }
    const auto content = std::max<double>(nm::stringTextMinimum, 2 * nm::stringTextPadding + lines * nm::fontValue * nm::stringLineHeight);
    const auto overhead = nm::contentTop + inset;
    const auto natural = int(std::ceil(std::min<double>(overhead + content, nm::stringMaximumHeight)));
    const auto height = std::max(natural, input.node["ui_properties"].toObject()["height"].toInt());
    layout.size.setHeight(height);
    // The card can shrink to the 60 px text area, which then scrolls.
    layout.flexHeight = height - int(overhead + nm::stringTextMinimum);
    auto area = controlRow(NodeRowKind::Multiline, QStringLiteral("value"), {}, QRectF(inset, nm::contentTop, width - 2 * inset, height - overhead));
    area.value = text;
    area.placeholder = text.isEmpty();
    area.checked = field.value("connected").toBool();
    layout.rows.append(area);
}

void layoutRotateFlip(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    // .controls pads 2 px. The angle row pads 2 px on each side and puts a
    // 48 px degree readout 2 px after the slider.
    column.y += nm::micro;
    QRectF slider(column.x, column.y, column.width - nm::micro, nm::nodeSliderHeight);
    auto angle = sliderRow(input.fields.value(QStringLiteral("angle")), QStringLiteral("angle"), {}, slider, -360, 360, 1, QStringLiteral("%1°"));
    angle.labelWidth = 0;
    angle.columnGap = nm::micro;
    angle.valueWidth = nm::angleReadoutWidth;
    // ANGLE_MARKS: a snap mark every 90 degrees.
    for (int mark = -360; mark <= 360; mark += 90) {
        angle.optionValues.append(mark);
    }
    layout.rows.append(angle);
    // The column's 2 px gap and the action row's 2 px padding.
    column.y = slider.bottom() + nm::micro + nm::micro;
    const auto size = double(nm::iconButtonSize);
    auto flipH = iconAction(QStringLiteral("toggleProperty"), QStringLiteral("flip_horizontal"), QStringLiteral("flip"),
                            QObject::tr("Flip horizontal"), QRectF(column.x, column.y, size, size));
    flipH.checked = fieldValue(input.fields.value(QStringLiteral("flip_horizontal"))).toBool();
    auto flipV = iconAction(QStringLiteral("toggleProperty"), QStringLiteral("flip_vertical"), QStringLiteral("flip"),
                            QObject::tr("Flip vertical"), QRectF(flipH.rect.right() + nm::micro, column.y, size, size));
    flipV.checked = fieldValue(input.fields.value(QStringLiteral("flip_vertical"))).toBool();
    flipV.number = 90;
    layout.rows.append(flipH);
    layout.rows.append(flipV);
    layout.rows.append(iconAction(QStringLiteral("resetTransform"), {}, QStringLiteral("restartAlt"), QObject::tr("Reset"),
                                  QRectF(column.x + column.width - size, column.y, size, size)));
    column.y += size;
    column.finish();
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
    // ADJUSTMENT_NODE_TYPES in AdjustmentBody.constants.ts.
    static const QSet<QString> adjustments{
        "lib.image.color.BrightnessContrast", "lib.image.color.HSB", "lib.image.color.Invert", "lib.image.color.Posterize",
        "lib.image.color.Exposure", "lib.image.color.Grade", "lib.image.color_grading.Exposure",
        "lib.image.color_grading.SaturationVibrance", "lib.image.color_grading.ColorBalance", "lib.image.color_grading.Vignette",
        "lib.image.color_grading.CDL", "lib.image.color_grading.LiftGammaGain", "lib.image.color_grading.SplitToning",
        "lib.image.effects.Add", "lib.image.effects.Glow", "lib.image.enhance.AdaptiveContrast", "lib.image.enhance.AutoContrast",
        "lib.image.enhance.RankFilter", "lib.image.filter.Canny", "lib.image.filter.Expand", "lib.image.filter.GaussianBlur",
        "lib.image.filter.Pixelate", "lib.image.filter.Posterize", "lib.image.filter.Solarize", "lib.image.filter.Threshold",
        "lib.image.filter.UnsharpMask", "lib.image.filter.Vignette", "lib.image.keyer.LumaKey", "lib.image.warp.Displace",
        "lib.image.warp.Spherize"};
    // GENERATOR_NODE_TYPES in bespokeNodeTypes.ts.
    static const QSet<QString> generators{
        "lib.image.draw.LinearGradient", "lib.image.draw.RadialGradient", "lib.image.draw.AngularGradient",
        "lib.image.draw.DiamondGradient", "lib.image.draw.Checkerboard", "lib.image.draw.GaussianNoise"};
    static const QHash<QString, CardBody> bodies{
        {"lib.image.filter.Invert", CardBody::SimpleFilter}, {"lib.image.filter.ConvertToGrayscale", CardBody::SimpleFilter},
        {"nodetool.image.Scale", CardBody::Scale}, {"lib.image.warp.Offset", CardBody::Offset}, {"lib.image.warp.Pad", CardBody::Pad},
        {"lib.image.effects.Outline", CardBody::Outline}, {"lib.image.effects.DropShadow", CardBody::DropShadow},
        {"lib.image.effects.ColorOverlay", CardBody::ColorOverlay}, {"lib.image.keyer.ChromaKey", CardBody::ChromaKey},
        {"nodetool.image.Channels", CardBody::Channels}, {"lib.image.Mask", CardBody::Mask},
        {"lib.image.color_grading.HSLAdjust", CardBody::HslAdjust}, {"nodetool.variable.GetVariable", CardBody::GetVariable},
        // The node components ReactFlowWrapper.tsx registers, and the remaining image bodies.
        {"nodetool.compare.CompareImages", CardBody::CompareImages}, {"nodetool.constant.String", CardBody::ConstantString},
        {"nodetool.image.RotateAndFlip", CardBody::RotateFlip}, {"nodetool.image.Resize", CardBody::Resize},
        {"nodetool.image.Fit", CardBody::Fit}, {"nodetool.image.Paste", CardBody::Paste}};
    if (bodies.contains(type)) {
        return bodies.value(type);
    }
    // bespokeRegistry.ts routes SYNTH_NODE_TYPES and AUDIO_EFFECT_NODE_TYPES to SynthModuleBody.
    if (type == QLatin1String(audioOutType)) {
        return CardBody::AudioOut;
    }
    if (!synthModule(type).isEmpty()) {
        return CardBody::SynthModule;
    }
    if (adjustments.contains(type)) {
        return CardBody::Adjustment;
    }
    if (generators.contains(type)) {
        return CardBody::Generator;
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
    case CardBody::SimpleFilter:
    case CardBody::Scale:
    case CardBody::Offset:
    case CardBody::Pad:
    case CardBody::Outline:
    case CardBody::DropShadow:
    case CardBody::ColorOverlay:
    case CardBody::ChromaKey:
    case CardBody::Channels:
    case CardBody::HslAdjust:
    case CardBody::RotateFlip:
    case CardBody::Resize:
    case CardBody::Fit:
        return name == QStringLiteral("image");
    case CardBody::Paste:
        return name == QStringLiteral("image") || name == QStringLiteral("paste");
    case CardBody::CompareImages:
        return name == QStringLiteral("image_a") || name == QStringLiteral("image_b");
    case CardBody::ConstantString:
        return name == QStringLiteral("value");
    case CardBody::Mask:
        return name == QStringLiteral("image1") || name == QStringLiteral("image2") || name == QStringLiteral("mask");
    case CardBody::Adjustment:
        for (const auto &value : metadata["properties"].toArray()) {
            if (value.toObject()["name"].toString() == name) {
                return typeName(value) == QStringLiteral("image");
            }
        }
        return false;
    case CardBody::Generator:
        return false;
    case CardBody::GetVariable:
        return name == QStringLiteral("trigger");
    case CardBody::SynthModule:
        return synthModule(metadata["node_type"].toString())["inputs"].toArray().contains(name);
    case CardBody::AudioOut:
        return name == QStringLiteral("chunk");
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
    // CompareImagesNode passes iconType="image".
    if (body == CardBody::CompareImages) {
        return QStringLiteral("image");
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
        growPreview(layout, input);
        break;
    case CardBody::ResizeImage:
        layoutResizeImage(layout, input);
        growPreview(layout, input);
        break;
    case CardBody::Adjustment:
        layoutAdjustment(layout, input);
        break;
    case CardBody::SimpleFilter:
        layoutSimpleFilter(layout, input);
        break;
    case CardBody::Mask:
        layoutMask(layout, input);
        break;
    case CardBody::Scale:
        layoutScale(layout, input);
        break;
    case CardBody::Offset:
        layoutOffset(layout, input);
        break;
    // The slider specs of PadBody.tsx, ChromaKeyBody.tsx, OutlineBody.tsx, DropShadowBody.tsx and ColorOverlayBody.tsx.
    case CardBody::Pad:
        layoutSwatchGrid(layout, input, QStringLiteral("color"), QObject::tr("Fill"),
                         {{QStringLiteral("left"), QObject::tr("Left"), 0, 4, 0.01, 0, false},
                          {QStringLiteral("top"), QObject::tr("Top"), 0, 4, 0.01, 0, false},
                          {QStringLiteral("right"), QObject::tr("Right"), 0, 4, 0.01, 0, false},
                          {QStringLiteral("bottom"), QObject::tr("Bottom"), 0, 4, 0.01, 0, false}});
        break;
    case CardBody::ChromaKey:
        layoutSwatchGrid(layout, input, QStringLiteral("key_color"), QObject::tr("Key color"),
                         {{QStringLiteral("tolerance"), QObject::tr("Tolerance"), 0, 1, 0.01, 0.1, false},
                          {QStringLiteral("softness"), QObject::tr("Softness"), 0, 1, 0.01, 0.05, false},
                          {QStringLiteral("spill"), QObject::tr("Spill"), 0, 1, 0.01, 0.5, false}});
        break;
    case CardBody::Outline:
        layoutColorRowBody(layout, input, QObject::tr("Color"),
                           {{QStringLiteral("width"), QObject::tr("Width (px)"), 0, 32, 0.5, 2, false},
                            {QStringLiteral("threshold"), QObject::tr("Alpha threshold"), 0, 1, 0.01, 0.5, false}});
        break;
    case CardBody::DropShadow:
        layoutColorRowBody(layout, input, QObject::tr("Shadow color"),
                           {{QStringLiteral("offset_x"), QObject::tr("Offset X"), -0.5, 0.5, 0.01, 0.02, true},
                            {QStringLiteral("offset_y"), QObject::tr("Offset Y"), -0.5, 0.5, 0.01, 0.02, true},
                            {QStringLiteral("blur_radius"), QObject::tr("Radius (px)"), 0, 40, 0.5, 8, false},
                            {QStringLiteral("intensity"), QObject::tr("Intensity"), 0, 4, 0.05, 0.6, false}});
        break;
    case CardBody::ColorOverlay:
        layoutColorRowBody(layout, input, QObject::tr("Color"), {{QStringLiteral("amount"), QObject::tr("Amount"), 0, 1, 0.01, 0.5, false}});
        break;
    case CardBody::Channels:
        layoutChannels(layout, input);
        break;
    case CardBody::HslAdjust:
        layoutHslAdjust(layout, input);
        break;
    case CardBody::Generator:
        layoutGenerator(layout, input);
        break;
    case CardBody::GetVariable:
        layoutGetVariable(layout, input);
        break;
    case CardBody::CompareImages:
        layoutCompareImages(layout, input);
        break;
    case CardBody::ConstantString:
        layoutConstantString(layout, input);
        break;
    case CardBody::RotateFlip:
        layoutRotateFlip(layout, input);
        break;
    case CardBody::Resize:
        layoutResize(layout, input);
        growPreview(layout, input);
        break;
    case CardBody::Fit:
        layoutFit(layout, input);
        growPreview(layout, input);
        break;
    case CardBody::Paste:
        layoutPaste(layout, input);
        growPreview(layout, input);
        break;
    case CardBody::SynthModule:
        layoutSynthModule(layout, input);
        break;
    case CardBody::AudioOut:
        layoutAudioOut(layout, input);
        break;
    default:
        break;
    }
}

QStringList graphVariableNames(const QJsonArray &nodes) {
    QStringList names;
    for (const auto &value : nodes) {
        const auto node = value.toObject();
        if (node["type"].toString() != QLatin1String(setVariableType)) {
            continue;
        }
        const auto name = node["data"].toObject()["name"].toString().trimmed();
        if (!name.isEmpty() && !names.contains(name)) {
            names.append(name);
        }
    }
    // localeCompare order.
    std::sort(names.begin(), names.end(), [](const QString &a, const QString &b) { return QString::localeAwareCompare(a, b) < 0; });
    return names;
}

SchemaProvider schemaProvider(const QString &type) {
    // The accents and copy of DynamicFalSchemaNode, DynamicKieSchemaNode and
    // DynamicReplicateNode, and the i18n-next78 dynamicSchema strings.
    if (type == QStringLiteral("fal.DynamicFal")) {
        return {QStringLiteral("fal.ai"), QColor(0x8B, 0x5C, 0xF6), QStringLiteral("endpoint_id"), QStringLiteral("fal-ai/"),
                QObject::tr("Run any model on fal.ai."),
                QObject::tr("Paste the llms.txt from a fal.ai model page into the model_info field.")};
    }
    if (type == QStringLiteral("kie.dynamic_schema.KieAI") || type == QStringLiteral("kie.DynamicKie")) {
        return {QStringLiteral("kie.ai"), QColor(0xE5, 0x5C, 0x20), QStringLiteral("model_id"), {},
                QObject::tr("Run any model on kie.ai."),
                QObject::tr("Paste the API documentation from a kie.ai model page into the model_info field.")};
    }
    if (type == QStringLiteral("replicate.DynamicReplicate")) {
        return {QStringLiteral("replicate"), QColor(0x3D, 0x6C, 0xEB), QStringLiteral("model_id"), {},
                QObject::tr("Run any model on replicate.com."),
                QObject::tr("Enter a Replicate model identifier (e.g. runwayml/gen-4.5) into the model_info field.")};
    }
    return {};
}

QString schemaTitleDetail(const SchemaProvider &provider, const QJsonObject &ui) {
    auto detail = ui[provider.detailKey].toString();
    // endpoint_id.replace("fal-ai/", "") drops the first occurrence.
    if (!provider.titlePrefix.isEmpty()) {
        const auto at = detail.indexOf(provider.titlePrefix);
        if (at >= 0) {
            detail.remove(at, provider.titlePrefix.size());
        }
    }
    return detail;
}

QString schemaFooter(const SchemaProvider &provider, const QJsonObject &ui) {
    const auto model = ui[provider.detailKey].toString();
    return model.isEmpty() ? provider.label : QStringLiteral("%1 · %2").arg(provider.label, model);
}

bool readsGraphVariables(CardBody body) {
    return body == CardBody::Prompt || body == CardBody::GetVariable;
}

QRectF sliderTrack(const NodeRow &row) {
    auto left = row.rect.x() + nm::controlLabelWidth;
    auto right = row.rect.right() - nm::sliderValueWidth - nm::chipGap;
    // A row with its own cells, including one without a label such as the Rotate and Flip angle.
    if (row.labelWidth > 0 || row.valueWidth > 0) {
        left = row.rect.x() + row.labelWidth + row.columnGap;
        right = row.rect.right() - row.valueWidth - row.columnGap;
    }
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
    // A bipolar value shows its sign, as formatSliderValue in AdjustmentSlider.tsx.
    const auto sign = row.bipolar && decimals > 0 && value > 0 ? QStringLiteral("+") : QString{};
    return row.value.arg(sign + QString::number(value, 'f', decimals));
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
