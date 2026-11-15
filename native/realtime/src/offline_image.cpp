#include "offline_image.h"
#include <algorithm>
#include <fstream>
#include <stdexcept>
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STB_IMAGE_WRITE_STATIC
#include <stb_image_write.h>

namespace nt::realtime {
std::string loadOfflineCatalog(const std::filesystem::path& path, Registry& registry) {
    const auto source = path.empty() ? std::filesystem::path(NT_GPU_CATALOG) : path;
    const auto size = std::filesystem::file_size(source);
    if (size > 64ull * 1024 * 1024) { throw std::length_error("GPU catalog exceeds 64 MiB"); }
    std::ifstream stream(source, std::ios::binary);
    std::string text(static_cast<std::size_t>(size), '\0');
    stream.read(text.data(), static_cast<std::streamsize>(text.size()));
    if (!stream || stream.peek() != std::char_traits<char>::eof()) { throw std::runtime_error("Cannot read GPU catalog"); }
    const auto catalog = Plan::parse(text);
    if (catalog.at("format") != 1 || !catalog.at("modules").is_object()) { throw std::runtime_error("Expected format-1 GPU catalog"); }
    for (const auto& [name, module] : catalog["modules"].items()) {
        if (module.at("kind") != "fragment" && module.at("kind") != "compute") { continue; }
        ModuleDefinition definition;
        for (const auto& [input, contract] : module.at("io").at("inputs").items()) {
            definition.inputs.emplace(input, TextureInput{"linear", contract.value("alpha", "premultiplied"), {}, contract.value("optional", false)});
        }
        if (module.contains("uniform") && module["uniform"].is_object()) { definition.uniforms = module["uniform"].at("fields").size(); }
        registry.modules.emplace(name, std::move(definition));
    }
    return text;
}
void writeOfflinePng(const std::filesystem::path& path, std::span<std::byte> pixels,
    unsigned width, unsigned height) {
    if (width == 0 || height == 0 || width > 16384 || height > 16384 ||
        pixels.size() != static_cast<std::size_t>(width) * height * 4) { throw std::runtime_error("Invalid PNG dimensions"); }
    // GPU readback is premultiplied. PNG stores unassociated alpha.
    for (std::size_t i = 0; i < pixels.size(); i += 4) {
        const auto alpha = std::to_integer<unsigned>(pixels[i + 3]);
        for (unsigned channel = 0; channel < 3; ++channel) {
            const auto value = std::to_integer<unsigned>(pixels[i + channel]);
            pixels[i + channel] = static_cast<std::byte>(alpha == 0 ? 0 : std::min(255u, (value * 255 + alpha / 2) / alpha));
        }
    }
    std::ofstream stream(path, std::ios::binary);
    if (!stream) { throw std::runtime_error("Cannot open PNG output"); }
    // Synchronous callback borrows this stream only for the encoder call.
    const auto write = [](void* context, void* bytes, int count) {
        static_cast<std::ofstream*>(context)->write(static_cast<const char*>(bytes), count);
    };
    const auto encoded = stbi_write_png_to_func(write, &stream, static_cast<int>(width), static_cast<int>(height),
        4, pixels.data(), static_cast<int>(width * 4));
    stream.close();
    if (!encoded || !stream) { throw std::runtime_error("PNG encoding or output failed"); }
}
}
