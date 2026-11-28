#include "VstHost.h"
#include "DenormalGuard.h"
#include <cmath>

namespace vsthost {
namespace {
int effectiveLatencyOf(const juce::AudioProcessor* plugin) {
    if (!plugin) return 0;
    if (auto* bypass = plugin->getBypassParameter(); bypass && bypass->getValue() >= 0.5f) {
        return 0;
    }
    return std::clamp(plugin->getLatencySamples(), 0, kShmMaxLatencySamples);
}
} // namespace

void LiveRenderState::clearTrackedMidiState() noexcept {
    for (auto& ch : heldNoteVel) ch.fill(0);
    for (auto& ch : curCc) ch.fill(-1);
    for (auto& ch : curPolyPressure) ch.fill(-1);
    curPitchBend.fill(-1);
    curChanPressure.fill(-1);
}

void LiveRenderState::clearOverflowReleased() noexcept {
    for (auto& ch : ovReleased) ch.fill(0);
    for (auto& ch : ovReleaseVel) ch.fill(0);
    ovResetAllControllers.fill(0);
}

void LiveRenderState::trackMidiEvent(const ShmMidiEvent& ev, bool inContention) noexcept {
    const std::uint8_t kind = ev.status & 0xF0u;
    const std::size_t ch = static_cast<std::size_t>(ev.status & 0x0Fu);
    if (kind == 0x90u && ev.data2 > 0) {
        const std::size_t pitch = static_cast<std::size_t>(ev.data1 & 0x7Fu);
        heldNoteVel[ch][pitch] = ev.data2;
        if (inContention) {
            ovReleased[ch][pitch] = 0u;
            ovReleaseVel[ch][pitch] = 0u;
        }
    } else if (kind == 0x80u || (kind == 0x90u && ev.data2 == 0)) {
        const std::size_t pitch = static_cast<std::size_t>(ev.data1 & 0x7Fu);
        heldNoteVel[ch][pitch] = 0u;
        if (inContention) {
            ovReleased[ch][pitch] = 1u;
            ovReleaseVel[ch][pitch] = static_cast<std::uint8_t>(ev.data2 & 0x7Fu);
        }
    } else if (kind == 0xB0u) {
        const std::size_t cc = static_cast<std::size_t>(ev.data1 & 0x7Fu);
        const auto val = static_cast<std::int8_t>(ev.data2 & 0x7Fu);
        if (cc < 120) {
            curCc[ch][cc] = val;
        } else if (cc == 120 || cc == 123) {
            // All Sound Off (CC 120) and All Notes Off (CC 123) cancel held notes on this channel.
            for (std::size_t p = 0; p < 128; ++p) {
                if (heldNoteVel[ch][p] > 0u) {
                    heldNoteVel[ch][p] = 0u;
                    if (inContention) {
                        ovReleased[ch][p] = 1u;
                        ovReleaseVel[ch][p] = 0u;
                    }
                }
            }
        } else if (cc == 121) {
            // Reset All Controllers.
            curCc[ch].fill(-1);
            curCc[ch][64] = 0;
            curPitchBend[ch] = 8192;
            curChanPressure[ch] = 0;
            curPolyPressure[ch].fill(-1);
            if (inContention) {
                ovResetAllControllers[ch] = 1u;
            }
        }
    } else if (kind == 0xE0u) {
        curPitchBend[ch] = static_cast<std::int16_t>((ev.data1 & 0x7Fu) | ((ev.data2 & 0x7Fu) << 7));
    } else if (kind == 0xD0u) {
        curChanPressure[ch] = static_cast<std::int8_t>(ev.data1 & 0x7Fu);
    } else if (kind == 0xA0u) {
        const std::size_t pitch = static_cast<std::size_t>(ev.data1 & 0x7Fu);
        curPolyPressure[ch][pitch] = static_cast<std::int8_t>(ev.data2 & 0x7Fu);
    }
}

void LiveRenderState::writeContendedBlock(int numFrames, bool reset,
                                          const ShmMidiEvent* midiEvents, int numMidiEvents,
                                          float* outL, float* outR) noexcept {
    if (reset) {
        pendingReset = true;
        pendingMidiCount = 0;
        pendingOverflow = false;
        clearTrackedMidiState();
        clearOverflowReleased();
    }
    if (midiEvents && numMidiEvents > 0) {
        for (int i = 0; i < numMidiEvents; ++i) {
            trackMidiEvent(midiEvents[i], /*inContention=*/true);
            if (!pendingOverflow) {
                if (pendingMidiCount < kMaxPendingMidi) {
                    ShmMidiEvent ev = midiEvents[i];
                    ev.sampleOffset = 0;
                    pendingMidi[pendingMidiCount++] = ev;
                } else {
                    // C5 / E1: Transition to reset + held-note/controller re-chase on overflow.
                    pendingOverflow = true;
                    pendingMidiCount = 0;
                }
            }
        }
    }
    if (!paused) {
        paused = true;
        fadeOutStartL = lastOutL;
        fadeOutStartR = lastOutR;
        fadeOutPos = 0;
        fadingIn = false;
        fadeInPos = 0;
    }
    if (outL && outR && numFrames > 0) {
        for (int i = 0; i < numFrames; ++i) {
            if (fadeOutPos < kFadeFrames) {
                const float g = 1.0f - static_cast<float>(fadeOutPos + 1) / static_cast<float>(kFadeFrames);
                outL[i] = fadeOutStartL * g;
                outR[i] = fadeOutStartR * g;
                ++fadeOutPos;
            } else {
                outL[i] = 0.0f;
                outR[i] = 0.0f;
            }
        }
        lastOutL = outL[numFrames - 1];
        lastOutR = outR[numFrames - 1];
    }
}

void LiveRenderState::finishRenderedBlock(int numFrames, float* outL, float* outR) noexcept {
    if (!outL || !outR || numFrames <= 0) return;
    if (paused) {
        paused = false;
        fadeOutPos = 0;
        fadingIn = true;
        fadeInPos = 0;
        fadeInFromL = lastOutL;
        fadeInFromR = lastOutR;
    }
    if (fadingIn) {
        for (int i = 0; i < numFrames && fadingIn; ++i) {
            const float alpha = static_cast<float>(fadeInPos + 1) / static_cast<float>(kFadeFrames);
            const float oneMinus = 1.0f - alpha;
            outL[i] = fadeInFromL * oneMinus + outL[i] * alpha;
            outR[i] = fadeInFromR * oneMinus + outR[i] * alpha;
            ++fadeInPos;
            if (fadeInPos >= kFadeFrames) {
                fadingIn = false;
            }
        }
    }
    lastOutL = outL[numFrames - 1];
    lastOutR = outR[numFrames - 1];
}

Instance::~Instance() {
    poller_.stopTimer();
    setLatencyChangedCallback({});
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        pluginLoaded_.store(false, std::memory_order_release);
        if (plugin_) {
            plugin_->removeListener(&listener_);
            plugin_.reset();
        }
    }
}

