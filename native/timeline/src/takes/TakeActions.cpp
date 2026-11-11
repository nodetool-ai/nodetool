// Keys and menus for take switching. The key table follows FilmCraft
// (https://github.com/storytold/filmcraft), crates/engine/src/multicam.rs, MIT. See licenses/FilmCraft-MIT.txt.
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "takes/TakeSwitcher.h"
#include "ui/MonitorViewRegistry.h"
#include "ui/MonitorViewState.h"
#include "wiring/KeyActions.h"

namespace {
const QString GROUP = QStringLiteral("Takes");
const QString VIEW_ID = QStringLiteral("takes");

ClipGestureController* gesturesIn(const QVariantMap& context) {
    return qobject_cast<ClipGestureController*>(context.value(QStringLiteral("gestures")).value<QObject*>());
}
TakeSwitcher* switcherOf(ClipGestureController& gestures) { return TakeSwitcher::forTimeline(gestures.timeline()); }
bool pressKey(ClipGestureController& gestures, const QVariantMap& context, int number, bool cut) {
    auto* switcher = switcherOf(gestures);
    return switcher && switcher->press(gestures, number, cut, context.value(QStringLiteral("autoRepeat")).toBool());
}

const bool registered = [] {
    nt::ui::registerMonitorView({VIEW_ID, QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/takes/TakeGridView.qml")), 20, GROUP});
    for (int number = 1; number <= 9; ++number) {
        const auto key = static_cast<Qt::Key>(Qt::Key_0 + number);
        nt::wiring::registerKeyAction({QStringLiteral("takeSwitch%1").arg(number), QStringLiteral("Switch to take %1").arg(number),
            {QKeySequence(key)}, [number](ClipGestureController& gestures, const QVariantMap& context) {
                return pressKey(gestures, context, number, false);
            }, GROUP});
        nt::wiring::registerKeyAction({QStringLiteral("takeCut%1").arg(number), QStringLiteral("Cut to take %1 at the playhead").arg(number),
            {QKeySequence(QKeyCombination(Qt::ControlModifier, key))}, [number](ClipGestureController& gestures, const QVariantMap& context) {
                return pressKey(gestures, context, number, true);
            }, GROUP});
    }
    nt::wiring::registerKeyAction({QStringLiteral("takeRecord"), QStringLiteral("Record take switches"),
        {QKeySequence(Qt::Key_0)}, [](ClipGestureController& gestures, const QVariantMap& context) {
            auto* switcher = switcherOf(gestures);
            if (!switcher) { return false; }
            if (!context.value(QStringLiteral("autoRepeat")).toBool()) { switcher->toggleRecording(gestures); }
            return true;
        }, GROUP});
    nt::wiring::registerKeyAction({QStringLiteral("takeGrid"), QStringLiteral("Show takes in the Program monitor"), {},
        [](ClipGestureController& gestures, const QVariantMap&) {
            auto* monitor = MonitorViewState::forOwner(&gestures);
            if (!monitor) { return false; }
            monitor->setDisplayMode(monitor->displayMode() == VIEW_ID ? QStringLiteral("composite") : VIEW_ID);
            return true;
        }, GROUP});
    const auto hasEditor = [](const QVariantMap& context) { return gesturesIn(context) != nullptr; };
    nt::app::registerShellMenuItem({QStringLiteral("Clip"), QStringLiteral("takeRecord"), QStringLiteral("Record Take Switches"), {},
        GROUP, QStringLiteral("takes"), 61, hasEditor, [](const QVariantMap& context) {
            auto* gestures = gesturesIn(context);
            auto* switcher = gestures ? switcherOf(*gestures) : nullptr;
            return switcher && switcher->recording();
        }, {}, QStringLiteral("Open a timeline first.")});
    nt::app::registerShellMenuItem({QStringLiteral("Clip"), QStringLiteral("takeGrid"), QStringLiteral("Show Takes in the Program Monitor"), {},
        GROUP, QStringLiteral("takes"), 60, hasEditor, [](const QVariantMap& context) {
            auto* gestures = gesturesIn(context);
            auto* monitor = gestures ? MonitorViewState::forOwner(gestures) : nullptr;
            return monitor && monitor->displayMode() == VIEW_ID;
        }, {}, QStringLiteral("Open a timeline first.")});
    return true;
}();
}
