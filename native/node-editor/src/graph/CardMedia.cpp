#include "CardMedia.h"
#include "CardBodyPainter.h"
#include "EditorScene.h"
#include <QCoreApplication>
#include <QPainter>
#include <QPainterPath>
#include <QSet>
#include <QUrl>
#include <algorithm>
#include <cmath>

namespace nodetool {
namespace {
namespace nm = node_metrics;
namespace cm = card_media;

QString tr(const char *text) { return QCoreApplication::translate("CardMedia", text); }

QFont font(const QString &family, int pixels) {
    QFont result(family);
    result.setPixelSize(pixels);
    result.setHintingPreference(QFont::PreferNoHinting);
    return result;
}

// The web's centered uppercase drop zone lines: the mono caption with 1 px tracking.
QFont promptFont(const CanvasTheme &theme) {
    auto result = font(theme.monoFamily, nm::fontValue - nm::micro);
    result.setLetterSpacing(QFont::AbsoluteSpacing, nm::micro);
    return result;
}

QSize naturalOr(const QSize &natural, double aspect) {
    return natural.width() > 0 && natural.height() > 0 ? natural : QSize(1000, int(std::lround(1000 * aspect)));
}

double aspectOf(const QSize &size) { return double(size.height()) / size.width(); }

void paintPrompt(QPainter *painter, const CanvasTheme &theme, const QRectF &rect, const QString &text, bool dashed) {
    if (dashed) {
        painter->setPen(QPen(theme.divider, nm::borderWidth, Qt::DashLine));
        painter->setBrush(theme.field);
        painter->drawRoundedRect(rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::fieldRadius, nm::fieldRadius);
    }
    painter->setFont(promptFont(theme));
    painter->setPen(theme.textSecondary);
    painter->drawText(rect, Qt::AlignCenter, painter->fontMetrics().elidedText(text, Qt::ElideMiddle, int(rect.width() - 2 * nm::padding)));
}

// alphaSurfaceBg: a 12 px checkerboard of two fixed dark tones behind an image.
void paintAlphaSurface(QPainter *painter, const CanvasTheme &theme, const QRectF &rect) {
    painter->fillRect(rect, theme.alphaBase);
    constexpr double cell = 6;
    for (int y = 0; y * cell < rect.height(); ++y) {
        for (int x = y % 2; x * cell < rect.width(); x += 2) {
            painter->fillRect(QRectF(rect.x() + x * cell, rect.y() + y * cell, cell, cell).intersected(rect), theme.alphaChecker);
        }
    }
}

void drawContained(QPainter *painter, const QImage &image, const QRectF &rect) {
    auto target = QRectF(QPointF(), QSizeF(image.size()).scaled(rect.size(), Qt::KeepAspectRatio));
    target.moveCenter(rect.center());
    painter->drawImage(target, image);
}

void drawCovered(QPainter *painter, const QImage &image, const QRectF &rect) {
    const auto scaled = QSizeF(rect.size()).scaled(QSizeF(image.size()), Qt::KeepAspectRatio);
    QRectF source(QPointF(), scaled);
    source.moveCenter(QRectF(QPointF(), QSizeF(image.size())).center());
    painter->drawImage(rect, image, source);
}

void paintBadge(QPainter *painter, const CanvasTheme &theme, const QRectF &surface, const QString &text) {
    const auto badgeFont = font(theme.monoFamily, nm::fontValue - 1);
    const auto width = QFontMetricsF(badgeFont).horizontalAdvance(text) + 2 * nm::padding;
    const QRectF badge(surface.center().x() - width / 2, surface.bottom() - cm::badgeInset - cm::badgeHeight, width, cm::badgeHeight);
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.mediaScrim);
    painter->drawRoundedRect(badge, nm::micro, nm::micro);
    painter->setFont(badgeFont);
    painter->setPen(theme.mediaScrimInk);
    painter->drawText(badge, Qt::AlignCenter, text);
}

// Copy and Replace in the zone's top right corner, 4 px apart.
QRectF actionRect(const QRectF &zone, int index) {
    return QRectF(zone.right() - cm::badgeInset - (index + 1) * cm::actionSize - index * cm::badgeInset, zone.top() + cm::badgeInset,
                  cm::actionSize, cm::actionSize);
}

void paintActions(QPainter *painter, const CanvasTheme &theme, const QRectF &zone) {
    for (const auto &[icon, index] : {std::pair{QStringLiteral("contentCopy"), 1}, std::pair{QStringLiteral("folderOpen"), 0}}) {
        const auto button = actionRect(zone, index);
        painter->setPen(Qt::NoPen);
        painter->setBrush(theme.mediaScrim);
        painter->drawRoundedRect(button, nm::fieldRadius, nm::fieldRadius);
        paintMaterialIcon(painter, icon, QRectF(button.center().x() - nm::iconSize / 2.0, button.center().y() - nm::iconSize / 2.0, nm::iconSize, nm::iconSize),
                          theme.mediaScrimInk);
    }
}

// A player's place while its overlay is not shown: a dark frame with a play mark.
void paintPlayerPlace(QPainter *painter, const CanvasTheme &theme, const QRectF &rect, double radius) {
    painter->setPen(Qt::NoPen);
    painter->setBrush(theme.mediaScrim);
    painter->drawRoundedRect(rect, radius, radius);
    paintMaterialIcon(painter, QStringLiteral("playArrow"), QRectF(rect.center().x() - nm::iconSize / 2.0, rect.center().y() - nm::iconSize / 2.0, nm::iconSize, nm::iconSize),
                      theme.mediaScrimInk);
}

QString filename(const QVariant &locator) {
    const auto map = locator.toMap();
    const auto name = QUrl(map.value("uri").toString()).fileName();
    return name.isEmpty() ? map.value("asset_id").toString() : name;
}
} // namespace

