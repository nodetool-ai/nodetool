#pragma once
#include "plan.h"
#include <array>
#include <cstdint>
#include <span>

namespace nt::realtime {
enum class ControlDomain { render, audio };
struct ControlValue {
    std::array<double, 4> lanes{};
    unsigned width = 1;
};
struct TickContext {
    double seconds = 0;
    double beats = 0;
    double dt = 0;
    double beatsPerSecond = 2;
    std::uint64_t frame = 0;
    unsigned width = 1;
    unsigned height = 1;
};
struct ControlTickResult {
    bool accepted = false;
    std::uint64_t steps = 0;
    std::uint64_t skipped = 0;
    std::uint64_t operations = 0;
};

// Prepared on the host thread, then exclusively owned by one render OR audio
// thread. No concurrent access. Vectors own all registers, instructions and state
// until destruction after that thread stops. No borrowed plan data survives.
class ControlExecutor {
    struct Storage;
public:
    explicit ControlExecutor(std::unique_ptr<Storage> storage);
    ~ControlExecutor();
    ControlExecutor(const ControlExecutor&) = delete;
    ControlExecutor& operator=(const ControlExecutor&) = delete;
    ControlTickResult tick(const TickContext& context) noexcept;
    std::span<const ControlValue> registers() const noexcept;
    void reset() noexcept;
    struct Prepared;
    static Prepared prepare(const Plan& plan, ControlDomain domain);
private:
    std::unique_ptr<Storage> storage_;
};
struct ControlExecutor::Prepared {
    std::unique_ptr<ControlExecutor> executor;
    std::optional<Diagnostic> error;
};
// Prepare-thread registry augmentation. Module/kernel entries are preserved.
void registerControlOperations(Registry& registry);
}
