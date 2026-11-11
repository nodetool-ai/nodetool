#pragma once
#include <cstddef>
namespace nt {
// Storage precision only. Transfer and effect domains remain unchanged.
enum class WorkingFormat { Rgba8, Rgba16F };
constexpr size_t workingPixelBytes(WorkingFormat format) {
    return format == WorkingFormat::Rgba16F ? 8u : 4u;
}
}
