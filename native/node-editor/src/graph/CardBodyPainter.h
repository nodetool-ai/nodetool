#pragma once
#include "EditorScene.h"
#include "NodeLayout.h"
#include <optional>
class QPainter;

namespace nodetool {
// Per-paint state of a card body that the layout does not hold.
struct CardBodyPaintState {
    // A run result replaces the body's empty state.
    bool hasResult = false;
    // The node is running, so its Run button shows the running state.
    bool running = false;
    // The slider value under an active drag, before it is committed.
    QString draftProperty;
    double draftValue = 0;
    // The crop under an active drag, in image pixels, before it is committed.
    std::optional<QRectF> cropDraft;
    // The pointer is over the card, which shows media badges and actions.
    bool hovered = false;
};

// Paints the header type icon the web draws, or the shared Material path.
void paintCardIcon(QPainter *painter, const QString &typeIcon, const QString &fallback, const QRectF &rect, const QColor &color);
void paintMaterialIcon(QPainter *painter, const QString &name, const QRectF &rect, const QColor &color);

// Paints a bespoke row, a placeholder, a model chip or a drop zone. Returns false
// for the generic row kinds, which the node painter draws.
bool paintCardBodyRow(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row,
                      const CardBodyPaintState &state);
} // namespace nodetool
