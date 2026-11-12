#include "nodetool/realtime/control.h"
#include "nodetool/realtime/math.h"
#include "platform/SanitizerBuild.h"
#ifndef NT_SANITIZED
#include "audio/TestAllocationCounter.h"
#endif
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
using namespace nt::realtime;
void require(bool condition, const char* message) { if (!condition) { throw std::runtime_error(message); } }
void near(double actual, double expected, double tolerance = 1e-10) {
    if (!std::isfinite(actual) || std::abs(actual - expected) > tolerance) {
        throw std::runtime_error("Value mismatch: " + std::to_string(actual) + " expected " + std::to_string(expected));
    }
}
Plan base(unsigned registers = 16) {
    return {{"session", {{"sampleRate", 48000}, {"quantum", 128}, {"seed", 123}}},
        {"control", {{"registers", registers}, {"ops", Plan::array()}, {"stateful", Plan::array()}}}};
}
Plan operation(const char* name, unsigned output, std::vector<unsigned> inputs = {}, std::vector<double> values = {}, bool stateful = false) {
    Plan result = {{"node", "node-" + std::to_string(output)}, {"op", name}, {"domain", "render"},
        {"out", output}, {"in", inputs}, {"values", values}};
    if (stateful) { result["stateVersion"] = 1; }
    return result;
}
void constant(Plan& plan, unsigned output, std::vector<double> values) {
    plan["control"]["ops"].push_back(operation("constant", output, {}, std::move(values)));
}
std::unique_ptr<ControlExecutor> prepare(const Plan& plan, ControlDomain domain = ControlDomain::render) {
    auto prepared = ControlExecutor::prepare(plan, domain);
    if (!prepared.executor) { throw std::runtime_error(prepared.error->node + ": " + prepared.error->reason); }
    return std::move(prepared.executor);
}
void rejected(const Plan& plan, const char* reason) {
    const auto result = ControlExecutor::prepare(plan, ControlDomain::render);
    require(!result.executor && result.error && result.error->reason == reason, "Wrong preparation rejection");
}
TickContext tickAt(double seconds) { return {seconds, seconds * 2, 1.0 / 60, 2, 7, 640, 480}; }
double scalar(const ControlExecutor& executor, unsigned index) { return executor.registers()[index].lanes[0]; }

