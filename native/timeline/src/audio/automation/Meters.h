#pragma once
#include "audio/Mixer.h"
#include "MeterReadings.h"
namespace nt::automation {
void attachMeters(audio::MixPlan& plan);
// Building a mix plan attaches meter taps and replaces the readings the mixer shows. A plan built for
// analysis (loudness measurement, ducking) has no business doing that: while one of these is alive on a
// thread, plans built on that thread attach no taps and leave the readings alone.
class ScopedNoMeters {
public:
    ScopedNoMeters();
    ~ScopedNoMeters();
    ScopedNoMeters(const ScopedNoMeters&) = delete;
    ScopedNoMeters& operator=(const ScopedNoMeters&) = delete;
private:
    bool previous_;
};
}
