#include "CardBodies.h"
#include "SynthModules.h"
#include <QFont>
#include <QFontMetricsF>
#include <QTextLayout>
#include <QLineF>
#include <QObject>
#include <QPainter>
#include <QtMath>
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

// The number boxes of ResizeImageBody, ResizeBody, FitBody, PasteBody and
// CanvasResizeBody: 12 px labels over 24 px boxes, side by side. Two boxes get
// the aspect lock between them when `lock` is set. The boxes edit width and
// height unless other names are given. Returns the bottom of the boxes.
double dimensionRow(NodeLayout &layout, const CardBodyInput &input, double y, bool lock,
                    const QStringList &names = {QStringLiteral("width"), QStringLiteral("height")},
                    const QStringList &labels = {QObject::tr("Width"), QObject::tr("Height")}) {
    const auto x = double(nm::borderWidth + nm::padding + nm::micro);
    lock = lock && names.size() == 2;
    const auto gap = lock ? double(nm::lockWidth) : double(nm::micro) * 2;
    const auto count = double(names.size());
    const auto boxWidth = (layout.size.width() - 2 * x - gap * (count - 1)) / count;
    for (int i = 0; i < names.size(); ++i) {
        layout.rows.append(labelRow(labels[i], QRectF(x + i * (boxWidth + gap), y, boxWidth, nm::dimensionLabelHeight)));
    }
    y += nm::dimensionLabelHeight + nm::borderWidth;
    for (int i = 0; i < names.size(); ++i) {
        const QRectF box(x + i * (boxWidth + gap), y, boxWidth, nm::controlHeight);
        layout.rows.append(numberBox(input.fields.value(names[i]), names[i], box));
        placePort(layout, input.inputs, names[i], box.center().y());
    }
    if (lock) {
        auto link = controlRow(NodeRowKind::Lock, {}, input.dimensionsLinked ? QObject::tr("Unlock aspect ratio") : QObject::tr("Lock aspect ratio"),
                               QRectF(x + boxWidth, y, gap, nm::controlHeight));
        link.checked = input.dimensionsLinked;
        link.icon = input.dimensionsLinked ? QStringLiteral("link") : QStringLiteral("linkOff");
        layout.rows.append(link);
    }
    return y + nm::controlHeight;
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

const CardMediaItem *readySource(const CardBodyInput &input, const QString &handle) {
    const auto found = input.sources.constFind(handle);
    if (found == input.sources.cend() || found->state != CardMediaState::Ready || !found->natural.isValid()) {
        return nullptr;
    }
    return &*found;
}

// ImagePreview shows the arriving image until the node has a result of its own.
void showSource(NodeLayout &layout, const CardBodyInput &input, const QString &handle) {
    const auto *source = readySource(input, handle);
    if (!source) {
        return;
    }
    for (auto &row : layout.rows) {
        if (row.kind == NodeRowKind::Preview && row.rect == layout.resultRect) {
            row.media = {*source};
            row.mediaKind = QStringLiteral("image");
        }
    }
}

// SimpleFilterBody.tsx, MaskBody.tsx and MasksExtractorBody.tsx: a preview
// whose tab bar picks which image it shows. A tab named in sources shows the
// image arriving at that handle in place of the run result.
Column tabbedPreview(NodeLayout &layout, const CardBodyInput &input, const QStringList &handles, const QStringList &labels,
                     const QStringList &tabs, const QStringList &messages, const QString &fallbackTab, double padTop,
                     const QHash<QString, QString> &sources) {
    Column column(layout, input);
    column.handles(handles);
    const auto tab = tabs.contains(input.previewTab) ? input.previewTab : fallbackTab;
    const auto index = int(tabs.indexOf(tab));
    column.preview(messages.value(index));
    if (sources.contains(tab)) {
        layout.sourceTab = true;
        showSource(layout, input, sources.value(tab));
    }
    column.y += nm::bodyGap + padTop;
    QVariantList values;
    for (const auto &value : tabs) {
        values.append(value);
    }
    auto row = toggleRow(column, column.x, {}, labels, values, index, ToggleFit::Flexible, true);
    row.action = QStringLiteral("previewTab");
    layout.rows.append(row);
    column.y += nm::toggleHeight;
    return column;
}

void layoutTabbedPreview(NodeLayout &layout, const CardBodyInput &input, const QStringList &handles, const QStringList &labels,
                         const QStringList &tabs, const QStringList &messages, const QString &fallbackTab, double padTop,
                         const QHash<QString, QString> &sources) {
    tabbedPreview(layout, input, handles, labels, tabs, messages, fallbackTab, padTop, sources).finish();
}

void layoutSimpleFilter(NodeLayout &layout, const CardBodyInput &input) {
    layoutTabbedPreview(layout, input, {QStringLiteral("image")}, {QObject::tr("Before"), QObject::tr("After")},
                        {QStringLiteral("before"), QStringLiteral("after")},
                        {QObject::tr("Connect an image"), QObject::tr("Run the node to see the result")}, QStringLiteral("after"), 0,
                        {{QStringLiteral("before"), QStringLiteral("image")}});
}

void layoutMask(NodeLayout &layout, const CardBodyInput &input) {
    layoutTabbedPreview(layout, input, {QStringLiteral("image1"), QStringLiteral("image2"), QStringLiteral("mask")},
                        {QObject::tr("Img 1"), QObject::tr("Img 2"), QObject::tr("Mask"), QObject::tr("Result")},
                        {QStringLiteral("image1"), QStringLiteral("image2"), QStringLiteral("mask"), QStringLiteral("result")},
                        {QObject::tr("Connect image 1"), QObject::tr("Connect image 2"), QObject::tr("Connect a mask"), QObject::tr("Run the node to composite")},
                        QStringLiteral("result"), 0,
                        {{QStringLiteral("image1"), QStringLiteral("image1")}, {QStringLiteral("image2"), QStringLiteral("image2")},
                         {QStringLiteral("mask"), QStringLiteral("mask")}});
}

// MasksExtractorBody.tsx: Image and Mask tabs over the preview, then the
// Recalculate mask button that runs this node alone.
void layoutMasksExtractor(NodeLayout &layout, const CardBodyInput &input) {
    auto column = tabbedPreview(layout, input, {QStringLiteral("image")}, {QObject::tr("Image"), QObject::tr("Mask")},
                                {QStringLiteral("image"), QStringLiteral("mask")},
                                {QObject::tr("Connect an image"), QObject::tr("Run the node to extract a mask")}, QStringLiteral("image"), 0,
                                {{QStringLiteral("image"), QStringLiteral("image")}});
    // .action-row: 2 px above, aligned right. RunModelButton pads 4 px by 16 px around a 16 px icon and a 6 px gap.
    column.y += nm::micro + nm::micro;
    const auto label = QObject::tr("Recalculate mask");
    const auto width = std::min(column.width, std::ceil(captionWidth(label, true)) + nm::iconSize + nm::runButtonGap + 2 * nm::runButtonPadding);
    auto run = controlRow(NodeRowKind::Action, {}, label, QRectF(column.x + column.width - width, column.y, width, nm::runButtonHeight));
    run.action = QStringLiteral("runNode");
    layout.rows.append(run);
    column.y += nm::runButtonHeight;
    column.finish();
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

// The loaded image arriving at a body's handle, or null while it loads or when none arrives.
// The dashed placement rectangle, as percentages of the preview area, and the size badge.
void placementOverlay(NodeLayout &layout, const QRectF &fraction, const QString &badge) {
    const auto area = layout.resultRect;
    auto row = controlRow(NodeRowKind::Overlay, {}, {}, {});
    if (fraction.isValid()) {
        row.rect = QRectF(area.x() + fraction.x() * area.width(), area.y() + fraction.y() * area.height(),
                          fraction.width() * area.width(), fraction.height() * area.height());
    }
    row.parts = {area};
    row.value = badge;
    layout.rows.append(row);
}

// CanvasResizeBody.tsx: a Fixed, Scale and Padding toggle under the preview
// picks the controls. Fixed edits the canvas size, Scale a 0.01 to 4 factor,
// and Padding a px or percent unit and the four edges.
void layoutCanvasResize(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    const QVariantList modes{QStringLiteral("fixed"), QStringLiteral("scale"), QStringLiteral("padding")};
    const auto modeValue = fieldValue(input.fields.value(QStringLiteral("mode")));
    const auto mode = modes.contains(modeValue) ? modeValue.toString() : QStringLiteral("padding");
    auto modeRow = toggleRow(column, column.x, QStringLiteral("mode"), {QObject::tr("Fixed"), QObject::tr("Scale"), QObject::tr("Padding")},
                             modes, int(modes.indexOf(mode)), ToggleFit::Equal, false);
    modeRow.checked = input.fields.value(QStringLiteral("mode")).value("connected").toBool();
    layout.rows.append(modeRow);
    placePort(layout, input.inputs, QStringLiteral("mode"), modeRow.rect.center().y());
    // The mode row is a column with a 4 px gap.
    column.y += nm::toggleHeight + nm::chipGap;
    if (mode == QStringLiteral("fixed")) {
        column.y = dimensionRow(layout, input, column.y, false);
    } else if (mode == QStringLiteral("scale")) {
        const QRectF slider(column.x, column.y, column.width, nm::sliderRowHeight);
        layout.rows.append(sliderRow(input.fields.value(QStringLiteral("scale")), QStringLiteral("scale"), QObject::tr("Scale"),
                                     slider, 0.01, 4, 0.01, QStringLiteral("%1×")));
        placePort(layout, input.inputs, QStringLiteral("scale"), slider.center().y());
        column.y = slider.bottom();
    } else {
        const QVariantList units{QStringLiteral("px"), QStringLiteral("percent")};
        const auto unitValue = fieldValue(input.fields.value(QStringLiteral("padding_unit")));
        const auto unit = units.contains(unitValue) ? int(units.indexOf(unitValue)) : 0;
        auto unitRow = toggleRow(column, column.x, QStringLiteral("padding_unit"), {QStringLiteral("px"), QStringLiteral("%")}, units, unit,
                                 ToggleFit::Content, false);
        unitRow.checked = input.fields.value(QStringLiteral("padding_unit")).value("connected").toBool();
        layout.rows.append(unitRow);
        placePort(layout, input.inputs, QStringLiteral("padding_unit"), unitRow.rect.center().y());
        column.y += nm::toggleHeight + nm::chipGap;
        column.y = dimensionRow(layout, input, column.y, false,
                                {QStringLiteral("top"), QStringLiteral("bottom"), QStringLiteral("left"), QStringLiteral("right")},
                                {QObject::tr("Top"), QObject::tr("Bottom"), QObject::tr("Left"), QObject::tr("Right")});
    }
    column.finish();
    showSource(layout, input, QStringLiteral("image"));
    const auto *source = readySource(input, QStringLiteral("image"));
    if (!source) {
        return;
    }
    // computeLayout in CanvasResizeBody.tsx.
    const double sourceWidth = source->natural.width(), sourceHeight = source->natural.height();
    const auto number = [&input](const char *name, double fallback) {
        const auto value = fieldValue(input.fields.value(QString::fromLatin1(name)));
        return value.isValid() && value.canConvert<double>() ? value.toDouble() : fallback;
    };
    double canvasWidth = 0, canvasHeight = 0, offsetX = 0, offsetY = 0;
    if (mode == QStringLiteral("fixed")) {
        canvasWidth = std::max(1.0, std::floor(number("width", sourceWidth)));
        canvasHeight = std::max(1.0, std::floor(number("height", sourceHeight)));
        offsetX = std::floor((canvasWidth - sourceWidth) / 2);
        offsetY = std::floor((canvasHeight - sourceHeight) / 2);
    } else if (mode == QStringLiteral("scale")) {
        const auto scale = number("scale", 0) > 0 ? number("scale", 1) : 1.0;
        canvasWidth = std::max(1.0, std::round(sourceWidth * scale));
        canvasHeight = std::max(1.0, std::round(sourceHeight * scale));
        offsetX = std::floor((canvasWidth - sourceWidth) / 2);
        offsetY = std::floor((canvasHeight - sourceHeight) / 2);
    } else {
        const auto percent = fieldValue(input.fields.value(QStringLiteral("padding_unit"))).toString() == QStringLiteral("percent");
        const auto pixels = [percent](double value, double dimension) {
            return percent ? std::max(0.0, std::round(dimension * value / 100)) : std::max(0.0, std::floor(value));
        };
        const auto left = pixels(number("left", 0), sourceWidth), right = pixels(number("right", 0), sourceWidth);
        const auto top = pixels(number("top", 0), sourceHeight), bottom = pixels(number("bottom", 0), sourceHeight);
        canvasWidth = std::max(1.0, sourceWidth + left + right);
        canvasHeight = std::max(1.0, sourceHeight + top + bottom);
        offsetX = left;
        offsetY = top;
    }
    placementOverlay(layout, QRectF(offsetX / canvasWidth, offsetY / canvasHeight, sourceWidth / canvasWidth, sourceHeight / canvasHeight),
                     QStringLiteral("%1 × %2").arg(canvasWidth).arg(canvasHeight));
}

// CurvesBody.tsx: Tonal and RGB Midtones sections of AdjustmentSlider rows.
// The Tonal header carries the Reset that returns every slider to its default.
void layoutCurves(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    const auto section = [&](const QString &title, bool reset, const QVector<SliderSpec> &sliders) {
        // .section-header pads 2 px by 4 px around the eyebrow and the reset button.
        const auto top = column.y + nm::micro;
        const auto height = reset ? double(nm::iconButtonSize) : double(nm::toggleHeight);
        const auto label = title.toUpper();
        layout.rows.append(labelRow(label, QRectF(column.x + nm::chipGap, top, captionWidth(label), height)));
        if (reset) {
            layout.rows.append(iconAction(QStringLiteral("resetSliders"), {}, QStringLiteral("restartAlt"), QObject::tr("Reset curves"),
                                          QRectF(column.x + column.width - nm::chipGap - height, top, height, height)));
        }
        column.y = top + height + nm::micro + nm::micro;
        auto grid = autoGrid(nm::micro, false, nm::adjustmentValueWidth);
        for (const auto &spec : sliders) {
            grid.slider(spec);
        }
        grid.place(column);
        column.y += nm::micro;
    };
    section(QObject::tr("Tonal"), true,
            {{QStringLiteral("black_point"), QObject::tr("Black point"), 0, 0.5, 0.01, 0, false},
             {QStringLiteral("white_point"), QObject::tr("White point"), 0.5, 1, 0.01, 1, false},
             {QStringLiteral("shadows"), QObject::tr("Shadows"), -0.5, 0.5, 0.01, 0, true},
             {QStringLiteral("midtones"), QObject::tr("Midtones"), -0.5, 0.5, 0.01, 0, true},
             {QStringLiteral("highlights"), QObject::tr("Highlights"), -0.5, 0.5, 0.01, 0, true}});
    section(QObject::tr("RGB midtones"), false,
            {{QStringLiteral("red_midtones"), QObject::tr("Red"), -0.5, 0.5, 0.01, 0, true},
             {QStringLiteral("green_midtones"), QObject::tr("Green"), -0.5, 0.5, 0.01, 0, true},
             {QStringLiteral("blue_midtones"), QObject::tr("Blue"), -0.5, 0.5, 0.01, 0, true}});
    column.finish();
}

// LevelsBody.tsx: the result's histogram with an R, G, B and L view toggle,
// then a Red, Green and Blue toggle that picks which channel's Black, Gamma
// and White sliders show. Both choices are view state, kept together as the
// body tab "<channel>:<view>". Reset returns all nine values to neutral.
void layoutLevels(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    const QStringList channels{QStringLiteral("r"), QStringLiteral("g"), QStringLiteral("b")};
    const QStringList views{QStringLiteral("r"), QStringLiteral("g"), QStringLiteral("b"), QStringLiteral("luminance")};
    const auto tab = input.previewTab.split(QLatin1Char(':'));
    const auto channel = channels.contains(tab.value(0)) ? tab.value(0) : channels.first();
    const auto view = views.contains(tab.value(1)) ? tab.value(1) : views.last();
    const auto key = [](const QString &c, const QString &v) { return c + QLatin1Char(':') + v; };
    // .histogram-area: a 2 px padded panel holding the 56 px canvas and the view toggle 2 px below it.
    const auto top = column.y;
    const QRectF bars(column.x + nm::micro, top + nm::micro, column.width - 2 * nm::micro, nm::histogramHeight);
    auto histogram = controlRow(NodeRowKind::Histogram, {}, QObject::tr("Histogram"), bars);
    histogram.value = view;
    if (input.histogram) {
        const auto &bins = input.histogram->bins[size_t(views.indexOf(view))];
        const auto peak = *std::max_element(bins.cbegin(), bins.cend());
        // Clip extreme outliers so the histogram is readable.
        const auto cap = std::max(1.0, peak * 0.85);
        for (const auto count : bins) {
            histogram.optionValues.append(peak > 0 ? std::min(1.0, count / cap) : 0.0);
        }
    }
    const auto bottom = bars.bottom() + nm::micro + nm::toggleHeight + nm::micro;
    histogram.parts = {QRectF(column.x, top, column.width, bottom - top)};
    layout.rows.append(histogram);
    Column inner = column;
    inner.x = bars.x();
    inner.width = bars.width();
    inner.y = bars.bottom() + nm::micro;
    QVariantList viewValues;
    for (const auto &v : views) { viewValues.append(key(channel, v)); }
    auto viewToggle = toggleRow(inner, inner.x, {}, {QStringLiteral("R"), QStringLiteral("G"), QStringLiteral("B"), QStringLiteral("L")},
                                viewValues, int(views.indexOf(view)), ToggleFit::Flexible, true);
    viewToggle.action = QStringLiteral("previewTab");
    layout.rows.append(viewToggle);
    column.y = bottom + nm::chipGap;
    QVariantList channelValues;
    for (const auto &c : channels) { channelValues.append(key(c, view)); }
    auto toggle = toggleRow(column, column.x, {}, {QObject::tr("Red"), QObject::tr("Green"), QObject::tr("Blue")}, channelValues,
                            int(channels.indexOf(channel)), ToggleFit::Equal, false);
    toggle.action = QStringLiteral("previewTab");
    layout.rows.append(toggle);
    column.y += nm::toggleHeight + nm::chipGap;
    auto grid = autoGrid(nm::chipGap, true, nm::sliderValueWidth);
    grid.slider({channel + QStringLiteral("_black"), QObject::tr("Black"), 0, 255, 1, 0, false});
    grid.slider({channel + QStringLiteral("_gamma"), QObject::tr("Gamma"), 0.1, 10, 0.01, 1, false});
    grid.slider({channel + QStringLiteral("_white"), QObject::tr("White"), 0, 255, 1, 255, false});
    grid.place(column);
    const auto size = double(nm::iconButtonSize);
    auto reset = iconAction(QStringLiteral("resetSliders"), {}, QStringLiteral("restartAlt"), QObject::tr("Reset levels"),
                            QRectF(column.x, column.y, size, size));
    for (const auto &c : channels) {
        for (const auto &[suffix, neutral] : {std::pair{"_black", 0.0}, std::pair{"_gamma", 1.0}, std::pair{"_white", 255.0}}) {
            reset.options.append(c + QString::fromLatin1(suffix));
            reset.optionValues.append(neutral);
        }
    }
    layout.rows.append(reset);
    column.y += size;
    column.finish();
}

// PainterBody.tsx: the canvas over the incoming image, then the brush and
// eraser, the color, Undo, Redo and Clear, the brush size and opacity, the
// canvas size and the background opacity. The tools are view state.
void layoutPainter(NodeLayout &layout, const CardBodyInput &input) {
    Column column(layout, input);
    column.handles({QStringLiteral("image")});
    column.preview({});
    // The canvas replaces the run result, as the web body shows no result.
    layout.sourceTab = true;
    column.y += nm::bodyGap + nm::micro;
    const auto &view = input.painter;
    const auto size = double(nm::controlHeight);
    auto x = column.x;
    for (const auto &[tool, icon, label] : {std::tuple{false, "brush", QObject::tr("Brush")}, std::tuple{true, "eraser", QObject::tr("Eraser")}}) {
        auto row = iconAction(QStringLiteral("painterTool"), {}, QLatin1String(icon), label, QRectF(x, column.y, size, size));
        row.value = tool ? QStringLiteral("eraser") : QStringLiteral("brush");
        row.checked = view.eraser == tool;
        layout.rows.append(row);
        x += size + nm::micro;
    }
    auto swatch = controlRow(NodeRowKind::Swatch, QLatin1String(painterColorControl), QObject::tr("Brush color"),
                             QRectF(x + nm::chipGap, column.y, size, size));
    swatch.value = view.color;
    layout.rows.append(swatch);
    auto right = column.x + column.width;
    for (const auto &[action, icon, label, enabled] :
         {std::tuple{"painterClear", "restartAlt", QObject::tr("Clear mask"), true},
          std::tuple{"painterRedo", "redo", QObject::tr("Redo"), !view.redo.isEmpty()},
          std::tuple{"painterUndo", "undo", QObject::tr("Undo"), !view.undo.isEmpty()}}) {
        right -= size;
        auto row = iconAction(QLatin1String(action), {}, QLatin1String(icon), label, QRectF(right, column.y, size, size));
        row.placeholder = !enabled;
        layout.rows.append(row);
        right -= nm::micro;
    }
    column.y += size + nm::micro;
    // Size and opacity share a row, each half wide.
    const auto half = (column.width - nm::micro) / 2;
    // Each slider's label takes its own width, as NumberInput's inline label.
    const auto labelled = [](NodeRow row) {
        row.labelWidth = captionWidth(row.label);
        row.valueWidth = nm::sliderValueWidth;
        row.columnGap = nm::chipGap;
        return row;
    };
    layout.rows.append(labelled(sliderRow({{QStringLiteral("value"), view.size}}, QLatin1String(painterSizeControl), QObject::tr("Size"),
                                 QRectF(column.x, column.y, half, nm::controlHeight), 1, 256, 1, QStringLiteral("%1"))));
    layout.rows.append(labelled(sliderRow({{QStringLiteral("value"), view.opacity}}, QLatin1String(painterOpacityControl), QObject::tr("Opacity"),
                                 QRectF(column.x + half + nm::micro, column.y, half, nm::controlHeight), 0, 1, 0.01, QStringLiteral("%1"))));
    column.y += nm::controlHeight + nm::micro;
    column.y = dimensionRow(layout, input, column.y, false, {QStringLiteral("canvas_width"), QStringLiteral("canvas_height")},
                            {QObject::tr("Canvas width"), QObject::tr("Canvas height")}) + nm::micro;
    layout.rows.append(labelled(sliderRow({{QStringLiteral("value"), view.fade}}, QLatin1String(painterFadeControl), QObject::tr("Background opacity"),
                                 QRectF(column.x, column.y, column.width, nm::controlHeight), 0, 1, 0.01, QStringLiteral("%1"))));
    column.y += nm::controlHeight;
    column.finish();
    // The canvas keeps its own aspect inside the area, as paintStageStyle.
    const auto canvas = QSizeF(painterCanvasSize(input));
    auto stage = QRectF(QPointF(), canvas.scaled(layout.resultRect.size(), Qt::KeepAspectRatio));
    stage.moveCenter(layout.resultRect.center());
    auto paint = controlRow(NodeRowKind::Paint, {}, QObject::tr("Paint"), stage);
    paint.parts = {layout.resultRect};
    paint.minimum = canvas.width();
    paint.maximum = canvas.height();
    paint.number = view.fade;
    paint.step = view.size;
    paint.value = view.color;
    paint.checked = view.eraser;
    paint.optionValues = {view.opacity};
    CardMediaItem mask;
    mask.state = input.paintMask.isNull() ? CardMediaState::Unrequested : CardMediaState::Ready;
    mask.image = input.paintMask;
    mask.natural = input.paintMask.size();
    paint.media = {mask};
    if (const auto *source = readySource(input, QStringLiteral("image"))) {
        paint.media.append(*source);
    }
    layout.rows.append(paint);
}

// CompositorPreview: the layers drawn bottom first (image_0 is on top), each
// at its transform or contain-fit centered, with its opacity and blend mode,
// on a canvas of the given size scaled to fit the area.
QImage compositeLayers(const QStringList &keys, const QVector<CompositorLayer> &layers, const QHash<QString, CardMediaItem> &sources,
                       const QSize &canvas, const QSizeF &area) {
    static const QHash<QString, QPainter::CompositionMode> modes{
        {"normal", QPainter::CompositionMode_SourceOver}, {"multiply", QPainter::CompositionMode_Multiply},
        {"screen", QPainter::CompositionMode_Screen}, {"overlay", QPainter::CompositionMode_Overlay},
        {"darken", QPainter::CompositionMode_Darken}, {"lighten", QPainter::CompositionMode_Lighten},
        {"color-dodge", QPainter::CompositionMode_ColorDodge}, {"color-burn", QPainter::CompositionMode_ColorBurn},
        {"hard-light", QPainter::CompositionMode_HardLight}, {"soft-light", QPainter::CompositionMode_SoftLight},
        {"difference", QPainter::CompositionMode_Difference}, {"exclusion", QPainter::CompositionMode_Exclusion},
        {"add", QPainter::CompositionMode_Plus}};
    const auto size = QSizeF(canvas).scaled(area, Qt::KeepAspectRatio).toSize();
    if (size.isEmpty()) { return {}; }
    QImage result(size, QImage::Format_ARGB32_Premultiplied);
    result.fill(Qt::transparent);
    QPainter painter(&result);
    painter.setRenderHint(QPainter::SmoothPixmapTransform);
    const auto scale = double(size.width()) / canvas.width();
    for (auto i = keys.size() - 1; i >= 0; --i) {
        const auto layer = layers.value(i);
        const auto source = sources.constFind(keys[i]);
        if (!layer.visible || layer.opacity <= 0 || source == sources.cend() || source->state != CardMediaState::Ready || source->image.isNull()) {
            continue;
        }
        const QSizeF natural = source->natural.isValid() ? QSizeF(source->natural) : QSizeF(source->image.size());
        // defaultLayerTransform: contain-fit, never upscaled, centered.
        const auto fit = std::min({canvas.width() / natural.width(), canvas.height() / natural.height(), 1.0});
        QPointF center(canvas.width() / 2.0, canvas.height() / 2.0);
        QSizeF factor(fit, fit);
        double rotation = 0;
        if (layer.transform) {
            const auto &t = *layer.transform;
            center = QPointF(t["x"].toDouble(), t["y"].toDouble());
            factor = QSizeF(t["scaleX"].toDouble(1), t["scaleY"].toDouble(1));
            rotation = t["rotation"].toDouble();
        }
        painter.save();
        painter.scale(scale, scale);
        painter.translate(center);
        painter.rotate(qRadiansToDegrees(rotation));
        painter.scale(factor.width(), factor.height());
        painter.setOpacity(layer.opacity);
        painter.setCompositionMode(modes.value(layer.blend, QPainter::CompositionMode_SourceOver));
        painter.drawImage(QRectF(QPointF(-natural.width() / 2, -natural.height() / 2), natural), source->image);
        painter.restore();
    }
    painter.end();
    return result;
}

// CompositorBody.tsx: a handle per image_N layer over the live composite,
// a LayerRow per layer (thumbnail, opacity, blend mode, visibility and
// delete), and Add another layer. The layout editor dialog is not native.
void layoutCompositor(NodeLayout &layout, const CardBodyInput &input) {
    Column column(layout, input);
    const auto keys = compositorLayerKeys(input.node);
    const auto layers = compositorLayers(input.node);
    column.handles(keys);
    column.preview(QObject::tr("Add layers, then run"));
    column.y += nm::micro;
    const auto gap = double(nm::chipGap);
    const auto thumb = double(nm::layerThumbnail);
    const auto button = double(nm::layerButton);
    if (keys.isEmpty()) {
        layout.rows.append(labelRow(QObject::tr("No layers yet"), QRectF(column.x, column.y, column.width, nm::rowHeight)));
        column.y += nm::rowHeight;
        layout.rows.append(labelRow(QObject::tr("Add one below."), QRectF(column.x, column.y, column.width, nm::rowHeight)));
        column.y += nm::rowHeight + nm::micro;
    }
    QVariantList blendValues;
    QStringList blendLabels;
    for (const auto &[value, label] : compositorBlendModes()) {
        blendValues.append(value);
        blendLabels.append(label);
    }
    for (int i = 0; i < keys.size(); ++i) {
        const auto layer = layers.value(i);
        const auto top = column.y;
        const auto middle = top + thumb / 2;
        // 40px | minmax(0, 1fr) | 96px | 28px | 28px.
        auto preview = placeholderRow({}, QStringLiteral("image"), QRectF(column.x, top, thumb, thumb));
        preview.label = QObject::tr("Layer %1 thumbnail").arg(i + 1);
        if (const auto *source = readySource(input, keys[i])) {
            preview.media = {*source};
            preview.mediaKind = QStringLiteral("image");
        }
        layout.rows.append(preview);
        const auto right = column.x + column.width;
        const auto deleteX = right - button;
        const auto visibleX = deleteX - gap - button;
        const auto blendX = visibleX - gap - nm::layerBlendWidth;
        const auto sliderX = column.x + thumb + gap;
        auto slider = sliderRow({{QStringLiteral("value"), layer.opacity}}, QStringLiteral("@compositor:opacity:%1").arg(i), {},
                                QRectF(sliderX, middle - nm::controlHeight / 2.0, blendX - gap - sliderX, nm::controlHeight), 0, 1, 0.01,
                                QStringLiteral("%1"));
        // NumberInput with showSlider: the value and a track, no label.
        slider.labelWidth = 0.01;
        slider.valueWidth = std::ceil(captionWidth(QStringLiteral("0.00"), true, true)) + nm::micro;
        slider.columnGap = nm::micro;
        layout.rows.append(slider);
        auto blend = selectRow({{QStringLiteral("value"), layer.blend}}, QStringLiteral("@compositor:blend:%1").arg(i), {},
                               QRectF(blendX, middle - nm::controlHeight / 2.0, nm::layerBlendWidth, nm::controlHeight));
        blend.bare = true;
        blend.options = blendLabels;
        blend.optionValues = blendValues;
        blend.value = blendLabels.value(int(blendValues.indexOf(layer.blend)), blendLabels.first());
        layout.rows.append(blend);
        auto visible = iconAction(QStringLiteral("compositorVisible"), {}, layer.visible ? QStringLiteral("visibility") : QStringLiteral("visibilityOff"),
                                  layer.visible ? QObject::tr("Hide") : QObject::tr("Show"), QRectF(visibleX, middle - button / 2, button, button));
        visible.number = i;
        layout.rows.append(visible);
        auto remove = iconAction(QStringLiteral("compositorDelete"), {}, QStringLiteral("deleteOutline"), QObject::tr("Delete layer"),
                                 QRectF(deleteX, middle - button / 2, button, button));
        remove.number = i;
        layout.rows.append(remove);
        placePort(layout, input.inputs, keys[i], nm::contentTop + nm::rowHeight / 2.0 + i * nm::handleRowStep);
        column.y = top + thumb + nm::micro;
    }
    column.y += nm::micro;
    auto add = controlRow(NodeRowKind::Action, {}, QObject::tr("Add another layer"),
                          QRectF(column.x, column.y, std::min(column.width, captionWidth(QObject::tr("Add another layer")) + nm::iconSize + 3 * nm::padding),
                                 nm::controlHeight));
    add.action = QStringLiteral("compositorAdd");
    layout.rows.append(add);
    column.y += nm::controlHeight;
    column.finish();
    // The live composite replaces the run result once a layer image arrives.
    bool anySource = false;
    for (const auto &key : keys) { anySource = anySource || readySource(input, key); }
    if (!anySource) { return; }
    layout.sourceTab = true;
    QSize canvas;
    const auto data = input.node["data"].toObject();
    for (int i = 0; i < keys.size() && canvas.isEmpty(); ++i) {
        const auto *source = readySource(input, keys[i]);
        if (source && layers.value(i).visible && layers.value(i).opacity > 0) { canvas = source->natural; }
    }
    const auto width = data.value(QStringLiteral("canvas_width")).toDouble(), height = data.value(QStringLiteral("canvas_height")).toDouble();
    canvas = QSize(width > 0 ? int(width) : canvas.isEmpty() ? 512 : canvas.width(), height > 0 ? int(height) : canvas.isEmpty() ? 512 : canvas.height());
    CardMediaItem composite;
    composite.state = CardMediaState::Ready;
    composite.image = compositeLayers(keys, layers, input.sources, canvas, layout.resultRect.size() * 2);
    composite.natural = canvas;
    for (auto &row : layout.rows) {
        if (row.kind == NodeRowKind::Preview && row.rect == layout.resultRect) {
            row.media = {composite};
            row.mediaKind = QStringLiteral("image");
        }
    }
}

// CropBody.tsx: the source with its crop rectangle and size badge, then the
// aspect select, the width and height boxes and Reset. The aspect is view
// state, kept as the body tab, and the boxes edit the crop's edges.
void layoutCrop(NodeLayout &layout, const CardBodyInput &input) {
    auto column = imageColumn(layout, input);
    showSource(layout, input, QStringLiteral("image"));
    const auto *source = readySource(input, QStringLiteral("image"));
    // writeRect clamps to 4096 until the image's size is known, and an unset
    // right or bottom edge is the image's, as props.right ?? imgDims.w ?? 512.
    const auto natural = source ? QSizeF(source->natural) : QSizeF();
    const auto bounds = source ? natural : QSizeF(4096, 4096);
    const auto data = input.node["data"].toObject();
    const auto edge = [&data](const char *name, double fallback) {
        const auto value = data.value(QLatin1String(name));
        return value.isDouble() ? value.toDouble() : fallback;
    };
    const QVariantList edges{edge("left", 0), edge("top", 0), edge("right", source ? natural.width() : 512),
                             edge("bottom", source ? natural.height() : 512)};
    const auto keys = cropAspectKeys();
    const auto aspect = keys.contains(input.previewTab) ? input.previewTab : keys.first();
    const auto ratio = cropAspectRatio(aspect);
    const auto cropRow = [&](NodeRow row) {
        row.optionValues = edges;
        row.minimum = bounds.width();
        row.maximum = bounds.height();
        row.step = ratio;
        return row;
    };
    // .controls: minmax(0, auto) minmax(40px, 1fr) auto columns, 4 px gaps, padded 2 px by 4 px.
    column.y += nm::micro;
    const auto gap = double(nm::chipGap);
    const auto labelWidth = std::max(captionWidth(QObject::tr("Aspect")), captionWidth(QObject::tr("Size")));
    const auto controls = column.x + labelWidth + gap;
    auto select = selectRow({}, QLatin1String(cropAspectControl), QObject::tr("Aspect"),
                            QRectF(controls, column.y, column.x + column.width - controls, nm::controlHeight));
    for (const auto &key : keys) {
        select.options.append(key == QStringLiteral("free") ? QObject::tr("Free") : key == QStringLiteral("1:1") ? QObject::tr("1:1 Square") : key);
        select.optionValues.append(key);
    }
    select.value = select.options.value(int(keys.indexOf(aspect)));
    select.placeholder = false;
    layout.rows.append(select);
    column.y += nm::controlHeight + gap;
    layout.rows.append(labelRow(QObject::tr("Size"), QRectF(column.x, column.y, labelWidth, nm::controlHeight)));
    const auto size = double(nm::controlHeight);
    const auto times = QStringLiteral("×");
    const auto timesWidth = captionWidth(times) + 2 * nm::micro;
    const auto clusterRight = column.x + column.width - size - gap;
    const auto boxWidth = std::max(1.0, (clusterRight - controls - timesWidth) / 2);
    const QRectF crop(QPointF(edges[0].toDouble(), edges[1].toDouble()), QPointF(edges[2].toDouble(), edges[3].toDouble()));
    const auto box = [&](const char *name, double value, const QRectF &rect) {
        layout.rows.append(cropRow(numberBox({{QStringLiteral("value"), std::max(1.0, value)}}, QLatin1String(name), rect)));
    };
    box(cropWidthControl, crop.width(), QRectF(controls, column.y, boxWidth, nm::controlHeight));
    layout.rows.append(labelRow(times, QRectF(controls + boxWidth, column.y, timesWidth, nm::controlHeight)));
    box(cropHeightControl, crop.height(), QRectF(controls + boxWidth + timesWidth, column.y, boxWidth, nm::controlHeight));
    layout.rows.append(iconAction(QStringLiteral("resetCrop"), {}, QStringLiteral("restartAlt"), QObject::tr("Reset crop"),
                                  QRectF(column.x + column.width - size, column.y, size, size)));
    column.y += size + nm::micro;
    column.finish();
    if (!source) {
        return;
    }
    auto image = QRectF(QPointF(), natural.scaled(layout.resultRect.size(), Qt::KeepAspectRatio));
    image.moveCenter(layout.resultRect.center());
    auto overlay = cropRow(controlRow(NodeRowKind::Crop, {}, QObject::tr("Crop"), image));
    overlay.parts = {layout.resultRect};
    layout.rows.append(overlay);
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
        {"nodetool.image.Fit", CardBody::Fit}, {"nodetool.image.Paste", CardBody::Paste},
        {"nodetool.image.CanvasResize", CardBody::CanvasResize}, {"lib.image.color_grading.Curves", CardBody::Curves},
        {"nodetool.image.Levels", CardBody::Levels}, {"nodetool.image.Crop", CardBody::Crop},
        // MASKS_EXTRACTOR_NODE_TYPES in MasksExtractorBody.tsx.
        {"replicate.image.background.Bria_RemoveBackground", CardBody::MasksExtractor},
        {"replicate.image.background.BackgroundRemover_851", CardBody::MasksExtractor},
        {"replicate.image.background.BackgroundRemover_Codeplug", CardBody::MasksExtractor},
        {"replicate.image.process.RemoveBackground", CardBody::MasksExtractor},
        {"fal.image_to_image.BriaBackgroundRemove", CardBody::MasksExtractor},
        {"nodetool.image.Painter", CardBody::Painter}, {"nodetool.image.Compositor", CardBody::Compositor}};
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

bool readsBodySources(CardBody body) {
    return body == CardBody::CanvasResize || body == CardBody::Paste || body == CardBody::Crop || body == CardBody::SimpleFilter
           || body == CardBody::Mask || body == CardBody::MasksExtractor || body == CardBody::Painter || body == CardBody::Compositor;
}

ImageHistogram imageHistogram(const QImage &image) {
    ImageHistogram histogram;
    const auto rgb = image.convertToFormat(QImage::Format_RGBA8888);
    for (int y = 0; y < rgb.height(); ++y) {
        const auto *line = rgb.constScanLine(y);
        for (int x = 0; x < rgb.width(); ++x) {
            const int r = line[4 * x], g = line[4 * x + 1], b = line[4 * x + 2];
            ++histogram.bins[0][size_t(r)];
            ++histogram.bins[1][size_t(g)];
            ++histogram.bins[2][size_t(b)];
            const auto luminance = std::lround(0.2126 * r + 0.7152 * g + 0.0722 * b);
            ++histogram.bins[3][size_t(std::clamp(luminance, 0L, 255L))];
        }
    }
    return histogram;
}

QString bodySourceKey(const QString &handle) {
    return QStringLiteral("@source:") + handle;
}

QRectF cropEdges(const NodeRow &row) {
    const auto edge = [&row](int index) { return row.optionValues.value(index).toDouble(); };
    return QRectF(QPointF(edge(0), edge(1)), QPointF(edge(2), edge(3)));
}

QRectF cropOnCard(const NodeRow &row, const QRectF &crop) {
    if (row.minimum <= 0 || row.maximum <= 0) {
        return {};
    }
    const auto sx = row.rect.width() / row.minimum, sy = row.rect.height() / row.maximum;
    return QRectF(row.rect.x() + crop.left() * sx, row.rect.y() + crop.top() * sy, crop.width() * sx, crop.height() * sy);
}

double cropHandleRadius(const NodeRow &row) {
    // handleR: 1.2% of the shorter image side, 3 to 24 image pixels, drawn at the image's scale.
    const auto radius = std::clamp(std::min(row.minimum, row.maximum) * 0.012, 3.0, 24.0);
    return std::max(3.0, row.minimum > 0 ? radius * row.rect.width() / row.minimum : 3.0);
}

QString cropHandleAt(const NodeRow &row, const QRectF &crop, const QPointF &local) {
    const auto card = cropOnCard(row, crop);
    if (card.isEmpty()) {
        return {};
    }
    // A pointer finds a handle within 6 px even when the drawn handle is smaller.
    const auto reach = std::max(6.0, cropHandleRadius(row));
    const auto mid = card.center();
    const std::pair<const char *, QPointF> handles[] = {
        {"nw", card.topLeft()}, {"n", {mid.x(), card.top()}}, {"ne", card.topRight()}, {"e", {card.right(), mid.y()}},
        {"se", card.bottomRight()}, {"s", {mid.x(), card.bottom()}}, {"sw", card.bottomLeft()}, {"w", {card.left(), mid.y()}}};
    for (const auto &[name, point] : handles) {
        if (QLineF(point, local).length() <= reach) {
            return QString::fromLatin1(name);
        }
    }
    return card.contains(local) ? QStringLiteral("move") : QString{};
}

namespace {
// writeRect: whole pixels, at least one pixel, inside the image.
QRectF cropClamped(double left, double top, double right, double bottom, const QSizeF &bounds) {
    const auto l = std::clamp(std::round(left), 0.0, std::max(0.0, bounds.width() - 1));
    const auto t = std::clamp(std::round(top), 0.0, std::max(0.0, bounds.height() - 1));
    const auto r = std::clamp(std::round(right), l + 1, std::max(l + 1, bounds.width()));
    const auto b = std::clamp(std::round(bottom), t + 1, std::max(t + 1, bounds.height()));
    return QRectF(QPointF(l, t), QPointF(r, b));
}
} // namespace

QRectF cropDragged(const QString &handle, const QRectF &start, const QPointF &delta, const QSizeF &bounds, double ratio) {
    auto left = start.left(), top = start.top(), right = start.right(), bottom = start.bottom();
    if (handle == QStringLiteral("move")) {
        // Moving keeps the size and stops at the image's edges.
        left = std::clamp(start.left() + delta.x(), 0.0, std::max(0.0, bounds.width() - start.width()));
        top = std::clamp(start.top() + delta.y(), 0.0, std::max(0.0, bounds.height() - start.height()));
        right = left + start.width();
        bottom = top + start.height();
        return cropClamped(left, top, right, bottom, bounds);
    }
    if (handle.contains(QLatin1Char('w'))) { left += delta.x(); }
    if (handle.contains(QLatin1Char('e'))) { right += delta.x(); }
    if (handle.contains(QLatin1Char('n'))) { top += delta.y(); }
    if (handle.contains(QLatin1Char('s'))) { bottom += delta.y(); }
    if (ratio > 0) {
        // The dragged edge leads and the other side follows. A side handle or
        // a mostly horizontal corner drag sets the height from the width.
        const auto width = std::max(1.0, right - left), height = std::max(1.0, bottom - top);
        const auto horizontal = handle == QStringLiteral("e") || handle == QStringLiteral("w")
                                || std::abs(delta.x()) >= std::abs(delta.y());
        if (horizontal) {
            if (handle.contains(QLatin1Char('n'))) { top = bottom - width / ratio; } else { bottom = top + width / ratio; }
        } else if (handle == QStringLiteral("nw") || handle == QStringLiteral("sw") || handle == QStringLiteral("w")) {
            left = right - height * ratio;
        } else {
            right = left + height * ratio;
        }
    }
    return cropClamped(left, top, right, bottom, bounds);
}

QStringList cropAspectKeys() {
    return {QStringLiteral("free"), QStringLiteral("1:1"), QStringLiteral("4:3"), QStringLiteral("3:2"), QStringLiteral("16:9"),
            QStringLiteral("3:4"), QStringLiteral("2:3"), QStringLiteral("9:16")};
}

double cropAspectRatio(const QString &key) {
    const auto parts = key.split(QLatin1Char(':'));
    if (parts.size() != 2 || !cropAspectKeys().contains(key)) {
        return 0;
    }
    const auto a = parts[0].toDouble(), b = parts[1].toDouble();
    return a > 0 && b > 0 ? a / b : 0;
}

bool isPainterControl(const QString &name) {
    return name == QLatin1String(painterSizeControl) || name == QLatin1String(painterOpacityControl)
           || name == QLatin1String(painterFadeControl) || name == QLatin1String(painterColorControl);
}

bool isCompositorControl(const QString &name) {
    return name.startsWith(QStringLiteral("@compositor:opacity:")) || name.startsWith(QStringLiteral("@compositor:blend:"));
}

bool isCardControl(const QString &name) {
    return isCropControl(name) || isPainterControl(name) || isCompositorControl(name);
}

QStringList compositorLayerKeys(const QJsonObject &node) {
    static const QRegularExpression layer(QStringLiteral("^image_(\\d+)$"));
    QVector<std::pair<int, QString>> found;
    const auto values = node["dynamic_properties"].toObject();
    for (auto it = values.begin(); it != values.end(); ++it) {
        if (const auto match = layer.match(it.key()); match.hasMatch()) { found.append({match.captured(1).toInt(), it.key()}); }
    }
    std::sort(found.begin(), found.end());
    QStringList keys;
    for (const auto &entry : found) { keys.append(entry.second); }
    return keys;
}

const QVector<std::pair<QString, QString>> &compositorBlendModes() {
    static const QVector<std::pair<QString, QString>> modes{
        {"normal", QObject::tr("Normal")}, {"multiply", QObject::tr("Multiply")}, {"screen", QObject::tr("Screen")},
        {"overlay", QObject::tr("Overlay")}, {"darken", QObject::tr("Darken")}, {"lighten", QObject::tr("Lighten")},
        {"color-dodge", QObject::tr("Color Dodge")}, {"color-burn", QObject::tr("Color Burn")}, {"hard-light", QObject::tr("Hard Light")},
        {"soft-light", QObject::tr("Soft Light")}, {"difference", QObject::tr("Difference")}, {"exclusion", QObject::tr("Exclusion")},
        {"add", QObject::tr("Add")}};
    return modes;
}

QVector<CompositorLayer> compositorLayers(const QJsonObject &node) {
    const auto stored = node["data"].toObject().value(QStringLiteral("layers")).toArray();
    QVector<CompositorLayer> layers;
    for (qsizetype i = 0; i < compositorLayerKeys(node).size(); ++i) {
        const auto raw = stored.at(i).toObject();
        CompositorLayer layer;
        if (raw["opacity"].isDouble()) { layer.opacity = std::clamp(raw["opacity"].toDouble(), 0.0, 1.0); }
        // coerceBlendMode: the legacy "over" is normal, and an unknown name falls back to normal.
        const auto blend = raw["blend_mode"].toString();
        for (const auto &mode : compositorBlendModes()) {
            if (mode.first == blend) { layer.blend = blend; }
        }
        if (!raw["visible"].isUndefined()) { layer.visible = raw["visible"].toBool() || (raw["visible"].isDouble() && raw["visible"].toDouble() != 0); }
        const auto transform = raw["transform"].toObject();
        if (transform["x"].isDouble() && transform["y"].isDouble()) { layer.transform = transform; }
        layers.append(layer);
    }
    return layers;
}

QJsonArray compositorLayersJson(const QVector<CompositorLayer> &layers) {
    QJsonArray result;
    for (const auto &layer : layers) {
        QJsonObject entry{{"opacity", layer.opacity}, {"blend_mode", layer.blend}, {"visible", layer.visible}};
        if (layer.transform) { entry["transform"] = *layer.transform; }
        result.append(entry);
    }
    return result;
}

QSize painterCanvasSize(const CardBodyInput &input) {
    const auto found = input.sources.constFind(QStringLiteral("image"));
    if (found != input.sources.cend() && found->state == CardMediaState::Ready && found->natural.isValid()) {
        return found->natural;
    }
    const auto data = input.node["data"].toObject();
    const auto side = [&data](const char *name) {
        const auto value = data.value(QLatin1String(name)).toDouble();
        return value > 0 ? int(value) : 512;
    };
    return {side("canvas_width"), side("canvas_height")};
}

QImage paintedMask(const QImage &mask, const QImage &stroke, const QSize &canvas, double opacity, bool eraser) {
    QImage result(canvas, QImage::Format_ARGB32_Premultiplied);
    result.fill(Qt::transparent);
    QPainter painter(&result);
    // The saved mask keeps its own size at the top left, as loadDataUrlIntoCanvas.
    if (!mask.isNull()) { painter.drawImage(0, 0, mask); }
    painter.setOpacity(std::clamp(opacity, 0.0, 1.0));
    painter.setCompositionMode(eraser ? QPainter::CompositionMode_DestinationOut : QPainter::CompositionMode_SourceOver);
    painter.drawImage(0, 0, stroke);
    painter.end();
    return result;
}

bool isCropControl(const QString &name) {
    return name == QLatin1String(cropAspectControl) || name == QLatin1String(cropWidthControl) || name == QLatin1String(cropHeightControl);
}

QRectF cropControlled(const QString &control, const QVariant &value, const QRectF &crop, const QSizeF &bounds, double ratio) {
    auto left = crop.left(), top = crop.top(), right = crop.right(), bottom = crop.bottom();
    if (control == QLatin1String(cropAspectControl)) {
        // The new ratio keeps the width and the top-left corner, and the
        // bottom stops at the image's edge.
        const auto next = cropAspectRatio(value.toString());
        if (next <= 0) {
            return crop;
        }
        const auto height = std::round(std::max(1.0, crop.width()) / next);
        bottom = std::min(bounds.height(), top + height);
        top = bottom - height < 0 ? 0 : bottom - height;
    } else if (control == QLatin1String(cropWidthControl)) {
        const auto width = std::max(1.0, std::round(value.toDouble()));
        right = left + width;
        if (ratio > 0) { bottom = top + std::round(width / ratio); }
    } else if (control == QLatin1String(cropHeightControl)) {
        const auto height = std::max(1.0, std::round(value.toDouble()));
        bottom = top + height;
        if (ratio > 0) { right = left + std::round(height * ratio); }
    } else {
        return crop;
    }
    return cropClamped(left, top, right, bottom, bounds);
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
    case CardBody::MasksExtractor:
    case CardBody::Painter:
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
    case CardBody::CanvasResize:
    case CardBody::Curves:
    case CardBody::Levels:
    case CardBody::Crop:
        return name == QStringLiteral("image");
    case CardBody::Paste:
        return name == QStringLiteral("image") || name == QStringLiteral("paste");
    case CardBody::Compositor:
        return name == QStringLiteral("layers") || QRegularExpression(QStringLiteral("^image_\\d+$")).match(name).hasMatch();
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
    case CardBody::MasksExtractor:
        layoutMasksExtractor(layout, input);
        break;
    case CardBody::Painter:
        layoutPainter(layout, input);
        break;
    case CardBody::Compositor:
        layoutCompositor(layout, input);
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
    case CardBody::Paste: {
        layoutPaste(layout, input);
        growPreview(layout, input);
        showSource(layout, input, QStringLiteral("image"));
        // PasteBody.tsx: the pasted image's placement as a share of the base image.
        const auto *base = readySource(input, QStringLiteral("image"));
        const auto *paste = readySource(input, QStringLiteral("paste"));
        if (base && paste) {
            const double width = base->natural.width(), height = base->natural.height();
            const auto offset = [&input](const QString &name) { return fieldValue(input.fields.value(name)).toDouble(); };
            const auto share = [](double value) { return std::clamp(value, 0.0, 1.0); };
            placementOverlay(layout, QRectF(share(offset(QStringLiteral("left")) / width), share(offset(QStringLiteral("top")) / height),
                                            share(paste->natural.width() / width), share(paste->natural.height() / height)), {});
        }
        break;
    }
    case CardBody::CanvasResize:
        layoutCanvasResize(layout, input);
        break;
    case CardBody::Curves:
        layoutCurves(layout, input);
        break;
    case CardBody::Levels:
        layoutLevels(layout, input);
        break;
    case CardBody::Crop:
        layoutCrop(layout, input);
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
