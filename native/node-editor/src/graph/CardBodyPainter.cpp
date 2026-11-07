#include "CardBodyPainter.h"
#include "CardBodies.h"
#include <QPainter>
#include <QPainterPath>
#include <QSvgRenderer>
#include <cmath>

namespace nodetool {
namespace {
namespace nm = node_metrics;

QFont sans(const CanvasTheme &theme, int pixels, QFont::Weight weight = QFont::Normal) {
    QFont font(theme.sansFamily);
    font.setPixelSize(pixels);
    font.setWeight(weight);
    font.setHintingPreference(QFont::PreferNoHinting);
    return font;
}

QFont mono(const CanvasTheme &theme, int pixels) {
    QFont font(theme.monoFamily);
    font.setPixelSize(pixels);
    font.setHintingPreference(QFont::PreferNoHinting);
    return font;
}

QColor faded(QColor color, double alpha) {
    color.setAlphaF(color.alphaF() * alpha);
    return color;
}

void fillField(QPainter *painter, const CanvasTheme &theme, const QRectF &rect) {
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.field);
    painter->drawRoundedRect(rect, nm::fieldRadius, nm::fieldRadius);
}

// CheckerDropzone: a checker field with an icon over a centered message.
void paintPlaceholder(QPainter *painter, const CanvasTheme &theme, const QRectF &rect, const QString &icon, const QString &message) {
    fillField(painter, theme, rect);
    painter->save();
    QPainterPath clip;
    clip.addRoundedRect(rect, nm::fieldRadius, nm::fieldRadius);
    painter->setClipPath(clip, Qt::IntersectClip);
    constexpr int cell = 16;
    for (int y = 0; y * cell < rect.height(); ++y) {
        for (int x = y % 2; x * cell < rect.width(); x += 2) {
            painter->fillRect(QRectF(rect.x() + x * cell, rect.y() + y * cell, cell, cell), theme.checker);
        }
    }
    painter->restore();
    const auto ink = faded(theme.textSecondary, 0.65);
    const auto top = rect.center().y() - nm::iconSize;
    paintMaterialIcon(painter, icon, QRectF(rect.center().x() - nm::iconSize / 2.0, top, nm::iconSize, nm::iconSize), ink);
    painter->setPen(theme.textSecondary);
    painter->setFont(sans(theme, nm::fontValue));
    painter->drawText(QRectF(rect.x(), top + nm::iconSize + nm::micro, rect.width(), nm::rowHeight), Qt::AlignHCenter | Qt::AlignTop,
                      painter->fontMetrics().elidedText(message, Qt::ElideRight, int(rect.width())));
}

void paintChevron(QPainter *painter, const CanvasTheme &theme, const QRectF &field) {
    QPainterPath chevron;
    const auto c = QPointF(field.right() - 12, field.center().y());
    chevron.moveTo(c + QPointF(-3, -1.5));
    chevron.lineTo(c + QPointF(0, 1.5));
    chevron.lineTo(c + QPointF(3, -1.5));
    painter->setBrush(Qt::NoBrush);
    painter->setPen(QPen(theme.textSecondary, 1.2));
    painter->drawPath(chevron);
}

// Variables and asset/entity mentions draw as chips within the composer.
void paintComposer(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.field);
    painter->drawRoundedRect(row.rect, nm::chipRadius, nm::chipRadius);
    const auto text = sans(theme, nm::fontLabel);
    const auto chipFont = mono(theme, nm::fontValue);
    const QFontMetricsF textMetrics(text);
    const QFontMetricsF chipMetrics(chipFont);
    const auto area = row.rect.adjusted(nm::composerPadding, nm::composerPadding, -nm::composerPadding, -nm::composerPadding);
    painter->save();
    painter->setClipRect(area);
    if (row.placeholder) {
        painter->setFont(text);
        painter->setPen(faded(theme.textSecondary, 0.7));
        // PromptComposerBody's placeholder, i18n promptComposer.placeholder.
        painter->drawText(QRectF(area.topLeft(), QSizeF(area.width(), nm::composerLineHeight)), Qt::AlignLeft | Qt::AlignVCenter,
                          painter->fontMetrics().elidedText(QObject::tr("Write a prompt\u2026 @ to mention an asset"), Qt::ElideRight, int(area.width())));
        painter->restore();
        return;
    }
    const auto ink = theme.textPrimary;
    auto x = area.x();
    auto y = area.y();
    const auto newline = [&] {
        x = area.x();
        y += nm::composerLineHeight;
    };
    for (const auto &line : row.value.split(QLatin1Char('\n'))) {
        for (const auto &token : promptTokens(line)) {
            if (token.variable || !token.mentionScheme.isEmpty()) {
                const auto name = token.text.section(QLatin1Char('|'), 0, 0).trimmed();
                const bool known = row.options.contains(name);
                const auto width = chipMetrics.horizontalAdvance(token.text) + 2 * nm::chipPadding;
                if (x > area.x() && x + width > area.right()) {
                    newline();
                }
                const QRectF chip(x + nm::chipGap, y + (nm::composerLineHeight - nm::chipHeight) / 2.0, width, nm::chipHeight);
                const auto tone = !token.mentionScheme.isEmpty() ? theme.primary : known ? theme.success : theme.warning;
                painter->setPen(QPen(tone, nm::borderWidth));
                painter->setBrush(faded(tone, 0.18));
                painter->drawRoundedRect(chip.adjusted(0.5, 0.5, -0.5, -0.5), nm::chipRadius, nm::chipRadius);
                painter->setPen(ink);
                painter->setFont(chipFont);
                painter->drawText(chip, Qt::AlignCenter, token.text);
                x = chip.right() + nm::chipGap;
                continue;
            }
            painter->setFont(text);
            painter->setPen(ink);
            // Words wrap as whole runs, like the web's pre-wrap composer.
            const auto words = token.text.split(QLatin1Char(' '));
            for (int i = 0; i < words.size(); ++i) {
                const auto word = words[i] + (i + 1 < words.size() ? QStringLiteral(" ") : QString{});
                const auto width = textMetrics.horizontalAdvance(word);
                if (x > area.x() && x + textMetrics.horizontalAdvance(words[i]) > area.right()) {
                    newline();
                }
                painter->drawText(QRectF(x, y, width + 1, nm::composerLineHeight), Qt::AlignLeft | Qt::AlignVCenter, word);
                x += width;
            }
        }
        newline();
    }
    painter->restore();
}

