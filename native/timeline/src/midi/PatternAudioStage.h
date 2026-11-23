#pragma once

// Real-time MixPlan stage (priority 99) that derives `kind: "device"` automation
// from pattern clips (SQ41) and applies the merged curves (stored automation
// wins outside each pattern clip; pattern points replace inside) to matching
// native instrument or built-in insert BlockProcessors.
//
// Thread affinity: `runPatternDeviceAutomationStage` runs on the plan-build /
// control thread; the attached BlockProcessor runs on the real-time audio
// callback (or offline render) thread with zero locks, zero heap allocations,
// and zero blocking.

#include "audio/Mixer.h"

namespace nt::midi {

// Attaches merged device curves to native instrument or built-in insert processors.
void runPatternDeviceAutomationStage(const Timeline& timeline, audio::MixPlan& plan);

// Registers the native subtractive instrument at priority -1 and pattern
// automation at 99 (before AutomationStage at 100). Returns the automation
// stage token. Both registrations are idempotent.
[[nodiscard]] audio::MixPlanStageToken registerPatternAutomationStage();

}  // namespace nt::midi
