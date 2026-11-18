#include "preview/StandardHooks.h"
#include "preview/effects/EffectsRegistrations.h"
#include "render2d/Render2dRegistrations.h"
#include <ranges>
#include <utility>

namespace nt {
HookRegistrations::HookRegistrations(HookRegistrations&& other) noexcept
    : m_unregister(std::exchange(other.m_unregister, {})) {}

HookRegistrations& HookRegistrations::operator=(HookRegistrations&& other) noexcept {
    if (this != &other) {
        reset();
        m_unregister = std::exchange(other.m_unregister, {});
    }
    return *this;
}

HookRegistrations::~HookRegistrations() { reset(); }

void HookRegistrations::add(std::function<void()> unregister) { m_unregister.push_back(std::move(unregister)); }

void HookRegistrations::append(HookRegistrations&& other) {
    for (auto& unregister : other.m_unregister) {
        m_unregister.push_back(std::move(unregister));
    }
    other.m_unregister.clear();
}

void HookRegistrations::keepForProcess() { m_unregister.clear(); }

void HookRegistrations::reset() {
    for (auto& unregister : std::views::reverse(m_unregister)) {
        if (unregister) {
            unregister();
        }
    }
    m_unregister.clear();
}

HookRegistrations registerStandardHooks() {
    HookRegistrations registrations;
    if (!effects::missingEffectHooks().isEmpty()) {
        registrations.append(effects::registerEffectHooks());
    }
    if (!render2d::missingRender2dHooks().isEmpty()) {
        registrations.append(render2d::registerRender2dHooks());
    }
    return registrations;
}

QStringList missingStandardHooks() { return effects::missingEffectHooks() + render2d::missingRender2dHooks(); }
}
