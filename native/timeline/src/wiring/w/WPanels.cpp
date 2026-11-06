#include "app/PanelRegistry.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"
#include "SceneItems.h"

namespace {
const bool registered = [] {
    const QString base = QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/wiring/w/");
    nt::app::registerPanel({"documentBarActions", "w.exportButton", QUrl(base + "ExportButton.qml"), 10, "Export"});
    nt::app::registerPanel({"trackLane", "w.trackEffects", QUrl(base + "TrackEffectsHost.qml"), 10, "Effects"});
    nt::app::registerPanel({"overlay", "w.speedDuration", QUrl(base + "SpeedDurationHost.qml"), 45, "Speed / Duration"});
    nt::wiring::registerKeyAction({"speedDuration", "Speed and duration of selected clips", {},
        [](ClipGestureController& gestures, const QVariantMap&) {
            if (gestures.selection().isEmpty()) { return false; }
            auto* host = nt::wiring::w::windowItem(&gestures, "speedDurationHost");
            QVariant opened;
            return host && QMetaObject::invokeMethod(host, "openForSelection", Q_RETURN_ARG(QVariant, opened),
                Q_ARG(QVariant, QVariant::fromValue(gestures.selection()))) && opened.toBool();
        }});
    return true;
}();
}