QString CardMediaStore::key(const QString &node, const QString &property, int index) {
    return node + QLatin1Char('\n') + property + QLatin1Char('\n') + QString::number(index);
}

CardMediaItem CardMediaStore::item(const QString &node, const QString &property, int index, const QString &identity) const {
    const auto found = items_.constFind(key(node, property, index));
    if (found == items_.cend() || found->identity != identity) {
        CardMediaItem fresh;
        fresh.identity = identity;
        return fresh;
    }
    return *found;
}

void CardMediaStore::set(const QString &node, const QString &property, int index, const CardMediaItem &item) {
    items_.insert(key(node, property, index), item);
}

void CardMediaStore::retain(const QSet<QString> &nodes) {
    items_.removeIf([&nodes](const auto &entry) { return !nodes.contains(entry.key().section(QLatin1Char('\n'), 0, 0)); });
}

QString cardMediaIdentity(const QVariant &locator) {
    const auto map = locator.toMap();
    const auto asset = map.value("asset_id").toString();
    return asset.isEmpty() ? map.value("uri").toString() : QStringLiteral("asset:") + asset;
}

bool cardMediaBare(const QString &nodeType) {
    return nodeType == QLatin1String("nodetool.constant.Image") || nodeType == QLatin1String("nodetool.constant.Video")
           || nodeType == QLatin1String("nodetool.constant.Audio");
}

bool cardMediaFills(const QString &nodeType) {
    return nodeType == QLatin1String("nodetool.constant.Image") || nodeType == QLatin1String("nodetool.constant.Video");
}

