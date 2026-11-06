#include "app/PanelRegistry.h"

namespace {
const bool explorerRegistered = nt::app::registerPanel({
    "left", "assets", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/assets/AssetExplorer.qml"), 10, "Library"});
const bool overlayRegistered = nt::app::registerPanel({
    "overlay", "assetDrop", QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/assets/AssetDropOverlay.qml"), 20, "Asset drop"});
}
