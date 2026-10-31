#pragma once
#include "document/Schema.h"
#include <unordered_map>
namespace nodetool::game {
class ScriptWorld {
public:
    explicit ScriptWorld(const Json& entities);
    const Json* find(const std::string& id) const;
private:
    std::unordered_map<std::string, const Json*> entities_;
};
/** Stateless bounded QuickJS invocations. Persistent behavior state is explicit JSON. */
class ScriptHost {
public:
    Json invoke(const Json& call) const;
    Json invoke(const Json& call, const ScriptWorld& world) const;
    void validateSource(const std::string& source, const std::string& scriptId) const;
};
}
