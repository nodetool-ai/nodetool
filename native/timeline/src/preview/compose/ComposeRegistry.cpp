#include "preview/compose/ComposeRegistry.h"
#include <algorithm>
#include <mutex>

namespace nt {
namespace {
struct Registration { BlendHandlerToken token; std::string mode; BlendHandlerFactory factory; };
struct Registry {
    std::mutex mutex;
    std::vector<Registration> entries;
    BlendHandlerToken next = 1;
};
Registry& registry() { static Registry value; return value; }
}
BlendHandlerToken registerBlendHandler(std::string mode, BlendHandlerFactory factory) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    const auto token = r.next++;
    r.entries.push_back({token, std::move(mode), std::move(factory)});
    return token;
}
void unregisterBlendHandler(BlendHandlerToken token) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    std::erase_if(r.entries, [token](const auto& entry) { return entry.token == token; });
}
std::map<std::string, std::unique_ptr<BlendHandler>> registeredBlendHandlers() {
    std::map<std::string, BlendHandlerFactory> factories;
    {
        auto& r = registry();
        const std::scoped_lock lock(r.mutex);
        for (const auto& entry : r.entries) { factories[entry.mode] = entry.factory; }
    }
    std::map<std::string, std::unique_ptr<BlendHandler>> handlers;
    for (const auto& [mode, factory] : factories) {
        if (factory) {
            if (auto handler = factory()) { handlers.emplace(mode, std::move(handler)); }
        }
    }
    return handlers;
}
}
