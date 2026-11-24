#include "VstHost.h"
#include <cmath>

namespace vsthost {

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
    std::lock_guard<std::recursive_mutex> guard(lock);
    plugin_ = std::move(plugin);
    path_ = path;
    uid_ = pick->createIdentifierString();
    isInstrument_ = pick->isInstrument;
    appliedState_ = {};
    preparedRate_ = 0;
    preparedBlockSize_ = 0;
    defaultState_ = getState();
    return true;
}

juce::String Instance::pluginName() const { return plugin_ ? plugin_->getName() : juce::String(); }

juce::String Instance::getState() {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) return {};
    juce::MemoryBlock mb;
    plugin_->getStateInformation(mb);
    if (mb.isEmpty()) return {};
    appliedState_ = juce::Base64::toBase64(mb.getData(), mb.getSize());
    return appliedState_;
}

bool Instance::setState(const juce::String& base64, juce::String& error) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    const juce::String& target = base64.isEmpty() ? defaultState_ : base64;
    if (target.isEmpty() || target == appliedState_) return true;
    juce::MemoryOutputStream decoded;
    if (!juce::Base64::convertFromBase64(decoded, target)) { error = "Plug-in state is not valid base64"; return false; }
    plugin_->setStateInformation(decoded.getData(), (int)decoded.getDataSize());
    appliedState_ = target;
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
    appliedState_.clear();
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
    appliedState_.clear();
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
}

bool Instance::prepareLive(double sampleRate, int maxBlockFrames, juce::String& error) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    if (sampleRate < 8000 || sampleRate > 384000) { error = "Unsupported sample rate"; return false; }
    const int bs = juce::jlimit(64, static_cast<int>(kShmMaxFrames), maxBlockFrames);
    prepare(sampleRate, false, bs);
    plugin_->reset();
    return true;
}

bool Instance::processLiveBlock(double sampleRate, int numFrames, bool reset,
                                const float* inL, const float* inR,
                                float* outL, float* outR,
                                const ShmMidiEvent* midiEvents, int numMidiEvents,
                                juce::AudioBuffer<float>& scratchBlock, juce::MidiBuffer& scratchMidi,
                                int* latencySamples) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_ || numFrames <= 0 || numFrames > static_cast<int>(kShmMaxFrames)) return false;
    // The live worker never prepares: prepareToPlay allocates and blocks. The control side
    // calls prepareLive() for the real rate. A mismatch drops the block, never prepares.
    if (preparedRate_ <= 0 || !juce::exactlyEqual(preparedRate_, sampleRate) || preparedNonRealtime_ ||
        preparedBlockSize_ < numFrames) {
        return false;
    }
    if (latencySamples) *latencySamples = std::max(0, plugin_->getLatencySamples());
    const int inChannels = plugin_->getTotalNumInputChannels();
    const int outChannels = plugin_->getTotalNumOutputChannels();
    const int channels = std::max(2, std::max(inChannels, outChannels));
    if (scratchBlock.getNumChannels() < channels || scratchBlock.getNumSamples() < numFrames) {
        scratchBlock.setSize(channels, std::max(numFrames, static_cast<int>(kShmMaxFrames)), false, false, true);
    }
    scratchBlock.setSize(channels, numFrames, false, false, true);
    if (reset) {
        if (isInstrument_) {
            scratchMidi.clear();
            for (int ch = 1; ch <= 16; ++ch) {
                // Release sustain and centre pitch bend too, so a seek leaks no controller state.
                scratchMidi.addEvent(juce::MidiMessage::allNotesOff(ch), 0);
                scratchMidi.addEvent(juce::MidiMessage::controllerEvent(ch, 64, 0), 0);
                scratchMidi.addEvent(juce::MidiMessage::pitchWheel(ch, 8192), 0);
            }
            scratchBlock.clear();
            plugin_->processBlock(scratchBlock, scratchMidi);
        }
        plugin_->reset();
    }
    scratchBlock.clear();
    if (!isInstrument_ && inL && inR) {
        if (inChannels >= 1) scratchBlock.copyFrom(0, 0, inL, numFrames);
        if (inChannels >= 2) scratchBlock.copyFrom(1, 0, inR, numFrames);
    }
    scratchMidi.clear();
    if (midiEvents && numMidiEvents > 0) {
        for (int i = 0; i < numMidiEvents; ++i) {
            const auto& e = midiEvents[i];
            const int offset = juce::jlimit(0, numFrames - 1, static_cast<int>(e.sampleOffset));
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
        }
    }
    plugin_->processBlock(scratchBlock, scratchMidi);
    if (outL && outR) {
        if (outChannels >= 1) {
            std::memcpy(outL, scratchBlock.getReadPointer(0), static_cast<size_t>(numFrames) * sizeof(float));
            std::memcpy(outR, scratchBlock.getReadPointer(outChannels > 1 ? 1 : 0),
                        static_cast<size_t>(numFrames) * sizeof(float));
        } else {
            std::memset(outL, 0, static_cast<size_t>(numFrames) * sizeof(float));
            std::memset(outR, 0, static_cast<size_t>(numFrames) * sizeof(float));
        }
    }
    return true;
}

bool Instance::render(double sampleRate, juce::int64 frames, const std::vector<NoteEvent>& events,
                      juce::AudioBuffer<float>& out, juce::String& error) {
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    if (sampleRate < 8000 || sampleRate > 384000) { error = "Unsupported sample rate"; return false; }
    if (frames < 0 || frames > (juce::int64)(sampleRate * 60 * 30)) { error = "Render is longer than 30 minutes"; return false; }
    prepare(sampleRate);
    plugin_->reset();
    const int latency = std::max(0, plugin_->getLatencySamples());
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
    std::lock_guard<std::recursive_mutex> guard(lock);
    if (!plugin_) { error = "No plug-in loaded"; return false; }
    if (sampleRate < 8000 || sampleRate > 384000) { error = "Unsupported sample rate"; return false; }
    const juce::int64 frames = input.getNumSamples();
    if (frames < 0 || frames > (juce::int64)(sampleRate * 60 * 30)) { error = "Process buffer is longer than 30 minutes"; return false; }
    prepare(sampleRate);
    plugin_->reset();
    const int latency = std::max(0, plugin_->getLatencySamples());
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
