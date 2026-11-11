// Registers qml/interchange/PremierePanel.qml in the overlay slot and puts its two commands in the File menu.
// A C++ registrar instead of an nt-panel marker, as src/export/ExportPanel.cpp does.
#include "app/MenuRegistry.h"
#include "app/PanelRegistry.h"
#include "wiring/w/SceneItems.h"

#include <QQuickItem>

namespace {
// The menu context holds the editor's clip gestures when an editor is open.
bool callPanel(const QVariantMap& context, const char* method) {
    auto* gestures = qobject_cast<QQuickItem*>(context.value(QStringLiteral("gestures")).value<QObject*>());
    auto* panel = nt::wiring::w::windowItem(gestures, QStringLiteral("premierePanel"));
    return panel && QMetaObject::invokeMethod(panel, method);
}
bool editorOpen(const QVariantMap& context) { return context.value(QStringLiteral("gestures")).value<QObject*>() != nullptr; }

const bool registered = [] {
    nt::app::registerPanel({QStringLiteral("overlay"), QStringLiteral("premiere"),
        QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/interchange/PremierePanel.qml")), 41, QStringLiteral("Premiere Pro")});
    // Both stay enabled on a timeline that has no server, so pressing them says why they cannot run (UX guidelines 4.7).
    const QString openTimeline = QStringLiteral("Open a timeline first.");
    nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("importPremiere"), QStringLiteral("Import Premiere XML…"), {}, {},
        QStringLiteral("interchange"), 10, editorOpen, {}, [](const QVariantMap& context) { return callPanel(context, "openImport"); }, openTimeline});
    nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("exportPremiere"), QStringLiteral("Export to Premiere Pro…"), {}, {},
        QStringLiteral("interchange"), 11, editorOpen, {}, [](const QVariantMap& context) { return callPanel(context, "openExport"); }, openTimeline});
    return true;
}();
}  // namespace
