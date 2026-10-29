#include "edit/inspectorsections/InspectorSectionRegistry.h"
namespace {
const bool registered = nt::inspector::registerInspectorSection("borderRadius", QUrl("qrc:/qt/qml/NodeTool/Timeline/src/motion/controls/BorderRadius.qml"), 45, "Corners");
}
