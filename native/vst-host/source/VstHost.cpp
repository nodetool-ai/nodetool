#include "VstHost.h"

namespace vsthost {

juce::FileSearchPath defaultSearchPath() {
    juce::VST3PluginFormat format;
    return format.getDefaultLocationsToSearch();
}

std::vector<PluginInfo> scan(const juce::StringArray& extraDirs, bool instrumentsOnly) {
    juce::VST3PluginFormat format;
    auto search = defaultSearchPath();
    for (auto& d : extraDirs)
        if (juce::File(d).isDirectory()) search.add(juce::File(d));
    std::vector<PluginInfo> out;
    for (auto& file : format.searchPathsForPlugins(search, true, false)) {
        juce::OwnedArray<juce::PluginDescription> descs;
        format.findAllTypesForFile(descs, file);
        for (auto* d : descs) {
            if (instrumentsOnly && !d->isInstrument) continue;
            out.push_back({ d->createIdentifierString(), d->name, d->manufacturerName, d->version,
                            d->fileOrIdentifier, d->isInstrument });
        }
    }
    std::sort(out.begin(), out.end(), [](const PluginInfo& a, const PluginInfo& b) {
        return a.name.compareIgnoreCase(b.name) < 0;
    });
    return out;
}

bool Instance::load(const juce::String& path, const juce::String& uid, juce::String& error) {
    if (formats_.getNumFormats() == 0) formats_.addFormat(new juce::VST3PluginFormat());
    juce::OwnedArray<juce::PluginDescription> descs;
    juce::VST3PluginFormat format;
    format.findAllTypesForFile(descs, path);
    const juce::PluginDescription* pick = nullptr;
    for (auto* d : descs)
        if (d->createIdentifierString() == uid) pick = d;
    if (!pick)
        for (auto* d : descs)
            if (d->isInstrument) { pick = d; break; }
    if (!pick) { error = "No VST3 instrument found in " + path; return false; }
    const double rate = preparedRate_ > 0 ? preparedRate_ : 48000.0;
    auto plugin = formats_.createPluginInstance(*pick, rate, block_, error);
    if (!plugin) return false;
    std::lock_guard<std::recursive_mutex> guard(lock);
    plugin_ = std::move(plugin);
    path_ = path;
    uid_ = pick->createIdentifierString();
    appliedState_ = {};
    preparedRate_ = 0;
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

void Instance::prepare(double sampleRate) {
    if (juce::exactlyEqual(preparedRate_, sampleRate)) return;
    if (preparedRate_ > 0) plugin_->releaseResources();
    // An instrument has no audio input; ask for a stereo main output.
    auto layout = plugin_->getBusesLayout();
    for (auto& in : layout.inputBuses) in = juce::AudioChannelSet::disabled();
    if (!layout.outputBuses.isEmpty()) layout.outputBuses.getReference(0) = juce::AudioChannelSet::stereo();
    if (!plugin_->setBusesLayout(layout)) plugin_->enableAllBuses();
    plugin_->setNonRealtime(true);
    plugin_->setPlayConfigDetails(plugin_->getTotalNumInputChannels(), plugin_->getTotalNumOutputChannels(),
                                  sampleRate, block_);
    plugin_->prepareToPlay(sampleRate, block_);
    preparedRate_ = sampleRate;
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

} // namespace vsthost
