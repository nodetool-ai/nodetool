#include "app/EditRegistry.h"
#include "assets/AssetDrop.h"

namespace {
const bool registered = nt::app::registerEdit("assets.dropAsset", nt::assets::dropAsset);
}
