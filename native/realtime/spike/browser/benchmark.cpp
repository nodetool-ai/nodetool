#include "nodetool/realtime/offline_gpu.h"
#include <emscripten.h>
#include <fstream>
#include <iostream>
#include <stdexcept>

// Browser main-thread-owned benchmark. The private GPU owner outlives every
// readback and callback. Preparation and reporting are outside measured frames.
int main() {
    using namespace nt::realtime;
    try {
        Plan plan, catalog;
        std::ifstream("/plan.json") >> plan;
        std::ifstream("/gpu-catalog.json") >> catalog;
        Registry registry;
        registry.analyticOps.insert("constant");
        registry.modules["sources.solid@1"].uniforms = 1;
        registry.modules["color.invert@1"].uniforms = 1;
        registry.modules["color.invert@1"].inputs["source"] = {"linear", "premultiplied", {}};
        auto prepared = OfflineGpu::prepare(plan, registry, catalog.dump());
        if (!prepared.gpu) { throw std::runtime_error(prepared.error->detail); }
        auto gpu = std::move(prepared.gpu);
        std::vector<ControlValue> values(plan["control"]["registers"].get<unsigned>());
        for (const auto& op : plan["control"]["ops"]) {
            auto& value = values.at(op["out"].get<unsigned>());
            value.width = op["values"].size();
            if (value.width > value.lanes.size()) { throw std::runtime_error("Invalid constant width"); }
            for (unsigned i = 0; i < value.width; ++i) { value.lanes[i] = op["values"][i]; }
        }
        std::vector<std::byte> pixels(gpu->readbackBytes());
        std::vector<double> encode, complete;
        encode.reserve(120); complete.reserve(120);
        for (unsigned frame = 0; frame < 150; ++frame) {
            const auto start = emscripten_get_now();
            const auto result = gpu->render({values, {}, true, false}, true);
            const auto submitted = emscripten_get_now();
            if (!result.readbackQueued) { throw std::runtime_error("Frame rejected"); }
            std::uint64_t captured = 0;
            while (true) {
                if (!gpu->poll()) { throw std::runtime_error("Readback failed"); }
                if (gpu->takeReadback(pixels, captured)) { break; }
                if (emscripten_get_now() - start > 10000) { throw std::runtime_error("Readback timeout"); }
                emscripten_sleep(0);
            }
            if (captured != frame) { throw std::runtime_error("Readback order changed"); }
            if (frame >= 30) {
                encode.push_back(submitted - start);
                complete.push_back(emscripten_get_now() - start);
            }
        }
        std::vector<unsigned> bytes;
        for (const auto value : pixels) { bytes.push_back(std::to_integer<unsigned>(value)); }
        std::cout << "RT_BENCH " << Plan{{"encodeMs", encode}, {"completeMs", complete}, {"pixels", bytes}}.dump() << '\n';
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
