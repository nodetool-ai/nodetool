#include "offline_slots.h"
#include <bit>
#include <cmath>
#include <fstream>
#include <stdexcept>

namespace nt::realtime {
OfflineSlots loadOfflineSlots(const Plan& plan, std::span<const OfflineSlotFile> files) {
    std::unordered_map<std::string, const Plan*> declarations;
    for (const auto& slot : plan["slots"]) {
        const auto id = slot["id"].get<std::string>();
        if (slot["kind"] != "buffer" && slot["kind"] != "texture") {
            throw std::runtime_error(id + ": offline control/event/latched slot inputs are not implemented");
        }
        declarations.emplace(id, &slot);
    }
    std::unordered_set<std::string> needed;
    for (const auto& node : plan["audio"]["nodes"]) {
        if (node.contains("bufferSlot")) { needed.insert(node["bufferSlot"].get<std::string>()); }
    }
    std::unordered_map<std::string, const Plan*> passes;
    for (const auto& pass : plan["render"]["passes"]) { passes.emplace(pass["node"].get<std::string>(), &pass); }
    std::vector<std::string> pending;
    std::unordered_set<std::string> visited;
    if (plan["render"].contains("present")) { pending.push_back(plan["render"]["present"]["source"].get<std::string>()); }
    while (!pending.empty()) {
        auto name = std::move(pending.back()); pending.pop_back();
        if (!visited.insert(name).second) { continue; }
        const auto pass = passes.find(name);
        if (pass == passes.end()) { needed.insert(std::move(name)); continue; }
        for (const auto& input : (*pass->second)["inputs"]) { pending.push_back(input.get<std::string>()); }
    }
    std::unordered_map<std::string, std::filesystem::path> bindings;
    for (const auto& file : files) {
        if (!declarations.contains(file.id) || !needed.contains(file.id)) { throw std::runtime_error(file.id + ": slot binding is not consumed by this plan"); }
        if (!bindings.emplace(file.id, file.path).second) { throw std::runtime_error(file.id + ": duplicate slot binding"); }
    }
    OfflineSlots result;
    std::uint64_t remaining = 256ull * 1024 * 1024;
    // Declaration order determines preparation and diagnostics, not hash iteration.
    for (const auto& slot : plan["slots"]) {
        const auto id = slot["id"].get<std::string>();
        if (!needed.contains(id)) { continue; }
        const auto binding = bindings.find(id);
        if (binding == bindings.end()) { throw std::runtime_error(id + ": missing --slot ID=FILE binding"); }
        if (!std::filesystem::is_regular_file(binding->second)) { throw std::runtime_error(id + ": slot source must be a regular file"); }
        const auto size = std::filesystem::file_size(binding->second);
        if (size == 0 || size > remaining) { throw std::runtime_error(id + ": empty slot or combined inputs exceed 256 MiB"); }
        remaining -= size;
        std::vector<std::byte> bytes(static_cast<std::size_t>(size));
        std::ifstream stream(binding->second, std::ios::binary);
        stream.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
        if (!stream || stream.peek() != std::char_traits<char>::eof()) { throw std::runtime_error(id + ": failed or changed slot file"); }
        if (slot["kind"] == "texture") {
            result.textures.emplace(id, std::move(bytes));
        } else {
            const unsigned channels = slot["channels"] == "mono" ? 1 : 2;
            if (bytes.size() % (channels * 4) != 0) { throw std::runtime_error(id + ": expected planar float32 little-endian PCM"); }
            AudioBufferSlot pcm{id, plan["session"]["sampleRate"].get<unsigned>(), channels, {}};
            pcm.samples.resize(bytes.size() / 4);
            for (std::size_t sample = 0; sample < pcm.samples.size(); ++sample) {
                std::uint32_t value = 0;
                for (unsigned byte = 0; byte < 4; ++byte) {
                    value |= std::to_integer<std::uint32_t>(bytes[sample * 4 + byte]) << (byte * 8);
                }
                pcm.samples[sample] = std::bit_cast<float>(value);
                if (!std::isfinite(pcm.samples[sample])) { throw std::runtime_error(id + ": non-finite PCM sample"); }
            }
            result.audio.push_back(std::move(pcm));
        }
    }
    return result;
}
}
