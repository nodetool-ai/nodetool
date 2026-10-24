#pragma once
// Hosts third-party VST3 instruments for another application (NodeTool's
// timeline). The host renders note events offline into PCM and opens a
// plug-in's own editor window, so the caller never loads native plug-in code
// into its own process: a crashing plug-in takes down only this helper.
#include <juce_audio_processors/juce_audio_processors.h>
#include <map>
#include <mutex>

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
    // Loads `path` (and the type `uid` names inside it, or the first instrument).
    bool load(const juce::String& path, const juce::String& uid, juce::String& error);
    const juce::String& path() const { return path_; }
    const juce::String& uid() const { return uid_; }
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

    juce::AudioPluginInstance* plugin() { return plugin_.get(); }
    std::recursive_mutex lock;

private:
    void prepare(double sampleRate);

    juce::AudioPluginFormatManager formats_;
    std::unique_ptr<juce::AudioPluginInstance> plugin_;
    juce::String path_, uid_, appliedState_, defaultState_;
    double preparedRate_ = 0;
    static constexpr int block_ = 512;
};

// Planar float32 little-endian: every left frame, then every right frame.
bool writePlanarF32(const juce::AudioBuffer<float>& buffer, const juce::File& file);

} // namespace vsthost