void Instance::setLatencyChangedCallback(std::function<void(int, std::uint64_t)> callback) {
    const bool hasCallback = static_cast<bool>(callback);
    {
        std::lock_guard<std::mutex> guard(callbackMutex_);
        latencyChangedCallback_ = std::move(callback);
    }
    if (hasCallback) {
        if (juce::MessageManager::getInstanceWithoutCreating() != nullptr) {
            poller_.startTimer(kLatencyPollIntervalMs);
        }
    } else {
        poller_.stopTimer();
    }
}

std::uint64_t Instance::recordLatencyUpdate(int newLatency, bool forceNotify) noexcept {
    const int clamped = std::clamp(newLatency, 0, kShmMaxLatencySamples);
    std::uint64_t cur = packedLatency_.load(std::memory_order_acquire);
    for (;;) {
        const int curLat = unpackLatency(cur);
        const std::uint32_t curGen = unpackGeneration(cur);
        if (clamped == curLat && !forceNotify) {
            return cur;
        }
        const std::uint32_t nextGen = curGen + 1u;
        const std::uint64_t next = packLatency(nextGen, clamped);
        if (packedLatency_.compare_exchange_weak(cur, next, std::memory_order_acq_rel, std::memory_order_acquire)) {
            if (forceNotify) {
                forceNotifyPending_.store(true, std::memory_order_release);
            }
            latencyNotifyPending_.store(true, std::memory_order_release);
            return next;
        }
    }
}

void Instance::LatencyPoller::timerCallback() {
    owner_.deliverLatencyNotification();
}

void Instance::deliverLatencyNotification() {
    if (!latencyNotifyPending_.exchange(false, std::memory_order_acq_rel)) {
        return;
    }
    const bool forced = forceNotifyPending_.exchange(false, std::memory_order_acq_rel);
    const std::uint64_t packed = packedLatency_.load(std::memory_order_acquire);
    const int lat = unpackLatency(packed);
    const std::uint32_t gen = unpackGeneration(packed);
    if (!forced && lat == lastNotifiedLatency_) {
        return;
    }
    lastNotifiedLatency_ = lat;
    std::function<void(int, std::uint64_t)> cb;
    {
        std::lock_guard<std::mutex> guard(callbackMutex_);
        cb = latencyChangedCallback_;
    }
    if (cb) cb(lat, gen);
}

void Instance::PluginListener::audioProcessorParameterChanged(juce::AudioProcessor* processor, int, float) {
    if (!processor || processor->getBypassParameter() == nullptr) return;
    const int lat = effectiveLatencyOf(processor);
    if (lat != owner_.latencySamples()) {
        (void)owner_.recordLatencyUpdate(lat, false);
    }
}

void Instance::PluginListener::audioProcessorChanged(juce::AudioProcessor* processor, const ChangeDetails& details) {
    if (!processor) return;
    const int lat = effectiveLatencyOf(processor);
    if (details.latencyChanged || lat != owner_.latencySamples()) {
        (void)owner_.recordLatencyUpdate(lat, details.latencyChanged);
    }
}

int Instance::refreshLatency(std::uint64_t* latencyGenerationOut) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    const std::uint64_t packed = recordLatencyUpdate(effectiveLatencyOf(plugin_.get()), false);
    if (latencyGenerationOut) {
        *latencyGenerationOut = unpackGeneration(packed);
    }
    return unpackLatency(packed);
}

bool renderWithState(Instance& inst, bool applyState, const juce::String& state,
                     double sampleRate, juce::int64 frames, const std::vector<NoteEvent>& events,
                     juce::AudioBuffer<float>& out, juce::String& error) {
    std::lock_guard<std::recursive_mutex> guard(inst.lock);
    if (applyState && !inst.setState(state, error)) return false;
    return inst.render(sampleRate, frames, events, out, error);
}

bool processWithState(Instance& inst, bool applyState, const juce::String& state,
                      double sampleRate, const juce::AudioBuffer<float>& input,
                      juce::AudioBuffer<float>& out, juce::String& error) {
    std::lock_guard<std::recursive_mutex> guard(inst.lock);
    if (applyState && !inst.setState(state, error)) return false;
    return inst.process(sampleRate, input, out, error);
}

bool decodeNoteExpression(const ShmMidiEvent& event, NoteExpressionValue& out) {
    if (event.status != kShmStatusNoteExpression) return false;
    // Steinberg::Vst::NoteExpressionTypeIDs: kVolumeTypeID 0, kPanTypeID 1, kTuningTypeID 2, kBrightnessTypeID 5.
    switch (event.data1) {
        case kShmExprVolume: out.typeId = 0; break;
        case kShmExprPan: out.typeId = 1; break;
        case kShmExprTuning: out.typeId = 2; break;
        case kShmExprBrightness: out.typeId = 5; break;
        default: return false;
    }
    out.sampleOffset = event.sampleOffset;
    out.noteId = event.noteId;
    out.value = juce::jlimit(0.0f, 1.0f, event.value);
    return true;
}

juce::FileSearchPath defaultSearchPath() {
    juce::VST3PluginFormat format;
    auto paths = format.getDefaultLocationsToSearch();
#if JUCE_PLUGINHOST_AU
    paths.addPath(juce::AudioUnitPluginFormat().getDefaultLocationsToSearch());
#endif
    return paths;
}

