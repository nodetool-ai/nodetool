#pragma once
#include "EditorScene.h"
#include "CardControls.h"
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
    // The stroke being drawn on a Painter card, at full alpha.
    const QImage *paintDraft = nullptr;
    // The card-local pointer over a Painter canvas, where the brush circle draws.
    std::optional<QPointF> brushCursor;
    // The slider value under an active drag, before it is committed.
    QString draftProperty;
    double draftValue = 0;
    // The crop under an active drag, in image pixels, before it is committed.
    std::optional<QRectF> cropDraft;
    // The pointer is over the card, which shows media badges and actions.
    bool hovered = false;
};

// Paints a bespoke row, a placeholder, a model chip or a drop zone by choosing
// the control from card_controls (CardControls.h) that its kind names. Returns
// false for the generic row kinds, which the node painter draws. Row layout
// stays with the body. The control set holds the painting.
// Thread affinity: UI thread only, like every painter that draws the scene.
bool paintCardBodyRow(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row,
                      const CardBodyPaintState &state);
} // namespace nodetool
