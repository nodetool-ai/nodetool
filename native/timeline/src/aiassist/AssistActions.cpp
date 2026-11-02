#include "aiassist/AssistDocument.h"
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineModel.h"
#include "wiring/KeyActions.h"
namespace {
// Whether the edit would change anything. It runs only when a menu opens.
bool hasFillers(const QVariantMap& context) {
    auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
    if (!gestures || !gestures->timeline()) { return false; }
    const auto& raw = gestures->timeline()->timeline().raw;
    return nt::aiassist::removeFillers(raw, {}) != raw;
}
const bool registered = [] {
    const QString noFillers = QStringLiteral("No filler words in the captions.");
    nt::app::registerMenuItem({"ruler", "assist.removeFillers", "Remove filler words", {}, {}, {}, 0, {}, {}, {}, hasFillers});
    nt::app::registerShellMenuItem({"Sequence", "assist.removeFillers", "Remove Filler Words", {}, {}, "assist", 35, hasFillers, {}, {}, noFillers});
    nt::wiring::registerKeyAction({"assist.removeFillers", "Remove filler words", {},
        [](ClipGestureController& gestures, const QVariantMap&) {
            return gestures.timeline() && gestures.timeline()->applyEdit("assist.removeFillers", {}) != 0;
        }});
    return true;
}();
}
