// A minimal VST3 stereo audio effect for vst_host_test: scales input by a gain
// parameter (default 0.5) and optionally introduces latency samples, so audio
// effect hosting and latency compensation can be tested without third-party plug-ins.
#include <juce_audio_processors/juce_audio_processors.h>
#include <vector>

class GainEffect : public juce::AudioProcessor {
public:
    GainEffect()
        : AudioProcessor(BusesProperties()
                             .withInput("Input", juce::AudioChannelSet::stereo(), true)
                             .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
        // native-rules #2: naked new, ownership passes to the JUCE processor
        addParameter(gain_ = new juce::AudioParameterFloat(juce::ParameterID { "gain", 1 }, "Gain", 0.0f, 2.0f, 0.5f));
        // native-rules #2: naked new, ownership passes to the JUCE processor
        addParameter(latency_ = new juce::AudioParameterInt(juce::ParameterID { "latency", 1 }, "Latency", 0, 2048, 0));
    }

    const juce::String getName() const override { return "NodeTool Test Gain"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    bool hasEditor() const override { return true; }
    // native-rules #4: returns a raw owning pointer the caller must free
    juce::AudioProcessorEditor* createEditor() override { return new juce::GenericAudioProcessorEditor(*this); }

    void prepareToPlay(double, int) override {
        setLatencySamples(latency_->get());
        const size_t n = static_cast<size_t>(getLatencySamples());
        delayL_.assign(n, 0.0f);
        delayR_.assign(n, 0.0f);
        delayAt_ = 0;
    }
    void releaseResources() override {}
    void reset() override {
        std::fill(delayL_.begin(), delayL_.end(), 0.0f);
        std::fill(delayR_.begin(), delayR_.end(), 0.0f);
        delayAt_ = 0;
    }

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override {
        const float g = gain_->get();
        const int numCh = buffer.getNumChannels();
        const int numSamples = buffer.getNumSamples();
        for (int ch = 0; ch < numCh; ++ch) {
            buffer.applyGain(ch, 0, numSamples, g);
        }
        if (!delayL_.empty()) {
            for (int i = 0; i < numSamples; ++i) {
                const float inL = numCh > 0 ? buffer.getSample(0, i) : 0.0f;
                const float inR = numCh > 1 ? buffer.getSample(1, i) : inL;
                const float outL = delayL_[delayAt_];
                const float outR = delayR_[delayAt_];
                delayL_[delayAt_] = inL;
                delayR_[delayAt_] = inR;
                delayAt_ = (delayAt_ + 1) % delayL_.size();
                if (numCh > 0) buffer.setSample(0, i, outL);
                if (numCh > 1) buffer.setSample(1, i, outR);
            }
        }
    }

    void getStateInformation(juce::MemoryBlock& dest) override {
        juce::MemoryOutputStream out(dest, false);
        out.writeFloat(gain_->get());
        out.writeInt(latency_->get());
    }
    void setStateInformation(const void* data, int size) override {
        juce::MemoryInputStream in(data, (size_t)size, false);
        if (size >= (int)sizeof(float)) *gain_ = in.readFloat();
        if (size >= (int)(sizeof(float) + sizeof(int))) {
            *latency_ = in.readInt();
            const int lat = latency_->get();
            setLatencySamples(lat);
            delayL_.assign(static_cast<size_t>(lat), 0.0f);
            delayR_.assign(static_cast<size_t>(lat), 0.0f);
            delayAt_ = 0;
        }
    }

private:
    juce::AudioParameterFloat* gain_;
    juce::AudioParameterInt* latency_;
    std::vector<float> delayL_;
    std::vector<float> delayR_;
    size_t delayAt_ = 0;
};

// native-rules #4: returns a raw owning pointer the caller must free
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new GainEffect(); }
