#pragma once
// Hosts third-party VST3 instruments and audio effects for another application
// (NodeTool's timeline). The host renders note events or processes stereo audio
// offline into PCM and opens a plug-in's own editor window, so the caller never
// loads native plug-in code into its own process: a crashing plug-in takes down
// only this helper.
#include <juce_audio_processors/juce_audio_processors.h>
#include <map>
#include <atomic>
#include <mutex>
#include "VstShmProtocol.h"

namespace vsthost {

struct PluginInfo {
    juce::String uid;       // PluginDescription::createIdentifierString()
    juce::String name, vendor, version, path;
    bool isInstrument = false;
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

// Every VST3 under the platform's standard folders plus `extraDirs`.
// `instrumentsOnly` drops effects. Each bundle is scanned in this process.
std::vector<PluginInfo> scan(const juce::StringArray& extraDirs, bool instrumentsOnly);

// The standard VST3 folders of this platform.
juce::FileSearchPath defaultSearchPath();

// One loaded plug-in instance, keyed by the caller (one per timeline track).
// render() runs on any thread; state and editor calls belong to the message
// thread. `lock` serializes rendering against state reads and writes.
class Instance {
public:
    // Loads `path` (and the type `uid` names inside it, or the first instrument/plug-in).
    bool load(const juce::String& path, const juce::String& uid, juce::String& error);
    const juce::String& path() const { return path_; }
    const juce::String& uid() const { return uid_; }
    bool isInstrument() const { return isInstrument_; }
    juce::String pluginName() const;

    // Base64 of getStateInformation(); empty when the plug-in reports none.
    juce::String getState();
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

    // Processes one real-time block using caller-owned pre-allocated scratch buffers.
    bool processLiveBlock(double sampleRate, int numFrames, bool reset,
                          const float* inL, const float* inR,
                          float* outL, float* outR,
                          const ShmMidiEvent* midiEvents, int numMidiEvents,
                          juce::AudioBuffer<float>& scratchBlock, juce::MidiBuffer& scratchMidi,
                          int* latencySamples = nullptr);

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
    void prepare(double sampleRate, bool nonRealtime = true, int blockSize = block_);

    juce::AudioPluginFormatManager formats_;
    std::unique_ptr<juce::AudioPluginInstance> plugin_;
    juce::String path_, uid_, appliedState_, defaultState_;
    bool isInstrument_ = false;
    // Written by the live worker thread, read by any thread without `lock`: atomic.
    std::atomic<std::uint64_t> droppedNoteExpression_{0};
    bool preparedNonRealtime_ = true;
    int preparedBlockSize_ = 0;
    double preparedRate_ = 0;
    static constexpr int block_ = 512;
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
