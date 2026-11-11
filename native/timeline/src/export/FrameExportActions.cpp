// The exportFrame action and its File menu item. qml/export/ExportFramePanel.qml is the dialog.
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"
#include "wiring/w/SceneItems.h"

namespace {
bool editorOpen(const QVariantMap& context) { return context.value(QStringLiteral("gestures")).value<QObject*>() != nullptr; }

const bool registered = [] {
    nt::wiring::registerKeyAction({QStringLiteral("exportFrame"), QStringLiteral("Export frame"),
        {QKeySequence(QStringLiteral("Ctrl+Alt+E"))},
        [](ClipGestureController& gestures, const QVariantMap& context) {
            auto* panel = nt::wiring::w::windowItem(&gestures, QStringLiteral("exportFramePanel"));
            QVariant opened;
            return panel && QMetaObject::invokeMethod(panel, "openFor", Q_RETURN_ARG(QVariant, opened),
                Q_ARG(QVariant, context.value(QStringLiteral("monitor"))),
                Q_ARG(QVariant, QVariant::fromValue<QObject*>(&gestures))) && opened.toBool();
        }, QStringLiteral("Keyframes & source")});
    nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("exportFrame"), QStringLiteral("Export Frame…"), {}, {},
        QStringLiteral("export"), 2, editorOpen, {}, {}, QStringLiteral("Open a timeline first.")});
    return true;
}();
}  // namespace
