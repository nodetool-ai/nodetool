#include "CardBodyPainter.h"
#include "CardBodies.h"
#include "CardControls.h"
#include "CardMedia.h"
#include "SynthModules.h"
#include <QPainter>
#include <QPainterPath>
#include <algorithm>
#include <cmath>
#include <optional>

namespace nodetool {
namespace nm = node_metrics;
using namespace card_controls;

namespace {
// PainterBody's canvas: the paper letterbox, a checker under the canvas, the
// source at the background opacity, the saved mask and the stroke in flight
// at the brush opacity.
void paintPaintCanvas(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, const QImage *draft,
                      const std::optional<QPointF> &cursor) {
    const auto area = row.parts.value(0, row.rect);
    painter->save();
    QPainterPath clip;
    clip.addRoundedRect(area, nm::chipRadius, nm::chipRadius);
    painter->setClipPath(clip, Qt::IntersectClip);
    painter->fillRect(area, theme.node);
    const auto cell = double(nm::chipGap) * 2;
    painter->fillRect(row.rect, theme.alphaBase);
    painter->save();
    painter->setClipRect(row.rect, Qt::IntersectClip);
    for (double y = row.rect.top(); y < row.rect.bottom(); y += cell) {
        for (double x = row.rect.left() + (int((y - row.rect.top()) / cell) % 2) * cell; x < row.rect.right(); x += 2 * cell) {
            painter->fillRect(QRectF(x, y, cell, cell), theme.alphaChecker);
        }
    }
    painter->restore();
    painter->setRenderHint(QPainter::SmoothPixmapTransform);
    if (row.media.size() > 1 && !row.media[1].image.isNull()) {
        painter->setOpacity(painter->opacity() * std::clamp(row.number, 0.0, 1.0));
        painter->drawImage(row.rect, row.media[1].image);
        painter->setOpacity(1);
    }
    // The mask keeps its own size from the canvas's top left.
    const auto scale = row.minimum > 0 ? row.rect.width() / row.minimum : 1.0;
    if (!row.media.isEmpty() && !row.media[0].image.isNull()) {
        const auto &mask = row.media[0].image;
        painter->drawImage(QRectF(row.rect.topLeft(), QSizeF(mask.size()) * scale), mask);
    }
    if (draft && !draft->isNull()) {
        painter->setOpacity(std::clamp(row.optionValues.value(0, 1).toDouble(), 0.0, 1.0));
        painter->drawImage(QRectF(row.rect.topLeft(), QSizeF(draft->size()) * scale), *draft);
    }
    // .brush-cursor: the brush size in canvas pixels, a white circle outlined in black.
    if (cursor && row.rect.contains(*cursor)) {
        painter->setOpacity(1);
        painter->setRenderHint(QPainter::Antialiasing);
        painter->setBrush(Qt::NoBrush);
        const auto radius = std::max(2.0, row.step * scale) / 2;
        painter->setPen(QPen(Qt::black, 1));
        painter->drawEllipse(*cursor, radius + 1, radius + 1);
        painter->setPen(QPen(Qt::white, 1));
        painter->drawEllipse(*cursor, radius, radius);
    }
    painter->restore();
}

// ImageComparer: the checker, B contain-fit, A clipped before the divider,
// the white divider, the scrim labels and each image's size.
void paintCompare(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    const auto area = row.rect;
    painter->save();
    QPainterPath clip;
    clip.addRoundedRect(area, nm::chipRadius, nm::chipRadius);
    painter->setClipPath(clip, Qt::IntersectClip);
    painter->fillRect(area, theme.alphaBase);
    const auto cell = double(nm::chipGap) * 2;
    for (double y = area.top(); y < area.bottom(); y += cell) {
        for (double x = area.left() + (int((y - area.top()) / cell) % 2) * cell; x < area.right(); x += 2 * cell) {
            painter->fillRect(QRectF(x, y, cell, cell), theme.alphaChecker);
        }
    }
    painter->setRenderHint(QPainter::SmoothPixmapTransform);
    const auto fitted = [&area](const CardMediaItem &item) {
        const QSizeF natural = item.natural.isValid() ? QSizeF(item.natural) : QSizeF(item.image.size());
        const auto size = natural.scaled(area.size(), Qt::KeepAspectRatio);
        return QRectF(area.center() - QPointF(size.width() / 2, size.height() / 2), size);
    };
    const auto vertical = row.checked;
    const auto position = std::clamp(row.number, 0.0, 1.0);
    if (row.media.size() > 1) { painter->drawImage(fitted(row.media[1]), row.media[1].image); }
    // clipPathA: inset(0 (100 - position)% 0 0), or from the bottom when vertical.
    const auto split = vertical ? QRectF(area.left(), area.top(), area.width(), area.height() * position)
                                : QRectF(area.left(), area.top(), area.width() * position, area.height());
    if (!row.media.isEmpty()) {
        painter->save();
        painter->setClipRect(split, Qt::IntersectClip);
        painter->drawImage(fitted(row.media[0]), row.media[0].image);
        painter->restore();
    }
    // .divider-line: 2 px of common.white.
    painter->setPen(Qt::NoPen);
    painter->setBrush(Qt::white);
    painter->drawRect(vertical ? QRectF(area.left(), split.bottom() - 1, area.width(), 2) : QRectF(split.right() - 1, area.top(), 2, area.height()));
    // .label: 8 px in, scrim fill, semibold white text. B is top right, or bottom left when vertical.
    const auto labelFont = sans(theme, nm::fontValue - 1, QFont::DemiBold);
    const QFontMetricsF metrics(labelFont);
    const auto pill = [&](const QString &text, const QFont &font, double width, const QPointF &corner, Qt::Alignment from) {
        const QSizeF size(width + 2 * nm::chipGap, card_media::badgeHeight);
        const auto x = from & Qt::AlignRight ? corner.x() - size.width() : corner.x();
        const auto y = from & Qt::AlignBottom ? corner.y() - size.height() : corner.y();
        const QRectF badge(QPointF(x, y), size);
        painter->setPen(Qt::NoPen);
        painter->setBrush(theme.mediaScrim);
        painter->drawRoundedRect(badge, nm::fieldRadius, nm::fieldRadius);
        painter->setFont(font);
        painter->setPen(Qt::white);
        painter->drawText(badge, Qt::AlignCenter, text);
    };
    const auto inset = 8.0;
    const auto labelA = row.options.value(0), labelB = row.options.value(1);
    pill(labelA, labelFont, metrics.horizontalAdvance(labelA), area.topLeft() + QPointF(inset, inset), Qt::AlignLeft | Qt::AlignTop);
    if (vertical) {
        pill(labelB, labelFont, metrics.horizontalAdvance(labelB), area.bottomLeft() + QPointF(inset, -inset), Qt::AlignLeft | Qt::AlignBottom);
    } else {
        pill(labelB, labelFont, metrics.horizontalAdvance(labelB), area.topRight() + QPointF(-inset, inset), Qt::AlignRight | Qt::AlignTop);
    }
    // .metadata: the natural size, bottom left for A and 56 px from the right for B
    // (top left 32 px down and bottom left 32 px up when vertical).
    const auto metaFont = sans(theme, nm::fontValue - 1);
    const QFontMetricsF metaMetrics(metaFont);
    const auto sizeText = [](const CardMediaItem &item) {
        return item.natural.isValid() ? QStringLiteral("%1 × %2").arg(item.natural.width()).arg(item.natural.height()) : QString();
    };
    for (int i = 0; i < std::min<qsizetype>(2, row.media.size()); ++i) {
        const auto text = sizeText(row.media[i]);
        if (text.isEmpty()) { continue; }
        QPointF corner;
        Qt::Alignment from;
        if (!vertical) {
            corner = i == 0 ? area.bottomLeft() + QPointF(inset, -inset) : area.bottomRight() + QPointF(-56, -inset);
            from = i == 0 ? (Qt::AlignLeft | Qt::AlignBottom) : (Qt::AlignRight | Qt::AlignBottom);
        } else {
            corner = i == 0 ? area.topLeft() + QPointF(inset, 32) : area.bottomLeft() + QPointF(inset, -32);
            from = i == 0 ? (Qt::AlignLeft | Qt::AlignTop) : (Qt::AlignLeft | Qt::AlignBottom);
        }
        pill(text, metaFont, metaMetrics.horizontalAdvance(text), corner, from);
    }
    painter->restore();
}

// LevelsBody's histogram panel: background.default behind bars in HIST_COLORS.
void paintHistogram(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    const auto area = row.parts.value(0, row.rect);
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.canvas);
    painter->drawRoundedRect(area, nm::chipRadius, nm::chipRadius);
    if (row.optionValues.size() != 256) {
        return;
    }
    static const QHash<QString, QColor> colors{{QStringLiteral("r"), QColor(244, 67, 54, 217)},
                                               {QStringLiteral("g"), QColor(76, 175, 80, 217)},
                                               {QStringLiteral("b"), QColor(33, 150, 243, 217)},
                                               {QStringLiteral("luminance"), QColor(255, 255, 255, 217)}};
    painter->setBrush(colors.value(row.value, colors.value(QStringLiteral("luminance"))));
    const auto bin = row.rect.width() / 256;
    for (int i = 0; i < 256; ++i) {
        const auto height = row.optionValues[i].toDouble() * row.rect.height();
        if (height > 0) {
            painter->drawRect(QRectF(row.rect.x() + i * bin, row.rect.bottom() - height, std::max(1.0, bin), height));
        }
    }
}

// RunModelButton: dark ink on the primary fill with a play icon, and a darker
// fill with light ink while the node runs.
void paintRunButton(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, bool running) {
    painter->setPen(Qt::NoPen);
    painter->setBrush(running ? theme.primary.darker(130) : theme.primary);
    painter->drawRoundedRect(row.rect, nm::chipRadius, nm::chipRadius);
    const auto ink = running ? theme.textPrimary : QColor(Qt::black);
    painter->setFont(sans(theme, nm::fontValue, QFont::Medium));
    const auto labelWidth = painter->fontMetrics().horizontalAdvance(row.label);
    const auto content = std::min(row.rect.width() - 2 * nm::runButtonPadding, nm::iconSize + nm::runButtonGap + double(labelWidth));
    const auto left = row.rect.center().x() - content / 2;
    paintMaterialIcon(painter, QStringLiteral("playArrow"), QRectF(left, row.rect.center().y() - nm::iconSize / 2.0, nm::iconSize, nm::iconSize), ink);
    painter->setPen(ink);
    const QRectF text(left + nm::iconSize + nm::runButtonGap, row.rect.y(), content - nm::iconSize - nm::runButtonGap, row.rect.height());
    painter->drawText(text, Qt::AlignLeft | Qt::AlignVCenter, painter->fontMetrics().elidedText(row.label, Qt::ElideRight, int(text.width())));
}
} // namespace

