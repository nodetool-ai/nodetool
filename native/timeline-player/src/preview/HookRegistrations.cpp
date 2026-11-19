#include "preview/StandardHooks.h"
#include <ranges>
#include <utility>

namespace nt {
HookRegistrations::HookRegistrations(HookRegistrations&& other) noexcept
    : m_unregister(std::exchange(other.m_unregister, {})) {}

HookRegistrations::~HookRegistrations() { reset(); }

void HookRegistrations::add(std::function<void()> unregister) { m_unregister.push_back(std::move(unregister)); }

void HookRegistrations::append(HookRegistrations&& other) {
    m_unregister.reserve(m_unregister.size() + other.m_unregister.size());
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

}