std::vector<PluginInfo> scan(const juce::StringArray& extraDirs, bool instrumentsOnly) {
    // JUCE owns formats passed to addFormat and destroys them with the manager.
    juce::AudioPluginFormatManager formats;
    formats.addFormat(std::make_unique<juce::VST3PluginFormat>().release());
#if JUCE_PLUGINHOST_AU
    formats.addFormat(std::make_unique<juce::AudioUnitPluginFormat>().release());
#endif
    auto search = defaultSearchPath();
    for (const auto& d : extraDirs) {
        if (juce::File(d).isDirectory()) search.add(juce::File(d));
    }
    std::vector<PluginInfo> out;
    for (auto* format : formats.getFormats()) {
        for (const auto& file : format->searchPathsForPlugins(search, true, false)) {
            juce::OwnedArray<juce::PluginDescription> descs;
            format->findAllTypesForFile(descs, file);
            for (const auto* d : descs) {
                if (instrumentsOnly && !d->isInstrument) { continue; }
                out.push_back({d->createIdentifierString(), d->name, d->manufacturerName, d->version,
                               d->fileOrIdentifier, d->isInstrument, format->getName() == "AudioUnit" ? "au" : "vst3"});
            }
        }
    }
    std::sort(out.begin(), out.end(), [](const PluginInfo& a, const PluginInfo& b) {
        return a.name.compareIgnoreCase(b.name) < 0;
    });
    return out;
}

bool Instance::load(const juce::String& path, const juce::String& uid, juce::String& error) {
    if (formats_.getNumFormats() == 0) {
        formats_.addFormat(std::make_unique<juce::VST3PluginFormat>().release());
#if JUCE_PLUGINHOST_AU
        formats_.addFormat(std::make_unique<juce::AudioUnitPluginFormat>().release());
#endif
    }
    juce::OwnedArray<juce::PluginDescription> descs;
    for (auto* format : formats_.getFormats()) {
        format->findAllTypesForFile(descs, path);
    }
    const juce::PluginDescription* pick = nullptr;
    for (auto* d : descs)
        if (d->createIdentifierString() == uid) pick = d;
    if (!pick)
        for (auto* d : descs)
            if (d->isInstrument) { pick = d; break; }
    if (!pick && !descs.isEmpty()) pick = descs[0];
    if (!pick) { error = "No VST3/AU plug-in found in " + path; return false; }
    double rate = 48000.0;
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        if (preparedRate_ > 0) rate = preparedRate_;
    }
    auto plugin = formats_.createPluginInstance(*pick, rate, block_, error);
    if (!plugin) return false;
    juce::MemoryBlock initStateBlock;
    std::uint64_t loadedVersion = 0;
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        if (plugin_) {
            plugin_->removeListener(&listener_);
        }
        plugin_ = std::move(plugin);
        pluginLoaded_.store(true, std::memory_order_release);
        plugin_->addListener(&listener_);
        path_ = path;
        uid_ = pick->createIdentifierString();
        isInstrument_ = pick->isInstrument;
        preparedRate_ = 0;
        preparedBlockSize_ = 0;
        const int ch = std::max(2, std::max(plugin_->getTotalNumInputChannels(), plugin_->getTotalNumOutputChannels()));
        preparedChannels_.store(ch, std::memory_order_release);
        const int initLat = effectiveLatencyOf(plugin_.get());
        const std::uint32_t nextGen = unpackGeneration(packedLatency_.load(std::memory_order_acquire)) + 1u;
        packedLatency_.store(packLatency(nextGen, initLat), std::memory_order_release);
        lastNotifiedLatency_ = initLat;
        forceNotifyPending_.store(false, std::memory_order_release);
        latencyNotifyPending_.store(false, std::memory_order_release);
        plugin_->getStateInformation(initStateBlock);
        {
            std::lock_guard<std::mutex> stateGuard(stateMutex_);
            loadedVersion = ++stateVersion_;
            appliedState_.clear();
            defaultState_.clear();
        }
    }
    const juce::String encodedDefault = initStateBlock.isEmpty()
        ? juce::String()
        : juce::Base64::toBase64(initStateBlock.getData(), initStateBlock.getSize());
    {
        std::lock_guard<std::mutex> stateGuard(stateMutex_);
        defaultState_ = encodedDefault;
        if (stateVersion_ == loadedVersion) {
            appliedState_ = encodedDefault;
        }
    }
    return true;
}

bool Instance::loadPluginForTest(std::unique_ptr<juce::AudioPluginInstance> plugin, bool isInstrument) {
    if (!plugin) return false;
    juce::MemoryBlock initStateBlock;
    std::uint64_t loadedVersion = 0;
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        if (plugin_) {
            plugin_->removeListener(&listener_);
        }
        plugin_ = std::move(plugin);
        pluginLoaded_.store(true, std::memory_order_release);
        plugin_->addListener(&listener_);
        path_ = "test://in-process";
        uid_ = plugin_->getName();
        isInstrument_ = isInstrument;
        preparedRate_ = 0;
        preparedBlockSize_ = 0;
        const int ch = std::max(2, std::max(plugin_->getTotalNumInputChannels(), plugin_->getTotalNumOutputChannels()));
        preparedChannels_.store(ch, std::memory_order_release);
        const int initLat = effectiveLatencyOf(plugin_.get());
        const std::uint32_t nextGen = unpackGeneration(packedLatency_.load(std::memory_order_acquire)) + 1u;
        packedLatency_.store(packLatency(nextGen, initLat), std::memory_order_release);
        lastNotifiedLatency_ = initLat;
        forceNotifyPending_.store(false, std::memory_order_release);
        latencyNotifyPending_.store(false, std::memory_order_release);
        plugin_->getStateInformation(initStateBlock);
        {
            std::lock_guard<std::mutex> stateGuard(stateMutex_);
            loadedVersion = ++stateVersion_;
            appliedState_.clear();
            defaultState_.clear();
        }
    }
    const juce::String encodedDefault = initStateBlock.isEmpty()
        ? juce::String()
        : juce::Base64::toBase64(initStateBlock.getData(), initStateBlock.getSize());
    {
        std::lock_guard<std::mutex> stateGuard(stateMutex_);
        defaultState_ = encodedDefault;
        if (stateVersion_ == loadedVersion) {
            appliedState_ = encodedDefault;
        }
    }
    return true;
}

