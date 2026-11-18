// File > Publish to Cloud… and File > Synchronize… (technical design WP2.8).
// Both open the document bar's review sheet for the open timeline's project.
// The sheet asks the server whether the project is linked and publishes or
// synchronizes from the answer. UI thread only: the menu reads and runs the
// entries on the window's thread.
#include "app/MenuRegistry.h"
#include "wiring/w/SceneItems.h"

#include <QQuickItem>

namespace {
QQuickItem* transferDialog(const QVariantMap& context) {
    auto* gestures = qobject_cast<QQuickItem*>(context.value(QStringLiteral("gestures")).value<QObject*>());
    return nt::wiring::w::windowItem(gestures, QStringLiteral("transferDialog"));
}
bool available(const QVariantMap& context) {
    auto* dialog = transferDialog(context);
    return dialog && dialog->property("available").toBool();
}
bool openSheet(const QVariantMap& context) {
    auto* dialog = transferDialog(context);
    QVariant opened;
    return dialog && QMetaObject::invokeMethod(dialog, "openSheet", Q_RETURN_ARG(QVariant, opened)) && opened.toBool();
}
const QString reason = QStringLiteral("Sign in and open a timeline of a project folder on this computer first.");
const bool publish = nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("publishToCloud"),
    QStringLiteral("Publish to Cloud…"), {}, {}, QStringLiteral("cloud"), 40, available, {}, openSheet, reason});
const bool synchronize = nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("synchronize"),
    QStringLiteral("Synchronize…"), {}, {}, QStringLiteral("cloud"), 41, available, {}, openSheet, reason});
}  // namespace
