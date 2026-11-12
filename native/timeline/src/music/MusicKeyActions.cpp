// The Range tool's key action (docs/MUSIC-MODE.md MD11). The key comes from
// the keyboard preset (KeymapOverlay.h), and the shortcut sheet lists it
// under Tools. Compiled into the QML module, so every editor host has it.

#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"

namespace {
const bool rangeTool = nt::wiring::registerKeyAction({QStringLiteral("rangeTool"),
    QStringLiteral("Range tool (choose bars on a track to generate)"), {},
    [](ClipGestureController& gestures, const QVariantMap&) {
        gestures.setActiveTool(QStringLiteral("range"));
        return true;
    },
    QStringLiteral("Tools")});
} // namespace