void paintAction(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    if (row.bare) {
        painter->setPen(QPen(row.checked ? theme.primary : theme.divider, nm::borderWidth));
        painter->setBrush(Qt::NoBrush);
        painter->drawRoundedRect(row.rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::chipRadius, nm::chipRadius);
        painter->setPen(row.checked ? theme.primary : theme.textPrimary);
        painter->setFont(mono(theme, nm::fontValue));
        painter->drawText(row.rect, Qt::AlignCenter, row.label);
        return;
    }
    // DynamicInputButton: a dashed outline around a plus and its label.
    painter->setPen(QPen(theme.divider, nm::borderWidth, Qt::DashLine));
    painter->setBrush(Qt::NoBrush);
    painter->drawRoundedRect(row.rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::chipRadius, nm::chipRadius);
    painter->setFont(sans(theme, nm::fontLabel));
    const auto labelWidth = painter->fontMetrics().horizontalAdvance(row.label);
    const auto left = row.rect.center().x() - (labelWidth + nm::iconSize) / 2.0;
    paintMaterialIcon(painter, QStringLiteral("add"), QRectF(left, row.rect.center().y() - nm::iconSize / 2.0, nm::iconSize, nm::iconSize), theme.textSecondary);
    painter->setPen(theme.textSecondary);
    painter->drawText(QRectF(left + nm::iconSize, row.rect.y(), labelWidth + nm::micro, row.rect.height()), Qt::AlignLeft | Qt::AlignVCenter, row.label);
}

