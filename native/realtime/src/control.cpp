#include "nodetool/realtime/control.h"
#include "nodetool/realtime/math.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <queue>

namespace nt::realtime {
namespace {
enum class Op {
    constant, seconds, beats, dt, frame, width, height,
    add, subtract, multiply, divide, minimum, maximum, less, equal, remap,
    vec2, vec3, vec4, sine, noise, pow, tanh,
    damp, envelope, oscillator, hold, integrate, counter
};
struct Definition { std::string_view name; Op op; unsigned inputs; bool stateful; };
constexpr Definition definitions[] = {
    {"constant", Op::constant, 0, false}, {"time.seconds", Op::seconds, 0, false},
    {"time.beats", Op::beats, 0, false}, {"time.dt", Op::dt, 0, false},
    {"time.frame", Op::frame, 0, false}, {"output.width", Op::width, 0, false},
    {"output.height", Op::height, 0, false}, {"add", Op::add, 2, false},
    {"subtract", Op::subtract, 2, false}, {"multiply", Op::multiply, 2, false},
    {"divide", Op::divide, 2, false}, {"min", Op::minimum, 2, false},
    {"max", Op::maximum, 2, false}, {"less", Op::less, 2, false},
    {"equal", Op::equal, 2, false}, {"remap", Op::remap, 5, false},
    {"vec2", Op::vec2, 2, false}, {"vec3", Op::vec3, 3, false},
    {"vec4", Op::vec4, 4, false}, {"sine", Op::sine, 0, false},
    {"noise", Op::noise, 0, false}, {"pow", Op::pow, 2, false},
    {"tanh", Op::tanh, 1, false}, {"damp", Op::damp, 2, true},
    {"envelope", Op::envelope, 3, true}, {"oscillator", Op::oscillator, 1, true},
    {"sample_hold", Op::hold, 1, true}, {"integrator", Op::integrate, 1, true},
    {"counter", Op::counter, 2, true}
};
// Values built on the prepare thread, read on the executor's owning thread.
struct Instruction {
    Op op{};
    std::array<unsigned, 5> inputs{};
    ControlValue literal;
    unsigned output = 0;
    unsigned width = 1;
    std::uint32_t seed = 0;
    bool stateful = false;
};
// Cleared by the host in prepare/reset, exclusively mutated by the owner thread.
struct State { std::array<double, 4> value{}; double phase = 0; std::uint64_t index = 0; bool high = false; };
std::uint32_t nodeSeed(std::uint32_t session, std::string_view node) {
    auto seed = session ^ 2166136261u;
    for (unsigned char c : node) { seed = (seed ^ c) * 16777619u; }
    return seed;
}
double clearSmall(double value) noexcept { return std::abs(value) < 1e-30 ? 0 : value; }
// Callers prove |value| < 2^52 before this conversion.
std::int64_t floorBounded(double value) noexcept {
    const auto integer = static_cast<std::int64_t>(value);
    return static_cast<double>(integer) > value ? integer - 1 : integer;
}
double phase(double value) noexcept {
    if (!std::isfinite(value) || std::abs(value) >= 0x1p52) { return 0; }
    return value - static_cast<double>(floorBounded(value));
}
}

// Same exclusive affinity as ControlExecutor. All storage allocated at prepare.
struct ControlExecutor::Storage {
    std::vector<Instruction> instructions;
    std::vector<ControlValue> registers;
    std::vector<State> states;
    ControlDomain domain = ControlDomain::render;
    double sampleRate = 44100;
    double quantum = 128;
    std::uint64_t completed = 0;
    double lastSeconds = 0;

