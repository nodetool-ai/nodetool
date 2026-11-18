#include "preview/StandardHooks.h"
#include <ranges>
#include <utility>

namespace nt {
HookRegistrations::HookRegistrations(HookRegistrations&& other) noexcept
    : m_unregister(std::exchange(other.m_unregister, {})), m_shared(std::move(other.m_shared)) {}

HookRegistrations& HookRegistrations::operator=(HookRegistrations&& other) noexcept {
    if (this != &other) {
        reset();
        m_unregister = std::exchange(other.m_unregister, {});
        m_shared = std::move(other.m_shared);
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

void HookRegistrations::keepForProcess() {
    m_unregister.clear();
    if (m_shared) {
        m_shared->keepForProcess();
        m_shared.reset();
    }
}

std::size_t HookRegistrations::size() const {
    return m_unregister.size() + (m_shared ? m_shared->size() : 0);
}

void HookRegistrations::reset() {
    for (auto& unregister : std::views::reverse(m_unregister)) {
        if (unregister) {
            unregister();
        }
    }
    m_unregister.clear();
}

}
