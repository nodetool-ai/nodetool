#pragma once

// Bench diagnostics for render stalls (M1c F7): the QoS class of a thread,
// and the window's occlusion state from AppKit, so a stall can be matched
// against scheduling or occlusion. Information only.

#include <string>

class QWindow;

namespace nt::diag {

// Logs every change of the window's AppKit occlusion state to stderr with a
// steady-clock time in ms, and returns the state now ("visible"/"occluded").
std::string watchOcclusion(QWindow* window);

}  // namespace nt::diag