namespace {
// A body header: a 12 px icon, the title and an accent such as the collection's
// type. A placeholder is the list's centered empty state instead.
void paintBodyCaption(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    painter->setFont(sans(theme, nm::fontValue));
    if (row.placeholder) {
        painter->setPen(faded(theme.textSecondary, 0.7));
        painter->drawText(row.rect, Qt::AlignCenter | Qt::TextWordWrap, row.label);
        return;
    }
    constexpr double icon = 12;
    auto x = row.rect.x();
    if (!row.icon.isEmpty()) {
        paintMaterialIcon(painter, row.icon, QRectF(x, row.rect.center().y() - icon / 2, icon, icon), theme.textSecondary);
        x += icon + nm::chipGap + nm::micro;
    }
    painter->setPen(theme.textSecondary);
    const auto width = painter->fontMetrics().horizontalAdvance(row.label);
    painter->drawText(QRectF(x, row.rect.y(), width + 1, row.rect.height()), Qt::AlignLeft | Qt::AlignVCenter, row.label);
    x += width + nm::chipGap + nm::micro;
    if (!row.typeName.isEmpty()) {
        painter->setPen(theme.primary);
        painter->drawText(QRectF(x, row.rect.y(), row.rect.right() - x, row.rect.height()), Qt::AlignLeft | Qt::AlignVCenter, row.typeName);
    }
    // A running list shows a quarter arc after its title, as the inline spinner.
    if (row.checked) {
        const QRectF spinner(x, row.rect.center().y() - icon / 2 + 1, icon - 2, icon - 2);
        painter->setPen(QPen(theme.textSecondary, 1.5));
        painter->setBrush(Qt::NoBrush);
        painter->drawArc(spinner, 90 * 16, -270 * 16);
    }
}

// A List Generator row: the index badge, the item's first line, the chevron, and
// the full text below once the row is open. Rows are divided by a 1 px rule.
void paintListItem(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    if (row.parts.size() < 4) {
        return;
    }
    const auto &badge = row.parts[0];
    painter->setPen(Qt::NoPen);
    painter->setBrush(faded(theme.primary, 0.18));
    painter->drawRoundedRect(badge, badge.height() / 2, badge.height() / 2);
    painter->setPen(theme.primary);
    painter->setFont(sans(theme, nm::fontValue, QFont::DemiBold));
    painter->drawText(badge, Qt::AlignCenter, QString::number(row.selected + 1));
    painter->setPen(theme.textPrimary);
    painter->setFont(sans(theme, nm::fontLabel));
    painter->drawText(row.parts[1], Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(row.label, Qt::ElideRight, int(row.parts[1].width())));
    const auto &chevron = row.parts[2];
    painter->save();
    painter->translate(chevron.center());
    painter->rotate(row.checked ? 90 : 0);
    paintMaterialIcon(painter, QStringLiteral("chevronRight"), QRectF(-chevron.width() / 2, -chevron.height() / 2, chevron.width(), chevron.height()),
                      theme.textSecondary);
    painter->restore();
    if (row.checked) {
        painter->save();
        painter->setClipRect(row.parts[3]);
        painter->drawText(row.parts[3], Qt::AlignLeft | Qt::AlignTop | Qt::TextWordWrap, row.value);
        painter->restore();
    }
    if (!row.bare) {
        painter->setPen(QPen(theme.divider, nm::borderWidth));
        painter->drawLine(QPointF(row.rect.left(), row.rect.bottom() + 0.5), QPointF(row.rect.right(), row.rect.bottom() + 0.5));
    }
}

// A Collection tile: the image thumbnail cropped to the square, or the item's
// kind or name, with its 1-based index in the top left corner.
void paintCollectionTile(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    QPainterPath tile;
    tile.addRoundedRect(row.rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::chipRadius, nm::chipRadius);
    painter->setPen(QPen(theme.divider, nm::borderWidth));
    painter->setBrush(theme.canvas);
    painter->drawPath(tile);
    const auto inside = row.rect.adjusted(nm::borderWidth, nm::borderWidth, -nm::borderWidth, -nm::borderWidth);
    const bool image = !row.media.isEmpty() && row.media.first().state == CardMediaState::Ready && !row.media.first().image.isNull();
    if (image) {
        const auto &source = row.media.first().image;
        const auto crop = inside.size().scaled(QSizeF(source.size()), Qt::KeepAspectRatio);
        QRectF part(QPointF(), crop);
        part.moveCenter(QRectF(QPointF(), QSizeF(source.size())).center());
        painter->save();
        painter->setClipPath(tile);
        painter->setRenderHint(QPainter::SmoothPixmapTransform);
        painter->drawImage(inside, source, part);
        painter->restore();
    } else if (row.typeName == QStringLiteral("video") || row.typeName == QStringLiteral("audio")) {
        const auto icon = row.typeName == QStringLiteral("video") ? QStringLiteral("movie") : QStringLiteral("equalizer");
        paintMaterialIcon(painter, icon, QRectF(inside.center().x() - nm::iconSize / 2.0, inside.center().y() - nm::iconSize / 2.0, nm::iconSize, nm::iconSize),
                          theme.textSecondary);
    } else {
        painter->setPen(faded(theme.textSecondary, 0.7));
        painter->setFont(sans(theme, nm::fontValue));
        painter->drawText(inside.adjusted(nm::chipGap, nm::chipGap, -nm::chipGap, -nm::chipGap), Qt::AlignCenter | Qt::TextWrapAnywhere, row.label);
    }
    const auto number = QString::number(row.selected + 1);
    const auto font = sans(theme, nm::fontValue);
    const auto width = std::max(double(nm::iconSize), QFontMetricsF(font).horizontalAdvance(number) + 2 * nm::chipGap);
    const QRectF badge(row.rect.x() + nm::micro, row.rect.y() + nm::micro, width, nm::iconSize);
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.mediaScrim);
    painter->drawRoundedRect(badge, badge.height() / 2, badge.height() / 2);
    painter->setPen(theme.mediaScrimInk);
    painter->setFont(font);
    painter->drawText(badge, Qt::AlignCenter, number);
}

