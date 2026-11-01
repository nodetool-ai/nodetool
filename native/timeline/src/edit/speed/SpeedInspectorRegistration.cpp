#include "edit/inspectorsections/InspectorSectionRegistry.h"
namespace {
const bool registered = nt::inspector::registerInspectorSection("timeRemap",
    QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/SpeedTimeRemap.qml"), 85, "Time remap");
}
