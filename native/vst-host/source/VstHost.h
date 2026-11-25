#pragma once
// Hosts third-party VST3/AU instruments and audio effects for another application
// (NodeTool's timeline). The host renders note events or processes stereo audio
// offline into PCM and opens a plug-in's own editor window, so the caller never
// loads native plug-in code into its own process: a crashing plug-in takes down
// only this helper.
#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>
#include <functional>
#include <map>
#include <mutex>
#include "VstShmProtocol.h"

namespace vsthost {

struct PluginInfo {
    juce::String uid;       // PluginDescription::createIdentifierString()
    juce::String name, vendor, version, path;
    bool isInstrument = false;
    juce::String format = "vst3";
};

struct NoteEvent {
    int pitch = 60;
    int velocity = 100;      // 1..127
    juce::int64 startFrame = 0;
    juce::int64 gateOffFrame = 1;
};

// One VST3 note expression value, decoded from a kShmStatusNoteExpression event.
// `typeId` is the Steinberg::Vst::NoteExpressionTypeIDs value (volume 0, pan 1,
// tuning 2, brightness 5) and `value` the normalized 0..1 plain value.
struct NoteExpressionValue {
    int sampleOffset = 0;
    std::int32_t noteId = kShmNoNoteId;
    std::uint32_t typeId = 0;
    float value = 0.0f;
};

// Decodes one note expression event. False when `event` is another kind or its
// expression type is unknown.
bool decodeNoteExpression(const ShmMidiEvent& event, NoteExpressionValue& out);

// VST3 bundles in standard folders plus `extraDirs`, and registered AudioUnits on Apple.
// `instrumentsOnly` drops effects. Each bundle is scanned in this process.
std::vector<PluginInfo> scan(const juce::StringArray& extraDirs, bool instrumentsOnly);

// The standard VST3 folders of this platform.
juce::FileSearchPath defaultSearchPath();

// One loaded plug-in instance, keyed by the caller (one per timeline track).
// render() runs on any thread; state, preset, parameter and editor calls belong to the message
// thread. `lock` serializes rendering against state reads and writes.
class Instance {
public:
    Instance() = default;
    ~Instance();
    Instance(const Instance&) = delete;
    Instance& operator=(const Instance&) = delete;

    // Loads `path` (and the type `uid` names inside it, or the first instrument/plug-in).
    bool load(const juce::String& path, const juce::String& uid, juce::String& error);
    const juce::String& path() const { return path_; }
    const juce::String& uid() const { return uid_; }
    bool isInstrument() const { return isInstrument_; }
    juce::String pluginName() const;

    // Base64 of getStateInformation(); empty when the plug-in reports none.
    juce::String getState();
    juce::var listPresets();
    bool selectPreset(const juce::var& index, const juce::String& name, juce::String& error);
    juce::var getParameters();
    bool setParameters(const juce::var& changes, juce::String& error);
    // Applies base64 state unless it is what the instance already holds. Empty
    // state restores the sound the plug-in loaded with, so one instance can
    // render a track with saved state and then a track without.
    bool setState(const juce::String& base64, juce::String& error);

    // Renders `frames` frames of stereo at `sampleRate`. The plug-in is reset
    // first, so a render depends only on its state and the events.
    bool render(double sampleRate, juce::int64 frames, const std::vector<NoteEvent>& events,
                juce::AudioBuffer<float>& out, juce::String& error);

    // Processes stereo `input` through an audio effect plug-in at `sampleRate`.
    // The plug-in is reset first and latency is compensated to match `input`'s length.
    bool process(double sampleRate, const juce::AudioBuffer<float>& input,
                 juce::AudioBuffer<float>& out, juce::String& error);

    // Prepares the plug-in for real-time shared-memory streaming at `sampleRate`.
    bool prepareLive(double sampleRate, int maxBlockFrames, juce::String& error);

    // Ensures live preparation at `sampleRate` (without resetting if already prepared at that rate)
    // and re-probes the plug-in's current effective latency (0 when bypassed).
    bool probeLiveLatency(double sampleRate, int maxBlockFrames, int& latencyOut, juce::String& error,
                          std::uint64_t* latencyGenerationOut = nullptr);

    // Processes one real-time block using caller-owned pre-allocated scratch buffers.
    bool processLiveBlock(double sampleRate, int numFrames, bool reset,
                          const float* inL, const float* inR,
                          float* outL, float* outR,
                          const ShmMidiEvent* midiEvents, int numMidiEvents,
                          juce::AudioBuffer<float>& scratchBlock, juce::MidiBuffer& scratchMidi,
                          int* latencySamples = nullptr,
                          std::uint64_t* latencyGeneration = nullptr);

