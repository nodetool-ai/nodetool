#include "audio/automation/Automation.h"
namespace { const bool registered = [] { nt::automation::registerEdits(); nt::automation::ensureRegistered(); nt::automation::registerPictureAutomation(); return true; }(); }
