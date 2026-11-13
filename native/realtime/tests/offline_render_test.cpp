#include "nodetool/realtime/offline.h"
#include <chrono>
#include <array>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_STATIC
#define STBI_ONLY_PNG
#include <stb_image.h>

namespace {
using namespace nt::realtime;
void require(bool value, const char* message) { if (!value) { throw std::runtime_error(message); } }
std::string read(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary);
    require(bool(stream), "Missing fixture or output");
    return {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
}
// Test thread only. Owns an exclusively created directory until scope exit.
struct Directory {
    std::filesystem::path path;
    Directory() {
        path = std::filesystem::temp_directory_path() /
            ("nt-render-export-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
        require(std::filesystem::create_directory(path), "Cannot create unique test directory");
    }
    ~Directory() { std::error_code ignored; std::filesystem::remove_all(path, ignored); }
};
void golden(const std::string& png, std::array<int, 4> expected = {255, 0, 0, 128}) {
    int width = 0, height = 0, channels = 0;
    std::unique_ptr<stbi_uc, decltype(&stbi_image_free)> pixels(stbi_load_from_memory(
        reinterpret_cast<const stbi_uc*>(png.data()), static_cast<int>(png.size()), &width, &height, &channels, 4), &stbi_image_free);
    require(pixels && width == 4 && height == 4, "Invalid exported PNG");
    for (unsigned i = 0; i < 16; ++i) {
        for (unsigned channel = 0; channel < 4; ++channel) {
            require(std::abs(static_cast<int>(pixels.get()[i * 4 + channel]) - expected[channel]) <= 1,
                "PNG differs from straight-alpha reference");
        }
    }
}
}
int main() {
    try {
        Directory directory;
        auto plan = Plan::parse(read(std::filesystem::path(NT_FIXTURES) / "offline-render.json"));
        for (unsigned mixed = 0; mixed < 2; ++mixed) {
            if (mixed) {
                const auto audio = Plan::parse(read(std::filesystem::path(NT_FIXTURES) / "offline-audio.json"));
                plan["audio"] = audio["audio"]; plan["params"] = audio["params"];
                for (const auto& op : audio["control"]["ops"]) { plan["control"]["ops"].push_back(op); }
                plan["control"]["stateful"] = audio["control"]["stateful"];
            }
            const auto first = directory.path / (mixed ? "mixed-a" : "render-a");
            const auto second = directory.path / (mixed ? "mixed-b" : "render-b");
            OfflineOptions options{"0.05", "60", first, NT_GPU_CATALOG};
            auto result = runOffline(plan.dump(), options);
            require(!result.error && result.frames == 3 && result.samples == 2400, "First export failed");
            options.output = second;
            require(!runOffline(plan.dump(), options).error, "Repeated export failed");
            for (const auto* name : {"frame-000000.png", "frame-000001.png", "frame-000002.png"}) {
                const auto bytes = read(first / name); golden(bytes);
                require(bytes == read(second / name), "PNG repeat bytes differ");
            }
            require(read(first / "audio.wav") == read(second / "audio.wav"), "WAV repeat bytes differ");
            require(read(first / "manifest.json") == read(second / "manifest.json"), "Manifest repeat bytes differ");
            const auto manifest = Plan::parse(read(first / "manifest.json"));
            require(manifest["imageFrames"] == 3 && manifest["samples"] == 2400, "Manifest counts differ");
        }
        auto timing = Plan::parse(read(std::filesystem::path(NT_FIXTURES) / "offline-render.json"));
        timing["render"]["passes"].erase(timing["render"]["passes"].begin() + 1, timing["render"]["passes"].end());
        timing["render"]["present"]["source"] = "solid";
        timing["render"]["passes"][0]["output"]["colorSpace"] = "srgb";
        timing["control"]["registers"] = 4;
        timing["control"]["ops"] = {
            {{"node", "delta"}, {"op", "time.dt"}, {"domain", "render"}, {"out", 0}, {"in", Plan::array()}, {"values", Plan::array()}},
            {{"node", "zero"}, {"op", "constant"}, {"domain", "render"}, {"out", 1}, {"in", Plan::array()}, {"values", {0}}},
            {{"node", "one"}, {"op", "constant"}, {"domain", "render"}, {"out", 2}, {"in", Plan::array()}, {"values", {1}}},
            {{"node", "pixel"}, {"op", "vec4"}, {"domain", "render"}, {"out", 3}, {"in", {0, 1, 1, 2}}, {"values", Plan::array()}}
        };
        timing["render"]["passes"][0]["uniforms"] = {3};
        OfflineOptions timingOptions{"0.05", "60", directory.path / "timing", NT_GPU_CATALOG};
        require(!runOffline(timing.dump(), timingOptions).error, "Frame delta export failed");
        golden(read(timingOptions.output / "frame-000000.png"), {0, 0, 0, 255});
        golden(read(timingOptions.output / "frame-000001.png"), {4, 0, 0, 255});
        golden(read(timingOptions.output / "frame-000002.png"), {4, 0, 0, 255});
        auto slotPlan = Plan::parse(read(std::filesystem::path(NT_FIXTURES) / "offline-render.json"));
        auto slotOutput = slotPlan["render"]["passes"][0]["output"];
        slotOutput["colorSpace"] = "srgb"; slotOutput["alpha"] = "straight";
        slotPlan["render"]["passes"] = Plan::array();
        slotPlan["render"]["present"]["source"] = "pixels";
        slotPlan["slots"] = {{{"id", "pixels"}, {"kind", "texture"}, {"source", "batch.image"}, {"output", slotOutput}}};
        const auto raw = directory.path / "pixels.rgba";
        {
            std::ofstream stream(raw, std::ios::binary);
            for (unsigned pixel = 0; pixel < 16; ++pixel) {
                const std::array<unsigned char, 4> value{255, 0, 0, 128};
                stream.write(reinterpret_cast<const char*>(value.data()), 4);
            }
        }
        OfflineOptions slotOptions{"0.01", "60", directory.path / "texture-slot", NT_GPU_CATALOG, {{"pixels", raw}}};
        require(!runOffline(slotPlan.dump(), slotOptions).error, "Texture slot export failed");
        golden(read(slotOptions.output / "frame-000000.png"));
        { std::ofstream stream(raw, std::ios::binary | std::ios::trunc); stream.put('x'); }
        slotOptions.output = directory.path / "bad-texture";
        const auto badSlot = runOffline(slotPlan.dump(), slotOptions);
        require(badSlot.error && badSlot.error->reason == "texture_slot" && !std::filesystem::exists(slotOptions.output), "Wrong texture size rejected before output");
        plan["render"]["present"]["colorSpace"] = "linear";
        OfflineOptions invalid{"1", "60", directory.path / "invalid", NT_GPU_CATALOG};
        const auto rejected = runOffline(plan.dump(), invalid);
        require(rejected.error && rejected.error->reason == "presentation" && !std::filesystem::exists(invalid.output),
            "Non-sRGB presentation must fail before writing files");
        std::cout << "Offline render export checks passed\n";
        return 0;
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