juce::String Instance::pluginName() const { return plugin_ ? plugin_->getName() : juce::String(); }

void Instance::setGetStatePublishHookForTest(std::function<void()> hook) {
    std::lock_guard<std::mutex> stateGuard(stateMutex_);
    getStatePublishHook_ = std::move(hook);
    hasGetStatePublishHook_.store(static_cast<bool>(getStatePublishHook_), std::memory_order_release);
}

juce::String Instance::getState() {
    juce::MemoryBlock mb;
    std::uint64_t capturedVersion = 0;
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        if (!plugin_) return {};
        {
            std::lock_guard<std::mutex> stateGuard(stateMutex_);
            capturedVersion = stateVersion_;
        }
        plugin_->getStateInformation(mb);
    }
    if (mb.isEmpty()) return {};
    const juce::String encoded = juce::Base64::toBase64(mb.getData(), mb.getSize());
    if (hasGetStatePublishHook_.load(std::memory_order_acquire)) {
        std::function<void()> hook;
        {
            std::lock_guard<std::mutex> stateGuard(stateMutex_);
            hook = getStatePublishHook_;
        }
        if (hook) hook();
    }
    {
        std::lock_guard<std::mutex> stateGuard(stateMutex_);
        if (stateVersion_ == capturedVersion) {
            appliedState_ = encoded;
        }
    }
    return encoded;
}

std::optional<juce::String> Instance::tryGetState() {
    juce::MemoryBlock mb;
    std::uint64_t capturedVersion = 0;
    {
        std::unique_lock<std::recursive_mutex> guard(lock, std::try_to_lock);
        if (!guard.owns_lock()) return std::nullopt;
        if (!plugin_) return juce::String();
        {
            std::lock_guard<std::mutex> stateGuard(stateMutex_);
            capturedVersion = stateVersion_;
        }
        plugin_->getStateInformation(mb);
    }
    if (mb.isEmpty()) return juce::String();
    const juce::String encoded = juce::Base64::toBase64(mb.getData(), mb.getSize());
    if (hasGetStatePublishHook_.load(std::memory_order_acquire)) {
        std::function<void()> hook;
        {
            std::lock_guard<std::mutex> stateGuard(stateMutex_);
            hook = getStatePublishHook_;
        }
        if (hook) hook();
    }
    {
        std::lock_guard<std::mutex> stateGuard(stateMutex_);
        if (stateVersion_ == capturedVersion) {
            appliedState_ = encoded;
        }
    }
    return encoded;
}

bool Instance::setState(const juce::String& base64, juce::String& error) {
    if (!pluginLoaded_.load(std::memory_order_acquire)) { error = "No plug-in loaded"; return false; }
    juce::String target;
    {
        std::lock_guard<std::mutex> stateGuard(stateMutex_);
        target = base64.isEmpty() ? defaultState_ : base64;
        if (target.isEmpty() || target == appliedState_) return true;
    }
    // Decode base64 outside `lock` so live processing never contends with serialization work.
    juce::MemoryOutputStream decoded;
    if (!juce::Base64::convertFromBase64(decoded, target)) { error = "Plug-in state is not valid base64"; return false; }
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        if (!plugin_) { error = "No plug-in loaded"; return false; }
        {
            std::lock_guard<std::mutex> stateGuard(stateMutex_);
            if (target == appliedState_) return true;
        }
        plugin_->setStateInformation(decoded.getData(), (int)decoded.getDataSize());
        (void)recordLatencyUpdate(effectiveLatencyOf(plugin_.get()), false);
        {
            std::lock_guard<std::mutex> stateGuard(stateMutex_);
            ++stateVersion_;
            appliedState_ = target;
        }
    }
    return true;
}

namespace {
// JUCE var retains the DynamicObject and releases it when the last var copy dies.
juce::var jsonObject() { return juce::var(std::make_unique<juce::DynamicObject>().release()); }
juce::String parameterId(juce::AudioProcessorParameter& parameter, int index) {
    if (auto* hosted = dynamic_cast<juce::HostedAudioProcessorParameter*>(&parameter)) { return hosted->getParameterID(); }
    if (auto* identified = dynamic_cast<juce::AudioProcessorParameterWithID*>(&parameter)) { return identified->paramID; }
    return juce::String(index);
}
}

juce::var Instance::listPresets() {
    std::lock_guard<std::recursive_mutex> guard(lock);
    auto result = jsonObject();
    juce::Array<juce::var> presets;
    if (plugin_) {
        for (int i = 0; i < plugin_->getNumPrograms(); ++i) {
            auto preset = jsonObject();
            preset.getDynamicObject()->setProperty("index", i);
            preset.getDynamicObject()->setProperty("name", plugin_->getProgramName(i));
            presets.add(preset);
        }
    }
    result.getDynamicObject()->setProperty("presets", presets);
    result.getDynamicObject()->setProperty("currentPresetIndex", plugin_ ? plugin_->getCurrentProgram() : 0);
    return result;
}

bool Instance::selectPreset(const juce::var& requested, const juce::String& name, juce::String& error) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    int index = -1;
    if (requested.isInt() || requested.isInt64() || requested.isDouble()) {
        const double value = static_cast<double>(requested);
        if (std::isfinite(value) && value >= 0 && value < plugin_->getNumPrograms() && std::floor(value) == value) {
            index = static_cast<int>(value);
        }
    } else if (name.isNotEmpty()) {
        for (int i = 0; i < plugin_->getNumPrograms(); ++i) {
            if (plugin_->getProgramName(i).equalsIgnoreCase(name)) {
                if (index >= 0) { error = "Ambiguous preset name"; return false; }
                index = i;
            }
        }
    }
    if (index < 0) { error = "Unknown preset"; return false; }
    plugin_->setCurrentProgram(index);
    {
        std::lock_guard<std::mutex> stateGuard(stateMutex_);
        ++stateVersion_;
        appliedState_.clear();
    }
    return true;
}

