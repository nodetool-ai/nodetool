#include "app/PanelRegistry.h"
#include "PreferencesSettings.h"

namespace {
const bool registered = [] {
    nt::app::applyCachePreferences();
    return nt::app::registerPanel({
        "overlay", "appShell",
        QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Preferences/AppShell.qml"),
        100, "App shell"});
}();
}
