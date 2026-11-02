#include "app/PanelRegistry.h"

namespace {
const bool registered = nt::app::registerPanel({"overlay", "audioGain",
    QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/AudioGainHost.qml"), 46, "Audio gain"});
}
