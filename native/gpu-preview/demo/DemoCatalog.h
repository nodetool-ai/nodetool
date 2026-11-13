#pragma once

#include <QString>

namespace nt::preview::demo {

// The shader catalog document of the demo (graph-runner gpu_catalog.h):
// "demo.plasma@1" writes rgba8unorm, "demo.plasma16@1" rgba16float.
QString catalogJson(const QString& plasmaWgsl);

}  // namespace nt::preview::demo
