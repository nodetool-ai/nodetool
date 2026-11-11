#include "Reframe.h"
#include "app/EditRegistry.h"
namespace {
const bool registered = [] {
    for (const auto& name :
         {"setClipCropEdge", "setClipReframeSubject", "addClipReframeKeyframe", "clearClipReframe"}) {
        nt::app::registerEdit(name, [action = QString(name)](QJsonObject doc, const QJsonObject& payload) {
            return nt::reframe::edit(std::move(doc), action, payload);
        });
    }
    return true;
}();
} // namespace
