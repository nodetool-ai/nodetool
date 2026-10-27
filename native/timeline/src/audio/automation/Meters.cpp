#include "Meters.h"
#include <atomic>
#include <cmath>
#include <numbers>

namespace nt::automation {
namespace {
void publish(std::atomic<float>& target, float value) noexcept {
    auto current = target.load(std::memory_order_relaxed);
    while (current < value && !target.compare_exchange_weak(current, value, std::memory_order_relaxed)) {}
}
class Meter final : public audio::BlockProcessor {
public:
    Meter(std::shared_ptr<MeterPeaks> peaks, double gain, double pan,
          std::shared_ptr<const audio::ParameterSource> gainSource,
          std::shared_ptr<const audio::ParameterSource> panSource)
        : peaks_(std::move(peaks)), gain_(gain), pan_(pan), gainSource_(std::move(gainSource)), panSource_(std::move(panSource)) {}
    void process(std::span<float> stereo, const audio::BlockContext& context) noexcept override {
        float left = 0, right = 0;
        for (std::size_t i = 0; i < stereo.size(); i += 2) {
            const double t = context.timelineMs + static_cast<double>(i/2)*context.msPerFrame;
            const double gain = gainSource_ ? gainSource_->valueAt(t,gain_) : gain_;
            const double pan = std::clamp(panSource_ ? panSource_->valueAt(t,pan_) : pan_, -1., 1.);
            double l = stereo[i], r = stereo[i+1];
            if (pan < 0) { const auto x=(pan+1)*std::numbers::pi/2; l+=r*std::cos(x); r*=std::sin(x); }
            else if (pan > 0) { const auto x=pan*std::numbers::pi/2; r+=l*std::sin(x); l*=std::cos(x); }
            left=std::max(left,static_cast<float>(std::abs(l*gain)));
            right=std::max(right,static_cast<float>(std::abs(r*gain)));
        }
        publish(peaks_->left,left); publish(peaks_->right,right);
    }
    void reset() noexcept override {
        audio::BlockProcessor::reset(); peaks_->left.store(0,std::memory_order_relaxed); peaks_->right.store(0,std::memory_order_relaxed);
    }
private:
    std::shared_ptr<MeterPeaks> peaks_;
    double gain_, pan_;
    std::shared_ptr<const audio::ParameterSource> gainSource_, panSource_;
};
std::shared_ptr<audio::BlockProcessor> tap(const std::string& id, double gain, double pan,
        std::shared_ptr<const audio::ParameterSource> gainSource, std::shared_ptr<const audio::ParameterSource> panSource) {
    auto peaks=publishMeter(id);
    auto meter=std::make_shared<Meter>(peaks,gain,pan,std::move(gainSource),std::move(panSource));
    meter->id="p2-meter:"+id;
    return meter;
}
}
void attachMeters(audio::MixPlan& plan) {
    beginMeterPlan();
    for (auto& track : plan.tracks) { track.processors.push_back(tap(track.trackId,track.gain,track.pan,track.gainSource,track.panSource)); }
    plan.processors.push_back(tap("master",plan.masterGain,0,plan.gainSource,{}));
}
}
