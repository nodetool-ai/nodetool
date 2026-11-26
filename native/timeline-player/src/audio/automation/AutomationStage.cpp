#include "audio/automation/AutomationCurves.h"
#include "audio/effects/fable/FableColorTimeEffects.h"
#include "audio/effects/fable/FableDynamicsEffects.h"
#include "preview/PlaybackHooks.h"
#include "audio/Mixer.h"
#include <algorithm>
#include <cmath>
#include <vector>

namespace nt::automation {
namespace {
struct Breakpoint { double time; float value; };
// Built on the control thread and read immutably by the audio renderer.
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
// Control-thread construction, then one render thread owns the glide state.
// UI input is sampled once per block. Rendering then evaluates only cached data.
class LiveParameter final : public audio::ParameterSource {
public:
    // RenderLease on the shared prepared mix grants one renderer access to this cache.
    struct Glide {
        bool prepared=false,live=false;
        double raw=0,from=0,target=0,start=0,offset=0;
        double renderTime=0,blockTime=0,step=0,sampleRate=48000,timeScale=1;
        int frames=0;
        MixerReturn::Snapshot release;
    };
    LiveParameter(std::shared_ptr<MixerOverride> state,std::shared_ptr<const audio::ParameterSource> curve,bool gain,
                  std::shared_ptr<Glide> glide={})
        : state_(std::move(state)),curve_(std::move(curve)),gain_(gain),
          curveGeneration_((gain ? state_->volumeReturn : state_->panReturn).generation()),
          glide_(glide ? std::move(glide) : std::make_shared<Glide>()) {}
    std::shared_ptr<Glide> glide() const { return glide_; }
    std::shared_ptr<const audio::ParameterSource> curve() const { return curve_; }
    void beginBlock(const audio::BlockContext& context,int frames,double base) const noexcept override {
        if (curve_) { curve_->beginBlock(context,frames,base); }
        auto& g=*glide_;
        const double time=context.timelineMs;
        const double previous=g.prepared ? valueAt(g.blockTime+g.frames*g.step,base) : curveAt(time,base,g.release);
        if (g.prepared) { g.renderTime+=static_cast<double>(g.frames)*1000./g.sampleRate; }
        g.blockTime=time; g.frames=frames; g.step=context.msPerFrame; g.sampleRate=context.sampleRate;
        g.timeScale=g.step!=0 ? 1000./(g.sampleRate*g.step) : 0;
        const double raw=(gain_ ? state_->volumeDb : state_->pan).load(std::memory_order_acquire);
        const auto previousGeneration=g.release.generation;
        (gain_ ? state_->volumeReturn : state_->panReturn).read(g.release);
        const bool live=std::isfinite(raw);
        if (!g.prepared || live!=g.live || (live && raw!=g.raw) || (!live && g.release.generation!=previousGeneration)) {
            g.from=previous; g.start=g.renderTime;
            g.target=live ? (gain_ ? std::pow(10.,raw/20.) : raw) : 0;
            g.offset=live ? 0 : previous-curveAt(time,base,g.release);
        }
        g.live=live; g.raw=raw; g.prepared=true;
    }
    double valueAt(double time,double base) const noexcept override {
        const auto& g=*glide_;
        // A probe before rendering starts does not drive the render-thread glide.
        if (!g.prepared) {
            const double raw=(gain_ ? state_->volumeDb : state_->pan).load(std::memory_order_acquire);
            if (std::isfinite(raw)) { return gain_ ? std::pow(10.,raw/20.) : raw; }
            MixerReturn::Snapshot release;
            (gain_ ? state_->volumeReturn : state_->panReturn).read(release);
            return curveAt(time,base,release);
        }
        const double fraction=std::clamp((g.renderTime+(time-g.blockTime)*g.timeScale-g.start)/10.,0.,1.);
        return g.live ? g.from+(g.target-g.from)*fraction : curveAt(time,base,g.release)+g.offset*(1-fraction);
    }
private:
    double curveAt(double time,double base,const MixerReturn::Snapshot& release) const noexcept {
        if (release.generation>curveGeneration_ && release.active(time)) { return release.at(time); }
        return curve_ ? curve_->valueAt(time,base) : base;
    }
    // The model and plans share the atomic input. Immutable plans share their base curve across live-override refreshes.
    std::shared_ptr<MixerOverride> state_;
    std::shared_ptr<const audio::ParameterSource> curve_;
    bool gain_;
    const std::uint64_t curveGeneration_;
    // Old/new immutable plans coexist during publication. Their shared prepared mix's
    // RenderLease protects this continuation; the control thread copies only its owner.
    std::shared_ptr<Glide> glide_;
};
struct Parameter {
    std::string name;
    Ramp ramp;
    bool gain;
};
// Built on the control thread and used by the thread rendering the mix plan.
class AutomatedInsert final : public audio::BlockProcessor {
public:
    AutomatedInsert(std::shared_ptr<audio::BlockProcessor> inner,std::vector<Parameter> parameters,bool quantum)
        : inner_(std::move(inner)),parameters_(std::move(parameters)),quantum_(quantum) { id=inner_->id; }
    void prepare(double rate) override { inner_->prepare(rate); }
    void reset() noexcept override { audio::BlockProcessor::reset(); inner_->reset(); }
    bool hasPendingOutput(int n) const noexcept override { return inner_->hasPendingOutput(n); }
    bool keepsActiveInput() const noexcept override { return inner_->keepsActiveInput(); }
    bool setParameter(std::string_view name,double value) noexcept override { return inner_->setParameter(name,value); }
    int latencySamples() const noexcept override { return inner_->latencySamples(); }
    void setBypassed(bool b) noexcept override { inner_->setBypassed(b); }
    bool bypassed() const noexcept override { return inner_->bypassed(); }
    void onBypassedBlock(std::span<const float> stereo,const audio::BlockContext& ctx) noexcept override { inner_->onBypassedBlock(stereo,ctx); }
    void reprobeLatency(double rate) override { inner_->reprobeLatency(rate); }
    void serviceControlThread() override { inner_->serviceControlThread(); }
    void armForPlayback() override { inner_->armForPlayback(); }
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
    // The original insert is shared during plan construction while its bus
    // slot is replaced with this wrapper.
    std::shared_ptr<audio::BlockProcessor> inner_;
    std::vector<Parameter> parameters_;
    bool quantum_;
};
bool supports(const QString& type,const QString& param) {
    if (type=="instrument") { return param=="cutoffHz" || param=="filter.cutoff"; }
    if (type=="gain") { return param=="gainDb"; }
    if (type=="filter") { return param=="frequency" || param=="q"; }
    if (type=="eq3") { return QStringList{"lowFreq","lowGainDb","midFreq","midQ","midGainDb","highFreq","highGainDb"}.contains(param); }
    if (type=="compressor") { return QStringList{"thresholdDb","ratio","attackMs","releaseMs","kneeDb"}.contains(param); }
    if (type=="fable") {
        const std::string key = param.toStdString();
        for (const char* kind : {"eq", "comp", "ott", "limiter"}) {
            for (const auto& def : audio::effects::fable::fableDynamicsParams(kind)) {
                if (def.id == key) { return true; }
            }
        }
        for (const char* kind : {"drive", "chorus", "echo", "reverb"}) {
            for (const auto& def : audio::effects::fable::fableColorTimeParams(kind)) {
                if (def.id == key) { return true; }
            }
        }
    }
    return false;
}
bool isFableLogParam(const QString& param) {
    const std::string key = param.toStdString();
    for (const char* kind : {"eq", "comp", "ott", "limiter"}) {
        for (const auto& def : audio::effects::fable::fableDynamicsParams(kind)) {
            if (def.id == key) { return def.curve == audio::effects::fable::ParamCurve::Log; }
        }
    }
    for (const char* kind : {"drive", "chorus", "echo", "reverb"}) {
        for (const auto& def : audio::effects::fable::fableColorTimeParams(kind)) {
            if (def.id == key) { return def.curve == audio::effects::fable::ParamCurve::Log; }
        }
    }
    return false;
}
void attach(const nt::Timeline& tl,audio::MixPlan& plan) {
    refreshMixerAutomation(tl,plan);
    for (auto& bus : plan.tracks) {
        const auto* track=tl.findTrack(bus.trackId);
        if (!track || track->raw["automationMode"] == "off" || (track->type!=TrackType::Audio && track->type!=TrackType::Midi)) { continue; }
        const auto lanes=track->raw["automation"].toArray();
        for (auto& processor : bus.processors) {
            if (processor->drivesDeviceAutomation()) { continue; }
            QString type = processor->id == "instrument" ? QStringLiteral("instrument") : QString{};
            for (const auto& fx : track->raw["effects"].toArray()) { if (fx.toObject()["id"].toString().toStdString()==processor->id) { type=fx.toObject()["type"].toString(); break; } }
            std::vector<Parameter> parameters;
            for (const auto& v : lanes) {
                const auto lane=v.toObject(),target=lane["target"].toObject();
                const auto points=lane["points"].toArray(); const auto param=target["param"].toString();
                if (lane["enabled"]==false || points.empty() || target["kind"]!="device" || target["deviceId"].toString().toStdString()!=processor->id || !supports(type,param)) { continue; }
                const bool gain=type=="gain";
                const bool curved=gain || (type=="eq3" && param.endsWith("Freq")) || (type=="filter" && param=="frequency")
                                  || (type=="fable" && isFableLogParam(param));
                parameters.push_back({param.toStdString(),Ramp(points,gain,curved),gain});
            }
            if (!parameters.empty()) { processor=std::make_shared<AutomatedInsert>(processor,std::move(parameters),type=="compressor"); }
        }
    }
}
}

void refreshMixerAutomation(const nt::Timeline& tl,audio::MixPlan& plan) {
    const auto* previousMaster=dynamic_cast<const LiveParameter*>(plan.gainSource.get());
    const auto masterCurve=previousMaster ? previousMaster->curve() : plan.gainSource;
    if (tl.masterMixerOverride) {
        // Plans share the atomic handoff and the render continuation across publication.
        plan.gainSource=std::make_shared<LiveParameter>(tl.masterMixerOverride,masterCurve,true,previousMaster ? previousMaster->glide() : nullptr);
    } else { plan.gainSource=masterCurve; }
    for (auto& bus:plan.tracks) {
        const auto* track=tl.findTrack(bus.trackId);
        if (!track || (track->type!=TrackType::Audio && track->type!=TrackType::Midi)) { continue; }
        const auto* previousGain=dynamic_cast<const LiveParameter*>(bus.gainSource.get());
        const auto* previousPan=dynamic_cast<const LiveParameter*>(bus.panSource.get());
        const auto gainGlide=previousGain ? previousGain->glide() : nullptr;
        const auto panGlide=previousPan ? previousPan->glide() : nullptr;
        std::unique_ptr<const audio::ParameterSource> gainCurve,panCurve;
        if (track->raw["automationMode"]!="off") {
            for (const auto& v:track->raw["automation"].toArray()) {
                const auto lane=v.toObject(),target=lane["target"].toObject(); const auto points=lane["points"].toArray();
                if (lane["enabled"]==false || points.empty() || target["kind"]!="mixer") { continue; }
                const bool gain=target["param"]=="volumeDb";
                auto source=std::make_unique<Ramp>(points,gain,gain,!gain);
                if (gain) { gainCurve=std::move(source); } else { panCurve=std::move(source); }
            }
        }
        if (track->mixerOverride) {
            bus.gainSource=std::make_shared<LiveParameter>(track->mixerOverride,std::move(gainCurve),true,gainGlide);
            bus.panSource=std::make_shared<LiveParameter>(track->mixerOverride,std::move(panCurve),false,panGlide);
        } else {
            bus.gainSource=std::move(gainCurve); bus.panSource=std::move(panCurve);
        }
    }
}

audio::MixPlanStageToken registerMixerAutomation() {
    return audio::registerMixPlanStage("automation", attach, 100);
}
}
