// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,ParametricEq.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/effects/fable/FableDsp.h"

#include <array>

namespace nt::audio::effects::fable {

// Four-band stereo parametric EQ matching FableSynth ParametricEq.
// Parameter layout matches FableEqFields order:
//   [0]=on, [1]=low, [2]=mid, [3]=mfreq, [4]=high, [5]=lfreq, [6]=m2freq,
//   [7]=hfreq, [8]=mid2, [9]=lq, [10]=ltype, [11]=lon, [12]=mq, [13]=mtype,
//   [14]=mon, [15]=m2q, [16]=m2type, [17]=m2on, [18]=hq, [19]=htype, [20]=hon.
// Thread affinity: prepared on control thread; setParams/process/reset on audio render thread only.
class ParametricEq {
public:
    static constexpr int kParamCount = 21;

    void prepare(double sr) noexcept;
    void reset() noexcept;
    void setParams(const std::array<float, kParamCount>& p) noexcept;
    void process(float* L, float* R, int n) noexcept;
    [[nodiscard]] bool hasPendingOutput() const noexcept;
    [[nodiscard]] int latencySamples() const noexcept { return 0; }

private:
    struct Band {
        Biquad l;
        Biquad r;
        Biquad oldL;
        Biquad oldR;
        ChunkRamp freq;
        ChunkRamp gain;
        ChunkRamp q;
        int type = 1;
        int pendingType = 1;
        int xfLeft = 0;
        bool dirty = true;
    };

    std::array<Band, 4> bands_{};
    Smooth wet_{};
    PeakGuard guard_{};
    double sr_ = 48000.0;
    int left_ = 0;
    int typeFadeSamples_ = 144;
    bool primed_ = false;
};

}  // namespace nt::audio::effects::fable
