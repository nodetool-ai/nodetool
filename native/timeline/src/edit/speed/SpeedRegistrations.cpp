#include "SpeedOperations.h"
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
namespace {
const bool menu = nt::app::registerMenuItem(
    {"clip", "speedDuration", "Speed / Duration…", "Ctrl+R", [](const QVariantMap& context) {
         return context.value("editable", true).toBool() && context.value("mediaType").toString() != "midi";
     }});
const bool speed = nt::app::overrideEdit("setClipSpeed", nt::speed::setClipSpeed);
const bool speeds = nt::app::registerEdit("setClipsSpeed", nt::speed::setClipsSpeed);
const bool remap = nt::app::registerEdit("setClipTimeRemap", nt::speed::setClipTimeRemap);
} // namespace