    // Current effective latency in samples (0 when bypassed) and its monotonic generation,
    // kept synced via AudioProcessorListener (restartComponent kLatencyChanged), prepare, state loads, and processLiveBlock.
    int latencySamples() const noexcept {
        return unpackLatency(packedLatency_.load(std::memory_order_acquire));
    }
    std::uint64_t latencyGeneration() const noexcept {
        return unpackGeneration(packedLatency_.load(std::memory_order_acquire));
    }
    int refreshLatency(std::uint64_t* latencyGenerationOut = nullptr);
    std::uint64_t latencyChangeCount() const noexcept { return latencyGeneration(); }
    // Callback is always invoked on the JUCE message thread (polled by a message-thread timer).
    void setLatencyChangedCallback(std::function<void(int, std::uint64_t)> callback);

    // Note expression events decoded from live blocks and not delivered. JUCE
    // 8.0.4 hosts a VST3 through juce::MidiBuffer, which has no note
    // expression message, and it sends every note-on with noteId -1. So no
    // NoteExpressionValueEvent can reach the plug-in without patching JUCE's
    // MidiEventList. The host counts the events it drops, so a test or a log
    // can see them. Delivery belongs in deliverNoteExpression() when JUCE
    // can take it.
    std::uint64_t droppedNoteExpression() const { return droppedNoteExpression_.load(std::memory_order_relaxed); }

    juce::AudioPluginInstance* plugin() { return plugin_.get(); }
    std::recursive_mutex lock;

private:
    static constexpr std::uint64_t packLatency(std::uint32_t gen, int latency) noexcept {
        return (static_cast<std::uint64_t>(gen) << 32) |
               static_cast<std::uint32_t>(latency < 0 ? 0 : latency);
    }
    static constexpr std::uint32_t unpackGeneration(std::uint64_t packed) noexcept {
        return static_cast<std::uint32_t>(packed >> 32);
    }
    static constexpr int unpackLatency(std::uint64_t packed) noexcept {
        return static_cast<int>(static_cast<std::uint32_t>(packed & 0xFFFFFFFFu));
    }

    // Owned by Instance; attached to plugin_ in load() and detached before plugin_ destruction.
    struct PluginListener final : juce::AudioProcessorListener {
        explicit PluginListener(Instance& owner) : owner_(owner) {}
        void audioProcessorParameterChanged(juce::AudioProcessor* processor, int parameterIndex, float newValue) override;
        void audioProcessorChanged(juce::AudioProcessor* processor, const ChangeDetails& details) override;
        Instance& owner_;
    };

    // Owned by Instance; polls lock-free atomic latency state on the JUCE message thread
    // so audio and listener threads never post OS messages, allocate, or acquire locks.
    struct LatencyPoller final : juce::Timer {
        explicit LatencyPoller(Instance& owner) : owner_(owner) {}
        void timerCallback() override;
        Instance& owner_;
    };

    std::uint64_t recordLatencyUpdate(int newLatency, bool forceNotify) noexcept;
    void deliverLatencyNotification();
    void prepare(double sampleRate, bool nonRealtime = true, int blockSize = block_);

    juce::AudioPluginFormatManager formats_;
    std::unique_ptr<juce::AudioPluginInstance> plugin_;
    PluginListener listener_{*this};
    LatencyPoller poller_{*this};
    juce::String path_, uid_, appliedState_, defaultState_;
    bool isInstrument_ = false;
    // Packed (generation << 32) | latencySamples. Lock-free across audio, listener, and message threads.
    std::atomic<std::uint64_t> packedLatency_{0};
    std::atomic<bool> forceNotifyPending_{false};
    std::atomic<bool> latencyNotifyPending_{false};
    std::atomic<std::uint64_t> droppedNoteExpression_{0};
    // Message-thread-only tracking of the last delivered latencyChanged callback.
    int lastNotifiedLatency_ = -1;
    // Guards latencyChangedCallback_ on the message thread (never acquired on audio/listener threads).
    std::mutex callbackMutex_;
    std::function<void(int, std::uint64_t)> latencyChangedCallback_;
    bool preparedNonRealtime_ = true;
    int preparedBlockSize_ = 0;
    double preparedRate_ = 0;
    static constexpr int block_ = 512;
    static constexpr int kLatencyPollIntervalMs = 10;
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free,
                  "64-bit packed latency atomic must be lock-free");
    static_assert(std::atomic<bool>::is_always_lock_free,
                  "latency notification pending flag must be lock-free");
};

// Apply the requested state and render as one serialized operation.
bool renderWithState(Instance& inst, bool applyState, const juce::String& state,
                     double sampleRate, juce::int64 frames, const std::vector<NoteEvent>& events,
                     juce::AudioBuffer<float>& out, juce::String& error);

// Apply the requested state and process stereo audio as one serialized operation.
bool processWithState(Instance& inst, bool applyState, const juce::String& state,
                      double sampleRate, const juce::AudioBuffer<float>& input,
                      juce::AudioBuffer<float>& out, juce::String& error);

// Planar float32 little-endian: every left frame, then every right frame.
bool writePlanarF32(const juce::AudioBuffer<float>& buffer, const juce::File& file);
bool readPlanarF32(const juce::File& file, juce::AudioBuffer<float>& buffer, juce::int64 frames);

} // namespace vsthost