// A tile's remove button shows while the pointer is over the card, on a scrim over the thumbnail.
void paintTileRemove(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.mediaScrim);
    painter->drawRoundedRect(row.rect, nm::chipRadius, nm::chipRadius);
    const double icon = nm::headerButtonIcon;
    paintMaterialIcon(painter, row.icon, QRectF(row.rect.center().x() - icon / 2, row.rect.center().y() - icon / 2, icon, icon), theme.mediaScrimInk);
}

// The Collection's empty grid: a dashed box with the drop prompt and its hint.
void paintCollectionZone(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
    if (!row.placeholder) {
        return;
    }
    painter->setPen(QPen(theme.divider, nm::borderWidth, Qt::DashLine));
    painter->setBrush(Qt::NoBrush);
    painter->drawRoundedRect(row.rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::chipRadius, nm::chipRadius);
    painter->setPen(faded(theme.textSecondary, 0.7));
    painter->setFont(sans(theme, nm::fontValue));
    const auto text = row.rect.adjusted(12, 12, -12, -12);
    const auto line = QFontMetricsF(painter->font()).height();
    painter->drawText(QRectF(text.x(), text.center().y() - line - nm::chipGap / 2.0, text.width(), line), Qt::AlignCenter, row.value);
    painter->drawText(QRectF(text.x(), text.center().y() + nm::chipGap / 2.0, text.width(), 3 * line), Qt::AlignHCenter | Qt::AlignTop | Qt::TextWordWrap,
                      row.options.value(0));
}
} // namespace

