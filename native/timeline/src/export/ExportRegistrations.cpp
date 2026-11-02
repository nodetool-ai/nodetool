// What the export queue adds to the editor outside its panel: Ctrl+M for the
// full dialog, the Quick Export key action and menu item, and the document bar
// button. A C++ registrar instead of an nt-panel marker, as for ExportPanel.cpp.
#include "app/MenuRegistry.h"
#include "app/PanelRegistry.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineModel.h"
#include "wiring/KeyActions.h"
#include "wiring/w/SceneItems.h"

#include <QKeySequence>

namespace {
bool callPanel(ClipGestureController& gestures, const char* method) {
    auto* panel = nt::wiring::w::windowItem(&gestures, QStringLiteral("exportPanel"));
    return panel && QMetaObject::invokeMethod(panel, method);
}
bool hasEditor(const QVariantMap& context) { return context.value("gestures").value<QObject*>() != nullptr; }
bool hasContent(const QVariantMap& context) {
    const auto* model = qobject_cast<TimelineModel*>(context.value("timeline").value<QObject*>());
    return model && model->contentEndMs() > 0;
}
const bool registered = [] {
    nt::app::registerPanel({QStringLiteral("documentBarActions"), QStringLiteral("export.quick"),
        QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/export/QuickExportButton.qml")), 9, QStringLiteral("Quick export")});
    // Premiere's Export Media shortcut. A preset that binds Ctrl+M keeps it.
    nt::wiring::registerKeyAction({QStringLiteral("exportVideo"), QStringLiteral("Export the timeline"),
        {QKeySequence(Qt::CTRL | Qt::Key_M)},
        [](ClipGestureController& gestures, const QVariantMap& context) {
            return context.value("autoRepeat").toBool() || callPanel(gestures, "open");
        }, QStringLiteral("File")});
    nt::wiring::registerKeyAction({QStringLiteral("quickExport"), QStringLiteral("Quick export with the last settings"), {},
        [](ClipGestureController& gestures, const QVariantMap& context) {
            return context.value("autoRepeat").toBool() || callPanel(gestures, "quickExport");
        }, QStringLiteral("File")});
    nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("exportVideo"), QStringLiteral("Export…"),
        {}, {}, QStringLiteral("export"), 0, hasEditor, {}, {}, QStringLiteral("Open a timeline first.")});
    nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("quickExport"), QStringLiteral("Quick Export…"),
        {}, {}, QStringLiteral("export"), 1, hasContent, {}, {}, QStringLiteral("Add a clip to the timeline first.")});
    return true;
}();
}
