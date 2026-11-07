// Registers qml/ExportVideoDialog.qml in the editor's overlay slot. A C++
// registrar instead of an nt-panel marker: a marker under qml/ also enters
// every QML probe that S1's contract test builds, and that probe expects its
// own overlay panel to be the only one.
#include "app/PanelRegistry.h"

namespace {
const bool registered = nt::app::registerPanel({QStringLiteral("overlay"), QStringLiteral("export"),
    QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/ExportVideoDialog.qml")), 40, QStringLiteral("Export")});
}
