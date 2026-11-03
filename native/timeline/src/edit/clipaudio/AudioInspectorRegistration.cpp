#include "edit/inspectorsections/InspectorSectionRegistry.h"

namespace {
const bool registered = nt::inspector::registerInspectorSection("audio",
    QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/AudioSection.qml"), 41, "Volume", "effectControls");
}
