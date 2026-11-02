#include "DockLayoutStore.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"

namespace {
const bool registered = [] {
    const QStringList ordinals{"first", "second", "third", "fourth", "fifth", "sixth"};
    for (int index = 0; index < ordinals.size(); ++index) {
        nt::wiring::registerKeyAction({"workspace" + QString::number(index + 1), "Switch to the " + ordinals[index] + " workspace",
            {QKeySequence::fromString("Alt+Shift+" + QString::number(index + 1), QKeySequence::PortableText)},
            [index](ClipGestureController& gestures, const QVariantMap&) {
                for (QQuickItem* item = &gestures; item; item = item->parentItem()) {
                    auto* store = qobject_cast<DockLayoutStore*>(item->property("dockStore").value<QObject*>());
                    if (store) { store->switchWorkspace(index); return true; }
                }
                return false;
            }, QStringLiteral("Workspaces")});
    }
    const struct { const char* id; const char* title; const char* keys; const char* side; } sides[] = {
        {"toggleLeftPanels", "Show or hide the left panels", "Ctrl+B", "left"},
        {"toggleRightPanels", "Show or hide the right panels", "Ctrl+Alt+B", "right"}};
    for (const auto& entry : sides) {
        const QString side = entry.side;
        nt::wiring::registerKeyAction({entry.id, entry.title, {QKeySequence::fromString(entry.keys, QKeySequence::PortableText)},
            [side](ClipGestureController& gestures, const QVariantMap&) {
                for (QQuickItem* item = &gestures; item; item = item->parentItem()) {
                    auto* canvas = item->property("dockCanvas").value<QObject*>();
                    if (canvas) { return QMetaObject::invokeMethod(canvas, "toggleSide", Q_ARG(QString, side)); }
                }
                return false;
            }});
    }
    return true;
}();
}
