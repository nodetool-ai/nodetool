// A minimal VST3 stereo audio effect for vst_host_test: scales input by a gain
// parameter (default 0.5) and optionally introduces latency samples, so audio
// effect hosting and latency compensation can be tested without third-party plug-ins.
#include <juce_audio_processors/juce_audio_processors.h>
#include <algorithm>
#include <atomic>
#include <vector>

class GainEffect : public juce::AudioProcessor, private juce::AudioProcessorParameter::Listener {
public:
    static constexpr int kMaxLatency = 2048;

    GainEffect()
        : AudioProcessor(BusesProperties()
                             .withInput("Input", juce::AudioChannelSet::stereo(), true)
                             .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
          delayL_(static_cast<size_t>(kMaxLatency) + 1, 0.0f),
          delayR_(static_cast<size_t>(kMaxLatency) + 1, 0.0f) {
        // native-rules #2: naked new, ownership passes to the JUCE processor
        addParameter(gain_ = new juce::AudioParameterFloat(juce::ParameterID { "gain", 1 }, "Gain", 0.0f, 2.0f, 0.5f));
        // native-rules #2: naked new, ownership passes to the JUCE processor
        addParameter(latency_ = new juce::AudioParameterInt(juce::ParameterID { "latency", 1 }, "Latency", 0, kMaxLatency, 0));
        // native-rules #2: naked new, ownership passes to the JUCE processor
        addParameter(bypass_ = new juce::AudioParameterBool(juce::ParameterID { "bypass", 1 }, "Bypass", false));
        latency_->addListener(this);
        bypass_->addListener(this);
    }

    ~GainEffect() override {
        if (bypass_) { bypass_->removeListener(this); }
        if (latency_) { latency_->removeListener(this); }
    }

    juce::AudioProcessorParameter* getBypassParameter() const override { return bypass_; }

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
        const int lat = std::clamp(latency_->get(), 0, kMaxLatency);
        activeDelay_.store(lat, std::memory_order_release);
        setLatencySamples(lat);
        reset();
    }
    void releaseResources() override {}
    void reset() override {
        std::fill(delayL_.begin(), delayL_.end(), 0.0f);
        std::fill(delayR_.begin(), delayR_.end(), 0.0f);
        writePos_ = 0;
        validFrames_ = 0;
    }

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override {
        const bool bypassed = bypass_ && bypass_->get();
        const float g = gain_->get();
        const int numCh = buffer.getNumChannels();
        const int numSamples = buffer.getNumSamples();
        const int lat = std::clamp(activeDelay_.load(std::memory_order_acquire), 0, kMaxLatency);
        const size_t cap = delayL_.size();
        for (int i = 0; i < numSamples; ++i) {
            const float rawL = numCh > 0 ? buffer.getSample(0, i) : 0.0f;
            const float rawR = numCh > 1 ? buffer.getSample(1, i) : rawL;
            const float inL = rawL * g;
            const float inR = rawR * g;
            delayL_[writePos_] = inL;
            delayR_[writePos_] = inR;
            float outL = bypassed ? rawL : inL;
            float outR = bypassed ? rawR : inR;
            if (!bypassed && lat > 0) {
                if (validFrames_ >= static_cast<size_t>(lat)) {
                    const size_t rPos = (writePos_ + cap - static_cast<size_t>(lat)) % cap;
                    outL = delayL_[rPos];
                    outR = delayR_[rPos];
                } else {
                    outL = 0.0f;
                    outR = 0.0f;
                }
            }
            if (numCh > 0) buffer.setSample(0, i, outL);
            if (numCh > 1) buffer.setSample(1, i, outR);
            writePos_ = (writePos_ + 1 == cap) ? 0 : writePos_ + 1;
            if (validFrames_ < cap) ++validFrames_;
        }
    }

    void getStateInformation(juce::MemoryBlock& dest) override {
        juce::MemoryOutputStream out(dest, false);
        out.writeFloat(gain_->get());
        out.writeInt(latency_->get());
        out.writeBool(bypass_->get());
    }
    void setStateInformation(const void* data, int size) override {
        juce::MemoryInputStream in(data, (size_t)size, false);
        if (size >= (int)sizeof(float)) *gain_ = in.readFloat();
        if (size >= (int)(sizeof(float) + sizeof(int))) {
            *latency_ = in.readInt();
            const int lat = std::clamp(latency_->get(), 0, kMaxLatency);
            activeDelay_.store(lat, std::memory_order_release);
            setLatencySamples(lat);
        }
        if (size >= (int)(sizeof(float) + sizeof(int) + 1)) {
            *bypass_ = in.readBool();
        }
    }

private:
    void parameterValueChanged(int, float) override {
        const int lat = std::clamp(latency_->get(), 0, kMaxLatency);
        activeDelay_.store(lat, std::memory_order_release);
        setLatencySamples(lat);
    }
    void parameterGestureChanged(int, bool) override {}

    juce::AudioParameterFloat* gain_;
    juce::AudioParameterInt* latency_;
    juce::AudioParameterBool* bypass_;
    std::atomic<int> activeDelay_{0};
    std::vector<float> delayL_;
    std::vector<float> delayR_;
    size_t writePos_ = 0;
    size_t validFrames_ = 0;
};

// native-rules #4: returns a raw owning pointer the caller must free
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new GainEffect(); }
