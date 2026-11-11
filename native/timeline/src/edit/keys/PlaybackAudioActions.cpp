// The two playback audio switches (issue #7086): audio while scrubbing, and pitch kept while shuttling.
// The live values sit on PlaybackClock. Preferences keeps them between launches (ShellPreferences::bind).
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "playback/PlaybackClock.h"
#include "wiring/KeyActions.h"

namespace {
PlaybackClock* clockOf(const QVariantMap& context) {
    auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
    return gestures ? gestures->clock() : nullptr;
}
const bool registered = [] {
    using C = ClipGestureController&;
    using V = const QVariantMap&;
    const QString group = QStringLiteral("Playback");
    nt::wiring::registerKeyAction({"toggleScrubAudio", "Play audio while scrubbing", {QKeySequence(Qt::SHIFT | Qt::Key_S)},
        [](C g, V c) {
            auto* clock = g.clock();
            if (!clock || c.value("autoRepeat").toBool()) return false;
            clock->setScrubAudio(!clock->scrubAudio());
            return true;
        }, group});
    nt::wiring::registerKeyAction({"toggleShuttleKeepsPitch", "Keep pitch while shuttling", {},
        [](C g, V c) {
            auto* clock = g.clock();
            if (!clock || c.value("autoRepeat").toBool()) return false;
            clock->setKeepShuttlePitch(!clock->keepShuttlePitch());
            return true;
        }, group});
    const auto hasClock = [](const QVariantMap& context) { return clockOf(context) != nullptr; };
    nt::app::registerShellMenuItem({"Playback", "toggleScrubAudio", "Play Audio While Scrubbing", {}, {}, "audio", 100, hasClock,
        [](const QVariantMap& context) { auto* clock = clockOf(context); return clock && clock->scrubAudio(); },
        {}, QStringLiteral("Open a timeline first.")});
    nt::app::registerShellMenuItem({"Playback", "toggleShuttleKeepsPitch", "Keep Pitch While Shuttling", {}, {}, "audio", 101, hasClock,
        [](const QVariantMap& context) { auto* clock = clockOf(context); return clock && clock->keepShuttlePitch(); },
        {}, QStringLiteral("Open a timeline first.")});
    return true;
}();
}  // namespace
