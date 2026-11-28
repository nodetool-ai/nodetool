// Edit > Clean Up Unused Music Takes… (docs/MUSIC-MODE.md TK-5), which opens
// the dialog in qml/music/MusicCleanupHost.qml. MusicCleanup.cpp registers
// the `music.removeTakes` edit.

#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "music/MusicDocument.h"
#include "server/ServerSource.h"
#include "wiring/w/SceneItems.h"

namespace {
ClipGestureController* gesturesOf(const QVariantMap& context) {
    return qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
}

// A music project that saves to a server: the only place its take audio lives.
bool canClean(const QVariantMap& context) {
    auto* gestures = gesturesOf(context);
    return gestures && gestures->timeline() && nt::music::isMusicSequence(gestures->timeline()->timeline().raw) &&
           nt::server::serverSaveTarget().has_value();
}

const bool cleanupMenu = nt::app::registerShellMenuItem({
    QStringLiteral("Edit"), QStringLiteral("musicCleanUpTakes"), QStringLiteral("Clean Up Unused Music Takes…"), {}, {},
    QStringLiteral("cleanup"), 50, canClean, {},
    [](const QVariantMap& context) {
        auto* gestures = gesturesOf(context);
        auto* host = nt::wiring::w::windowItem(gestures, QStringLiteral("musicCleanupHost"));
        return host && QMetaObject::invokeMethod(host, "begin");
    },
    QStringLiteral("Open a music project from the server first.")});
}  // namespace