void analytic() {
    struct BinaryCase { const char* name; double a; double b; double expected; };
    for (const auto& test : {BinaryCase{"add", 2, 3, 5}, {"subtract", 2, 3, -1},
        {"multiply", 2, 3, 6}, {"divide", 6, 3, 2}, {"divide", 6, 0, 0},
        {"min", 2, 3, 2}, {"max", 2, 3, 3}, {"less", 2, 3, 1},
        {"less", 3, 2, 0}, {"equal", 2, 2, 1}, {"equal", 2, 3, 0}, {"pow", 2, 3, 8}}) {
        auto plan = base();
        // Deliberately reverse dependency order to exercise preparation sorting.
        plan["control"]["ops"].push_back(operation(test.name, 2, {0, 1}));
        constant(plan, 1, {test.b}); constant(plan, 0, {test.a});
        auto executor = prepare(plan); require(executor->tick(tickAt(0)).accepted, "Analytic tick rejected");
        near(scalar(*executor, 2), test.expected);
    }
    auto plan = base();
    const char* sources[] = {"time.seconds", "time.beats", "time.dt", "time.frame", "output.width", "output.height"};
    for (unsigned i = 0; i < 6; ++i) { plan["control"]["ops"].push_back(operation(sources[i], i)); }
    auto executor = prepare(plan); executor->tick(tickAt(0.1));
    const double expected[] = {0.1, 0.2, 1.0 / 60, 7, 640, 480};
    for (unsigned i = 0; i < 6; ++i) { near(scalar(*executor, i), expected[i]); }
    for (unsigned width = 2; width <= 4; ++width) {
        plan = base(); std::vector<unsigned> inputs;
        for (unsigned i = 0; i < width; ++i) { constant(plan, i, {static_cast<double>(i + 1)}); inputs.push_back(i); }
        plan["control"]["ops"].push_back(operation(("vec" + std::to_string(width)).c_str(), 4, inputs));
        constant(plan, 5, {2});
        plan["control"]["ops"].push_back(operation("multiply", 6, {4, 5}));
        executor = prepare(plan); executor->tick(tickAt(0));
        require(executor->registers()[6].width == width, "Wrong packed width");
        for (unsigned i = 0; i < width; ++i) { near(executor->registers()[6].lanes[i], 2 * (i + 1)); }
    }
    plan = base();
    for (unsigned i = 0; i < 5; ++i) { constant(plan, i, {std::array<double, 5>{0.5, 0, 1, 10, 20}[i]}); }
    plan["control"]["ops"].push_back(operation("remap", 5, {0, 1, 2, 3, 4}));
    plan["control"]["ops"].push_back(operation("tanh", 6, {0}));
    plan["control"]["ops"].push_back(operation("sine", 7, {}, {1, 0}));
    plan["control"]["ops"].push_back(operation("noise", 8, {}, {4}));
    executor = prepare(plan); executor->tick(tickAt(0.25));
    near(scalar(*executor, 5), 15); near(scalar(*executor, 6), std::tanh(0.5)); near(scalar(*executor, 7), 1);
    const auto firstNoise = scalar(*executor, 8);
    executor->tick(tickAt(0.3)); near(scalar(*executor, 8), firstNoise, 0);
    executor->tick(tickAt(0.5)); require(scalar(*executor, 8) != firstNoise, "Noise did not advance");
    auto again = prepare(plan); again->tick(tickAt(0.25)); near(scalar(*again, 8), firstNoise, 0);
    plan["session"]["seed"] = 456; again = prepare(plan); again->tick(tickAt(0.25));
    require(scalar(*again, 8) != firstNoise, "Seed ignored");
    plan["control"]["ops"][2]["values"] = {0};
    executor = prepare(plan); executor->tick(tickAt(0)); near(scalar(*executor, 5), 10);
}

