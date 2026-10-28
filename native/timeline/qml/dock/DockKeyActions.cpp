#include "DockLayoutStore.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"

namespace {
const bool registered = [] {
    const QStringList ordinals{"first", "second", "third", "fourth"};
    for (int index = 0; index < ordinals.size(); ++index) {
        nt::wiring::registerKeyAction({"workspace" + QString::number(index + 1), "Switch to the " + ordinals[index] + " workspace",
            {QKeySequence::fromString("Alt+Shift+" + QString::number(index + 1), QKeySequence::PortableText)},
            [index](ClipGestureController& gestures, const QVariantMap&) {
                for (QQuickItem* item = &gestures; item; item = item->parentItem()) {
                    auto* store = qobject_cast<DockLayoutStore*>(item->property("dockStore").value<QObject*>());
                    if (store) { store->switchWorkspace(index); return true; }
                }
                return false;
            }});
    }
    return true;
}();
}
