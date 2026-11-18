#pragma once
#include <QStringList>
#include <functional>
#include <memory>
#include <vector>

namespace nt {
// The registrations of a group of preview hooks. Destroying it unregisters
// them in reverse order, unless keepForProcess() released them.
// UI thread only: create and destroy it on the thread that owns the
// QGuiApplication, while the application exists.
class HookRegistrations {
public:
    HookRegistrations() = default;
    HookRegistrations(const HookRegistrations&) = delete;
    HookRegistrations& operator=(const HookRegistrations&) = delete;
    HookRegistrations(HookRegistrations&& other) noexcept;
    HookRegistrations& operator=(HookRegistrations&& other) noexcept;
    ~HookRegistrations();

    // `unregister` removes one registration. It runs once, when this object is destroyed.
    void add(std::function<void()> unregister);
    // Leaves the hooks registered for the rest of the process.
    void keepForProcess();
    [[nodiscard]] bool empty() const { return size() == 0; }
    [[nodiscard]] std::size_t size() const;

private:
    friend HookRegistrations registerStandardHooks();
    void append(HookRegistrations&& other);
    void reset();
    std::vector<std::function<void()>> m_unregister;
    // Independent hosts can hold the same registrations. The last owner
    // unregisters them, even if the first host has already closed.
    std::shared_ptr<HookRegistrations> m_shared;
};

namespace detail {
// The existing scene registry keeps a weak reference. UI thread only.
std::shared_ptr<HookRegistrations> shareStandardHooks(HookRegistrations (*install)());
}

// The timeline's playback hooks: effects and blending, render2d sources,
// time-remapped PCM, mixer and picture automation, and crop/reframe.
// Link the startup registrar object libraries for process-lifetime
// registration, or call registerStandardHooks() and keep the returned
// handle while rendering. Explicit callers share the same registrations.
// Effects and render2d need a QGuiApplication. UI thread only.
[[nodiscard]] HookRegistrations registerStandardHooks();
// The standard hooks that the registries do not hold, by name. Empty when
// all are present. UI thread only.
QStringList missingStandardHooks();
}