void paintSegmented(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    // A bare toggle uses the mono face, as the preview tabs' fontFamily2.
    painter->setFont(row.bare ? mono(theme, nm::fontValue) : sans(theme, nm::fontValue));
    for (int i = 0; i < row.parts.size() && i < row.options.size(); ++i) {
        const auto active = i == row.selected;
        if (active) {
            painter->setPen(Qt::NoPen);
            painter->setBrush(theme.field);
            painter->drawRoundedRect(row.parts[i], nm::chipRadius, nm::chipRadius);
        }
        painter->setPen(active ? theme.textPrimary : theme.textSecondary);
        painter->drawText(row.parts[i], Qt::AlignCenter, row.options[i]);
    }
}

void paintSlider(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, double value) {
    painter->setPen(theme.textSecondary);
    // AdjustmentSlider labels use the medium face and wrap within their column.
    painter->setFont(sans(theme, nm::fontValue, row.tracksDefault ? QFont::Medium : QFont::Normal));
    const auto labelWidth = row.labelWidth > 0 ? row.labelWidth : double(nm::controlLabelWidth);
    painter->drawText(QRectF(row.rect.x(), row.rect.y(), labelWidth, row.rect.height()),
                      Qt::AlignLeft | Qt::AlignVCenter | (row.wrap ? Qt::TextWordWrap : 0), row.label);
    const auto track = sliderTrack(row);
    const auto span = row.maximum - row.minimum;
    const auto position = [&](double number) {
        return track.x() + track.width() * (span > 0 ? std::clamp((number - row.minimum) / span, 0.0, 1.0) : 0.0);
    };
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.divider);
    painter->drawRoundedRect(track, track.height() / 2, track.height() / 2);
    // A bipolar slider fills outward from zero, as the Slider primitive's origin.
    const auto origin = row.bipolar ? position(0) : track.x();
    const auto thumb = position(value);
    painter->setBrush(theme.primary);
    painter->drawRoundedRect(QRectF(QPointF(std::min(origin, thumb), track.y()), QPointF(std::max(origin, thumb), track.bottom())),
                             track.height() / 2, track.height() / 2);
    // A 12 px thumb with a 2 px ring in the card color. It is neutral until the
    // value leaves its default, and a bare NodeSlider always passes changed=false.
    const auto changed = row.tracksDefault && !qFuzzyCompare(1 + value, 1 + row.defaultNumber);
    painter->setBrush(theme.node);
    painter->drawEllipse(QPointF(thumb, track.center().y()), nm::sliderThumb / 2, nm::sliderThumb / 2);
    painter->setBrush(changed ? theme.primary : theme.textSecondary);
    painter->drawEllipse(QPointF(thumb, track.center().y()), nm::sliderThumb / 2 - nm::micro, nm::sliderThumb / 2 - nm::micro);
    painter->setPen(theme.textPrimary);
    painter->setFont(mono(theme, nm::fontValue));
    const auto valueWidth = row.valueWidth > 0 ? row.valueWidth : double(nm::sliderValueWidth);
    // AdjustmentSlider's value cell pads its text 4 px from the right.
    const auto valueInset = row.tracksDefault ? double(nm::chipGap) : 0.0;
    painter->drawText(QRectF(row.rect.right() - valueWidth, row.rect.y(), valueWidth - valueInset, row.rect.height()),
                      Qt::AlignRight | Qt::AlignVCenter, sliderText(row, value));
}

// A ColorPicker button: the property color over a checker for transparency, with its label.
void paintSwatch(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    if (!row.parts.isEmpty()) {
        painter->setPen(theme.textSecondary);
        painter->setFont(sans(theme, nm::fontValue, QFont::Medium));
        painter->drawText(row.parts.first(), Qt::AlignLeft | Qt::AlignVCenter,
                          painter->fontMetrics().elidedText(row.label, Qt::ElideRight, int(row.parts.first().width())));
    }
    const auto box = row.rect.adjusted(0.5, 0.5, -0.5, -0.5);
    painter->save();
    QPainterPath clip;
    clip.addRoundedRect(box, nm::chipRadius, nm::chipRadius);
    painter->setClipPath(clip, Qt::IntersectClip);
    painter->fillRect(box, theme.field);
    const auto half = box.width() / 2;
    painter->fillRect(QRectF(box.topLeft(), QSizeF(half, half)), theme.checker);
    painter->fillRect(QRectF(box.center(), QSizeF(half, half)), theme.checker);
    const QColor color(row.value);
    if (color.isValid()) {
        painter->fillRect(box, color);
    }
    painter->restore();
    painter->setPen(QPen(theme.divider, nm::borderWidth));
    painter->setBrush(Qt::NoBrush);
    painter->drawRoundedRect(box, nm::chipRadius, nm::chipRadius);
}

