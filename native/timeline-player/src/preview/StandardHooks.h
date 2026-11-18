#pragma once
#include <QStringList>
#include <functional>
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
    void append(HookRegistrations&& other);
    // Leaves the hooks registered for the rest of the process.
    void keepForProcess();
    [[nodiscard]] bool empty() const { return m_unregister.empty(); }
    [[nodiscard]] std::size_t size() const { return m_unregister.size(); }

private:
    void reset();
    std::vector<std::function<void()>> m_unregister;
};

// The standard preview hooks are process-wide registrations that the
// timeline's documents need: clip and track effects, masks and mattes, the
// adjustment stage, blend modes and the denoise and matte sources
// (effects::registerEffectHooks), and the text, shape and caption sources,
// their layer style and the text measurer (render2d::registerRender2dHooks).
// Without them, those layers render wrongly with no error.
//
// A host gets them in one of two ways:
// - link the registrar object libraries nodetool_timeline_effects_registrar
//   and nodetool_timeline_render2d_registrar, which register at
//   QCoreApplication startup for the process lifetime, or
// - call registerStandardHooks() after creating its QGuiApplication and keep
//   the result while it renders.
//
// registerStandardHooks() registers each group that has a missing hook and
// skips a complete group, so calling it in an executable that links the
// registrars does not register twice. It needs a QGuiApplication:
// without one it registers nothing. UI thread only.
[[nodiscard]] HookRegistrations registerStandardHooks();
// The standard hooks that the registries do not hold, by name. Empty when
// all are present. UI thread only.
QStringList missingStandardHooks();
}
