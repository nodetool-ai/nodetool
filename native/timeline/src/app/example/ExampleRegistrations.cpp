#include "app/CliModes.h"
#include "app/EditRegistry.h"
#include "app/PanelRegistry.h"
#include "app/MenuRegistry.h"

namespace {
const bool cli = nt::app::registerCliMode({"--seam-example", [](int, char**) { return 37; }});
const bool edit = nt::app::registerEdit("example.rename", [](QJsonObject raw, const QJsonObject& payload) {
    raw.insert("name", payload.value("name"));
    return raw;
});
const bool panel = nt::app::registerPanel({"left", "example", QUrl("qrc:/example/ExamplePanel.qml"), 1, "Example"});
const bool menu = nt::app::registerMenuItem({"clip", "example.rename", "Example", "Ctrl+E",
    [](const QVariantMap& context) { return context.value("editable").toBool(); }});
}
