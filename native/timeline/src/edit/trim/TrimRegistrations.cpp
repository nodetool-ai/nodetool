// Trim mode's keys, menu items and Program monitor view. The trim keys of the
// presets (extendEdit, trimEdit*, the shuttle keys) reach it through
// TrimMode::interceptAction.
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "edit/trim/TrimMode.h"
#include "ui/MonitorViewRegistry.h"
#include "wiring/KeyActions.h"

#include <QUrl>

namespace {
TrimMode* trimOf(const QVariantMap& context) {
    auto* gestures = qobject_cast<ClipGestureController*>(context.value(QStringLiteral("gestures")).value<QObject*>());
    return gestures ? gestures->trimMode() : nullptr;
}
const bool registered = [] {
    nt::ui::registerMonitorView({QStringLiteral("trim"), QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/preview/TrimMonitorView.qml")),
                                 30, QStringLiteral("Trim")});
    nt::wiring::registerKeyAction({QStringLiteral("selectNearestEditPoint"), QStringLiteral("Trim the edit nearest the playhead"),
        {QKeySequence(QStringLiteral("Shift+T"))},
        [](ClipGestureController& gestures, const QVariantMap&) { return gestures.trimMode()->selectNearest(); },
        QStringLiteral("Editing")});
    // Ctrl+T also means Cross-fade in, so only trim mode takes it, in TrimMode::handleKey.
    nt::wiring::registerKeyAction({QStringLiteral("toggleTrimType"), QStringLiteral("Switch between ripple, roll and regular trim (Ctrl+T in trim mode)"),
        {},
        [](ClipGestureController& gestures, const QVariantMap&) { return gestures.trimMode()->toggleKind(); },
        QStringLiteral("Editing")});
    const QString menu = QStringLiteral("Sequence");
    const QString group = QStringLiteral("Trim");
    nt::app::registerShellMenuItem({menu, QStringLiteral("selectNearestEditPoint"), QStringLiteral("Trim Edit"),
        {}, {}, group, 15,
        [](const QVariantMap& context) { return trimOf(context) != nullptr; }, {},
        [](const QVariantMap& context) { auto* trim = trimOf(context); return trim && trim->selectNearest(); },
        QStringLiteral("Open a sequence to trim an edit.")});
    nt::app::registerShellMenuItem({menu, QStringLiteral("toggleTrimType"), QStringLiteral("Toggle Trim Type"),
        {}, {}, group, 16,
        [](const QVariantMap& context) { auto* trim = trimOf(context); return trim && trim->active(); }, {},
        [](const QVariantMap& context) { auto* trim = trimOf(context); return trim && trim->toggleKind(); },
        QStringLiteral("Select an edit point to start trimming.")});
    nt::app::registerShellMenuItem({menu, QStringLiteral("exitTrimMode"), QStringLiteral("Exit Trim Mode"),
        {}, {}, group, 17,
        [](const QVariantMap& context) { auto* trim = trimOf(context); return trim && trim->active(); }, {},
        [](const QVariantMap& context) { auto* trim = trimOf(context); if (trim) trim->leave(); return trim != nullptr; },
        QStringLiteral("Trim mode is not on.")});
    return true;
}();
}  // namespace
