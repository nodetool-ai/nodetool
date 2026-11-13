#pragma once
#include "EditorScene.h"
#include "CardControls.h"
#include "NodeLayout.h"
class QPainter;

namespace nodetool {
// Per-paint state of a card body that the layout does not hold.
struct CardBodyPaintState {
    // A run result replaces the body's empty state.
    bool hasResult = false;
    // The slider value under an active drag, before it is committed.
    QString draftProperty;
    double draftValue = 0;
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
