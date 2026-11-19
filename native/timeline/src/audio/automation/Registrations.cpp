#include "audio/automation/Automation.h"
#include "audio/automation/Meters.h"

namespace {
const bool registered = [] {
    nt::automation::registerEdits();
    nt::automation::registerMeterStage();
    return true;
}();
}
