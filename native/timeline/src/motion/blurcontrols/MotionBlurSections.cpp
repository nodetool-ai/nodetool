#include "edit/inspectorsections/InspectorSectionRegistry.h"
namespace {
const bool registered = nt::inspector::registerInspectorSection(
    "motionBlur", QUrl("qrc:/qt/qml/NodeTool/Timeline/src/motion/blurcontrols/MotionBlur.qml"), 86, "Motion blur");
}
