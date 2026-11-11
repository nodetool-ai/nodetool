// Use a C++ registrar, like ExportPanel.cpp, so unrelated QML registry probes
// do not acquire this application overlay through an nt-panel marker.
#include "app/PanelRegistry.h"

namespace {
const bool registered = nt::app::registerPanel({QStringLiteral("overlay"), QStringLiteral("externalConflicts"),
    QUrl(QStringLiteral("qrc:/nodetool/sync/ExternalConflictsBanner.qml")),
    50, QStringLiteral("External changes")});
}
