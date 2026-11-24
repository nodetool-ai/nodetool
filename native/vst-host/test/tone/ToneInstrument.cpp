// A minimal VST3 instrument for vst_host_test: one sine voice per note and a
// level parameter that its state saves, so the test needs no third-party plug-in.
#include <juce_audio_processors/juce_audio_processors.h>
#include <cmath>
#include <map>
#include <vector>

// Host calls are serialized by Instance::lock, including audio processing and program changes.
class ToneInstrument : public juce::AudioProcessor {
public:
    ToneInstrument()
        : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
        // native-rules #2: naked new, ownership passes to the JUCE processor
        addParameter(level_ = new juce::AudioParameterFloat(juce::ParameterID { "level", 1 }, "Level", 0.0f, 1.0f, 0.5f));
        // native-rules #2: naked new, ownership passes to the JUCE processor
        addParameter(latency_ = new juce::AudioParameterInt(juce::ParameterID { "latency", 1 }, "Latency", 0, 2048, 0));
    }

    const juce::String getName() const override { return "NodeTool Test Tone"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0; }
    int getNumPrograms() override { return 2; }
    int getCurrentProgram() override { return currentProgram_; }
    void setCurrentProgram(int index) override {
        currentProgram_ = juce::jlimit(0, 1, index);
        *level_ = currentProgram_ == 0 ? 0.5f : 0.9f;
    }
    const juce::String getProgramName(int index) override { return index == 0 ? "Default" : "Bright"; }
    void changeProgramName(int, const juce::String&) override {}
    bool hasEditor() const override { return true; }
    // native-rules #4: returns a raw owning pointer the caller must free
    juce::AudioProcessorEditor* createEditor() override { return new juce::GenericAudioProcessorEditor(*this); }

    void prepareToPlay(double sampleRate, int) override {
        rate_ = sampleRate;
        logPath_ = juce::SystemStats::getEnvironmentVariable("NT_TONE_MIDI_LOG", {});
        notes_.clear();
        setLatencySamples(latency_->get());
        delay_.assign(static_cast<size_t>(getLatencySamples()), 0.0f);
        delayAt_ = 0;
    }
    void releaseResources() override {}
    void reset() override { notes_.clear(); std::fill(delay_.begin(), delay_.end(), 0.0f); delayAt_ = 0; }

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override {
        buffer.clear();
        int pos = 0;
        for (const auto meta : midi) {
            render(buffer, pos, meta.samplePosition);
            pos = meta.samplePosition;
            const auto msg = meta.getMessage();
            if (msg.isNoteOn()) notes_[msg.getNoteNumber()] = 0.0;
            else if (msg.isNoteOff()) notes_.erase(msg.getNoteNumber());
            log(msg);
        }
        render(buffer, pos, buffer.getNumSamples());
        if (!delay_.empty()) {
            for (int i = 0; i < buffer.getNumSamples(); ++i) {
                const float delayed = delay_[delayAt_];
                delay_[delayAt_] = buffer.getSample(0, i);
                delayAt_ = (delayAt_ + 1) % delay_.size();
                for (int ch = 0; ch < buffer.getNumChannels(); ++ch) buffer.setSample(ch, i, delayed);
            }
        }
    }

    void getStateInformation(juce::MemoryBlock& dest) override {
        juce::MemoryOutputStream stream(dest, false);
        stream.writeFloat(level_->get());
        stream.writeInt(currentProgram_);
    }
    void setStateInformation(const void* data, int size) override {
        if (size >= static_cast<int>(sizeof(float))) {
            juce::MemoryInputStream stream(data, static_cast<size_t>(size), false);
            *level_ = stream.readFloat();
            currentProgram_ = size >= static_cast<int>(sizeof(float) + sizeof(int)) ? juce::jlimit(0, 1, stream.readInt()) : 0;
        }
    }

private:
    // Test hook: when NT_TONE_MIDI_LOG names a file, every MIDI message the plug-in
    // receives is appended there as "<kind> ch=<1..16> <values>", so a host test
    // can see what reached a plug-in through the VST3 event path.
    void log(const juce::MidiMessage& msg) {
        if (logPath_.isEmpty()) return;
        juce::String line;
        const auto ch = " ch=" + juce::String(msg.getChannel());
        if (msg.isNoteOn()) line = "noteOn" + ch + " " + juce::String(msg.getNoteNumber()) + " " + juce::String(msg.getVelocity());
        else if (msg.isNoteOff()) line = "noteOff" + ch + " " + juce::String(msg.getNoteNumber()) + " " + juce::String(msg.getVelocity());
        else if (msg.isController()) line = "cc" + ch + " " + juce::String(msg.getControllerNumber()) + " " + juce::String(msg.getControllerValue());
        else if (msg.isPitchWheel()) line = "bend" + ch + " " + juce::String(msg.getPitchWheelValue());
        else if (msg.isChannelPressure()) line = "chanPressure" + ch + " " + juce::String(msg.getChannelPressureValue());
        else if (msg.isAftertouch()) line = "polyPressure" + ch + " " + juce::String(msg.getNoteNumber()) + " " + juce::String(msg.getAfterTouchValue());
        else return;
        juce::File(logPath_).appendText(line + "\n");
    }

    void render(juce::AudioBuffer<float>& buffer, int from, int to) {
        const float gain = 0.2f * level_->get();
        for (auto& [pitch, phase] : notes_) {
            const double step = juce::MathConstants<double>::twoPi * 440.0 * std::pow(2.0, (pitch - 69) / 12.0) / rate_;
            for (int i = from; i < to; ++i) {
                const auto sample = gain * (float)std::sin(phase);
                for (int ch = 0; ch < buffer.getNumChannels(); ++ch) buffer.addSample(ch, i, sample);
                phase += step;
            }
        }
    }

    juce::AudioParameterFloat* level_;
    juce::AudioParameterInt* latency_;
    std::vector<float> delay_;
    size_t delayAt_ = 0;
    std::map<int, double> notes_;
    juce::String logPath_;
    double rate_ = 48000;
    int currentProgram_ = 0;
};

// native-rules #4: returns a raw owning pointer the caller must free
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new ToneInstrument(); }
