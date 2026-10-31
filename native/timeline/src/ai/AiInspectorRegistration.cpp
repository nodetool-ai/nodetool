#include "edit/inspectorsections/InspectorSectionRegistry.h"

namespace {
const bool registered = nt::inspector::registerInspectorSection(
    "ai", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/ai/AiInspectorSection.qml"), 65, "AI");
}