juce::var Instance::getParameters() {
    std::lock_guard<std::recursive_mutex> guard(lock);
    auto result = jsonObject();
    juce::Array<juce::var> parameters;
    if (plugin_) {
        int index = 0;
        for (auto* parameter : plugin_->getParameters()) {
            auto entry = jsonObject();
            auto& obj = *entry.getDynamicObject();
            obj.setProperty("id", parameterId(*parameter, index));
            obj.setProperty("index", index++);
            obj.setProperty("name", parameter->getName(256));
            obj.setProperty("label", parameter->getLabel());
            obj.setProperty("value", parameter->getValue());
            obj.setProperty("displayValue", parameter->getCurrentValueAsText());
            obj.setProperty("defaultValue", parameter->getDefaultValue());
            obj.setProperty("minValue", 0.0);
            obj.setProperty("maxValue", 1.0);
            obj.setProperty("numSteps", parameter->getNumSteps());
            obj.setProperty("isDiscrete", parameter->isDiscrete());
            obj.setProperty("isBoolean", parameter->isBoolean());
            obj.setProperty("isAutomatable", parameter->isAutomatable());
            parameters.add(entry);
        }
    }
    result.getDynamicObject()->setProperty("parameters", parameters);
    return result;
}

bool Instance::setParameters(const juce::var& changes, juce::String& error) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    const auto* entries = changes.getArray();
    if (!entries || entries->isEmpty() || entries->size() > 128) { error = "Expected 1 to 128 changes"; return false; }
    std::vector<std::pair<juce::AudioProcessorParameter*, float>> updates;
    for (const auto& change : *entries) {
        auto* obj = change.getDynamicObject();
        if (!obj || obj->hasProperty("value") == obj->hasProperty("displayValue")) {
            error = "Expected exactly one of value or displayValue"; return false;
        }
        if (obj->hasProperty("id") && (!change["id"].isString() || change["id"].toString().isEmpty())) {
            error = "Parameter id must be nonempty text"; return false;
        }
        juce::AudioProcessorParameter* selected = nullptr;
        int index = 0;
        for (auto* parameter : plugin_->getParameters()) {
            const bool matches = obj->hasProperty("id")
                ? parameterId(*parameter, index) == change["id"].toString()
                : obj->hasProperty("index") && (change["index"].isInt() || change["index"].isInt64() || change["index"].isDouble()) &&
                  juce::exactlyEqual(static_cast<double>(change["index"]), static_cast<double>(index));
            if (matches) { selected = parameter; }
            ++index;
        }
        if (!selected) { error = "Unknown parameter"; return false; }
        if (obj->hasProperty("value") && !change["value"].isDouble() && !change["value"].isInt() && !change["value"].isInt64()) {
            error = "Parameter value must be a number"; return false;
        }
        if (obj->hasProperty("displayValue") && (!change["displayValue"].isString() || change["displayValue"].toString().isEmpty())) {
            error = "displayValue must be nonempty text"; return false;
        }
        const double value = obj->hasProperty("value") ? static_cast<double>(change["value"])
            : selected->getValueForText(change["displayValue"].toString());
        if (!std::isfinite(value) || value < 0 || value > 1) { error = "Parameter value must be from 0 to 1"; return false; }
        updates.emplace_back(selected, static_cast<float>(value));
    }
    for (const auto& [parameter, value] : updates) {
        parameter->beginChangeGesture();
        parameter->setValueNotifyingHost(value);
        parameter->endChangeGesture();
    }
    {
        std::lock_guard<std::mutex> stateGuard(stateMutex_);
        ++stateVersion_;
        appliedState_.clear();
    }
    return true;
}

void Instance::prepare(double sampleRate, bool nonRealtime, int blockSize) {
    if (juce::exactlyEqual(preparedRate_, sampleRate) && preparedNonRealtime_ == nonRealtime && preparedBlockSize_ >= blockSize) {
        return;
    }
    if (preparedRate_ > 0) plugin_->releaseResources();
    auto layout = plugin_->getBusesLayout();
    if (isInstrument_) {
        // An instrument has no audio input; ask for a stereo main output.
        for (auto& in : layout.inputBuses) in = juce::AudioChannelSet::disabled();
        if (!layout.outputBuses.isEmpty()) layout.outputBuses.getReference(0) = juce::AudioChannelSet::stereo();
    } else {
        // An effect takes stereo main input and produces stereo main output.
        for (int i = 0; i < layout.inputBuses.size(); ++i)
            layout.inputBuses.getReference(i) = i == 0 ? juce::AudioChannelSet::stereo() : juce::AudioChannelSet::disabled();
        for (int i = 0; i < layout.outputBuses.size(); ++i)
            layout.outputBuses.getReference(i) = i == 0 ? juce::AudioChannelSet::stereo() : juce::AudioChannelSet::disabled();
    }
    if (!plugin_->setBusesLayout(layout)) plugin_->enableAllBuses();
    plugin_->setNonRealtime(nonRealtime);
    plugin_->setPlayConfigDetails(plugin_->getTotalNumInputChannels(), plugin_->getTotalNumOutputChannels(),
                                  sampleRate, blockSize);
    plugin_->prepareToPlay(sampleRate, blockSize);
    preparedRate_ = sampleRate;
    preparedNonRealtime_ = nonRealtime;
    preparedBlockSize_ = blockSize;
    const int ch = std::max(2, std::max(plugin_->getTotalNumInputChannels(), plugin_->getTotalNumOutputChannels()));
    preparedChannels_.store(ch, std::memory_order_release);
    (void)recordLatencyUpdate(effectiveLatencyOf(plugin_.get()), false);
}

bool Instance::prepareLive(double sampleRate, int maxBlockFrames, juce::String& error) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    if (sampleRate < 8000 || sampleRate > 384000) { error = "Unsupported sample rate"; return false; }
    const int bs = juce::jlimit(64, static_cast<int>(kShmMaxFrames), maxBlockFrames);
    prepare(sampleRate, false, bs);
    plugin_->reset();
    (void)recordLatencyUpdate(effectiveLatencyOf(plugin_.get()), false);
    return true;
}

bool Instance::probeLiveLatency(double sampleRate, int maxBlockFrames, int& latencyOut, juce::String& error,
                                std::uint64_t* latencyGenerationOut) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    if (sampleRate >= 8000 && sampleRate <= 384000) {
        const int bs = juce::jlimit(64, static_cast<int>(kShmMaxFrames), maxBlockFrames);
        prepare(sampleRate, false, bs);
    }
    const std::uint64_t packed = recordLatencyUpdate(effectiveLatencyOf(plugin_.get()), false);
    latencyOut = unpackLatency(packed);
    if (latencyGenerationOut) {
        *latencyGenerationOut = unpackGeneration(packed);
    }
    return true;
}