void paintField(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row) {
    if (!row.bare && !row.label.isEmpty()) {
        painter->setPen(theme.textSecondary);
        painter->setFont(sans(theme, nm::fontValue));
        const auto inset = nm::borderWidth + nm::padding + nm::micro;
        painter->drawText(QRectF(inset, row.rect.y(), row.rect.x() - inset, row.rect.height()), Qt::AlignLeft | Qt::AlignVCenter, row.label);
    }
    fillField(painter, theme, row.rect);
    painter->setPen(row.placeholder ? theme.textSecondary : theme.textPrimary);
    painter->setFont(sans(theme, nm::fontValue));
    const auto text = row.rect.adjusted(nm::padding, 0, row.choice ? -24 : -nm::padding, 0);
    painter->drawText(text, Qt::AlignLeft | Qt::AlignVCenter, painter->fontMetrics().elidedText(row.value, Qt::ElideRight, int(text.width())));
    if (row.choice) {
        paintChevron(painter, theme, row.rect);
    }
    Q_UNUSED(layout);
}

void paintModelChip(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    if (!row.bare) {
        painter->setPen(theme.textSecondary);
        painter->setFont(sans(theme, nm::fontLabel));
        painter->drawText(QRectF(row.rect.x(), row.rect.y() - nm::rowHeight, row.rect.width(), nm::rowHeight), Qt::AlignLeft | Qt::AlignVCenter, row.label);
    }
    painter->setPen(QPen(theme.divider, nm::borderWidth));
    painter->setBrush(theme.field);
    painter->drawRoundedRect(row.rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::fieldRadius, nm::fieldRadius);
    const auto text = row.rect.adjusted(nm::padding, 0, -24, 0);
    painter->setFont(sans(theme, nm::fontValue));
    painter->setPen(row.placeholder ? theme.textSecondary : theme.textPrimary);
    const auto name = painter->fontMetrics().elidedText(row.value, Qt::ElideRight, int(text.width()));
    painter->drawText(text, Qt::AlignLeft | Qt::AlignVCenter, name);
    if (!row.typeName.isEmpty()) {
        const auto offset = painter->fontMetrics().horizontalAdvance(name + QStringLiteral(" "));
        painter->setFont(sans(theme, nm::fontValue - nm::micro));
        painter->setPen(theme.textSecondary);
        painter->drawText(text.adjusted(offset, 0, 0, 0), Qt::AlignLeft | Qt::AlignVCenter,
                          painter->fontMetrics().elidedText(row.typeName, Qt::ElideRight, int(std::max(0.0, text.width() - offset))));
    }
    paintChevron(painter, theme, row.rect);
}

void paintDropZone(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    painter->setPen(theme.textSecondary);
    painter->setFont(sans(theme, nm::fontLabel));
    painter->drawText(QRectF(row.rect.x(), row.y, row.rect.width(), nm::rowHeight), Qt::AlignLeft | Qt::AlignVCenter, row.label);
    painter->setPen(QPen(theme.divider, nm::borderWidth, Qt::DashLine));
    painter->setBrush(theme.field);
    painter->drawRoundedRect(row.rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::fieldRadius, nm::fieldRadius);
    auto font = mono(theme, nm::fontValue - nm::micro);
    font.setLetterSpacing(QFont::AbsoluteSpacing, nm::micro);
    painter->setFont(font);
    painter->setPen(row.placeholder ? theme.textSecondary : theme.textPrimary);
    painter->drawText(row.rect, Qt::AlignCenter, painter->fontMetrics().elidedText(row.value, Qt::ElideMiddle, int(row.rect.width() - 2 * nm::padding)));
}
} // namespace

