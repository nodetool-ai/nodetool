#include "CardBodyPainter.h"
#include "CardBodies.h"
#include "CardControls.h"
#include "CardMedia.h"
#include "SynthModules.h"
#include <QPainter>

namespace nodetool {
namespace nm = node_metrics;
using namespace card_controls;

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
    case NodeRowKind::ImageSize:
        paintImageSize(painter, theme, row);
        return true;
    case NodeRowKind::DropZone:
        if (row.mediaKind.isEmpty()) {
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
        if (row.rect.isEmpty()) {
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