    void evaluate(const TickContext& tick, bool advance) noexcept {
        for (std::size_t index = 0; index < instructions.size(); ++index) {
            const auto& instruction = instructions[index];
            auto& output = registers[instruction.output];
            auto& state = states[index];
            if (instruction.stateful && !advance) { continue; }
            const auto input = [&](unsigned port, unsigned lane) {
                const auto& value = registers[instruction.inputs[port]];
                return value.lanes[value.width == 1 ? 0 : lane];
            };
            if (instruction.op == Op::oscillator || instruction.op == Op::hold) {
                const double increment = input(0, 0) * tick.dt;
                const double next = state.phase + increment;
                if (instruction.op == Op::hold && std::isfinite(next) && std::abs(next) < 0x1p52) {
                    // Negative crossings move through the same cyclic uint64 sequence.
                    state.index += static_cast<std::uint64_t>(floorBounded(next));
                }
                state.phase = phase(next);
            }
            for (unsigned lane = 0; lane < instruction.width; ++lane) {
                double value = 0;
                const auto a = [&] { return input(0, lane); };
                const auto b = [&] { return input(1, lane); };
                switch (instruction.op) {
                case Op::constant: value = instruction.literal.lanes[lane]; break;
                case Op::seconds: value = tick.seconds; break;
                case Op::beats: value = tick.beats; break;
                case Op::dt: value = tick.dt; break;
                case Op::frame: value = static_cast<double>(tick.frame); break;
                case Op::width: value = tick.width; break;
                case Op::height: value = tick.height; break;
                case Op::add: value = a() + b(); break;
                case Op::subtract: value = a() - b(); break;
                case Op::multiply: value = a() * b(); break;
                case Op::divide: value = b() == 0 ? 0 : a() / b(); break;
                case Op::minimum: value = std::min(a(), b()); break;
                case Op::maximum: value = std::max(a(), b()); break;
                case Op::less: value = a() < b() ? 1 : 0; break;
                case Op::equal: value = a() == b() ? 1 : 0; break;
                case Op::pow: value = math::power(a(), b()); break;
                case Op::tanh: value = math::hyperbolicTangent(a()); break;
                case Op::remap: {
                    const double range = input(2, lane) - b();
                    value = range == 0 ? input(3, lane) : input(3, lane) +
                        (a() - b()) / range * (input(4, lane) - input(3, lane));
                    break;
                }
                case Op::vec2: case Op::vec3: case Op::vec4: value = input(lane, 0); break;
                case Op::sine:
                    value = math::sine(6.2831853071795864769 * phase(tick.seconds * instruction.literal.lanes[0] + instruction.literal.lanes[1])); break;
                case Op::noise: {
                    const double bucket = tick.seconds * instruction.literal.lanes[0];
                    value = std::isfinite(bucket) && bucket >= 0 && bucket < 0x1p64 ?
                        math::noise(static_cast<std::uint64_t>(bucket), instruction.seed) : 0;
                    break;
                }
                case Op::damp: {
                    const double decay = b() <= 0 ? 0 : math::exponential(-tick.dt / b());
                    value = a() + (state.value[lane] - a()) * decay;
                    state.value[lane] = clearSmall(value); value = state.value[lane]; break;
                }
                case Op::envelope: {
                    const bool high = a() > 0;
                    const double duration = high ? b() : input(2, lane);
                    const double step = duration <= 0 ? 1 : tick.dt / duration;
                    value = std::clamp(state.value[lane] + (high ? step : -step), 0.0, 1.0);
                    state.value[lane] = clearSmall(value); break;
                }
                case Op::oscillator: value = math::sine(6.2831853071795864769 * state.phase); break;
                case Op::hold: value = math::noise(state.index, instruction.seed); break;
                case Op::integrate: value = clearSmall(state.value[lane] + a() * tick.dt); state.value[lane] = value; break;
                case Op::counter: {
                    const bool high = a() > 0;
                    if (b() > 0) { state.value[0] = 0; }
                    else if (high && !state.high) { state.value[0] += 1; }
                    state.high = high; value = state.value[0]; break;
                }
                }
                output.lanes[lane] = value;
            }
        }
    }
};

void registerControlOperations(Registry& registry) {
    for (const auto& definition : definitions) {
        (definition.stateful ? registry.statefulOps : registry.analyticOps).emplace(definition.name);
    }
}
ControlExecutor::ControlExecutor(std::unique_ptr<Storage> storage) : storage_(std::move(storage)) {}
ControlExecutor::~ControlExecutor() = default;
std::span<const ControlValue> ControlExecutor::registers() const noexcept { return storage_->registers; }
void ControlExecutor::reset() noexcept {
    std::fill(storage_->states.begin(), storage_->states.end(), State{});
    for (auto& value : storage_->registers) { value.lanes.fill(0); }
    storage_->completed = 0; storage_->lastSeconds = 0;
}

ControlTickResult ControlExecutor::tick(const TickContext& context) noexcept {
    auto& data = *storage_;
    const double steps = context.seconds * data.sampleRate / data.quantum;
    if (!std::isfinite(steps) || steps < 0 || steps >= 0x1p53 || context.seconds < data.lastSeconds ||
        !std::isfinite(context.beats) || !std::isfinite(context.beatsPerSecond) ||
        !std::isfinite(context.dt) || context.dt < 0 || context.width == 0 || context.height == 0) { return {}; }
    // A single ULP tolerates round-off at an exact quantum boundary.
    const double rounded = std::bit_cast<double>(std::bit_cast<std::uint64_t>(steps == 0 ? 0.0 : steps) + 1);
    const auto target = static_cast<std::uint64_t>(rounded);
    const auto missing = target - data.completed;
    const auto limit = static_cast<std::uint64_t>(0.25 * data.sampleRate / data.quantum);
    const auto count = data.domain == ControlDomain::render ? std::min(missing, limit) : missing;
    // Audio ticks represent at most one quantum. Reject a gap instead of doing
    // unbounded catch-up work on the audio thread. Offline drivers tick each one.
    if (data.domain == ControlDomain::audio && count > 1) { return {}; }
    data.completed += missing - count;
    TickContext step = context;
    step.dt = data.quantum / data.sampleRate;
    for (std::uint64_t i = 0; i < count; ++i) {
        ++data.completed;
        step.seconds = static_cast<double>(data.completed) * data.quantum / data.sampleRate;
        step.beats = context.beats - (context.seconds - step.seconds) * context.beatsPerSecond;
        step.frame = data.completed;
        data.evaluate(step, true);
    }
    data.evaluate(context, false);
    data.lastSeconds = context.seconds;
    return {true, count, missing - count};
}

ControlExecutor::Prepared ControlExecutor::prepare(const Plan& plan, ControlDomain domain) {
    std::string current = "$control";
    const auto failure = [&](std::string reason, std::string detail) -> Prepared {
        return {nullptr, Diagnostic{current, std::move(reason), std::move(detail)}};
    };
    try {
        auto data = std::make_unique<Storage>();
        data->domain = domain;
        data->sampleRate = plan.at("session").at("sampleRate").get<double>();
        data->quantum = plan.at("session").at("quantum").get<double>();
        if ((data->sampleRate != 44100 && data->sampleRate != 48000) || data->quantum != 128) { return failure("session", "Unsupported sample rate or quantum"); }
        const auto& control = plan.at("control");
        const auto count = control.at("registers").get<unsigned>();
        if (count > 100000) { return failure("register", "Too many registers"); }
        data->registers.resize(count);
        std::vector<const Plan*> operations;
        std::vector<Instruction> unsorted;
        std::vector<std::optional<std::size_t>> producers(count);
        for (const auto* list : {"ops", "stateful"}) {
            for (const auto& operation : control.at(list)) {
                if (operation.at("domain") != (domain == ControlDomain::render ? "render" : "audio")) { continue; }
                current = operation.at("node").get<std::string>();
                const auto name = operation.at("op").get<std::string>();
                const auto found = std::find_if(std::begin(definitions), std::end(definitions), [&](const auto& d) { return d.name == name; });
                if (found == std::end(definitions)) { return failure("unknown_control", name); }
                if (found->stateful != (std::string_view(list) == "stateful")) { return failure("control_class", name); }
                if (found->stateful && operation.at("stateVersion") != 1) { return failure("state_version", "Expected version 1"); }
                if (operation.at("in").size() != found->inputs) { return failure("control_arity", name); }
                Instruction instruction;
                instruction.op = found->op; instruction.stateful = found->stateful;
                instruction.output = operation.at("out").get<unsigned>();
                if (instruction.output >= count || producers[instruction.output]) { return failure("register", "Invalid or multiply-written register"); }
                for (unsigned i = 0; i < found->inputs; ++i) {
                    instruction.inputs[i] = operation.at("in")[i].get<unsigned>();
                    if (instruction.inputs[i] >= count) { return failure("register", "Input out of bounds"); }
                }
                const auto& values = operation.at("values");
                const auto size = values.size();
                if ((found->op == Op::constant && (size < 1 || size > 4)) ||
                    (found->op == Op::sine && size != 2) || (found->op == Op::noise && size != 1) ||
                    (found->op != Op::constant && found->op != Op::sine && found->op != Op::noise && size != 0)) {
                    return failure("control_values", name);
                }
                for (std::size_t i = 0; i < size; ++i) {
                    instruction.literal.lanes[i] = values[i].get<double>();
                    if (!std::isfinite(instruction.literal.lanes[i])) { return failure("control_values", "Non-finite literal"); }
                }
                if (found->op == Op::noise && instruction.literal.lanes[0] < 0) { return failure("control_values", "Noise rate must be nonnegative"); }
                instruction.literal.width = static_cast<unsigned>(size);
                instruction.seed = nodeSeed(plan.at("session").at("seed").get<std::uint32_t>(), current);
                producers[instruction.output] = unsorted.size();
                operations.push_back(&operation); unsorted.push_back(instruction);
            }
        }
        std::vector<std::vector<std::size_t>> edges(unsorted.size());
        std::vector<unsigned> incoming(unsorted.size());
        for (std::size_t i = 0; i < unsorted.size(); ++i) {
            current = operations[i]->at("node").get<std::string>();
            for (const auto& input : operations[i]->at("in")) {
                const auto producer = producers[input.get<unsigned>()];
                if (!producer) { return failure("register", "Input has no producer in this domain"); }
                edges[*producer].push_back(i); ++incoming[i];
            }
        }
        std::queue<std::size_t> ready;
        for (std::size_t i = 0; i < incoming.size(); ++i) { if (incoming[i] == 0) { ready.push(i); } }
        while (!ready.empty()) {
            const auto i = ready.front(); ready.pop();
            current = operations[i]->at("node").get<std::string>();
            auto instruction = unsorted[i];
            const bool packed = instruction.op == Op::vec2 || instruction.op == Op::vec3 || instruction.op == Op::vec4;
            unsigned width = 1;
            for (const auto& input : operations[i]->at("in")) {
                const auto inputWidth = data->registers[input.get<unsigned>()].width;
                if ((packed || instruction.op == Op::counter || instruction.op == Op::oscillator || instruction.op == Op::hold) && inputWidth != 1) {
                    return failure("control_width", "This operation requires scalar inputs");
                }
                if (inputWidth != 1 && width != 1 && inputWidth != width) { return failure("control_width", "Incompatible vector widths"); }
                width = std::max(width, inputWidth);
            }
            if (packed) { width = static_cast<unsigned>(operations[i]->at("in").size()); }
            if (instruction.op == Op::constant) { width = instruction.literal.width; }
            instruction.width = width;
            data->registers[instruction.output].width = width;
            data->instructions.push_back(instruction);
            for (auto target : edges[i]) { if (--incoming[target] == 0) { ready.push(target); } }
        }
        if (data->instructions.size() != unsorted.size()) { return failure("cycle", "Control dependency cycle"); }
        data->states.resize(data->instructions.size());
        return {std::make_unique<ControlExecutor>(std::move(data)), std::nullopt};
    } catch (const Plan::exception& error) { return failure("structure", error.what()); }
}
}