Plan statePlan(const char* name, std::vector<double> values) {
    auto plan = base(); std::vector<unsigned> inputs;
    for (unsigned i = 0; i < values.size(); ++i) { constant(plan, i, {values[i]}); inputs.push_back(i); }
    plan["control"]["stateful"].push_back(operation(name, 10, inputs, {}, true));
    return plan;
}
void stateful() {
    constexpr double quantum = 128.0 / 48000;
    for (const auto* name : {"damp", "envelope", "oscillator", "sample_hold", "integrator", "counter"}) {
        std::vector<double> inputs;
        if (std::string_view(name) == "damp") { inputs = {1, 0.2}; }
        else if (std::string_view(name) == "envelope") { inputs = {1, 0.1, 0.2}; }
        else if (std::string_view(name) == "counter") { inputs = {1, 0}; }
        else { inputs = {1}; }
        const auto plan = statePlan(name, inputs);
        auto executor = prepare(plan);
        require(executor->tick(tickAt(0)).steps == 0, "State advanced at time zero");
        const auto first = executor->tick(tickAt(quantum));
        require(first.steps == 1 && first.skipped == 0, "Wrong quantum count");
        const double value = scalar(*executor, 10);
        if (std::string_view(name) == "damp") { near(value, 1 - std::exp(-quantum / 0.2)); }
        if (std::string_view(name) == "envelope") { near(value, quantum / 0.1); }
        if (std::string_view(name) == "oscillator") { near(value, std::sin(quantum * 2 * 3.141592653589793)); }
        if (std::string_view(name) == "integrator") { near(value, quantum); }
        if (std::string_view(name) == "counter") { near(value, 1); }
        if (std::string_view(name) == "sample_hold") { require(value >= -1 && value < 1, "Noise outside range"); }
        require(executor->tick(tickAt(quantum)).steps == 0, "Repeated time advanced state");
        near(scalar(*executor, 10), value, 0);
        executor->tick(tickAt(2 * quantum));
        if (std::string_view(name) == "counter" || std::string_view(name) == "sample_hold") { near(scalar(*executor, 10), value, 0); }
        require(!executor->tick(tickAt(0)).accepted, "Backward clock accepted without reset");
        executor->reset(); executor->tick(tickAt(quantum)); near(scalar(*executor, 10), value, 0);
    }
    auto envelope = prepare(statePlan("envelope", {0, 0.1, 0.1}));
    envelope->tick(tickAt(0.1)); near(scalar(*envelope, 10), 0);
    auto counter = prepare(statePlan("counter", {1, 1})); counter->tick(tickAt(quantum)); near(scalar(*counter, 10), 0);
    auto instant = prepare(statePlan("damp", {2, 0})); instant->tick(tickAt(quantum)); near(scalar(*instant, 10), 2);
    auto held = prepare(statePlan("sample_hold", {48000.0 / 128})); held->tick(tickAt(quantum));
    const auto value = scalar(*held, 10); held->tick(tickAt(2 * quantum)); require(value != scalar(*held, 10), "Sample hold failed to cross phase");

    auto changing = statePlan("envelope", {1, 10 * quantum, 20 * quantum});
    changing["control"]["ops"][0] = operation("time.seconds", 3);
    constant(changing, 4, {10 * quantum});
    changing["control"]["ops"].push_back(operation("less", 0, {3, 4}));
    envelope = prepare(changing);
    envelope->tick(tickAt(9 * quantum)); near(scalar(*envelope, 10), 0.9);
    envelope->tick(tickAt(10 * quantum)); near(scalar(*envelope, 10), 0.85);
    envelope->tick(tickAt(30 * quantum)); near(scalar(*envelope, 10), 0);

    changing = statePlan("oscillator", {1});
    changing["control"]["ops"][0] = operation("time.seconds", 0);
    auto modulated = prepare(changing); modulated->tick(tickAt(20 * quantum));
    near(scalar(*modulated, 10), std::sin(2 * 3.141592653589793 * quantum * quantum * 20 * 21 / 2));
    changing = statePlan("integrator", {1});
    changing["control"]["ops"][0]["values"] = {1, -2, 3, -4};
    auto vector = prepare(changing); vector->tick(tickAt(10 * quantum));
    for (unsigned lane = 0; lane < 4; ++lane) {
        near(vector->registers()[10].lanes[lane], std::array<double, 4>{1, -2, 3, -4}[lane] * 10 * quantum);
    }
}

void cadence() {
    for (const unsigned rate : {44100u, 48000u}) {
        auto plan = statePlan("damp", {1, 0.2}); plan["session"]["sampleRate"] = rate;
        auto slow = prepare(plan); auto fast = prepare(plan); auto exact = prepare(plan);
        double lastSlow = 0;
        for (unsigned frame = 1; frame <= 120; ++frame) {
            const double time = frame / 120.0;
            fast->tick(tickAt(time));
            if (frame % 2 == 0) {
                slow->tick(tickAt(time)); lastSlow = scalar(*slow, 10);
                near(lastSlow, scalar(*fast, 10), 0);
            }
        }
        const unsigned steps = rate / 128;
        for (unsigned i = 1; i <= steps; ++i) { exact->tick(tickAt(i * 128.0 / rate)); }
        near(lastSlow, scalar(*exact, 10), 0);
        auto audioPlan = plan;
        for (auto& op : audioPlan["control"]["ops"]) { op["domain"] = "audio"; }
        audioPlan["control"]["stateful"][0]["domain"] = "audio";
        auto audio = prepare(audioPlan, ControlDomain::audio);
        require(!audio->tick(tickAt(1)).accepted, "Audio accepted an unbounded gap");
        for (unsigned i = 1; i <= steps; ++i) { require(audio->tick(tickAt(i * 128.0 / rate)).accepted, "Audio quantum rejected"); }
        near(scalar(*audio, 10), lastSlow, 0);
        auto stalled = prepare(plan); const auto result = stalled->tick(tickAt(2));
        const auto limit = static_cast<unsigned>(0.25 * rate / 128);
        require(result.accepted && result.steps == limit && result.skipped == (2 * rate / 128 - limit), "Wrong catch-up accounting");
        near(scalar(*stalled, 10), 1 - std::exp(-static_cast<double>(limit) * 128 / rate / 0.2));
        auto timed = statePlan("integrator", {1}); timed["session"]["sampleRate"] = rate;
        timed["control"]["ops"][0] = operation("time.seconds", 0);
        auto recent = prepare(timed); recent->tick(tickAt(2));
        const double last = 2 * rate / 128;
        const double sum = limit * (2 * last - limit + 1) / 2;
        near(scalar(*recent, 10), sum * (128.0 / rate) * (128.0 / rate));
    }
}