double layoutCardMedia(NodeRow &row, const CardMediaField &field, double top, double inset, double cardWidth, const CardMediaStore &store) {
    const auto width = cardWidth - 2 * inset;
    const auto kind = field.mediaType;
    if (kind != QLatin1String("image") && kind != QLatin1String("video") && kind != QLatin1String("audio")) {
        if (field.list) {
            return top;
        }
        // A generic asset keeps the drop zone with its file name.
        const auto reference = field.value.toMap();
        row.kind = NodeRowKind::DropZone;
        row.typeName = kind;
        row.icon = QStringLiteral("image");
        row.placeholder = cardMediaIdentity(reference).isEmpty();
        row.value = row.placeholder ? tr("Click or drop %1").arg(kind.isEmpty() ? tr("file") : kind).toUpper() : filename(reference);
        row.rect = QRectF(inset, top + nm::dropZoneGap, width, nm::dropZoneHeight);
        row.fieldY = row.rect.y();
        row.height = row.rect.height();
        return row.rect.bottom() + nm::inlineRowGap;
    }
    row.kind = NodeRowKind::DropZone;
    row.typeName = kind;
    row.mediaKind = kind;
    row.mediaList = field.list;
    row.icon = kind == "audio" ? "equalizer" : kind == "video" ? "movie" : "image";
    QVariantList values = field.list ? field.value.toList() : QVariantList{field.value};
    for (int index = 0; index < values.size(); ++index) {
        const auto identity = cardMediaIdentity(values[index]);
        if (identity.isEmpty()) {
            values.removeAt(index--);
            continue;
        }
        auto item = store.item(field.node, field.property, int(row.media.size()), identity);
        item.locator = values[index];
        row.media.append(item);
    }
    if (field.list) {
        // ImageListProperty.tsx: a grid 8 px below the label, then the list's own drop zone.
        const auto minimum = kind == "video" ? cm::videoTileMinimum : cm::imageTileMinimum;
        const int columns = kind == "audio" ? 1 : std::max(1, int(std::floor((width + cm::listGap) / (minimum + cm::listGap))));
        const auto tileWidth = (width - (columns - 1) * cm::listGap) / columns;
        const auto tileHeight = kind == "audio" ? cm::audioItemHeight
                                : (kind == "video" ? tileWidth * cm::videoAspect : tileWidth) + cm::tileExtra;
        auto bottom = top;
        for (int index = 0; index < row.media.size(); ++index) {
            auto &item = row.media[index];
            item.rect = QRectF(inset + (index % columns) * (tileWidth + cm::listGap), top + cm::listGap + (index / columns) * (tileHeight + cm::listGap),
                               tileWidth, tileHeight);
            bottom = item.rect.bottom();
        }
        row.listZone = QRectF(inset, bottom + cm::zoneGap, width, cm::listZoneHeight);
        row.placeholder = row.media.isEmpty();
        row.value = (kind == "video" ? tr("Click or drop videos here") : kind == "audio" ? tr("Click or drop audio files here")
                                                                                       : tr("Click or drop images here")).toUpper();
        row.rect = row.listZone;
        row.fieldY = top;
        row.height = row.listZone.bottom() - top;
        return row.listZone.bottom() + cm::zoneBottom;
    }
    const bool fills = cardMediaFills(field.nodeType);
    const bool bare = row.bare;
    row.placeholder = row.media.isEmpty();
    // A filling constant sits flush under the header; other zones keep their margin.
    const auto zoneTop = fills ? top : top + cm::zoneGap;
    const auto finish = [&](const QRectF &zone, double gap) {
        row.rect = zone;
        row.fieldY = zone.y();
        row.height = zone.height();
        return zone.bottom() + gap;
    };
    const auto gap = fills ? double(nm::borderWidth) : cm::zoneBottom;
    if (row.placeholder) {
        row.value = (kind == "audio" && bare ? tr("Drop audio") : tr("Click or drop %1").arg(kind.isEmpty() ? tr("file") : kind)).toUpper();
        if (bare) {
            return finish(QRectF(inset, zoneTop, width, cm::messageHeight), gap);
        }
        // The input zone keeps the Image Input body's 46 px drop zone from W4.
        return finish(QRectF(inset, top + nm::dropZoneGap, width, nm::dropZoneHeight), nm::inlineRowGap);
    }
    auto &item = row.media.first();
    const auto padding = fills ? 0.0 : cm::zonePadding;
    const auto inner = width - 2 * padding;
    if (kind == "image") {
        double height = cm::messageHeight;
        if (item.state == CardMediaState::Ready && !item.image.isNull()) {
            const auto natural = naturalOr(item.natural, 1);
            height = fills ? width * aspectOf(natural) : std::min(cm::imageMaxHeight, inner * aspectOf(natural));
            row.value = QStringLiteral("%1×%2").arg(natural.width()).arg(natural.height());
        } else {
            row.value = item.state == CardMediaState::Failed ? tr("Image could not be loaded").toUpper() : QString{};
        }
        const QRectF zone(inset, zoneTop, width, height + 2 * padding);
        item.rect = zone.adjusted(padding, padding, -padding, -padding);
        return finish(zone, gap);
    }
    row.value = filename(item.locator);
    if (kind == "video") {
        const auto height = inner * aspectOf(naturalOr(item.natural, cm::videoAspect));
        const QRectF zone(inset, zoneTop, width, fills ? height : padding + height + cm::videoCaption);
        item.rect = QRectF(inset + padding, zoneTop + padding, inner, height);
        return finish(zone, gap);
    }
    const QRectF zone(inset, zoneTop, width, cm::audioZoneHeight);
    item.rect = zone.adjusted(cm::zonePadding, cm::zonePadding, -cm::zonePadding, -cm::zonePadding);
    return finish(zone, cm::zoneBottom);
}