bool Instance::processLiveBlock(double sampleRate, int numFrames, bool reset,
                                const float* inL, const float* inR,
                                float* outL, float* outR,
                                const ShmMidiEvent* midiEvents, int numMidiEvents,
                                juce::AudioBuffer<float>& scratchBlock, juce::MidiBuffer& scratchMidi,
                                int* latencySamples, std::uint64_t* latencyGeneration,
                                LiveRenderState* liveState) {
    const ScopedDenormalGuard denormalGuard;
    if (numFrames <= 0 || numFrames > static_cast<int>(kShmMaxFrames)) return false;
    LiveRenderState& state = liveState ? *liveState : defaultLiveState_;
    // C2 / D6 / D9: never block live processing behind state save/load or control work on `lock`.
    // When contended, capture reset/MIDI and fade smoothly to silence; resume with a crossfade.
    std::unique_lock<std::recursive_mutex> guard(lock, std::try_to_lock);
    if (!guard.owns_lock()) {
        state.writeContendedBlock(numFrames, reset, midiEvents, numMidiEvents, outL, outR);
        if (latencySamples) *latencySamples = this->latencySamples();
        if (latencyGeneration) *latencyGeneration = this->latencyGeneration();
        return true;
    }
    if (!plugin_) return false;
    // The live worker never prepares: prepareToPlay allocates and blocks. The control side
    // calls prepareLive() for the real rate. A mismatch drops the block, never prepares.
    if (preparedRate_ <= 0 || !juce::exactlyEqual(preparedRate_, sampleRate) || preparedNonRealtime_ ||
        preparedBlockSize_ < numFrames) {
        return false;
    }
    const int inChannels = plugin_->getTotalNumInputChannels();
    const int outChannels = plugin_->getTotalNumOutputChannels();
    const int channels = std::max(2, std::max(inChannels, outChannels));
    // C5: never allocate scratch in process. Caller must preallocate for preparedChannels() x kShmMaxFrames.
    const int origChannels = scratchBlock.getNumChannels();
    const int origSamples = scratchBlock.getNumSamples();
    if (origChannels < channels || origSamples < numFrames) {
        return false;
    }
    // D7: For <32 channels, use a stack-backed non-owning view (JUCE's inline preallocatedChannelSpace[32]
    // does zero heap allocations and never mutates scratchBlock). For >=32 channels, shrink scratchBlock
    // in-place with avoidReallocating=true and restore its preallocated dimensions on exit (zero heap
    // allocations when scratchBlock was preallocated via setSize()).
    struct ScratchRestoreGuard {
        juce::AudioBuffer<float>* buf = nullptr;
        int ch = 0;
        int samples = 0;
        ~ScratchRestoreGuard() {
            if (buf) buf->setSize(ch, samples, false, false, true);
        }
    } scratchRestore;
    juce::AudioBuffer<float> smallView;
    juce::AudioBuffer<float>* workBlock = &scratchBlock;
    if (channels < 32) {
        smallView.setDataToReferTo(scratchBlock.getArrayOfWritePointers(), channels, numFrames);
        workBlock = &smallView;
    } else if (origChannels != channels || origSamples != numFrames) {
        scratchRestore.buf = &scratchBlock;
        scratchRestore.ch = origChannels;
        scratchRestore.samples = origSamples;
        scratchBlock.setSize(channels, numFrames, false, false, true);
    }

    const bool effectiveReset = reset || state.pendingReset;
    state.pendingReset = false;
    if (reset) {
        // A current-block reset supersedes any older queued MIDI events and tracked live state.
        state.pendingMidiCount = 0;
        state.pendingOverflow = false;
        state.clearTrackedMidiState();
        state.clearOverflowReleased();
    }

    if (effectiveReset) {
        if (isInstrument_) {
            scratchMidi.clear();
            for (int ch = 1; ch <= 16; ++ch) {
                // Release sustain and centre pitch bend too, so a seek leaks no controller state.
                scratchMidi.addEvent(juce::MidiMessage::allNotesOff(ch), 0);
                scratchMidi.addEvent(juce::MidiMessage::controllerEvent(ch, 64, 0), 0);
                scratchMidi.addEvent(juce::MidiMessage::pitchWheel(ch, 8192), 0);
            }
            workBlock->clear();
            plugin_->processBlock(*workBlock, scratchMidi);
        }
        plugin_->reset();
    }
    workBlock->clear();
    if (!isInstrument_ && inL && inR) {
        if (inChannels >= 1) workBlock->copyFrom(0, 0, inL, numFrames);
        if (inChannels >= 2) workBlock->copyFrom(1, 0, inR, numFrames);
    }
    scratchMidi.clear();
    const auto pushShmMidi = [&](const ShmMidiEvent& e, int offset) {
        const std::uint8_t kind = e.status & 0xF0u;
        const int ch = (e.status & 0x0Fu) + 1;
        // Control change, pitch bend and channel pressure reach a VST3 through
        // JUCE's IMidiMapping conversion into parameter changes (the VST3 way
        // for a host to send them). Poly pressure becomes a PolyPressureEvent.
        if (kind == 0x90u && e.data2 > 0) {
            scratchMidi.addEvent(juce::MidiMessage::noteOn(ch, e.data1 & 0x7Fu, e.data2), offset);
        } else if (kind == 0x80u || (kind == 0x90u && e.data2 == 0)) {
            scratchMidi.addEvent(juce::MidiMessage::noteOff(ch, e.data1 & 0x7Fu, static_cast<juce::uint8>(e.data2 & 0x7Fu)), offset);
        } else if (kind == 0xB0u) {
            scratchMidi.addEvent(juce::MidiMessage::controllerEvent(ch, e.data1 & 0x7Fu, e.data2 & 0x7Fu), offset);
        } else if (kind == 0xE0u) {
            scratchMidi.addEvent(juce::MidiMessage::pitchWheel(ch, (e.data1 & 0x7F) | ((e.data2 & 0x7F) << 7)), offset);
        } else if (kind == 0xD0u) {
            scratchMidi.addEvent(juce::MidiMessage::channelPressureChange(ch, e.data1 & 0x7Fu), offset);
        } else if (kind == 0xA0u) {
            scratchMidi.addEvent(juce::MidiMessage::aftertouchChange(ch, e.data1 & 0x7Fu, e.data2 & 0x7Fu), offset);
        } else if (e.status == kShmStatusNoteExpression) {
            NoteExpressionValue expression;
            if (decodeNoteExpression(e, expression)) droppedNoteExpression_.fetch_add(1, std::memory_order_relaxed);
        }
    };
    // D6 / C5 / E1: Inject any MIDI events captured during lock/scratch contention at sample offset 0.
    // On capture overflow, replay a sustain-off (CC64=0) + all-notes-off (CC123=0) reset (plus
    // explicit Note-Offs for released notes so synths ignoring CC123 release cleanly), then re-chase
    // current controllers and currently held notes/poly pressure so sustain transitions never stick.
    if (state.pendingOverflow) {
        for (int ch = 0; ch < 16; ++ch) {
            scratchMidi.addEvent(juce::MidiMessage::controllerEvent(ch + 1, 64, 0), 0);
            scratchMidi.addEvent(juce::MidiMessage::allNotesOff(ch + 1), 0);
            for (int p = 0; p < 128; ++p) {
                const auto chIdx = static_cast<std::size_t>(ch);
                const auto pIdx = static_cast<std::size_t>(p);
                if (state.ovReleased[chIdx][pIdx] != 0u && state.heldNoteVel[chIdx][pIdx] == 0u) {
                    scratchMidi.addEvent(juce::MidiMessage::noteOff(ch + 1, p, state.ovReleaseVel[chIdx][pIdx]), 0);
                }
            }
        }
        for (int ch = 0; ch < 16; ++ch) {
            const auto chIdx = static_cast<std::size_t>(ch);
            if (state.ovResetAllControllers[chIdx] != 0u) {
                scratchMidi.addEvent(juce::MidiMessage::controllerEvent(ch + 1, 121, 0), 0);
            }
            for (int cc = 0; cc < 120; ++cc) {
                const auto val = state.curCc[chIdx][static_cast<std::size_t>(cc)];
                if (val >= 0) {
                    scratchMidi.addEvent(juce::MidiMessage::controllerEvent(ch + 1, cc, static_cast<int>(val)), 0);
                }
            }
            if (state.curPitchBend[chIdx] >= 0) {
                scratchMidi.addEvent(
                    juce::MidiMessage::pitchWheel(ch + 1, static_cast<int>(state.curPitchBend[chIdx])), 0);
            }
            if (state.curChanPressure[chIdx] >= 0) {
                scratchMidi.addEvent(
                    juce::MidiMessage::channelPressureChange(ch + 1, static_cast<int>(state.curChanPressure[chIdx])), 0);
            }
        }
        for (int ch = 0; ch < 16; ++ch) {
            const auto chIdx = static_cast<std::size_t>(ch);
            for (int p = 0; p < 128; ++p) {
                const auto vel = state.heldNoteVel[chIdx][static_cast<std::size_t>(p)];
                if (vel > 0u) {
                    scratchMidi.addEvent(juce::MidiMessage::noteOn(ch + 1, p, vel), 0);
                }
            }
            for (int p = 0; p < 128; ++p) {
                const auto val = state.curPolyPressure[chIdx][static_cast<std::size_t>(p)];
                if (val >= 0) {
                    scratchMidi.addEvent(juce::MidiMessage::aftertouchChange(ch + 1, p, static_cast<int>(val)), 0);
                }
            }
        }
        state.clearOverflowReleased();
        state.pendingOverflow = false;
    } else {
        for (std::size_t i = 0; i < state.pendingMidiCount; ++i) {
            pushShmMidi(state.pendingMidi[i], 0);
        }
        state.pendingMidiCount = 0;
        state.clearOverflowReleased();
    }
    if (midiEvents && numMidiEvents > 0) {
        for (int i = 0; i < numMidiEvents; ++i) {
            state.trackMidiEvent(midiEvents[i], /*inContention=*/false);
            const int offset = juce::jlimit(0, numFrames - 1, static_cast<int>(midiEvents[i].sampleOffset));
            pushShmMidi(midiEvents[i], offset);
        }
    }
    plugin_->processBlock(*workBlock, scratchMidi);
    const std::uint64_t packed = recordLatencyUpdate(effectiveLatencyOf(plugin_.get()), false);
    if (latencySamples) *latencySamples = unpackLatency(packed);
    if (latencyGeneration) *latencyGeneration = unpackGeneration(packed);
    if (outL && outR) {
        if (outChannels >= 1) {
            std::memcpy(outL, workBlock->getReadPointer(0), static_cast<size_t>(numFrames) * sizeof(float));
            std::memcpy(outR, workBlock->getReadPointer(outChannels > 1 ? 1 : 0),
                        static_cast<size_t>(numFrames) * sizeof(float));
        } else {
            std::memset(outL, 0, static_cast<size_t>(numFrames) * sizeof(float));
            std::memset(outR, 0, static_cast<size_t>(numFrames) * sizeof(float));
        }
        state.finishRenderedBlock(numFrames, outL, outR);
    }
    return true;
}