bool paintCardBodyRow(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row,
                      const CardBodyPaintState &state) {
    const auto inset = double(nm::borderWidth + nm::padding);
    switch (row.kind) {
    case NodeRowKind::Preview: {
        if (state.hasResult && !layout.resultRect.isEmpty()) {
            return true;
        }
        const auto rect = row.rect.isEmpty() ? QRectF(inset, row.y, layout.size.width() - 2 * inset, row.height) : row.rect;
        // ImagePreview shows the image arriving at the body before the node runs.
        if (!row.media.isEmpty() && row.media.first().state == CardMediaState::Ready && !row.media.first().image.isNull()) {
            fillField(painter, theme, rect);
            const auto &image = row.media.first().image;
            auto target = QRectF(QPointF(), QSizeF(image.size()).scaled(rect.size(), Qt::KeepAspectRatio));
            target.moveCenter(rect.center());
            painter->save();
            QPainterPath clip;
            clip.addRoundedRect(rect, nm::fieldRadius, nm::fieldRadius);
            painter->setClipPath(clip, Qt::IntersectClip);
            painter->setRenderHint(QPainter::SmoothPixmapTransform);
            painter->drawImage(target, image);
            painter->restore();
            return true;
        }
        auto area = rect;
        // A Preview body follows the card when it is resized.
        if (layout.body == CardBody::Preview) {
            area.setBottom(layout.size.height() - inset);
        }
        paintPlaceholder(painter, theme, area, row.icon.isEmpty() ? layout.icon : row.icon, row.value);
        return true;
    }
    case NodeRowKind::Overlay: {
        // CanvasResizeBody's and PasteBody's .overlay-rect: a 1 px dashed
        // primary edge over 12% primary, and MediaLabel in the bottom right.
        if (!row.rect.isEmpty()) {
            auto fill = theme.primary;
            fill.setAlphaF(0.12);
            painter->setPen(QPen(theme.primary, nm::borderWidth, Qt::DashLine));
            painter->setBrush(fill);
            painter->drawRect(row.rect.adjusted(0.5, 0.5, -0.5, -0.5));
        }
        if (!row.value.isEmpty() && !row.parts.isEmpty()) {
            const auto badgeFont = mono(theme, nm::fontValue - 1);
            const auto width = QFontMetricsF(badgeFont).horizontalAdvance(row.value) + 2 * nm::padding;
            const auto area = row.parts.first();
            const QRectF badge(area.right() - nm::micro * 2 - width, area.bottom() - nm::micro * 2 - card_media::badgeHeight, width,
                               card_media::badgeHeight);
            painter->setPen(Qt::NoPen);
            painter->setBrush(theme.mediaScrim);
            painter->drawRoundedRect(badge, nm::micro, nm::micro);
            painter->setFont(badgeFont);
            painter->setPen(theme.mediaScrimInk);
            painter->drawText(badge, Qt::AlignCenter, row.value);
        }
        return true;
    }
    case NodeRowKind::Crop: {
        const auto crop = state.cropDraft.value_or(cropEdges(row));
        const auto card = cropOnCard(row, crop);
        if (card.isEmpty()) {
            return true;
        }
        painter->save();
        // .darken: the scrim outside the crop, even-odd over the image.
        QPainterPath outside;
        outside.addRect(row.rect);
        outside.addRect(card);
        outside.setFillRule(Qt::OddEvenFill);
        painter->fillPath(outside, theme.mediaScrim);
        // .grid-line: rule-of-thirds lines inside the crop.
        painter->setPen(QPen(QColor(255, 255, 255, 115), 0.5));
        for (const auto third : {1.0 / 3, 2.0 / 3}) {
            painter->drawLine(QPointF(card.left() + card.width() * third, card.top()), QPointF(card.left() + card.width() * third, card.bottom()));
            painter->drawLine(QPointF(card.left(), card.top() + card.height() * third), QPointF(card.right(), card.top() + card.height() * third));
        }
        // .crop-rect and .handle in secondary.main, the handles ringed in white.
        painter->setRenderHint(QPainter::Antialiasing);
        painter->setPen(QPen(theme.progress, 1.5));
        painter->setBrush(Qt::NoBrush);
        painter->drawRect(card);
        const auto radius = cropHandleRadius(row);
        painter->setPen(QPen(Qt::white, 1));
        painter->setBrush(theme.progress);
        const auto mid = card.center();
        for (const auto &point : {card.topLeft(), QPointF(mid.x(), card.top()), card.topRight(), QPointF(card.right(), mid.y()),
                                  card.bottomRight(), QPointF(mid.x(), card.bottom()), card.bottomLeft(), QPointF(card.left(), mid.y())}) {
            painter->drawEllipse(point, radius, radius);
        }
        // .dim-badge: the crop size in the preview's top left corner.
        if (!row.parts.isEmpty()) {
            const auto text = QStringLiteral("%1 × %2 px").arg(crop.width()).arg(crop.height());
            const auto badgeFont = mono(theme, nm::fontValue - 1);
            const auto width = QFontMetricsF(badgeFont).horizontalAdvance(text) + 2 * nm::chipGap;
            const QRectF badge(row.parts.first().x() + nm::micro, row.parts.first().y() + nm::micro, width, card_media::badgeHeight);
            painter->setPen(Qt::NoPen);
            painter->setBrush(theme.mediaScrim);
            painter->drawRoundedRect(badge, nm::fieldRadius, nm::fieldRadius);
            painter->setFont(badgeFont);
            painter->setPen(Qt::white);
            painter->drawText(badge, Qt::AlignCenter, text);
        }
        painter->restore();
        return true;
    }
    case NodeRowKind::Composer:
        paintComposer(painter, theme, row);
        return true;
    case NodeRowKind::Action:
        if (row.action == QStringLiteral("removeCollectionItem")) {
            if (state.hovered) {
                paintTileRemove(painter, theme, row);
            }
            return true;
        }
        if (row.action == QStringLiteral("runNode")) {
            paintRunButton(painter, theme, row, state.running);
        } else {
            paintAction(painter, theme, row);
        }
        return true;
    case NodeRowKind::Paint:
        paintPaintCanvas(painter, theme, row, state.paintDraft, state.brushCursor);
        return true;
    case NodeRowKind::Compare:
        paintCompare(painter, theme, row);
        return true;
    case NodeRowKind::Histogram:
        paintHistogram(painter, theme, row);
        return true;
    case NodeRowKind::BodyCaption:
        paintBodyCaption(painter, theme, row);
        return true;
    case NodeRowKind::ListItem:
        paintListItem(painter, theme, row);
        return true;
    case NodeRowKind::CollectionTile:
        paintCollectionTile(painter, theme, row);
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
    case NodeRowKind::ImageSize:
        paintImageSize(painter, theme, row);
        return true;
    case NodeRowKind::DropZone:
        if (layout.body == CardBody::Collection) {
            paintCollectionZone(painter, theme, row);
        } else if (row.mediaKind.isEmpty()) {
            paintDropZone(painter, theme, row);
        } else {
            paintCardMedia(painter, theme, row, state.hovered);
        }
        return true;
    case NodeRowKind::Swatch:
        paintSwatch(painter, theme, row);
        return true;
    case NodeRowKind::Label: {
        if (row.rect.isEmpty()) {
            return false;
        }
        if (row.warning) {
            auto fill = theme.warning;
            fill.setAlphaF(nm::activeFillOpacity);
            painter->fillRect(row.rect, fill);
            painter->setPen(theme.warning);
            auto font = sans(theme, nm::fontValue);
            font.setCapitalization(QFont::AllUppercase);
            painter->setFont(font);
            painter->drawText(row.rect, Qt::AlignCenter, painter->fontMetrics().elidedText(row.label, Qt::ElideRight, int(row.rect.width())));
            return true;
        }
        auto text = row.rect;
        // A footer strip has a rule along its top and pads its caption.
        if (row.checked) {
            painter->setPen(QPen(theme.divider, nm::borderWidth));
            painter->drawLine(QPointF(row.rect.left(), row.rect.top() + nm::outlineInset), QPointF(row.rect.right(), row.rect.top() + nm::outlineInset));
            text.adjust(2 * nm::schemaFooterPadding, nm::borderWidth + nm::schemaFooterPadding, -2 * nm::schemaFooterPadding, -nm::schemaFooterPadding);
        }
        // A placeholder hint is drawn at the muted opacity, as the dynamic schema hint's opacity.
        painter->setPen(row.placeholder ? faded(theme.textSecondary, nm::mutedOpacity) : theme.textSecondary);
        painter->setFont(sans(theme, row.textSize > 0 ? row.textSize : nm::fontValue));
        painter->drawText(text, row.wrap ? Qt::AlignLeft | Qt::AlignTop | Qt::TextWordWrap : Qt::AlignLeft | Qt::AlignVCenter,
                          row.checked ? painter->fontMetrics().elidedText(row.label, Qt::ElideRight, int(text.width())) : row.label);
        return true;
    }
    case NodeRowKind::Multiline:
        if (row.rect.isEmpty() || row.code) {
            return false;
        }
        paintTextArea(painter, theme, row);
        return true;
    case NodeRowKind::Field:
        if (row.rect.isEmpty()) {
            return false;
        }
        paintField(painter, theme, layout, row);
        return true;
    default:
        return paintSynthRow(painter, theme, layout, row, state);
    }
}
} // namespace nodetool
