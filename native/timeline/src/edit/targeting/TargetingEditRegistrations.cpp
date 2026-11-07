#include "app/EditRegistry.h"
#include "edit/registry/TargetingEditAdapter.h"

namespace {
const bool drop = nt::app::overrideEdit("resolveDropAction", [](QJsonObject raw, const QJsonObject& p) {
    return nt::edit::registry::applyTargetingEdit("resolveDropAction", std::move(raw), p);
});
const bool range = nt::app::registerEdit("removeRange", [](QJsonObject raw, const QJsonObject& p) {
    return nt::edit::registry::applyTargetingEdit("removeRange", std::move(raw), p);
});
} // namespace
