#include "TimeRemap.h"
namespace {
// timeline-ops does not otherwise need TimelineJson. Retain its mapper too.
const bool registered = [] { nt::speed::registerTimeRemapMapper(); return true; }();
}
