#include "SynthModules.h"
#include "CardBodies.h"
#include "CardBodyPainter.h"
#include "EditorScene.h"
#include <QFile>
#include <QFontMetricsF>
#include <QJsonArray>
#include <QJsonDocument>
#include <QObject>
#include <QPainter>
#include <QPainterPath>
#include <algorithm>
#include <cmath>
#include <numbers>

namespace nodetool {
namespace {
namespace nm = node_metrics;
namespace sm = synth_metrics;

// SynthModuleBody.tsx: the faceplate pads 4 px and spaces its blocks 4 px apart.
constexpr double bodyPadding = 4;
constexpr double bodyGap = 4;
// .module-label: 2 px by 4 px around 11 px text on a line height of 1.
constexpr double labelPadX = 4;
constexpr double labelPadY = 2;
// WaveformSelector.tsx: 26 by 24 px buttons 2 px apart, each an 18 by 10 glyph.
constexpr double waveButtonWidth = 26;
constexpr double waveButtonHeight = 24;
constexpr double waveGap = 2;
constexpr double glyphWidth = 18;
constexpr double glyphHeight = 10;
// .mode-toggle: 2 px by 6 px padding, 11 px text on 1.4 lines, a 1 px border.
constexpr double togglePadX = 6;
constexpr double toggleHeight = 22;
// AdsrPreview.tsx: a 36 px sketch in a 120 by 36 view box, 3 px inside its edges,
// inset 2 px in the body.
constexpr double envelopeHeight = 36;
constexpr double envelopeViewWidth = 120;
constexpr double envelopeInset = 2;
constexpr double envelopePad = 3;
// .knob-grid: 2 px between knobs in a row, 4 px between rows.
constexpr double knobColumnGap = 2;
constexpr double knobRowGap = 4;
// SynthKnob.tsx: the arc's radius and stroke, and the pointer from 6 px to 5 px
// inside the arc. The sweep runs from -135 to +135 degrees, 0 pointing up.
constexpr double arcRadius = 18;
constexpr double arcStroke = 3;
constexpr double sweepDegrees = 270;
constexpr double startDegrees = -135;
// .jack-labels: 5 px from the body's left edge.
constexpr double jackLabelLeft = 5;
constexpr double jackLabelWidth = 96;

QVariant fieldValue(const QVariantMap &field) {
    const auto value = field.value("value");
    return value.isValid() && !value.isNull() ? value : field.value("defaultValue");
}

// numberProp in SynthModuleBody.tsx: the property as a number, or the default.
double numberValue(const CardBodyInput &input, const QString &name, double fallback) {
    bool ok = false;
    const auto value = fieldValue(input.fields.value(name)).toDouble(&ok);
    return ok && std::isfinite(value) ? value : fallback;
}

NodeRow bodyRow(NodeRowKind kind, const QString &name, const QString &label, const QRectF &rect) {
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

QFont labelFont() {
    QFont font(QStringLiteral("JetBrains Mono"));
    font.setPixelSize(nm::fontValue);
    font.setWeight(QFont::DemiBold);
    font.setCapitalization(QFont::AllUppercase);
    font.setLetterSpacing(QFont::AbsoluteSpacing, 0.04 * nm::fontValue);
    return font;
}

QFont monoFont() {
    QFont font(QStringLiteral("JetBrains Mono"));
    font.setPixelSize(nm::fontValue);
    return font;
}

// The input jacks in metadata order, as HandleColumn's filtered properties.
QStringList jackNames(const QJsonObject &metadata, const QJsonArray &configured) {
    QStringList names;
    for (const auto &value : metadata["properties"].toArray()) {
        const auto name = value.toObject()["name"].toString();
        if (configured.contains(name)) {
            names.append(name);
        }
    }
    return names;
}

// HandleColumn: one 18 px handle row per jack, 28 px apart, with its label beside it.
void placeJacks(NodeLayout &layout, const CardBodyInput &input, const QStringList &names, bool labels) {
    for (int i = 0; i < names.size(); ++i) {
        const auto y = nm::contentTop + nm::rowHeight / 2.0 + i * nm::handleRowStep;
        for (int port = 0; port < input.inputs.size(); ++port) {
            if (input.inputs[port].toObject()["name"].toString() == names[i]) {
                layout.inputY[port] = y;
            }
        }
        if (!labels) {
            continue;
        }
        // .jack-label: EYEBROW, the caption face in upper case.
        auto row = bodyRow(NodeRowKind::Label, {}, QString(names[i]).replace(QLatin1Char('_'), QLatin1Char(' ')).toUpper(),
                           QRectF(nm::borderWidth + nm::padding + jackLabelLeft, y - nm::rowHeight / 2.0, jackLabelWidth, nm::rowHeight));
        row.bare = true;
        layout.rows.append(row);
    }
}

// The module label strip, centered. Returns its bottom.
double moduleLabel(NodeLayout &layout, const QString &text, double center, double y) {
    const auto width = QFontMetricsF(labelFont()).horizontalAdvance(text) + 2 * labelPadX;
    auto row = bodyRow(NodeRowKind::Caption, {}, text, QRectF(center - width / 2.0, y, width, nm::fontValue + 2 * labelPadY));
    row.bare = true;
    layout.rows.append(row);
    return row.rect.bottom();
}

// A quiet ToggleGroup of mono options, centered. Returns its bottom.
double toggleGroup(NodeLayout &layout, const QString &name, const QStringList &labels, const QVariantList &values, int selected,
                   double center, double y) {
    const QFontMetricsF metrics(monoFont());
    QVector<double> widths;
    double total = nm::micro * std::max<qsizetype>(0, labels.size() - 1);
    for (const auto &label : labels) {
        widths.append(metrics.horizontalAdvance(label) + 2 * togglePadX + 2 * nm::borderWidth);
        total += widths.last();
    }
    auto row = bodyRow(NodeRowKind::Segmented, name, {}, QRectF(center - total / 2.0, y, total, toggleHeight));
    row.options = labels;
    row.optionValues = values;
    row.selected = selected;
    row.bare = true;
    auto x = row.rect.x();
    for (const auto width : widths) {
        row.parts.append(QRectF(x, y, width, toggleHeight));
        x += width + nm::micro;
    }
    layout.rows.append(row);
    return row.rect.bottom();
}

QColor accentColor(const CanvasTheme &theme, const QString &accent) {
    if (accent == QStringLiteral("secondary")) {
        return theme.progress;
    }
    if (accent == QStringLiteral("warning")) {
        return theme.warning;
    }
    if (accent == QStringLiteral("success")) {
        return theme.success;
    }
    // CanvasTheme carries no info or error role, so these are the web palette's info.main and error.main.
    if (accent == QStringLiteral("info")) {
        return QColor(0x22, 0xd3, 0xee);
    }
    if (accent == QStringLiteral("error")) {
        return QColor(0xff, 0x55, 0x55);
    }
    return theme.primary;
}

QColor faded(QColor color, double alpha) {
    color.setAlphaF(color.alphaF() * alpha);
    return color;
}

// polar in SynthKnob.tsx: a point at a sweep angle, 0 degrees up and clockwise.
QPointF polar(const QPointF &center, double degrees, double radius) {
    const auto radians = (degrees - 90) * std::numbers::pi / 180.0;
    return center + QPointF(radius * std::cos(radians), radius * std::sin(radians));
}

void strokeArc(QPainter *painter, const QPointF &center, double from, double to, const QColor &color) {
    const auto a = std::min(from, to);
    const auto b = std::max(from, to);
    QPainterPath path(polar(center, a, arcRadius));
    // Qt angles turn counterclockwise from 3 o'clock.
    path.arcTo(QRectF(center - QPointF(arcRadius, arcRadius), QSizeF(2 * arcRadius, 2 * arcRadius)), 90 - a, -(b - a));
    painter->setPen(QPen(color, arcStroke, Qt::SolidLine, Qt::RoundCap));
    painter->setBrush(Qt::NoBrush);
    painter->drawPath(path);
}

void paintKnob(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, double value) {
    const auto face = knobFace(row);
    const auto center = face.center();
    painter->setPen(Qt::NoPen);
    // .knob-face: action.hover, the divider tint.
    painter->setBrush(theme.divider);
    painter->drawEllipse(face);
    const auto angle = startDegrees + knobNorm(row, value) * sweepDegrees;
    // Bipolar knobs fill from where 0 sits, the others from the minimum.
    const auto neutral = startDegrees + (row.bipolar ? knobNorm(row, 0) : 0.0) * sweepDegrees;
    strokeArc(painter, center, startDegrees, startDegrees + sweepDegrees, faded(theme.textSecondary, 0.4));
    if (std::abs(angle - neutral) > 0.5) {
        strokeArc(painter, center, neutral, angle, accentColor(theme, row.accent));
    }
    painter->setPen(QPen(theme.textPrimary, 2, Qt::SolidLine, Qt::RoundCap));
    painter->drawLine(polar(center, angle, 6), polar(center, angle, arcRadius - 5));
    QFont label(theme.sansFamily);
    label.setPixelSize(nm::fontValue);
    label.setWeight(QFont::Medium);
    painter->setFont(label);
    painter->setPen(theme.textSecondary);
    const QRectF labelRect(row.rect.x(), face.bottom() + nm::micro, row.rect.width(), nm::fontValue);
    painter->drawText(labelRect, Qt::AlignHCenter | Qt::AlignVCenter, row.label);
    QFont mono(theme.monoFamily);
    mono.setPixelSize(nm::fontValue);
    painter->setFont(mono);
    painter->setPen(theme.textPrimary);
    painter->drawText(QRectF(row.rect.x() - nm::padding, labelRect.bottom() + nm::micro, row.rect.width() + 2 * nm::padding, nm::fontValue),
                      Qt::AlignHCenter | Qt::AlignVCenter, knobText(row, value));
}

// WAVE_PATHS in WaveformSelector.tsx, in the 18 by 10 glyph box.
QPainterPath waveGlyph(const QString &wave) {
    QPainterPath path;
    const auto lines = [&path](std::initializer_list<QPointF> points) {
        auto it = points.begin();
        path.moveTo(*it);
        for (++it; it != points.end(); ++it) {
            path.lineTo(*it);
        }
    };
    if (wave == QStringLiteral("saw")) {
        lines({{0, 9}, {8, 1}, {8, 9}, {16, 1}, {16, 9}});
    } else if (wave == QStringLiteral("square")) {
        lines({{0, 9}, {0, 1}, {6, 1}, {6, 9}, {12, 9}, {12, 1}, {18, 1}});
    } else if (wave == QStringLiteral("triangle")) {
        lines({{0, 9}, {4.5, 1}, {13.5, 9}, {18, 1}});
    } else if (wave == QStringLiteral("noise")) {
        lines({{0, 5}, {2, 2}, {4, 8}, {6, 3}, {8, 7}, {10, 1}, {12, 9}, {14, 4}, {16, 6}, {18, 5}});
    } else {
        path.moveTo(0, 5);
        path.cubicTo(2.5, -1, 6.5, -1, 9, 5);
        path.cubicTo(11.5, 11, 15.5, 11, 18, 5);
    }
    return path;
}

void paintWaveform(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    for (int i = 0; i < row.parts.size() && i < row.options.size(); ++i) {
        const auto active = i == row.selected;
        const auto part = row.parts[i];
        if (active) {
            // .waveform-btn.active: action.selected.
            painter->setPen(Qt::NoPen);
            painter->setBrush(faded(theme.textPrimary, 0.16));
            painter->drawRoundedRect(part, nm::chipRadius, nm::chipRadius);
        }
        painter->save();
        painter->translate(part.center() - QPointF(glyphWidth / 2.0, glyphHeight / 2.0));
        painter->setPen(QPen(active ? accentColor(theme, row.accent) : theme.textSecondary, 1.5, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
        painter->setBrush(Qt::NoBrush);
        painter->drawPath(waveGlyph(row.options[i]));
        painter->restore();
    }
}

// seg in AdsrPreview.tsx: a time in [0.0005, 10] s on a log axis, at least 0.08 wide.
double envelopeSegment(double seconds) {
    const auto t = std::clamp(seconds, 0.0005, 10.0);
    return std::max(0.08, std::log(t / 0.0005) / std::log(10 / 0.0005));
}

void paintEnvelope(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, const CardBodyPaintState &state) {
    const auto value = [&](int index) {
        const auto name = row.options.value(index);
        return !name.isEmpty() && state.draftProperty == name ? state.draftValue : row.optionValues.value(index).toDouble();
    };
    const auto a = envelopeSegment(value(0));
    const auto d = envelopeSegment(value(1));
    const auto r = envelopeSegment(value(3));
    // A fixed sustain plateau, relative to the segments.
    const auto hold = 0.55;
    const auto total = a + d + hold + r;
    // The view box stretches to the row's width, as preserveAspectRatio="none".
    const auto scale = row.rect.width() / envelopeViewWidth;
    const auto pad = envelopePad * scale;
    const auto usable = row.rect.width() - 2 * pad;
    const auto x0 = row.rect.x() + pad;
    const auto x1 = x0 + a / total * usable;
    const auto x2 = x1 + d / total * usable;
    const auto x3 = x2 + hold / total * usable;
    const auto x4 = row.rect.right() - pad;
    const auto base = row.rect.bottom() - envelopePad;
    const auto peak = row.rect.top() + envelopePad;
    const auto sustain = base - std::clamp(value(2), 0.0, 1.0) * (base - peak);
    QPainterPath line(QPointF(x0, base));
    line.lineTo(x1, peak);
    line.lineTo(x2, sustain);
    line.lineTo(x3, sustain);
    line.lineTo(x4, base);
    const auto accent = accentColor(theme, row.accent);
    auto area = line;
    area.closeSubpath();
    painter->setPen(Qt::NoPen);
    painter->setBrush(faded(accent, 0.15));
    painter->drawPath(area);
    painter->setPen(QPen(accent, 1.5, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
    painter->setBrush(Qt::NoBrush);
    painter->drawPath(line);
    painter->setPen(QPen(theme.divider, 1));
    painter->drawLine(QPointF(row.rect.x() + pad, base), QPointF(row.rect.right() - pad, base));
}

void paintCaption(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row, const CardBodyPaintState &state) {
    // A run result replaces the idle hint.
    if (state.hasResult && row.rect == layout.resultRect) {
        return;
    }
    painter->setPen(theme.textSecondary);
    if (row.bare) {
        auto font = labelFont();
        font.setFamily(theme.monoFamily);
        painter->setFont(font);
        painter->drawText(row.rect, Qt::AlignCenter, row.label);
        return;
    }
    QFont font(theme.sansFamily);
    font.setPixelSize(nm::fontValue);
    painter->setFont(font);
    painter->drawText(row.rect, Qt::AlignCenter | Qt::TextWordWrap, row.label);
}

// SynthModuleBody's flex column grows its knob grid to the card's height, so a
// card taller than its content centers the knobs in the extra room.
int targetHeight(const CardBodyInput &input, int fallback) {
    const auto authored = input.node["ui_properties"].toObject()["height"].toDouble();
    return authored > 0 ? int(authored) : fallback;
}
} // namespace

QJsonObject synthModule(const QString &type) {
    // Read once from the compiled resource and never changed afterwards.
    static const QJsonObject modules = [] {
        QFile file(QStringLiteral(":/editor/synth/modules.json"));
        return file.open(QIODevice::ReadOnly) ? QJsonDocument::fromJson(file.readAll()).object() : QJsonObject{};
    }();
    return modules[type].toObject();
}

double knobNorm(const NodeRow &row, double value) {
    const auto v = std::clamp(value, row.minimum, std::max(row.minimum, row.maximum));
    if (row.logScale && row.minimum > 0) {
        return std::log(v / row.minimum) / std::log(row.maximum / row.minimum);
    }
    return row.maximum == row.minimum ? 0 : (v - row.minimum) / (row.maximum - row.minimum);
}

double knobDenorm(const NodeRow &row, double t) {
    const auto c = std::clamp(t, 0.0, 1.0);
    if (row.logScale && row.minimum > 0) {
        return row.minimum * std::pow(row.maximum / row.minimum, c);
    }
    return row.minimum + c * (row.maximum - row.minimum);
}

double knobRound(const NodeRow &row, double value) {
    // Integer properties stay whole, log specs keep 4 significant digits and
    // linear specs two decimals.
    if (row.step == 1) {
        return std::round(value);
    }
    if (row.logScale) {
        return QString::number(value, 'g', 4).toDouble();
    }
    return std::round(value * 100) / 100;
}

QString knobText(const NodeRow &row, double value) {
    const auto fixed = [](double number, int decimals) { return QString::number(number, 'f', decimals); };
    if (row.unit == QStringLiteral("hz")) {
        if (value >= 1000) {
            return fixed(value / 1000, value >= 10000 ? 1 : 2) + QStringLiteral(" kHz");
        }
        return (value < 10 ? fixed(value, 2) : QString::number(std::round(value))) + QStringLiteral(" Hz");
    }
    if (row.unit == QStringLiteral("s")) {
        if (value < 1) {
            return QString::number(std::round(value * 1000)) + QStringLiteral(" ms");
        }
        return fixed(value, value < 10 ? 2 : 1) + QStringLiteral(" s");
    }
    if (row.unit == QStringLiteral("ms")) {
        if (value >= 1000) {
            return fixed(value / 1000, 2) + QStringLiteral(" s");
        }
        return (value < 10 ? fixed(value, 1) : QString::number(std::round(value))) + QStringLiteral(" ms");
    }
    if (row.unit == QStringLiteral("db")) {
        return (value > 0 ? QStringLiteral("+") : QString{}) + fixed(value, 1) + QStringLiteral(" dB");
    }
    const auto rounded = std::round(value * 100) / 100;
    if (row.unit == QStringLiteral("x")) {
        return QString::number(rounded, 'g', 15) + QStringLiteral("×");
    }
    if (row.step == 1) {
        return QString::number(std::round(value));
    }
    return (row.bipolar && rounded > 0 ? QStringLiteral("+") : QString{}) + QString::number(rounded, 'g', 15);
}

double knobDragValue(const NodeRow &row, double startValue, double startY, double y, bool fine) {
    const auto delta = (startY - y) / sm::knobDragRange * (fine ? sm::knobFine : 1.0);
    return knobRound(row, knobDenorm(row, std::clamp(knobNorm(row, startValue) + delta, 0.0, 1.0)));
}

QRectF knobFace(const NodeRow &row) {
    return {row.rect.center().x() - sm::knobSize / 2.0, row.rect.y(), sm::knobSize, sm::knobSize};
}

void layoutSynthModule(NodeLayout &layout, const CardBodyInput &input) {
    const auto config = synthModule(input.node["type"].toString());
    const auto width = double(layout.size.width());
    const auto left = nm::borderWidth + nm::padding + bodyPadding;
    const auto inner = width - 2 * left;
    const auto center = width / 2.0;
    const auto accent = config["accent"].toString(QStringLiteral("primary"));
    placeJacks(layout, input, jackNames(input.metadata, config["inputs"].toArray()), true);

    auto y = moduleLabel(layout, config["label"].toString(), center, nm::bodyTop + bodyPadding) + bodyGap;
    // The web default height: the label strip, the extras and 84 px per row of three knobs.
    double extras = 0;
    const auto waveform = config["waveform"].toObject();
    if (!waveform.isEmpty()) {
        const auto name = waveform["name"].toString();
        const auto current = fieldValue(input.fields.value(name)).toString();
        const auto value = current.isEmpty() ? waveform["default"].toString() : current;
        QStringList options;
        for (const auto &option : waveform["options"].toArray()) {
            options.append(option.toString());
        }
        const auto total = options.size() * waveButtonWidth + std::max<qsizetype>(0, options.size() - 1) * waveGap;
        auto row = bodyRow(NodeRowKind::Waveform, name, QObject::tr("Waveform"), QRectF(center - total / 2.0, y, total, waveButtonHeight));
        row.options = options;
        row.accent = accent;
        for (int i = 0; i < options.size(); ++i) {
            row.optionValues.append(options[i]);
            row.parts.append(QRectF(row.rect.x() + i * (waveButtonWidth + waveGap), y, waveButtonWidth, waveButtonHeight));
            if (options[i] == value) {
                row.selected = i;
            }
        }
        layout.rows.append(row);
        y = row.rect.bottom() + bodyGap;
        extras += 26;
    }
    const auto mode = config["modeToggle"].toObject();
    if (!mode.isEmpty()) {
        const auto name = mode["name"].toString();
        const auto current = fieldValue(input.fields.value(name)).toString();
        const auto value = current.isEmpty() ? mode["default"].toString() : current;
        QStringList labels;
        QVariantList values;
        int selected = -1;
        for (const auto &entry : mode["options"].toArray()) {
            const auto option = entry.toObject();
            if (option["value"].toString() == value) {
                selected = int(labels.size());
            }
            labels.append(option["label"].toString());
            values.append(option["value"].toString());
        }
        y = toggleGroup(layout, name, labels, values, selected, center, y) + bodyGap;
        extras += 28;
    }
    int toggles = 0;
    for (const auto &entry : config["toggles"].toArray()) {
        const auto toggle = entry.toObject();
        const auto name = toggle["name"].toString();
        const auto stored = fieldValue(input.fields.value(name));
        const auto on = stored.isValid() ? stored.toBool() : toggle["default"].toBool();
        y = toggleGroup(layout, name, {toggle["label"].toString()}, {name}, on ? 0 : -1, center, y) + bodyGap;
        // A click flips the boolean, so the one option is not a choice.
        layout.rows.last().action = QStringLiteral("toggleBool");
        ++toggles;
    }
    const auto knobs = config["knobs"].toArray();
    const auto numberOf = [&knobs, &input](const QString &name, double fallback) {
        for (const auto &knob : knobs) {
            if (knob.toObject()["name"].toString() == name) {
                return numberValue(input, name, knob.toObject()["default"].toDouble(fallback));
            }
        }
        return numberValue(input, name, fallback);
    };
    if (config["adsrPreview"].toBool()) {
        auto row = bodyRow(NodeRowKind::Envelope, {}, QObject::tr("Envelope shape"),
                           QRectF(left + envelopeInset, y, inner - 2 * envelopeInset, envelopeHeight));
        row.accent = accent;
        row.options = {QStringLiteral("attack"), QStringLiteral("decay"), QStringLiteral("sustain"), QStringLiteral("release")};
        row.optionValues = {numberOf(QStringLiteral("attack"), 0.01), numberOf(QStringLiteral("decay"), 0.1),
                            numberOf(QStringLiteral("sustain"), 0.7), numberOf(QStringLiteral("release"), 0.3)};
        layout.rows.append(row);
        y = row.rect.bottom() + bodyGap;
        extras += 42;
    }
    const auto knobCount = int(knobs.size());
    const auto perRow = std::max(1, int((inner + knobColumnGap) / (sm::knobWidth + knobColumnGap)));
    const auto rows = knobCount == 0 ? 0 : (knobCount + perRow - 1) / perRow;
    const auto gridHeight = rows == 0 ? 0.0 : rows * sm::knobHeight + (rows - 1) * knobRowGap;
    // The grid, the gap before the zero-height outputs row, the body padding and the card inset.
    const auto bottomSpace = bodyGap + bodyPadding + nm::borderWidth + nm::padding;
    const auto natural = int(std::ceil(y + gridHeight + bottomSpace));
    const auto webDefault = 96 + int(extras) + toggles * 28 + ((knobCount + 2) / 3) * 84;
    const auto height = std::max(natural, targetHeight(input, webDefault));
    layout.size.setHeight(height);
    // .knob-grid centers its rows in the room the flex column gives it.
    auto top = y + std::max(0.0, (height - bottomSpace - y - gridHeight) / 2.0);
    for (int r = 0; r < rows; ++r) {
        const auto count = std::min(perRow, knobCount - r * perRow);
        const auto rowWidth = count * sm::knobWidth + (count - 1) * knobColumnGap;
        auto x = center - rowWidth / 2.0;
        for (int c = 0; c < count; ++c) {
            const auto spec = knobs[r * perRow + c].toObject();
            const auto name = spec["name"].toString();
            auto row = bodyRow(NodeRowKind::Knob, name, spec["label"].toString(), QRectF(x, top, sm::knobWidth, sm::knobHeight));
            row.minimum = spec["min"].toDouble();
            row.maximum = spec["max"].toDouble();
            row.defaultNumber = spec["default"].toDouble();
            row.number = numberValue(input, name, row.defaultNumber);
            row.logScale = spec["scale"].toString() == QStringLiteral("log");
            row.bipolar = spec["bipolar"].toBool();
            row.step = spec["integer"].toBool() ? 1 : 0;
            row.unit = spec["unit"].toString();
            row.accent = accent;
            row.checked = input.fields.value(name).value("connected").toBool();
            layout.rows.append(row);
            x += sm::knobWidth + knobColumnGap;
        }
        top += sm::knobHeight + knobRowGap;
    }
}

void layoutAudioOut(NodeLayout &layout, const CardBodyInput &input) {
    const auto width = double(layout.size.width());
    const auto left = nm::borderWidth + nm::padding + bodyPadding;
    placeJacks(layout, input, {QStringLiteral("chunk")}, false);
    // AudioOutBody.tsx: the label strip, then the player or the idle hint filling the card.
    const auto y = moduleLabel(layout, QObject::tr("Out"), width / 2.0, nm::bodyTop + bodyPadding) + bodyGap;
    const auto bottomSpace = bodyGap + bodyPadding + nm::borderWidth + nm::padding;
    // bespokeNodeSizes.ts gives Audio Out 220 px.
    const auto height = std::max(int(std::ceil(y + nm::rowHeight + bottomSpace)), targetHeight(input, 220));
    layout.size.setHeight(height);
    const QRectF area(left, y, width - 2 * left, height - bottomSpace - y);
    layout.rows.append(bodyRow(NodeRowKind::Caption, {}, QObject::tr("Run the patch to hear it"), area));
    layout.resultRect = area;
}

bool paintSynthRow(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row,
                   const CardBodyPaintState &state) {
    switch (row.kind) {
    case NodeRowKind::Knob:
        paintKnob(painter, theme, row, state.draftProperty == row.propertyName ? state.draftValue : row.number);
        return true;
    case NodeRowKind::Waveform:
        paintWaveform(painter, theme, row);
        return true;
    case NodeRowKind::Envelope:
        paintEnvelope(painter, theme, row, state);
        return true;
    case NodeRowKind::Caption:
        paintCaption(painter, theme, layout, row, state);
        return true;
    default:
        return false;
    }
}
} // namespace nodetool