void validation() {
    auto valid = statePlan("damp", {1, 0.2}); auto plan = valid;
    plan["control"]["stateful"][0]["stateVersion"] = 2; rejected(plan, "state_version");
    plan = valid; plan["control"]["stateful"][0]["in"] = {0}; rejected(plan, "control_arity");
    plan = valid; plan["control"]["ops"][0]["values"] = {}; rejected(plan, "control_values");
    plan = valid; plan["control"]["stateful"][0]["op"] = "missing"; rejected(plan, "unknown_control");
    plan = valid; plan["control"]["stateful"][0]["out"] = 1000; rejected(plan, "register");
    plan = valid; plan["control"]["ops"][0]["domain"] = "audio"; rejected(plan, "register");
    plan = valid; plan["control"]["stateful"][0]["in"] = {10, 1}; rejected(plan, "cycle");
    plan = valid; plan["control"]["ops"][0]["values"] = {1, 2}; plan["control"]["ops"][1]["values"] = {1, 2, 3}; rejected(plan, "control_width");
    auto executor = prepare(valid); const auto old = scalar(*executor, 10);
    auto invalid = tickAt(std::numeric_limits<double>::infinity()); require(!executor->tick(invalid).accepted, "Infinite clock accepted");
    invalid = tickAt(-1); require(!executor->tick(invalid).accepted, "Negative clock accepted");
    near(scalar(*executor, 10), old, 0);
    auto large = base(10000); constant(large, 0, {1});
    for (unsigned i = 1; i < 10000; ++i) { large["control"]["ops"].push_back(operation("add", i, {i - 1, 0})); }
    executor = prepare(large); executor->tick(tickAt(0)); near(scalar(*executor, 9999), 10000);
    large["control"]["ops"][0] = operation("add", 0, {9999, 9999}); rejected(large, "cycle");
}

void projectMath() {
    for (int i = -10000; i <= 10000; ++i) {
        const double x = i / 100.0;
        near(math::sine(x), std::sin(x), 2e-14);
        near(math::hyperbolicTangent(x), std::tanh(x), 1e-14);
        near(math::exponential(x) / std::exp(x), 1, 2e-14);
    }
    for (double x : {-700.0, -500.0, 500.0, 700.0}) { near(math::exponential(x) / std::exp(x), 1, 1e-13); }
    for (double x : {0.01, 0.5, 1.0, 2.0, 100.0}) {
        for (double y : {-3.0, -0.5, 0.0, 0.5, 3.0}) { near(math::power(x, y) / std::pow(x, y), 1, 2e-14); }
    }
    near(math::power(-2, 3), -8); require(std::isnan(math::power(-2, 0.5)), "Invalid power accepted");
    require(std::isnan(math::sine(0x1p31)), "Out-of-range sine accepted");
    near(math::exponential(-701), 0); require(std::isinf(math::exponential(701)), "Exp overflow not explicit");
}

void allocation() {
#ifndef NT_SANITIZED
    require(nt::testing::countsAnAllocation(), "Allocation counter positive control failed");
    auto executor = prepare(statePlan("damp", {1, 0.2}));
    nt::testing::allocations = 0; nt::testing::countAllocations = true;
    for (unsigned i = 0; i < 10000; ++i) { executor->tick(tickAt(i / 120.0)); }
    executor->reset();
    nt::testing::countAllocations = false;
    require(nt::testing::allocations == 0, "Control tick allocated");
    std::cout << "C++ allocation audit: zero, positive control passed\n";
#else
    std::cout << "Allocation audit requires separate unsanitized run\n";
#endif
}
}
int main() {
    try { analytic(); stateful(); cadence(); validation(); projectMath(); allocation(); std::cout << "Control executor tests passed\n"; }
    catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