bool Instance::render(double sampleRate, juce::int64 frames, const std::vector<NoteEvent>& events,
                      juce::AudioBuffer<float>& out, juce::String& error) {
    const ScopedDenormalGuard denormalGuard;
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    if (sampleRate < 8000 || sampleRate > 384000) { error = "Unsupported sample rate"; return false; }
    if (frames < 0 || frames > (juce::int64)(sampleRate * 60 * 30)) { error = "Render is longer than 30 minutes"; return false; }
    prepare(sampleRate);
    plugin_->reset();
    const int latency = unpackLatency(recordLatencyUpdate(effectiveLatencyOf(plugin_.get()), false));
    const juce::int64 processFrames = frames + latency;

    // Note-ons and note-offs in frame order; at one frame, offs go first so a
    // repeated note retriggers instead of being cut by its predecessor's end.
    struct Ev { juce::int64 frame; bool on; int pitch, velocity; };
    std::vector<Ev> timeline;
    for (auto& e : events) {
        const int pitch = juce::jlimit(0, 127, e.pitch);
        timeline.push_back({ std::max<juce::int64>(0, e.startFrame), true, pitch, juce::jlimit(1, 127, e.velocity) });
        timeline.push_back({ std::max(e.gateOffFrame, e.startFrame + 1), false, pitch, 0 });
    }
    std::stable_sort(timeline.begin(), timeline.end(), [](const Ev& a, const Ev& b) {
        return a.frame != b.frame ? a.frame < b.frame : (!a.on && b.on);
    });

    const int channels = std::max(2, std::max(plugin_->getTotalNumInputChannels(), plugin_->getTotalNumOutputChannels()));
    const int outChannels = plugin_->getTotalNumOutputChannels();
    juce::AudioBuffer<float> block(channels, block_);
    out.setSize(2, (int)frames, false, true, false);
    out.clear();
    juce::MidiBuffer midi;
    size_t next = 0;
    for (juce::int64 pos = 0; pos < processFrames; pos += block_) {
        const int n = (int)std::min<juce::int64>(block_, processFrames - pos);
        block.setSize(channels, n, false, false, true);
        block.clear();
        midi.clear();
        while (next < timeline.size() && timeline[next].frame < pos + n) {
            const auto& e = timeline[next++];
            const int at = (int)(e.frame - pos);
            midi.addEvent(e.on ? juce::MidiMessage::noteOn(1, e.pitch, (juce::uint8)e.velocity)
                               : juce::MidiMessage::noteOff(1, e.pitch), at);
        }
        plugin_->processBlock(block, midi);
        const int from = static_cast<int>(std::max<juce::int64>(0, latency - pos));
        const auto destination = std::max<juce::int64>(0, pos - latency);
        const int count = static_cast<int>(std::min<juce::int64>(n - from, frames - destination));
        if (count > 0) {
            out.copyFrom(0, static_cast<int>(destination), block, 0, from, count);
            out.copyFrom(1, static_cast<int>(destination), block, outChannels > 1 ? 1 : 0, from, count);
        }
    }
    // Leave nothing ringing into the next render.
    midi.clear();
    for (int ch = 1; ch <= 16; ++ch) midi.addEvent(juce::MidiMessage::allNotesOff(ch), 0);
    block.setSize(channels, block_, false, false, true);
    block.clear();
    plugin_->processBlock(block, midi);
    return true;
}

