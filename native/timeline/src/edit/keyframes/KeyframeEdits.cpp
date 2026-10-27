#include "Keyframes.h"
#include "app/EditRegistry.h"
namespace {
const bool registered = [] {
    for (const auto& action :
         QStringList{"input", "field", "stopwatch", "toggle", "delete", "move", "easing", "animations"}) {
        nt::app::registerEdit("keyframes." + action, [action](QJsonObject document, QJsonObject payload) {
            payload.insert("action", action);
            return nt::keyframes::edit(std::move(document), payload);
        });
    }
    return true;
}();
} // namespace
