#include "audio/automation/Automation.h"
#include "audio/Mixer.h"
#include "Meters.h"
#include <algorithm>
#include <cmath>
#include <vector>

namespace nt::automation {
namespace {
struct Breakpoint { double time; float value; };
class Ramp final : public audio::ParameterSource {
public:
    Ramp(const QJsonArray& points,bool gain,bool subdivide,bool pan=false) {
        const auto breakpoints=automationBreakpoints(points,0,{{"maxStepMs",10},{"subdivideLinear",subdivide}});
        points_.reserve(static_cast<std::size_t>(breakpoints.size()));
        for (const auto& value : breakpoints) {
            const auto bp=value.toObject(); double v=bp["value"].toDouble();
            if (gain) { v=std::pow(10.,v/20); }
            if (pan) { v=std::clamp(v,-1.,1.); }
            points_.push_back({bp["timeMs"].toDouble(),static_cast<float>(v)});
        }
    }
    double valueAt(double time,double base) const noexcept override {
        if (points_.empty()) { return base; }
        const auto next=std::upper_bound(points_.begin(),points_.end(),time,[](double t,const Breakpoint& p) { return t<p.time; });
        if (next==points_.begin()) { return next->value; }
        const auto& a=*(next-1);
        if (next==points_.end()) { return a.value; }
        // AudioParam rounds endpoints and the ramp fraction to f32, then
        // interpolates with one rounding via f32 fused multiply-add.
        const float fraction=static_cast<float>((time-a.time)/(next->time-a.time));
        return std::fma(fraction,next->value-a.value,a.value);
    }
private:
    std::vector<Breakpoint> points_;
};
struct Parameter {
    std::string name;
    Ramp ramp;
    bool gain;
};
class AutomatedInsert final : public audio::BlockProcessor {
public:
    AutomatedInsert(std::shared_ptr<audio::BlockProcessor> inner,std::vector<Parameter> parameters,bool quantum)
        : inner_(std::move(inner)),parameters_(std::move(parameters)),quantum_(quantum) { id=inner_->id; }
    void prepare(double rate) override { inner_->prepare(rate); }
    void reset() noexcept override { audio::BlockProcessor::reset(); inner_->reset(); }
    bool hasPendingOutput(int n) const noexcept override { return inner_->hasPendingOutput(n); }
    bool keepsActiveInput() const noexcept override { return inner_->keepsActiveInput(); }
    bool setParameter(std::string_view name,double value) noexcept override { return inner_->setParameter(name,value); }
    void process(std::span<float> stereo,const audio::BlockContext& context) noexcept override {
        if (quantum_) {
            // DynamicsCompressorNode's AudioParams are k-rate.
            if (context.quantumOffset==0) { apply(context.timelineMs); }
            inner_->process(stereo,context); return;
        }
        for (std::size_t i=0;i<stereo.size();i+=2) {
            auto sample=context;
            sample.timelineMs+=static_cast<double>(i/2)*context.msPerFrame;
            sample.quantumOffset+=static_cast<int>(i/2);
            apply(sample.timelineMs);
            inner_->process(stereo.subspan(i,2),sample);
        }
    }
private:
    void apply(double time) noexcept {
        for (const auto& p : parameters_) {
            const double value=p.ramp.valueAt(time,0);
            // P1 accepts document units. Gain ramps are in AudioParam units.
            inner_->setParameter(p.name,p.gain?20*std::log10(std::max(value,1e-300)):value);
        }
    }
    std::shared_ptr<audio::BlockProcessor> inner_;
    std::vector<Parameter> parameters_;
    bool quantum_;
};
bool supports(const QString& type,const QString& param) {
    if (type=="gain") { return param=="gainDb"; }
    if (type=="filter") { return param=="frequency" || param=="q"; }
    if (type=="eq3") { return QStringList{"lowFreq","lowGainDb","midFreq","midQ","midGainDb","highFreq","highGainDb"}.contains(param); }
    if (type=="compressor") { return QStringList{"thresholdDb","ratio","attackMs","releaseMs","kneeDb"}.contains(param); }
    return false;
}
void attach(const nt::Timeline& tl,audio::MixPlan& plan) {
    for (auto& bus : plan.tracks) {
        const auto* track=tl.findTrack(bus.trackId);
        if (!track || (track->type!=TrackType::Audio && track->type!=TrackType::Midi)) { continue; }
        const auto lanes=track->raw["automation"].toArray();
        for (const auto& v : lanes) {
            const auto lane=v.toObject(),target=lane["target"].toObject();
            const auto points=lane["points"].toArray();
            if (lane["enabled"]==false || points.empty() || target["kind"]!="mixer") { continue; }
            const bool gain=target["param"]=="volumeDb";
            auto source=std::make_shared<Ramp>(points,gain,gain,!gain);
            if (gain) { bus.gainSource=std::move(source); } else { bus.panSource=std::move(source); }
        }
        for (auto& processor : bus.processors) {
            QString type;
            for (const auto& fx : track->raw["effects"].toArray()) { if (fx.toObject()["id"].toString().toStdString()==processor->id) { type=fx.toObject()["type"].toString(); break; } }
            std::vector<Parameter> parameters;
            for (const auto& v : lanes) {
                const auto lane=v.toObject(),target=lane["target"].toObject();
                const auto points=lane["points"].toArray(); const auto param=target["param"].toString();
                if (lane["enabled"]==false || points.empty() || target["kind"]!="device" || target["deviceId"].toString().toStdString()!=processor->id || !supports(type,param)) { continue; }
                const bool gain=type=="gain";
                const bool curved=gain || (type=="eq3" && param.endsWith("Freq")) || (type=="filter" && param=="frequency");
                parameters.push_back({param.toStdString(),Ramp(points,gain,curved),gain});
            }
            if (!parameters.empty()) { processor=std::make_shared<AutomatedInsert>(processor,std::move(parameters),type=="compressor"); }
        }
    }
    attachMeters(plan);
}
}
void ensureRegistered() {
    static const auto token=audio::registerMixPlanStage("automation",attach,100);
    (void)token;
}
}
