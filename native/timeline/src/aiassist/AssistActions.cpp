#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineModel.h"
#include "wiring/KeyActions.h"
namespace {
const bool registered = [] {
    nt::app::registerMenuItem({"ruler", "assist.removeFillers", "Remove filler words", {},
        [](const QVariantMap&) { return true; }});
    nt::wiring::registerKeyAction({"assist.removeFillers", "Remove filler words", {},
        [](ClipGestureController& gestures, const QVariantMap&) {
            return gestures.timeline() && gestures.timeline()->applyEdit("assist.removeFillers", {}) != 0;
        }});
    return true;
}();
}
