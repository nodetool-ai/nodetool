// Registers qml/scenedetect/SceneEditHost.qml in the editor's overlay slot. A C++
// registrar instead of an nt-panel marker, as for the marker editor: a marker
// under qml/ also enters every QML executable that has no app registrar, and
// tst_appshell_isolation expects those to receive no overlay panel.
#include "app/PanelRegistry.h"

namespace {
const bool registered = nt::app::registerPanel({QStringLiteral("overlay"), QStringLiteral("sceneEditDetection"),
    QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/scenedetect/SceneEditHost.qml")), 46,
    QStringLiteral("Scene edit detection")});
}