QRectF cardMediaActionRect(const NodeRow &row, CardMediaAction action) {
    if (row.kind != NodeRowKind::DropZone || row.mediaList || row.mediaKind != QLatin1String("image") || row.media.isEmpty()
        || row.media.first().state != CardMediaState::Ready) {
        return {};
    }
    return actionRect(row.rect, action == CardMediaAction::Copy ? 1 : 0);
}

void stretchCardMedia(NodeLayout &layout, const QString &nodeType) {
    if (!cardMediaFills(nodeType)) {
        return;
    }
    const auto bottom = layout.size.height() - nm::padding - nm::borderWidth;
    for (auto &row : layout.rows) {
        if (row.kind != NodeRowKind::DropZone || row.media.isEmpty() || row.rect.bottom() >= bottom) {
            continue;
        }
        row.rect.setBottom(bottom);
        row.height = row.rect.height();
        row.media.first().rect.setBottom(bottom);
    }
}

void paintCardMedia(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, bool hovered) {
    painter->save();
    painter->setRenderHint(QPainter::SmoothPixmapTransform);
    if (!row.bare) {
        painter->setPen(theme.textSecondary);
        painter->setFont(font(theme.sansFamily, nm::fontLabel));
        painter->drawText(QRectF(row.rect.x(), row.y, row.rect.width(), nm::rowHeight), Qt::AlignLeft | Qt::AlignVCenter, row.label);
    }
    if (row.mediaList) {
        for (const auto &item : row.media) {
            QPainterPath tile;
            tile.addRoundedRect(item.rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::fieldRadius, nm::fieldRadius);
            painter->setPen(QPen(theme.divider, nm::borderWidth));
            // A video tile is dark under its player. Image and audio tiles take the field tint.
            painter->setBrush(row.mediaKind == "video" ? theme.mediaScrim : theme.field);
            painter->drawPath(tile);
            const auto inside = item.rect.adjusted(nm::borderWidth, nm::borderWidth, -nm::borderWidth, -nm::borderWidth);
            if (row.mediaKind == "image" && item.state == CardMediaState::Ready && !item.image.isNull()) {
                painter->save();
                painter->setClipPath(tile);
                drawCovered(painter, item.image, inside);
                painter->restore();
            } else if (row.mediaKind == "video") {
                paintMaterialIcon(painter, QStringLiteral("playArrow"), QRectF(inside.center().x() - nm::iconSize / 2.0, inside.center().y() - nm::iconSize / 2.0,
                                                                          nm::iconSize, nm::iconSize), theme.mediaScrimInk);
            }
        }
        paintPrompt(painter, theme, row.listZone, row.value, true);
        painter->restore();
        return;
    }
    if (row.placeholder) {
        paintPrompt(painter, theme, row.rect, row.value, true);
        painter->restore();
        return;
    }
    const auto &item = row.media.first();
    const bool fills = row.bare && row.mediaKind != "audio";
    if (!fills) {
        // .dropzone.dropped: a 1 px divider outline instead of the dashed surface.
        painter->setPen(QPen(theme.divider, nm::borderWidth));
        painter->setBrush(Qt::NoBrush);
        painter->drawRoundedRect(row.rect.adjusted(0.5, 0.5, -0.5, -0.5), nm::fieldRadius, nm::fieldRadius);
    }
    const auto radius = fills ? 0.0 : double(nm::chipRadius);
    if (row.mediaKind == "image") {
        if (item.state == CardMediaState::Ready || item.state == CardMediaState::Failed) {
            QPainterPath surface;
            surface.addRoundedRect(item.rect, radius, radius);
            painter->save();
            painter->setClipPath(surface);
            paintAlphaSurface(painter, theme, item.rect);
            if (item.state == CardMediaState::Ready) {
                drawContained(painter, item.image, item.rect);
            }
            painter->restore();
        }
        if (item.state == CardMediaState::Failed) {
            paintPrompt(painter, theme, item.rect, row.value, false);
        } else if (item.state == CardMediaState::Ready && hovered) {
            paintBadge(painter, theme, item.rect, row.value);
            paintActions(painter, theme, row.rect);
        }
    } else if (row.mediaKind == "video") {
        paintPlayerPlace(painter, theme, item.rect, radius);
    }
    painter->restore();
}
} // namespace nodetool
