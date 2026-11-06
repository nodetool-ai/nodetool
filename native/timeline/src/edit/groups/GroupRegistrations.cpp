#include "app/EditRegistry.h"
#include "edit/groups/GroupOps.h"
namespace {
const bool registered = [] {
    for (const auto &name : QStringList{"groupClips", "ungroupClips"}) {
        nt::app::registerEdit(name, [name](QJsonObject raw, const QJsonObject &payload) {
            return nt::edit::groups::applyGroupEdit(name, std::move(raw), payload);
        });
    }
    for (const auto &name :
         QStringList{"moveClip", "moveSelectedClips", "nudge", "trimClipStart", "trimClipEnd",
                     "rollClipEdge", "deleteSelected"}) {
        nt::app::overrideEdit(name, [name](QJsonObject raw, const QJsonObject &payload) {
            return nt::edit::groups::applyGroupEdit(name, std::move(raw), payload);
        });
    }
    return true;
}();
} // namespace