bool Instance::process(double sampleRate, const juce::AudioBuffer<float>& input,
                       juce::AudioBuffer<float>& out, juce::String& error) {
    const ScopedDenormalGuard denormalGuard;
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    if (sampleRate < 8000 || sampleRate > 384000) { error = "Unsupported sample rate"; return false; }
    const juce::int64 frames = input.getNumSamples();
    if (frames < 0 || frames > (juce::int64)(sampleRate * 60 * 30)) { error = "Process buffer is longer than 30 minutes"; return false; }
    prepare(sampleRate);
    plugin_->reset();
    const int latency = unpackLatency(recordLatencyUpdate(effectiveLatencyOf(plugin_.get()), false));
    const juce::int64 processFrames = frames + latency;

    const int inChannels = plugin_->getTotalNumInputChannels();
    const int outChannels = plugin_->getTotalNumOutputChannels();
    const int channels = std::max(2, std::max(inChannels, outChannels));
    juce::AudioBuffer<float> block(channels, block_);
    out.setSize(2, static_cast<int>(frames), false, true, false);
    out.clear();
    juce::MidiBuffer midi;
    for (juce::int64 pos = 0; pos < processFrames; pos += block_) {
        const int n = static_cast<int>(std::min<juce::int64>(block_, processFrames - pos));
        block.setSize(channels, n, false, false, true);
        block.clear();
        const int copyIn = static_cast<int>(std::max<juce::int64>(0, std::min<juce::int64>(n, frames - pos)));
        if (copyIn > 0 && input.getNumChannels() > 0) {
            const int srcL = 0;
            const int srcR = input.getNumChannels() > 1 ? 1 : 0;
            if (inChannels >= 1) block.copyFrom(0, 0, input, srcL, static_cast<int>(pos), copyIn);
            if (inChannels >= 2) block.copyFrom(1, 0, input, srcR, static_cast<int>(pos), copyIn);
        }
        midi.clear();
        plugin_->processBlock(block, midi);
        const int from = static_cast<int>(std::max<juce::int64>(0, latency - pos));
        const auto destination = std::max<juce::int64>(0, pos - latency);
        const int count = static_cast<int>(std::min<juce::int64>(n - from, frames - destination));
        if (count > 0) {
            if (outChannels >= 1) out.copyFrom(0, static_cast<int>(destination), block, 0, from, count);
            if (outChannels >= 1) out.copyFrom(1, static_cast<int>(destination), block, outChannels > 1 ? 1 : 0, from, count);
        }
    }
    return true;
}

bool writePlanarF32(const juce::AudioBuffer<float>& buffer, const juce::File& file) {
    juce::FileOutputStream stream(file);
    if (!stream.openedOk()) return false;
    stream.setPosition(0);
    stream.truncate();
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
        const float* data = buffer.getReadPointer(ch);
        for (int i = 0; i < buffer.getNumSamples(); ++i) stream.writeFloat(data[i]);
    }
    stream.flush();
    return stream.getStatus().wasOk();
}

bool readPlanarF32(const juce::File& file, juce::AudioBuffer<float>& buffer, juce::int64 frames) {
    if (frames < 0) return false;
    juce::FileInputStream stream(file);
    if (!stream.openedOk()) return false;
    const juce::int64 expected = frames * 2 * static_cast<juce::int64>(sizeof(float));
    if (stream.getTotalLength() != expected) return false;
    buffer.setSize(2, static_cast<int>(frames), false, true, false);
    for (int ch = 0; ch < 2; ++ch) {
        float* data = buffer.getWritePointer(ch);
        for (juce::int64 i = 0; i < frames; ++i) {
            data[i] = stream.readFloat();
        }
    }
    return !stream.isExhausted() || expected == 0 || stream.getPosition() == expected;
}

} // namespace vsthost