void paintMaterialIcon(QPainter *painter, const QString &name, const QRectF &rect, const QColor &color) {
    const auto path = iconPath(name);
    if (path.isEmpty()) {
        return;
    }
    const auto svg = QStringLiteral("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"%1\" fill-opacity=\"%2\" d=\"%3\"/></svg>")
                         .arg(color.name()).arg(color.alphaF()).arg(path);
    QSvgRenderer(svg.toUtf8()).render(painter, rect);
}

void paintCardIcon(QPainter *painter, const QString &typeIcon, const QString &fallback, const QRectF &rect, const QColor &color) {
    const auto svg = typeIcon.isEmpty() ? QByteArray{} : webTypeIconSvg(typeIcon, color);
    if (svg.isEmpty()) {
        paintMaterialIcon(painter, fallback, rect, color);
        return;
    }
    QSvgRenderer renderer(svg);
    // The web scales each icon into its box and keeps its aspect ratio.
    const auto view = renderer.viewBoxF().size();
    auto target = rect;
    if (view.width() > 0 && view.height() > 0) {
        const auto size = view.scaled(rect.size(), Qt::KeepAspectRatio);
        target = QRectF(QPointF(), size);
        target.moveCenter(rect.center());
    }
    painter->save();
    painter->setOpacity(painter->opacity() * color.alphaF());
    renderer.render(painter, target);
    painter->restore();
}

bool paintCardBodyRow(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row,
                      const CardBodyPaintState &state) {
    const auto inset = double(nm::borderWidth + nm::padding);
    switch (row.kind) {
    case NodeRowKind::Preview: {
        if (state.hasResult && !layout.resultRect.isEmpty()) {
            return true;
        }
        const auto rect = row.rect.isEmpty() ? QRectF(inset, row.y, layout.size.width() - 2 * inset, row.height) : row.rect;
        auto area = rect;
        // A Preview body follows the card when it is resized.
        if (layout.body == CardBody::Preview) {
            area.setBottom(layout.size.height() - inset);
        }
        paintPlaceholder(painter, theme, area, row.icon.isEmpty() ? layout.icon : row.icon, row.value);
        return true;
    }
    case NodeRowKind::Composer:
        paintComposer(painter, theme, row);
        return true;
    case NodeRowKind::Action:
        paintAction(painter, theme, row);
        return true;
    case NodeRowKind::Segmented:
        paintSegmented(painter, theme, row);
        return true;
    case NodeRowKind::Slider:
        paintSlider(painter, theme, row, state.draftProperty == row.propertyName ? state.draftValue : row.number);
        return true;
    case NodeRowKind::Lock: {
        const auto ink = row.checked ? theme.textPrimary : theme.textSecondary;
        paintMaterialIcon(painter, row.icon, QRectF(row.rect.center().x() - nm::iconSize / 2.0, row.rect.center().y() - nm::iconSize / 2.0, nm::iconSize, nm::iconSize), ink);
        return true;
    }
    case NodeRowKind::ModelChip:
        paintModelChip(painter, theme, row);
        return true;
    case NodeRowKind::DropZone:
        paintDropZone(painter, theme, row);
        return true;
    case NodeRowKind::Swatch:
        paintSwatch(painter, theme, row);
        return true;
    case NodeRowKind::Label:
        if (row.rect.isEmpty()) {
            return false;
        }
        painter->setPen(theme.textSecondary);
        painter->setFont(sans(theme, row.textSize > 0 ? row.textSize : nm::fontValue));
        painter->drawText(row.rect, row.wrap ? Qt::AlignLeft | Qt::AlignTop | Qt::TextWordWrap : Qt::AlignLeft | Qt::AlignVCenter, row.label);
        return true;
    case NodeRowKind::Field:
        if (row.rect.isEmpty()) {
            return false;
        }
        paintField(painter, theme, layout, row);
        return true;
    default:
        return false;
    }
}
} // namespace nodetool
