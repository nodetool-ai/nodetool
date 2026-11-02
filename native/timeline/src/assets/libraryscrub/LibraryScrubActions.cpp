// Shift+H and the View menu turn the Library hover scrub on and off (issue #7092). The shortcut also
// works while the pointer is over a tile, where LibraryScrub reads the key itself.
#include "LibraryScrub.h"
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"
#include <QQmlEngine>

namespace {
LibraryScrub* scrubOf(const QObject* anchor) {
    auto* engine = anchor ? qmlEngine(anchor) : nullptr;
    return engine ? engine->singletonInstance<LibraryScrub*>("NodeTool.Timeline", "LibraryScrub") : nullptr;
}
LibraryScrub* scrubOf(const QVariantMap& context) {
    return scrubOf(context.value("gestures").value<QObject*>());
}
const bool registered = [] {
    nt::wiring::registerKeyAction({"toggleLibraryScrub", "Scrub clips in the Library", {QKeySequence(Qt::SHIFT | Qt::Key_H)},
        [](ClipGestureController& gestures, const QVariantMap& context) {
            auto* scrub = scrubOf(&gestures);
            if (!scrub || context.value("autoRepeat").toBool()) { return false; }
            return scrub->toggle();
        }, "Library"});
    nt::app::registerShellMenuItem({"View", "toggleLibraryScrub", "Scrub Clips in the Library", {}, {}, "library", 100,
        [](const QVariantMap& context) { return scrubOf(context) != nullptr; },
        [](const QVariantMap& context) { auto* scrub = scrubOf(context); return scrub && scrub->enabled(); }, {},
        QStringLiteral("Open a timeline first.")});
    return true;
}();
}  // namespace
