#pragma once
#include "document/Schema.h"
#include <memory>
#include <unordered_map>
namespace nodetool::game {
class ScriptWorld {
public:
    explicit ScriptWorld(const Json& entities);
    const Json* find(const std::string& id) const;
private:
    std::unordered_map<std::string, const Json*> entities_;
};
/**
 * Bounded QuickJS invocations. Persistent behavior state is explicit JSON.
 * One runtime and one hardened realm for each distinct source are reused across calls.
 * Each call evaluates the source again, so closures never carry state between calls.
 * Not thread-safe: use one host for each thread.
 */
class ScriptHost {
public:
    ScriptHost();
    ~ScriptHost();
    ScriptHost(ScriptHost&&) noexcept;
    ScriptHost& operator=(ScriptHost&&) noexcept;
    Json invoke(const Json& call);
    Json invoke(const Json& call, const ScriptWorld& world);
    void validateSource(const std::string& source, const std::string& scriptId);
    struct Engine;
private:
    std::unique_ptr<Engine> engine_;
};
}
