// NodeToolVstHost core against a real VST3: the test instrument this build produces.
//   vst_host_test <path to NodeTool Test Tone.vst3>
#include <juce_audio_processors/juce_audio_processors.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <thread>
#if JUCE_MAC
#include <CoreFoundation/CoreFoundation.h>
#include <malloc/malloc.h>
#include <pthread.h>
#endif
#include "../source/VstHost.h"

#if JUCE_MAC
extern "C" {
using MallocLoggerFn = void (*)(uint32_t, uintptr_t, uintptr_t, uintptr_t, uintptr_t, uint32_t);
extern MallocLoggerFn malloc_logger;
}
#endif

namespace {
#if JUCE_MAC
// Per-thread heap allocation counter via macOS malloc_logger (catches malloc, calloc, realloc, and operator new).
// Uses atomic pthread_t comparison (never thread_local, which can recurse into malloc during thread exit).
// native-rules #14: test-only atomic allocation tracking globals
static std::atomic<pthread_t> g_trackedThread{nullptr};
static std::atomic<std::uint64_t> g_trackedAllocCount{0};

void testMallocLogger(uint32_t type, uintptr_t, uintptr_t, uintptr_t, uintptr_t, uint32_t) {
    // 2 = MALLOC_LOG_TYPE_ALLOCATE, 4 = MALLOC_LOG_TYPE_DEALLOCATE (realloc sets both 2|4 = 6).
    if ((type & 2u) != 0u && pthread_self() == g_trackedThread.load(std::memory_order_relaxed)) {
        g_trackedAllocCount.fetch_add(1, std::memory_order_relaxed);
    }
}

struct ScopedAllocCounter {
    ScopedAllocCounter() {
        g_trackedAllocCount.store(0, std::memory_order_relaxed);
        g_trackedThread.store(pthread_self(), std::memory_order_release);
    }
    ~ScopedAllocCounter() {
        g_trackedThread.store(nullptr, std::memory_order_release);
    }
    [[nodiscard]] std::uint64_t count() const noexcept {
        return g_trackedAllocCount.load(std::memory_order_acquire);
    }
};
#else
struct ScopedAllocCounter {
    [[nodiscard]] std::uint64_t count() const noexcept { return 0; }
};
#endif

// Real 36-output-channel zero-allocation AudioPluginInstance fixture for C4, C5, and C7.
// Rejects non-36-channel layouts so Instance::prepare() keeps all 36 output channels
// (selecting the >=32-channel branch in Instance::processLiveBlock()).
class WideChannelTestPlugin final : public juce::AudioPluginInstance {
public:
    static constexpr int kOutputChannels = 36;

    WideChannelTestPlugin()
        : juce::AudioPluginInstance(
              BusesProperties().withOutput("Out36", juce::AudioChannelSet::discreteChannels(kOutputChannels), true)) {}

    const juce::String getName() const override { return "Wide36TestPlugin"; }
    void fillInPluginDescription(juce::PluginDescription& d) const override {
        d.name = getName();
        d.pluginFormatName = "Test";
        d.isInstrument = true;
        d.numInputChannels = 0;
        d.numOutputChannels = kOutputChannels;
    }
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
        return layouts.inputBuses.isEmpty() && layouts.outputBuses.size() == 1 &&
               layouts.outputBuses[0].size() == kOutputChannels;
    }
    void prepareToPlay(double, int) override {}
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override {
        lastNumChannels = buffer.getNumChannels();
        lastNumSamples = buffer.getNumSamples();
        int evCount = 0;
        int noteOns = 0;
        int noteOffs = 0;
        int lastCc74 = -1;
        for (const auto meta : midi) {
            ++evCount;
            if (meta.numBytes >= 3) {
                const auto st = meta.data[0] & 0xF0u;
                if (st == 0x90u && meta.data[2] > 0) ++noteOns;
                else if (st == 0x80u || (st == 0x90u && meta.data[2] == 0)) ++noteOffs;
                else if (meta.data[0] == 0xB0u && meta.data[1] == 74) lastCc74 = meta.data[2];
            }
        }
        lastMidiCount = evCount;
        lastNoteOnCount = noteOns;
        lastNoteOffCount = noteOffs;
        lastCc74Value = lastCc74;
        // Write deterministic non-zero marker on channel 0 & 1 without allocating.
        for (int i = 0; i < buffer.getNumSamples(); ++i) {
            buffer.setSample(0, i, 0.25f);
            buffer.setSample(1, i, 0.25f);
        }
    }
    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

    int lastNumChannels = 0;
    int lastNumSamples = 0;
    int lastMidiCount = 0;
    int lastNoteOnCount = 0;
    int lastNoteOffCount = 0;
    int lastCc74Value = -1;
};

// Deterministic state-race AudioPluginInstance fixture for C7/D13/E4.
// Paired with Instance::setGetStatePublishHookForTest() to deterministically hold getState()/tryGetState()
// after snapshot unlock and before cache publication while setState(B) completes.
class BarrierStateTestPlugin final : public juce::AudioPluginInstance {
public:
    static constexpr std::size_t kPayloadBytes = 64;

    BarrierStateTestPlugin()
        : juce::AudioPluginInstance(BusesProperties().withOutput("Out", juce::AudioChannelSet::stereo(), true)) {}

    const juce::String getName() const override { return "BarrierStateTestPlugin"; }
    void fillInPluginDescription(juce::PluginDescription& d) const override {
        d.name = getName();
        d.pluginFormatName = "Test";
        d.isInstrument = true;
        d.numInputChannels = 0;
        d.numOutputChannels = 2;
    }
    void prepareToPlay(double, int) override {}
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override { buffer.clear(); }
    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock& dest) override {
        const unsigned char tag = stateTag_.load(std::memory_order_acquire);
        const std::size_t sz = (tag == 'A') ? kPayloadBytes : 16u;
        dest.setSize(sz, false);
        std::memset(dest.getData(), tag, sz);
    }
    void setStateInformation(const void* data, int size) override {
        if (data && size > 0) {
            stateTag_.store(static_cast<const unsigned char*>(data)[0], std::memory_order_release);
            setStateCalls_.fetch_add(1, std::memory_order_acq_rel);
        }
    }

    std::atomic<unsigned char> stateTag_{'A'};
    std::atomic<int> setStateCalls_{0};
};

// Sustain-aware AudioPluginInstance fixture for E1 (sustain pedal + overflow reconciliation).
// Models MIDI CC64 sustain pedal (>=64 holds released notes until CC64 < 64) and CC123 All Notes Off
// without allocating in processBlock().
class SustainTestPlugin final : public juce::AudioPluginInstance {
public:
    SustainTestPlugin()
        : juce::AudioPluginInstance(BusesProperties().withOutput("Out", juce::AudioChannelSet::stereo(), true)) {}

    const juce::String getName() const override { return "SustainTestPlugin"; }
    void fillInPluginDescription(juce::PluginDescription& d) const override {
        d.name = getName();
        d.pluginFormatName = "Test";
        d.isInstrument = true;
        d.numInputChannels = 0;
        d.numOutputChannels = 2;
    }
    void prepareToPlay(double, int) override { resetState(); }
    void releaseResources() override {}
    void reset() override { resetState(); }
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override {
        buffer.clear();
        for (const auto meta : midi) {
            if (meta.numBytes < 2) continue;
            const auto st = meta.data[0] & 0xF0u;
            const auto ch = static_cast<std::size_t>(meta.data[0] & 0x0Fu);
            if (st == 0x90u && meta.numBytes >= 3 && meta.data[2] > 0) {
                const auto p = static_cast<std::size_t>(meta.data[1] & 0x7Fu);
                held_[ch][p] = true;
                sounding_[ch][p] = true;
            } else if (st == 0x80u || (st == 0x90u && meta.numBytes >= 3 && meta.data[2] == 0)) {
                const auto p = static_cast<std::size_t>(meta.data[1] & 0x7Fu);
                held_[ch][p] = false;
                if (!sustain_[ch]) {
                    sounding_[ch][p] = false;
                }
            } else if (st == 0xB0u && meta.numBytes >= 3) {
                const auto cc = meta.data[1] & 0x7Fu;
                const auto val = meta.data[2] & 0x7Fu;
                lastCc_[ch][cc] = static_cast<int>(val);
                if (cc == 64) {
                    const bool down = (val >= 64);
                    sustain_[ch] = down;
                    if (!down) {
                        for (std::size_t p = 0; p < 128; ++p) {
                            if (!held_[ch][p]) sounding_[ch][p] = false;
                        }
                    }
                } else if (cc == 120 || cc == 123) {
                    for (std::size_t p = 0; p < 128; ++p) {
                        held_[ch][p] = false;
                        if (cc == 120 || !sustain_[ch]) sounding_[ch][p] = false;
                    }
                } else if (cc == 121) {
                    // MIDI RP-015 Reset All Controllers: modulation->0, expression->127, sustain->0.
                    ++resetAllControllersCount_[ch];
                    sustain_[ch] = false;
                    lastCc_[ch][1] = 0;
                    lastCc_[ch][11] = 127;
                    lastCc_[ch][64] = 0;
                    for (std::size_t p = 0; p < 128; ++p) {
                        if (!held_[ch][p]) sounding_[ch][p] = false;
                    }
                }
            }
        }
        bool anySounding = false;
        for (std::size_t ch = 0; ch < 16 && !anySounding; ++ch) {
            for (std::size_t p = 0; p < 128; ++p) {
                if (sounding_[ch][p]) { anySounding = true; break; }
            }
        }
        if (anySounding) {
            for (int i = 0; i < buffer.getNumSamples(); ++i) {
                buffer.setSample(0, i, 0.25f);
                buffer.setSample(1, i, 0.25f);
            }
        }
    }
    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

    void resetState() noexcept {
        for (auto& c : held_) c.fill(false);
        for (auto& c : sounding_) c.fill(false);
        sustain_.fill(false);
        for (auto& c : lastCc_) {
            c.fill(-1);
            c[1] = 0;
            c[11] = 127;
        }
        resetAllControllersCount_.fill(0);
    }

    std::array<std::array<bool, 128>, 16> held_{};
    std::array<std::array<bool, 128>, 16> sounding_{};
    std::array<bool, 16> sustain_{};
    std::array<std::array<int, 128>, 16> lastCc_{};
    std::array<int, 16> resetAllControllersCount_{};
};
void pumpMessageQueue(int milliseconds) {
#if JUCE_MAC
    const auto end = juce::Time::getMillisecondCounterHiRes() + static_cast<double>(milliseconds);
    while (juce::Time::getMillisecondCounterHiRes() < end) {
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.005, false);
    }
#else
    if (auto* mm = juce::MessageManager::getInstanceWithoutCreating()) {
        juce::Timer::callAfterDelay(milliseconds, [mm] { mm->stopDispatchLoop(); });
        mm->runDispatchLoop();
    }
#endif
}
juce::File testTempFile(const juce::String& extension) {
    const auto directory = juce::SystemStats::getEnvironmentVariable("NT_VST_TEST_TMPDIR", {});
    if (directory.isEmpty()) return juce::File::createTempFile(extension);
    return juce::File(directory).getNonexistentChildFile(juce::Uuid().toString(), extension);
}

// Windows has no POSIX setenv or unsetenv. _putenv_s sets the process
// environment there, and an empty value removes the variable. The test plug-in
// reads it through juce::SystemStats, which sees both.
void setTestEnv(const char* name, const char* value) {
#ifdef _WIN32
    _putenv_s(name, value);
#else
    ::setenv(name, value, 1);
#endif
}

void clearTestEnv(const char* name) {
#ifdef _WIN32
    _putenv_s(name, "");
#else
    ::unsetenv(name);
#endif
}
} // namespace

using namespace vsthost;

// native-rules #14: file-scope mutable failure counter
static int g_fail = 0;
static void check(bool ok, const char* name, const juce::String& detail = {}) {
    std::printf("  [%s] %s%s\n", ok ? "PASS" : "FAIL", name, detail.isEmpty() ? "" : (" -> " + detail).toRawUTF8());
    if (!ok) ++g_fail;
}

static double rms(const juce::AudioBuffer<float>& b, int from, int to) {
    double sum = 0;
    for (int ch = 0; ch < b.getNumChannels(); ++ch)
        for (int i = from; i < to; ++i) sum += (double)b.getSample(ch, i) * b.getSample(ch, i);
    return std::sqrt(sum / std::max(1, (to - from) * b.getNumChannels()));
}

int main(int argc, char** argv) {
    juce::ScopedJuceInitialiser_GUI init;
    if (argc < 2) { std::printf("usage: vst_host_test <plugin.vst3>\n"); return 2; }
    const juce::String path = juce::File::getCurrentWorkingDirectory().getChildFile(argv[1]).getFullPathName();

    std::printf("== NodeToolVstHost: scan ==\n");
    const auto found = scan({ juce::File(path).getParentDirectory().getFullPathName() }, true);
    const PluginInfo* tone = nullptr;
    for (auto& p : found) if (p.path == path) tone = &p;
    check(tone != nullptr, "finds the test instrument in an extra folder", juce::String((int)found.size()) + " found");
    check(tone && tone->isInstrument && tone->name == "NodeTool Test Tone", "reports it as an instrument by name",
          tone ? tone->name : juce::String());

#if JUCE_PLUGINHOST_AU
    const auto au = std::find_if(found.begin(), found.end(), [](const PluginInfo& info) { return info.format == "au"; });
    juce::AudioUnitPluginFormat auFormat;
    const auto registered = auFormat.searchPathsForPlugins({}, true, false);
    if (registered.isEmpty()) {
        std::printf("  AudioUnit registry is empty in this environment; AU loading needs an accessible component registry.\n");
    } else {
        check(au != found.end(), "scans Apple AudioUnit instruments");
    }
    if (au != found.end()) {
        Instance apple;
        juce::String auError;
        check(apple.load(au->path, au->uid, auError), "loads an Apple AudioUnit by identifier", auError);
        check(apple.getParameters()["parameters"].isArray(), "AudioUnit parameter shape matches VST3");
    }
#endif

    std::printf("\n== NodeToolVstHost: render ==\n");
    Instance inst;
    juce::String error;
    check(inst.load(path, tone ? tone->uid : juce::String(), error), "loads the plug-in", error);
    if (!inst.plugin()) return 1;

    check(tone && tone->format == "vst3", "scan reports format");
    const auto presets = inst.listPresets();
    check(presets["presets"].isArray(), "preset list has Electron shape");
    check(!inst.selectPreset(juce::var(), "missing-preset", error), "unknown preset rejected");
    check(!inst.selectPreset(-1, {}, error), "negative preset rejected");
    const auto parameters = inst.getParameters();
    check(parameters["parameters"].isArray(), "parameters have Electron shape");
    if (auto* values = parameters["parameters"].getArray(); values && !values->isEmpty()) {
        auto change = juce::var(std::make_unique<juce::DynamicObject>().release());
        change.getDynamicObject()->setProperty("index", 0);
        change.getDynamicObject()->setProperty("value", 0.7);
        check(inst.setParameters(juce::Array<juce::var>{change}, error), "sets normalized parameter");
        check(std::abs((double)inst.getParameters()["parameters"][0]["value"] - 0.7) < 0.001,
              "reads normalized parameter");
        change.getDynamicObject()->setProperty("value", 2.0);
        check(!inst.setParameters(juce::Array<juce::var>{change}, error), "rejects out of range parameter");
        inst.setState({}, error);
    }

    const double rate = 48000;
    const std::vector<NoteEvent> events = { { 60, 110, 4800, 4800 + 24000 } };
    juce::AudioBuffer<float> a, b;
    check(inst.render(rate, 48000, events, a, error), "renders one second", error);
    check(a.getNumChannels() == 2 && a.getNumSamples() == 48000, "output is stereo at the requested length");
    const double before = rms(a, 0, 4800), during = rms(a, 6000, 24000);
    check(before < 1e-4, "silent before the note", juce::String(before));
    check(during > 1e-3, "sounds while the note is held", juce::String(during));

    check(inst.render(rate, 48000, events, b, error), "renders again", error);
    double diff = 0;
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < 48000; ++i) diff = std::max(diff, (double)std::abs(a.getSample(ch, i) - b.getSample(ch, i)));
    check(rms(b, 0, 4800) < 1e-4, "nothing rings over from the previous render", juce::String(rms(b, 0, 4800)));
    check(rms(b, 6000, 24000) > 1e-3, "the repeat sounds too", juce::String(diff));

    juce::AudioBuffer<float> rated;
    check(inst.render(44100, 44100, { { 60, 110, 0, 22050 } }, rated, error) && rated.getNumSamples() == 44100,
          "re-prepares for another sample rate", error);

    std::printf("\n== NodeToolVstHost: state ==\n");
    const auto state = inst.getState();
    check(state.isNotEmpty(), "reads base64 state", juce::String(state.length()) + " chars");
    juce::MemoryOutputStream decoded;
    check(juce::Base64::convertFromBase64(decoded, state) && decoded.getDataSize() > 0, "state is standard base64");
    check(inst.setState(state, error), "applies its own state", error);
    check(!inst.setState("not base64 !!", error), "rejects malformed state", error);
    error.clear();

    // Empty state restores the sound the plug-in loaded with.
    auto params = inst.plugin()->getParameters();
    check(!params.isEmpty(), "exposes parameters");
    if (!params.isEmpty()) {
        auto* p = params[0];
        p->setValueNotifyingHost(p->getValue() > 0.5f ? 0.0f : 1.0f);
        const auto changed = inst.getState();
        check(changed != state, "a parameter change changes the state");
        if (argc >= 3) {
            check(juce::File(juce::String(argv[2])).replaceWithText(changed), "writes nondefault state fixture");
        }
        juce::AudioBuffer<float> live;
        check(renderWithState(inst, false, {}, rate, 48000, events, live, error) && inst.getState() == changed,
              "render without applying state preserves editor changes", error);
        check(renderWithState(inst, true, {}, rate, 48000, events, live, error) && inst.getState() == state,
              "render with empty state restores the default", error);
        check(inst.setState(changed, error) && inst.getState() == changed, "and the changed state applies again", error);
        check(inst.setState(state, error), "back to the default", error);
    }

    // A fresh instance given the state renders the same sound as the first.
    Instance copy;
    check(copy.load(path, inst.uid(), error) && copy.setState(state, error), "a second instance takes the state", error);
    juce::AudioBuffer<float> c;
    check(copy.render(rate, 48000, events, c, error), "the copy renders", error);
    check(std::abs(rms(c, 6000, 24000) - rms(b, 6000, 24000)) < 0.25 * rms(b, 6000, 24000),
          "and sounds at the same level", juce::String(rms(c, 6000, 24000)));

    std::printf("\n== NodeToolVstHost: latency compensation ==\n");
    constexpr int renderFrames = 1003;
    const std::vector<NoteEvent> held = {{60, 110, 0, renderFrames}};
    juce::AudioBuffer<float> reference;
    check(copy.render(rate, renderFrames, held, reference, error), "renders latency reference", error);
    for (const int latency : {733, 2048}) {
        Instance delayed;
        check(delayed.load(path, inst.uid(), error), "loads delayed instrument", error);
        auto delayedParameters = delayed.plugin()->getParameters();
        check(delayedParameters.size() >= 2, "exposes the test latency parameter");
        if (delayedParameters.size() < 2) continue;
        delayedParameters[1]->setValueNotifyingHost(static_cast<float>(latency) / 2048.0f);
        juce::AudioBuffer<float> compensated;
        check(delayed.render(rate, renderFrames, held, compensated, error), "renders delayed instrument", error);
        check(delayed.plugin()->getLatencySamples() == latency, "instrument reports latency after preparation");
        double maxDifference = 0;
        for (int ch = 0; ch < 2; ++ch)
            for (int i = 0; i < renderFrames; ++i)
                maxDifference = std::max(maxDifference, static_cast<double>(std::abs(
                    reference.getSample(ch, i) - compensated.getSample(ch, i))));
        check(compensated.getNumSamples() == renderFrames && maxDifference < 1e-7,
              "latency compensation preserves alignment and the final partial block", juce::String(maxDifference));
        const std::vector<NoteEvent> lateNote = {{60, 110, renderFrames - 32, renderFrames}};
        check(copy.render(rate, renderFrames, lateNote, reference, error) &&
              delayed.render(rate, renderFrames, lateNote, compensated, error), "renders a note near the end", error);
        maxDifference = 0;
        for (int ch = 0; ch < 2; ++ch)
            for (int i = 0; i < renderFrames; ++i)
                maxDifference = std::max(maxDifference, static_cast<double>(std::abs(
                    reference.getSample(ch, i) - compensated.getSample(ch, i))));
        check(maxDifference < 1e-7 && rms(compensated, renderFrames - 30, renderFrames) > 1e-3,
              "latency drain retains a note at the requested end", juce::String(maxDifference));
        check(copy.render(rate, renderFrames, held, reference, error), "restores the held-note reference", error);
    }

    std::printf("\n== NodeToolVstHost: live MIDI forwarding ==\n");
    {
        // Note-off release velocity, channel nibble, pitch bend, CC, pressure and
        // note expression through processLiveBlock. The tone plug-in logs what it receives.
        const auto log = testTempFile(".midilog");
        log.deleteFile();
        setTestEnv("NT_TONE_MIDI_LOG", log.getFullPathName().toRawUTF8());
        Instance live;
        check(live.load(path, inst.uid(), error), "loads the live instrument", error);
        check(live.prepareLive(rate, 256, error), "prepares live streaming", error);
        const auto event = [](int offset, std::uint8_t status, std::uint8_t d1, std::uint8_t d2) {
            return ShmMidiEvent{ offset, status, d1, d2, 0, kShmNoNoteId, 0.0f };
        };
        ShmMidiEvent expression = event(5, kShmStatusNoteExpression, kShmExprTuning, 0);
        expression.noteId = 7;
        expression.value = 0.75f;
        // 8191 + 8192 = 16383: LSB 127, MSB 127.
        const ShmMidiEvent midi[] = {
            event(0, 0x92, 64, 90),   event(1, 0xB2, 1, 99),  event(2, 0xE2, 127, 127), event(3, 0xD2, 55, 0),
            event(4, 0xA2, 64, 44),   expression,             event(10, 0x82, 64, 33),  event(11, 0x80, 60, 0) };
        std::vector<float> zeros(256, 0.0f), outL(256), outR(256);
        juce::AudioBuffer<float> scratch(4, 512);
        juce::MidiBuffer scratchMidi;
        check(live.processLiveBlock(rate, 256, true, zeros.data(), zeros.data(), outL.data(), outR.data(),
                                    midi, static_cast<int>(std::size(midi)), scratch, scratchMidi),
              "processes a live block with events");
        const auto text = log.loadFileAsString();
        check(text.contains("noteOn ch=3 64 90"), "note-on keeps its channel", text);
        check(text.contains("cc ch=3 1 99"), "control change reaches the plug-in on its channel");
        check(text.contains("bend ch=3 16383"), "pitch bend reaches the plug-in as a 14-bit value");
        check(text.contains("chanPressure ch=3 55"), "channel pressure reaches the plug-in");
        check(text.contains("polyPressure ch=3 64 44"), "poly pressure reaches the plug-in");
        check(text.contains("noteOff ch=3 64 33"), "release velocity value is 33");
        check(text.contains("noteOff ch=1 60 0"), "note-off without release velocity sends 0");
        check(live.droppedNoteExpression() == 1, "note expression is counted as undeliverable through JUCE",
              juce::String(static_cast<juce::int64>(live.droppedNoteExpression())));
        NoteExpressionValue expressionOut;
        check(decodeNoteExpression(expression, expressionOut) && expressionOut.noteId == 7 && expressionOut.typeId == 2 &&
              std::abs(expressionOut.value - 0.75f) < 1e-6f, "decodes a tuning expression to the VST3 type id");
        clearTestEnv("NT_TONE_MIDI_LOG");
        log.deleteFile();
    }

    std::printf("\n== NodeToolVstHost: transport reset ==\n");
    {
        // A discontinuous seek releases sustain and centres pitch bend on every
        // channel, before the chase events of the same block.
        const auto log = testTempFile(".resetlog");
        log.deleteFile();
        setTestEnv("NT_TONE_MIDI_LOG", log.getFullPathName().toRawUTF8());
        Instance live;
        check(live.load(path, inst.uid(), error), "loads the reset instrument", error);
        check(live.prepareLive(rate, 256, error), "prepares reset streaming", error);
        const ShmMidiEvent chase{ 0, 0xB0, 1, 77, 0, kShmNoNoteId, 0.0f };
        std::vector<float> zeros(256, 0.0f), outL(256), outR(256);
        juce::AudioBuffer<float> scratch(4, 512);
        juce::MidiBuffer scratchMidi;
        check(live.processLiveBlock(rate, 256, true, zeros.data(), zeros.data(), outL.data(), outR.data(),
                                    &chase, 1, scratch, scratchMidi), "processes a reset block", error);
        const auto text = log.loadFileAsString();
        const auto chasePos = text.indexOf("cc ch=1 1 77");
        bool allChannels = chasePos > 0;
        for (int ch = 1; ch <= 16 && allChannels; ++ch) {
            const auto tag = " ch=" + juce::String(ch) + " ";
            const auto notesOff = text.indexOf("cc" + tag + "123 0");
            const auto sustain = text.indexOf("cc" + tag + "64 0");
            const auto bend = text.indexOf("bend" + tag + "8192");
            allChannels = notesOff >= 0 && sustain >= 0 && bend >= 0 &&
                          notesOff < chasePos && sustain < chasePos && bend < chasePos;
        }
        check(allChannels, "reset sends all-notes-off, sustain 0 and centred bend on 16 channels before the chase", text);
        clearTestEnv("NT_TONE_MIDI_LOG");
        log.deleteFile();
    }

    std::printf("\n== NodeToolVstHost: live rate is prepared by the control side ==\n");
    {
        Instance live;
        check(live.load(path, inst.uid(), error), "loads the rate instrument", error);
        std::vector<float> zeros(256, 0.0f), outL(256), outR(256);
        juce::AudioBuffer<float> scratch(4, 512);
        juce::MidiBuffer scratchMidi;
        int latency = -1;
        check(!live.processLiveBlock(rate, 256, false, zeros.data(), zeros.data(), outL.data(), outR.data(),
                                     nullptr, 0, scratch, scratchMidi, &latency),
              "an unprepared instance drops the block instead of preparing on the worker");
        check(live.prepareLive(rate, 256, error), "prepares live streaming at the rate", error);
        check(!live.processLiveBlock(rate * 0.91875, 256, false, zeros.data(), zeros.data(), outL.data(), outR.data(),
                                     nullptr, 0, scratch, scratchMidi, &latency),
              "a mismatched rate drops the block instead of preparing on the worker");
        check(live.processLiveBlock(rate, 256, false, zeros.data(), zeros.data(), outL.data(), outR.data(),
                                    nullptr, 0, scratch, scratchMidi, &latency) && latency >= 0,
              "the prepared rate processes and reports latency under the lock");
        check(live.prepareLive(rate * 0.91875, 256, error), "re-prepares at the device rate", error);
        check(live.processLiveBlock(rate * 0.91875, 256, false, zeros.data(), zeros.data(), outL.data(), outR.data(),
                                    nullptr, 0, scratch, scratchMidi, &latency),
              "the new rate processes after the control-side prepare");
    }

    std::printf("\n== NodeToolVstHost: output file ==\n");
    const auto file = testTempFile(".f32");
    check(writePlanarF32(a, file) && file.getSize() == (juce::int64)(2 * 48000 * sizeof(float)), "writes planar float32");
    juce::FileInputStream in(file);
    in.setPosition((juce::int64)(48000 + 10000) * 4);
    check(std::abs(in.readFloat() - a.getSample(1, 10000)) < 1e-9f, "right channel follows every left frame");
    juce::AudioBuffer<float> roundTripped;
    check(readPlanarF32(file, roundTripped, 48000) &&
          std::abs(roundTripped.getSample(1, 10000) - a.getSample(1, 10000)) < 1e-9f, "reads planar float32 back");
    file.deleteFile();

    if (argc >= 4) {
        std::printf("\n== NodeToolVstHost: audio effect ==\n");
        const juce::String fxPath = juce::File::getCurrentWorkingDirectory().getChildFile(argv[3]).getFullPathName();
        const auto fxScan = scan({ juce::File(fxPath).getParentDirectory().getFullPathName() }, false);
        const PluginInfo* gainFx = nullptr;
        for (auto& p : fxScan) if (p.path == fxPath) gainFx = &p;
        check(gainFx != nullptr && !gainFx->isInstrument && gainFx->name == "NodeTool Test Gain",
              "scans audio effect plug-in when includeEffects is enabled", gainFx ? gainFx->name : juce::String());

        Instance fx;
        error.clear();
        check(fx.load(fxPath, gainFx ? gainFx->uid : juce::String(), error) && !fx.isInstrument(),
              "loads audio effect plug-in", error);
        if (fx.plugin()) {
            constexpr int n = 1024;
            juce::AudioBuffer<float> dry(2, n), wet;
            for (int i = 0; i < n; ++i) {
                dry.setSample(0, i, 0.4f);
                dry.setSample(1, i, -0.8f);
            }
            check(fx.process(rate, dry, wet, error), "processes stereo audio", error);
            check(wet.getNumChannels() == 2 && wet.getNumSamples() == n, "effect output matches length");
            check(std::abs(wet.getSample(0, 100) - 0.2f) < 1e-5f && std::abs(wet.getSample(1, 100) + 0.4f) < 1e-5f,
                  "applies default 0.5x stereo gain", juce::String(wet.getSample(0, 100)));

            // State change & processWithState
            auto fxParams = fx.plugin()->getParameters();
            check(fxParams.size() >= 2, "effect exposes gain and latency parameters");
            if (fxParams.size() >= 2) {
                const auto defaultFxState = fx.getState();
                fxParams[0]->setValueNotifyingHost(1.0f); // max = 2.0x gain
                const auto boostedState = fx.getState();
                check(boostedState != defaultFxState, "effect parameter change updates state");
                juce::AudioBuffer<float> boosted;
                check(processWithState(fx, true, boostedState, rate, dry, boosted, error), "processes with saved state", error);
                check(std::abs(boosted.getSample(0, 100) - 0.8f) < 1e-5f, "boosted state applies 2.0x gain",
                      juce::String(boosted.getSample(0, 100)));

                // Latency compensation on effect
                Instance delayedFx;
                check(delayedFx.load(fxPath, fx.uid(), error), "loads delayed effect", error);
                auto delayedParams = delayedFx.plugin()->getParameters();
                delayedParams[1]->setValueNotifyingHost(733.0f / 2048.0f);
                juce::AudioBuffer<float> impulse(2, 1003), delayedWet;
                impulse.clear();
                for (int i = 0; i < 1003; ++i) {
                    impulse.setSample(0, i, static_cast<float>(std::sin(0.05 * i)));
                    impulse.setSample(1, i, static_cast<float>(std::cos(0.05 * i)));
                }
                check(delayedFx.process(rate, impulse, delayedWet, error), "processes with latency", error);
                check(delayedFx.plugin()->getLatencySamples() == 733, "effect reports latency after preparation");
                double maxErr = 0;
                for (int i = 0; i < 1003; ++i) {
                    maxErr = std::max(maxErr, std::abs(delayedWet.getSample(0, i) - 0.5 * impulse.getSample(0, i)));
                    maxErr = std::max(maxErr, std::abs(delayedWet.getSample(1, i) - 0.5 * impulse.getSample(1, i)));
                }
                check(maxErr < 1e-5, "effect latency compensation aligns output", juce::String(maxErr));

                // F6: denormal protection in vst-host live process loop.
                Instance denormFx;
                check(denormFx.load(fxPath, fx.uid(), error) && denormFx.prepareLive(rate, 128, error),
                      "loads and prepares effect for denormal test", error);
                std::vector<float> subIn(128, 1.0e-39f), subOutL(128, 1.0f), subOutR(128, 1.0f);
                juce::AudioBuffer<float> subScratch(4, 128);
                juce::MidiBuffer subMidi;
                check(denormFx.processLiveBlock(rate, 128, false, subIn.data(), subIn.data(),
                                                subOutL.data(), subOutR.data(), nullptr, 0, subScratch, subMidi),
                      "processes subnormal block");
                check(subOutL[0] == 0.0f && subOutR[0] == 0.0f,
                      "denormal inputs are flushed to zero inside vst-host processLiveBlock",
                      juce::String(subOutL[0]));

                // DSP1b: runtime latency change via parameter triggers restartComponent(kLatencyChanged)
                // and updates reported latency during live streaming without re-preparing.
                Instance dynFx;
                check(dynFx.load(fxPath, fx.uid(), error) && dynFx.prepareLive(rate, 128, error),
                      "loads and prepares effect for dynamic latency test", error);
                int liveLat = -1;
                std::vector<float> dynIn(128, 0.25f), dynOutL(128, 0.0f), dynOutR(128, 0.0f);
                juce::AudioBuffer<float> dynScratch(4, 128);
                juce::MidiBuffer dynMidi;
                check(dynFx.processLiveBlock(rate, 128, false, dynIn.data(), dynIn.data(),
                                             dynOutL.data(), dynOutR.data(), nullptr, 0, dynScratch, dynMidi, &liveLat) &&
                      liveLat == 0,
                      "initial live latency is 0", juce::String(liveLat));
                auto dynParams = dynFx.plugin()->getParameters();
                check(dynParams.size() >= 2, "dynamic effect exposes latency parameter");
                if (dynParams.size() >= 2) {
                    int callbackLat = -1;
                    int callbackCount = 0;
                    std::uint64_t lastGen = 0;
                    dynFx.setLatencyChangedCallback([&](int lat, std::uint64_t gen) {
                        callbackLat = lat;
                        lastGen = gen;
                        ++callbackCount;
                    });
                    const auto beforeChanges = dynFx.latencyChangeCount();
                    dynParams[1]->setValueNotifyingHost(512.0f / 2048.0f);
                    // Pump JUCE message queue so VST3 restartComponent(kLatencyChanged) delivers.
                    pumpMessageQueue(50);
                    check(dynFx.latencyChangeCount() > beforeChanges && callbackCount >= 1 && callbackLat == 512 && lastGen > beforeChanges,
                          "restartComponent(kLatencyChanged) invokes Instance latency callback",
                          juce::String(callbackLat));
                    check(dynFx.latencySamples() == 512,
                          "Instance::latencySamples() updated immediately on kLatencyChanged",
                          juce::String(dynFx.latencySamples()));
                    std::uint64_t liveGen = 0;
                    check(dynFx.processLiveBlock(rate, 128, false, dynIn.data(), dynIn.data(),
                                                 dynOutL.data(), dynOutR.data(), nullptr, 0, dynScratch, dynMidi, &liveLat, &liveGen),
                          "processes live block after latency parameter change");
                    check(liveLat == 512 && liveGen >= lastGen,
                          "runtime latency parameter change updates live latency via kLatencyChanged",
                          juce::String(liveLat));
                    int probedLat = -1;
                    std::uint64_t probedGen = 0;
                    check(dynFx.probeLiveLatency(rate, 128, probedLat, error, &probedGen) && probedLat == 512 && probedGen >= liveGen,
                          "probeLiveLatency returns updated latency without resetting",
                          juce::String(probedLat));

                    // D1 + D2: When latency changes and processLiveBlock on a background worker thread
                    // observes the new latency before the JUCE message loop dispatches kLatencyChanged,
                    // the callback MUST still fire (not be dropped) AND MUST run exclusively on the
                    // JUCE message thread (never synchronously on the worker thread).
                    bool callbackRanOnMessageThread = true;
                    callbackCount = 0;
                    callbackLat = -1;
                    const std::uint64_t genBeforeD2 = lastGen;
                    dynFx.setLatencyChangedCallback([&](int lat, std::uint64_t gen) {
                        auto* mm = juce::MessageManager::getInstanceWithoutCreating();
                        if (!mm || !mm->isThisTheMessageThread()) {
                            callbackRanOnMessageThread = false;
                        }
                        callbackLat = lat;
                        lastGen = gen;
                        ++callbackCount;
                    });
                    // Change latency parameter on the message thread (queues kLatencyChanged),
                    // then immediately run processLiveBlock on a worker thread BEFORE pumping the loop.
                    dynParams[1]->setValueNotifyingHost(1024.0f / 2048.0f);
                    std::thread workerThread([&] {
                        int workerLat = -1;
                        std::uint64_t workerGen = 0;
                        dynFx.processLiveBlock(rate, 128, false, dynIn.data(), dynIn.data(),
                                               dynOutL.data(), dynOutR.data(), nullptr, 0,
                                               dynScratch, dynMidi, &workerLat, &workerGen);
                    });
                    workerThread.join();
                    check(callbackCount == 0 && callbackRanOnMessageThread,
                          "D1: latency callback never executes synchronously on listener or audio/worker thread");
                    pumpMessageQueue(60);
                    check(callbackRanOnMessageThread,
                          "D1: coalesced latency callback runs on the JUCE message thread");
                    check(callbackCount >= 1 && callbackLat == 1024 && lastGen > genBeforeD2,
                          "D2: latency callback is not dropped when processLiveBlock observes new latency first",
                          "count=" + juce::String(callbackCount) + " lat=" + juce::String(callbackLat));

                    // C1: audio/listener latency updates must never post OS messages via AsyncUpdater.
                    {
                        const auto sourceDir = juce::File(__FILE__).getParentDirectory().getParentDirectory().getChildFile("source");
                        const auto hostHeader = sourceDir.getChildFile("VstHost.h").loadFileAsString();
                        const auto hostSource = sourceDir.getChildFile("VstHost.cpp").loadFileAsString();
                        check(hostHeader.isNotEmpty() && hostSource.isNotEmpty(), "C1: reads VstHost sources");
                        check(!hostHeader.contains("AsyncUpdater") && !hostSource.contains("triggerAsyncUpdate"),
                              "C1: VstHost uses message-thread timer polling, never AsyncUpdater/triggerAsyncUpdate");

                        // Coalesced multi-step worker-thread latency changes deliver final value on message thread.
                        callbackRanOnMessageThread = true;
                        callbackCount = 0;
                        callbackLat = -1;
                        const std::uint64_t genBeforeBurst = lastGen;
                        for (const int stepLat : {256, 768, 1280}) {
                            dynParams[1]->setValueNotifyingHost(static_cast<float>(stepLat) / 2048.0f);
                            std::thread burstWorker([&] {
                                int workerLat = -1;
                                std::uint64_t workerGen = 0;
                                dynFx.processLiveBlock(rate, 128, false, dynIn.data(), dynIn.data(),
                                                       dynOutL.data(), dynOutR.data(), nullptr, 0,
                                                       dynScratch, dynMidi, &workerLat, &workerGen);
                            });
                            burstWorker.join();
                        }
                        check(callbackCount == 0 && callbackRanOnMessageThread,
                              "C1: worker-thread latency burst never executes callback synchronously");
                        pumpMessageQueue(60);
                        check(callbackRanOnMessageThread && callbackCount >= 1 && callbackLat == 1280 && lastGen > genBeforeBurst,
                              "C1: message-thread timer delivers coalesced final latency",
                              "count=" + juce::String(callbackCount) + " lat=" + juce::String(callbackLat));

                        // Destroying an Instance with an unpumped pending latency update is clean.
                        int destroyedCbCount = 0;
                        {
                            Instance transientFx;
                            check(transientFx.load(fxPath, fx.uid(), error) && transientFx.prepareLive(rate, 128, error),
                                  "C1: loads transient effect for destroy-while-pending test", error);
                            transientFx.setLatencyChangedCallback([&](int, std::uint64_t) { ++destroyedCbCount; });
                            auto tParams = transientFx.plugin()->getParameters();
                            if (tParams.size() >= 2) {
                                tParams[1]->setValueNotifyingHost(512.0f / 2048.0f);
                                std::thread w([&] {
                                    int wl = -1;
                                    transientFx.processLiveBlock(rate, 128, false, dynIn.data(), dynIn.data(),
                                                                 dynOutL.data(), dynOutR.data(), nullptr, 0,
                                                                 dynScratch, dynMidi, &wl);
                                });
                                w.join();
                            }
                        }
                        pumpMessageQueue(40);
                        check(destroyedCbCount == 0, "C1: destroyed Instance never fires pending timer callback");
                        // Restore 1024 for D12.4 bypass check below.
                        dynParams[1]->setValueNotifyingHost(1024.0f / 2048.0f);
                        pumpMessageQueue(60);
                    }

                    // D12.4: VST3 internal bypass parameter drops effective latency to 0 and emits callback.
                    auto* bypassParam = dynFx.plugin()->getBypassParameter();
                    check(bypassParam != nullptr, "D12.4: GainEffect exposes a VST3 bypass parameter");
                    if (bypassParam != nullptr) {
                        callbackCount = 0;
                        callbackLat = -1;
                        bypassParam->setValueNotifyingHost(1.0f);
                        pumpMessageQueue(60);
                        check(dynFx.latencySamples() == 0,
                              "D12.4: bypassed VST3 plugin reports 0 effective latency",
                              juce::String(dynFx.latencySamples()));
                        check(callbackCount >= 1 && callbackLat == 0,
                              "D12.4: bypassing VST3 plugin emits latencyChanged(0)",
                              "count=" + juce::String(callbackCount) + " lat=" + juce::String(callbackLat));

                        callbackCount = 0;
                        callbackLat = -1;
                        bypassParam->setValueNotifyingHost(0.0f);
                        pumpMessageQueue(60);
                        check(dynFx.latencySamples() == 1024,
                              "D12.4: un-bypassing VST3 plugin restores latency",
                              juce::String(dynFx.latencySamples()));
                        check(callbackCount >= 1 && callbackLat == 1024,
                              "D12.4: un-bypassing VST3 plugin emits latencyChanged(1024)",
                              "count=" + juce::String(callbackCount) + " lat=" + juce::String(callbackLat));
                    }
                    dynFx.setLatencyChangedCallback({});
                }
            }
        }
    }

    // VST2 C5: processLiveBlock must reject undersized scratch buffers without allocating.
    {
        Instance c5Inst;
        juce::String c5Err;
        const bool c5Ready = c5Inst.load(path, {}, c5Err) && c5Inst.prepareLive(rate, 128, c5Err);
        check(c5Ready, "VST2 C5: loads and prepares ToneInstrument", c5Err);
        if (c5Ready) {
            juce::AudioBuffer<float> tinyScratch(1, 64);
            const float* ptrBefore = tinyScratch.getReadPointer(0);
            juce::MidiBuffer tinyMidi;
            tinyMidi.ensureSize(1024);
            std::vector<float> outL(128, 0.0f), outR(128, 0.0f);
            const bool accepted = c5Inst.processLiveBlock(rate, 128, false, nullptr, nullptr,
                                                          outL.data(), outR.data(), nullptr, 0,
                                                          tinyScratch, tinyMidi);
            check(!accepted, "VST2 C5: processLiveBlock rejects undersized scratch instead of reallocating");
            check(tinyScratch.getNumChannels() == 1 && tinyScratch.getNumSamples() == 64 &&
                      tinyScratch.getReadPointer(0) == ptrBefore,
                  "VST2 C5: undersized scratch buffer was not reallocated in processLiveBlock",
                  "ch=" + juce::String(tinyScratch.getNumChannels()) +
                      " samples=" + juce::String(tinyScratch.getNumSamples()));
        }
    }

    // VST2 C2 / D6 / D7 / D9 / D14: slow getState AND real (non-short-circuited) setState must
    // not block live processLiveBlock, must not drop MIDI/reset during contention, must fade
    // cleanly even across short (<64 frame) contended blocks, and must handle >=32-ch scratch.
    {
        setTestEnv("NT_TONE_INJECT_STATE_DELAY_MS", "30");
        Instance c2Inst;
        juce::String c2Err;
        const bool c2Ready = c2Inst.load(path, {}, c2Err) && c2Inst.prepareLive(rate, 128, c2Err);
        check(c2Ready, "VST2 C2: loads ToneInstrument with 30 ms state delay", c2Err);
        if (c2Ready) {
            const juce::String defaultState = c2Inst.getState();
            // Create a distinct saved state (program 1 = Bright, level 0.9) so setState cannot short-circuit.
            juce::String presetErr;
            check(c2Inst.selectPreset(1, {}, presetErr), "VST2 D14: selects Bright preset for distinct state", presetErr);
            const juce::String brightState = c2Inst.getState();
            check(brightState.isNotEmpty() && brightState != defaultState,
                  "VST2 D14: distinct state differs from default state");

            std::atomic<bool> startFlag{false};
            std::atomic<bool> noteOnContentionActive{false};
            std::atomic<bool> noteOffContentionActive{false};
            std::atomic<bool> resetContentionActive{false};
            std::atomic<double> maxBlockMs{0.0};
            std::atomic<int> blocksDone{0};
            std::vector<float> recordedL;
            recordedL.reserve(static_cast<size_t>(128) * 160);
            double rmsAfterContendedNoteOn = 0.0;
            double rmsAfterContendedNoteOff = 0.0;
            double rmsAfterContendedReset = 0.0;

            std::thread liveWorker([&] {
                // Use 40 channels (>= 32) to exercise D7 non-allocating large channel scratch too.
                juce::AudioBuffer<float> scratch(40, static_cast<int>(kShmMaxFrames));
                const float* scratchCh0Before = scratch.getReadPointer(0);
                juce::MidiBuffer midi;
                midi.ensureSize(4096);
                std::vector<float> outL(128, 0.0f), outR(128, 0.0f);
                ShmMidiEvent noteOn60{0, 0x90, 60, 110, 0, 1, 0.0f};
                ShmMidiEvent noteOn64{0, 0x90, 64, 110, 0, 2, 0.0f};
                ShmMidiEvent noteOff60{0, 0x80, 60, 0, 0, 1, 0.0f};
                ShmMidiEvent noteOff64{0, 0x80, 64, 0, 0, 2, 0.0f};
                bool sentContendedNoteOn = false;
                bool sentContendedNoteOff = false;
                bool sentContendedReset = false;
                int postNoteOnBlocks = 0;
                int postNoteOffBlocks = 0;
                int postResetBlocks = 0;
                double sumSqOn = 0.0, sumSqOff = 0.0, sumSqReset = 0.0;
                int nOn = 0, nOff = 0, nReset = 0;

                startFlag.store(true, std::memory_order_release);
                for (int blk = 0; blk < 120; ++blk) {
                    const ShmMidiEvent* ev = nullptr;
                    int evCount = 0;
                    bool doReset = (blk == 0);
                    if (blk == 0) {
                        ev = &noteOn60;
                        evCount = 1;
                    } else if (!sentContendedNoteOn && noteOnContentionActive.load(std::memory_order_acquire)) {
                        ev = &noteOn64;
                        evCount = 1;
                        sentContendedNoteOn = true;
                    } else if (blk == 42) {
                        // Silence note 60 so only note 64 (sent during contention) remains!
                        ev = &noteOff60;
                        evCount = 1;
                    } else if (!sentContendedNoteOff && noteOffContentionActive.load(std::memory_order_acquire)) {
                        // Send noteOff for note 64 WHILE setState holds lock!
                        ev = &noteOff64;
                        evCount = 1;
                        sentContendedNoteOff = true;
                    } else if (blk == 82) {
                        // Start note 60 again before testing contended reset.
                        ev = &noteOn60;
                        evCount = 1;
                    } else if (!sentContendedReset && resetContentionActive.load(std::memory_order_acquire)) {
                        doReset = true;
                        sentContendedReset = true;
                    }

                    const auto t0 = std::chrono::steady_clock::now();
                    const bool ok = c2Inst.processLiveBlock(
                        rate, 128, doReset, nullptr, nullptr, outL.data(), outR.data(),
                        ev, evCount, scratch, midi);
                    const double ms = std::chrono::duration<double, std::milli>(
                                          std::chrono::steady_clock::now() - t0)
                                          .count();
                    double prev = maxBlockMs.load(std::memory_order_relaxed);
                    while (ms > prev && !maxBlockMs.compare_exchange_weak(prev, ms)) {}
                    if (ok) {
                        recordedL.insert(recordedL.end(), outL.begin(), outL.end());
                        if (blk >= 45 && blk < 52) {
                            for (float s : outL) { sumSqOn += s * s; ++nOn; }
                            ++postNoteOnBlocks;
                        }
                        if (blk >= 72 && blk < 80) {
                            for (float s : outL) { sumSqOff += s * s; ++nOff; }
                            ++postNoteOffBlocks;
                        }
                        if (blk >= 110 && blk < 118) {
                            for (float s : outL) { sumSqReset += s * s; ++nReset; }
                            ++postResetBlocks;
                        }
                    }
                    blocksDone.fetch_add(1, std::memory_order_release);
                    std::this_thread::sleep_for(std::chrono::microseconds(2500));
                }
                check(scratch.getNumChannels() == 40 && scratch.getNumSamples() == static_cast<int>(kShmMaxFrames) &&
                          scratch.getReadPointer(0) == scratchCh0Before,
                      "VST2 D7: 40-channel scratch buffer kept capacity without reallocation");
                if (nOn > 0) rmsAfterContendedNoteOn = std::sqrt(sumSqOn / nOn);
                if (nOff > 0) rmsAfterContendedNoteOff = std::sqrt(sumSqOff / nOff);
                if (nReset > 0) rmsAfterContendedReset = std::sqrt(sumSqReset / nReset);
                (void)postNoteOnBlocks; (void)postNoteOffBlocks; (void)postResetBlocks;
            });

            while (!startFlag.load(std::memory_order_acquire)) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
            // Phase 1: getState contention while worker sends noteOn64.
            while (blocksDone.load(std::memory_order_acquire) < 6) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
            noteOnContentionActive.store(true, std::memory_order_release);
            const juce::String got = c2Inst.getState();
            noteOnContentionActive.store(false, std::memory_order_release);

            // Phase 2: REAL setState contention (defaultState != brightState) while worker sends noteOff64.
            while (blocksDone.load(std::memory_order_acquire) < 55) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
            noteOffContentionActive.store(true, std::memory_order_release);
            juce::String setErr;
            const auto setT0 = std::chrono::steady_clock::now();
            const bool setOk = c2Inst.setState(defaultState, setErr);
            const double setMs = std::chrono::duration<double, std::milli>(
                                     std::chrono::steady_clock::now() - setT0).count();
            noteOffContentionActive.store(false, std::memory_order_release);

            // Phase 3: REAL setState contention (brightState != defaultState) while worker sends reset.
            while (blocksDone.load(std::memory_order_acquire) < 88) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
            resetContentionActive.store(true, std::memory_order_release);
            const bool setOk2 = c2Inst.setState(brightState, setErr);
            resetContentionActive.store(false, std::memory_order_release);

            liveWorker.join();
            clearTestEnv("NT_TONE_INJECT_STATE_DELAY_MS");

            float maxStepContention1 = 0.0f;
            // Measure maxStep across the Phase 1 getState contention + resume window (before blk 42 noteOff60).
            const size_t phase1End = std::min(recordedL.size(), static_cast<size_t>(40) * 128);
            for (size_t i = 1; i < phase1End; ++i) {
                maxStepContention1 = std::max(maxStepContention1, std::abs(recordedL[i] - recordedL[i - 1]));
            }
            check(got.isNotEmpty() && setOk && setOk2,
                  "VST2 C2/D14: getState and distinct setState succeeded during live rendering", setErr);
            check(setMs >= 20.0,
                  "VST2 D14: setState actually acquired lock and ran setStateInformation (not short-circuited)",
                  "setMs=" + juce::String(setMs, 2));
            check(maxBlockMs.load() < 5.0,
                  "VST2 C2: live processLiveBlock never stalls on 30 ms getState/setState",
                  "maxBlockMs=" + juce::String(maxBlockMs.load(), 3));
            check(maxStepContention1 < 0.05f,
                  "VST2 C2: live pause/resume around state access fades without hard click",
                  "maxStep=" + juce::String(maxStepContention1, 4));
            check(rmsAfterContendedNoteOn > 0.02,
                  "VST2 D6: Note-On sent during lock contention is queued and sounds after resume",
                  "rms=" + juce::String(rmsAfterContendedNoteOn, 5));
            check(rmsAfterContendedNoteOff < 1e-4,
                  "VST2 D6: Note-Off sent during lock contention is queued (no stuck note)",
                  "rms=" + juce::String(rmsAfterContendedNoteOff, 5));
            check(rmsAfterContendedReset < 1e-4,
                  "VST2 D6: reset sent during lock contention is queued and silences held note",
                  "rms=" + juce::String(rmsAfterContendedReset, 5));

            // D13 / C7 / E4: Deterministic checkpoint-controlled getState()/tryGetState() vs setState() race.
            // Hold the getter right after snapshot unlock (Base64 encoded, before appliedState_ publish)
            // until setState(B) completes, then release the getter and verify stale publication cannot
            // poison appliedState_ or suppress restoring A.
            {
                Instance raceInst;
                auto racePlugin = std::make_unique<BarrierStateTestPlugin>();
                auto* rawRace = racePlugin.get();
                check(raceInst.loadPluginForTest(std::move(racePlugin), true),
                      "VST2 C7/D13/E4: loads BarrierStateTestPlugin");

                const juce::String stateA = raceInst.getState();
                std::array<unsigned char, 16> rawB{};
                rawB.fill('B');
                const juce::String stateB = juce::Base64::toBase64(rawB.data(), rawB.size());
                check(stateA.isNotEmpty() && stateB.isNotEmpty() && stateA != stateB,
                      "VST2 C7/D13/E4: distinct states A and B prepared");

                for (const bool useTryGet : {false, true}) {
                    juce::String prepErr;
                    (void)raceInst.setState(stateA, prepErr);
                    std::mutex barrierMu;
                    std::condition_variable barrierCv;
                    bool atPublishBoundary = false;
                    bool setterCompleted = false;

                    raceInst.setGetStatePublishHookForTest([&] {
                        std::unique_lock<std::mutex> lk(barrierMu);
                        atPublishBoundary = true;
                        barrierCv.notify_all();
                        barrierCv.wait(lk, [&] { return setterCompleted; });
                    });

                    juce::String gotA;
                    std::thread getterThread([&] {
                        if (useTryGet) {
                            auto opt = raceInst.tryGetState();
                            gotA = opt.value_or(juce::String());
                        } else {
                            gotA = raceInst.getState();
                        }
                    });

                    bool checkpointReached = false;
                    {
                        std::unique_lock<std::mutex> lk(barrierMu);
                        checkpointReached = barrierCv.wait_for(
                            lk, std::chrono::seconds(2), [&] { return atPublishBoundary; });
                    }
                    check(checkpointReached,
                          useTryGet ? "VST2 E4: tryGetState() reached unlocked publish checkpoint"
                                    : "VST2 E4: getState() reached unlocked publish checkpoint");

                    juce::String setErrB;
                    const bool setOkB = raceInst.setState(stateB, setErrB);
                    {
                        std::lock_guard<std::mutex> lk(barrierMu);
                        setterCompleted = true;
                    }
                    barrierCv.notify_all();
                    getterThread.join();
                    raceInst.setGetStatePublishHookForTest({});

                    check(gotA == stateA && setOkB && rawRace->stateTag_.load(std::memory_order_acquire) == 'B',
                          useTryGet ? "VST2 E4: deterministic tryGetState(A) vs setState(B) succeeded"
                                    : "VST2 E4: deterministic getState(A) vs setState(B) succeeded",
                          setErrB);

                    // Now restore stateA: if stale getState(A)/tryGetState(A) had overwritten appliedState_,
                    // this would falsely short-circuit and leave the plugin on 'B'!
                    const int callsBefore = rawRace->setStateCalls_.load(std::memory_order_acquire);
                    juce::String restoreErr;
                    check(raceInst.setState(stateA, restoreErr),
                          "VST2 C7/D13/E4: setState(A) after deterministic publish race succeeded", restoreErr);
                    const int callsAfter = rawRace->setStateCalls_.load(std::memory_order_acquire);
                    check(callsAfter == callsBefore + 1 && rawRace->stateTag_.load(std::memory_order_acquire) == 'A',
                          useTryGet ? "VST2 E4: stale tryGetState(A) did not poison appliedState_ (no false short-circuit)"
                                    : "VST2 E4: stale getState(A) did not poison appliedState_ (no false short-circuit)",
                          "callsDelta=" + juce::String(callsAfter - callsBefore) +
                              " tag=" + juce::String::charToString(static_cast<juce::juce_wchar>(rawRace->stateTag_.load())));
                }
            }
        } else {
            clearTestEnv("NT_TONE_INJECT_STATE_DELAY_MS");
        }
    }

    // VST2 D9: Short-block (<64 frames) lock contention must crossfade from the actual last emitted sample.
    {
        Instance d9Inst;
        juce::String d9Err;
        const bool d9Ready = d9Inst.load(path, {}, d9Err) && d9Inst.prepareLive(rate, 128, d9Err);
        check(d9Ready, "VST2 D9: loads ToneInstrument for short-block contention fade test", d9Err);
        if (d9Ready) {
            juce::AudioBuffer<float> scratch(4, static_cast<int>(kShmMaxFrames));
            juce::MidiBuffer midi;
            midi.ensureSize(1024);
            std::vector<float> outL(32, 0.0f), outR(32, 0.0f);
            ShmMidiEvent noteOn{0, 0x90, 69, 127, 0, 1, 0.0f};
            std::vector<float> stream;
            // Warm up 6 blocks of 32 frames until the sine wave is near a non-zero peak.
            for (int blkIdx = 0; blkIdx < 6; ++blkIdx) {
                check(d9Inst.processLiveBlock(rate, 32, blkIdx == 0, nullptr, nullptr, outL.data(), outR.data(),
                                              blkIdx == 0 ? &noteOn : nullptr, blkIdx == 0 ? 1 : 0, scratch, midi),
                      "VST2 D9: warmup block");
                stream.insert(stream.end(), outL.begin(), outL.end());
            }
            // Hold lock on another thread for ONE 32-frame block (< kFadeFrames = 64).
            std::atomic<bool> locked{false};
            std::atomic<bool> release{false};
            std::thread holder([&] {
                std::lock_guard<std::recursive_mutex> g(d9Inst.lock);
                locked.store(true, std::memory_order_release);
                while (!release.load(std::memory_order_acquire)) {
                    std::this_thread::sleep_for(std::chrono::microseconds(100));
                }
            });
            while (!locked.load(std::memory_order_acquire)) {
                std::this_thread::sleep_for(std::chrono::microseconds(100));
            }
            check(d9Inst.processLiveBlock(rate, 32, false, nullptr, nullptr, outL.data(), outR.data(),
                                          nullptr, 0, scratch, midi),
                  "VST2 D9: contended 32-frame block");
            stream.insert(stream.end(), outL.begin(), outL.end());
            release.store(true, std::memory_order_release);
            holder.join();

            // Resume with 4 more 32-frame blocks.
            for (int blkIdx = 0; blkIdx < 4; ++blkIdx) {
                check(d9Inst.processLiveBlock(rate, 32, false, nullptr, nullptr, outL.data(), outR.data(),
                                              nullptr, 0, scratch, midi),
                      "VST2 D9: resumed 32-frame block");
                stream.insert(stream.end(), outL.begin(), outL.end());
            }
            float maxResumeStep = 0.0f;
            for (size_t i = 1; i < stream.size(); ++i) {
                maxResumeStep = std::max(maxResumeStep, std::abs(stream[i] - stream[i - 1]));
            }
            check(maxResumeStep < 0.02f,
                  "VST2 D9: short-block (<64 frames) contention resume crossfades from actual last sample",
                  "maxStep=" + juce::String(maxResumeStep, 5));
        }
    }

    // VST2 C5: Contended MIDI overflow (>1024 events during a long state operation) must not
    // silently drop Note-Offs (causing stuck notes) or lose a still-held Note-On.
    {
        Instance c5OverInst;
        juce::String c5OverErr;
        const bool c5OverReady = c5OverInst.load(path, {}, c5OverErr) && c5OverInst.prepareLive(rate, 128, c5OverErr);
        check(c5OverReady, "VST2 C5: loads ToneInstrument for contended MIDI overflow test", c5OverErr);
        if (c5OverReady) {
            juce::AudioBuffer<float> scratch;
            scratch.setSize(4, static_cast<int>(kShmMaxFrames), false, true, false);
            juce::MidiBuffer midi;
            midi.ensureSize(65536);
            std::vector<float> outL(128, 0.0f), outR(128, 0.0f);
            LiveRenderState liveState;

            // Start note 60 BEFORE contention so we verify both pre-contention and in-contention notes release.
            ShmMidiEvent noteOn60{0, 0x90, 60, 110, 0, 1, 0.0f};
            for (int blkIdx = 0; blkIdx < 4; ++blkIdx) {
                check(c5OverInst.processLiveBlock(rate, 128, blkIdx == 0, nullptr, nullptr, outL.data(), outR.data(),
                                                  blkIdx == 0 ? &noteOn60 : nullptr, blkIdx == 0 ? 1 : 0, scratch, midi,
                                                  nullptr, nullptr, &liveState),
                      "VST2 C5: pre-contention noteOn60 block");
            }

            // Hold inst.lock on another thread to force contention while sending >1024 MIDI events.
            std::atomic<bool> locked{false};
            std::atomic<bool> release{false};
            std::thread holder([&] {
                std::lock_guard<std::recursive_mutex> g(c5OverInst.lock);
                locked.store(true, std::memory_order_release);
                while (!release.load(std::memory_order_acquire)) {
                    std::this_thread::sleep_for(std::chrono::microseconds(100));
                }
            });
            while (!locked.load(std::memory_order_acquire)) {
                std::this_thread::sleep_for(std::chrono::microseconds(100));
            }

            // Block 0 of contention: Note-On 64 + 255 CC events.
            std::vector<ShmMidiEvent> burst(256);
            burst[0] = ShmMidiEvent{0, 0x90, 64, 110, 0, 2, 0.0f};
            for (int i = 1; i < 256; ++i) {
                burst[static_cast<size_t>(i)] = ShmMidiEvent{0, 0xB0, 1, static_cast<std::uint8_t>(i & 0x7F), 0, kShmNoNoteId, 0.0f};
            }
            check(c5OverInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                              burst.data(), static_cast<int>(burst.size()), scratch, midi,
                                              nullptr, nullptr, &liveState),
                  "VST2 C5: contended burst 0");
            // 4 more blocks of 256 CC events = 1280 events total (> kMaxPendingMidi = 1024).
            for (int blk = 0; blk < 4; ++blk) {
                for (int i = 0; i < 256; ++i) {
                    burst[static_cast<size_t>(i)] = ShmMidiEvent{0, 0xB0, 1, static_cast<std::uint8_t>((blk + i) & 0x7F), 0, kShmNoNoteId, 0.0f};
                }
                check(c5OverInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                  burst.data(), static_cast<int>(burst.size()), scratch, midi,
                                                  nullptr, nullptr, &liveState),
                      "VST2 C5: contended CC flood block");
            }
            // Final contended block AFTER overflow: release both note 60 (pre-contention) and note 64 (in-contention).
            const std::array<ShmMidiEvent, 2> releases{
                ShmMidiEvent{0, 0x80, 60, 0, 0, 1, 0.0f},
                ShmMidiEvent{0, 0x80, 64, 0, 0, 2, 0.0f},
            };
            check(c5OverInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                              releases.data(), static_cast<int>(releases.size()), scratch, midi,
                                              nullptr, nullptr, &liveState),
                  "VST2 C5: contended post-overflow Note-Off block");

            release.store(true, std::memory_order_release);
            holder.join();

            // Resume and render 8 blocks: both notes must be completely silent (no stuck note!).
            double sumSq = 0.0;
            int nSamples = 0;
            for (int blkIdx = 0; blkIdx < 8; ++blkIdx) {
                check(c5OverInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                  nullptr, 0, scratch, midi, nullptr, nullptr, &liveState),
                      "VST2 C5: post-overflow resume block");
                if (blkIdx >= 2) {
                    for (float s : outL) { sumSq += static_cast<double>(s) * s; ++nSamples; }
                }
            }
            const double postReleaseRms = std::sqrt(sumSq / std::max(1, nSamples));
            check(postReleaseRms < 1e-4,
                  "VST2 C5: post-overflow Note-Offs reconciled without stuck notes",
                  "rms=" + juce::String(postReleaseRms, 5));

            // Second overflow pass (starting from clean silence): flood >1024 CC events then Note-On 67 -> Note 67 must sound!
            (void)c5OverInst.processLiveBlock(rate, 128, true, nullptr, nullptr, outL.data(), outR.data(),
                                              nullptr, 0, scratch, midi, nullptr, nullptr, &liveState);
            locked.store(false, std::memory_order_release);
            release.store(false, std::memory_order_release);
            std::thread holder2([&] {
                std::lock_guard<std::recursive_mutex> g(c5OverInst.lock);
                locked.store(true, std::memory_order_release);
                while (!release.load(std::memory_order_acquire)) {
                    std::this_thread::sleep_for(std::chrono::microseconds(100));
                }
            });
            while (!locked.load(std::memory_order_acquire)) {
                std::this_thread::sleep_for(std::chrono::microseconds(100));
            }
            for (int blk = 0; blk < 5; ++blk) {
                for (int i = 0; i < 256; ++i) {
                    burst[static_cast<size_t>(i)] = ShmMidiEvent{0, 0xB0, 74, static_cast<std::uint8_t>((blk * 17 + i) & 0x7F), 0, kShmNoNoteId, 0.0f};
                }
                (void)c5OverInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                  burst.data(), static_cast<int>(burst.size()), scratch, midi,
                                                  nullptr, nullptr, &liveState);
            }
            ShmMidiEvent noteOn67{0, 0x90, 67, 110, 0, 3, 0.0f};
            (void)c5OverInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                              &noteOn67, 1, scratch, midi, nullptr, nullptr, &liveState);
            release.store(true, std::memory_order_release);
            holder2.join();

            double sumSqHeld = 0.0;
            int nHeld = 0;
            for (int blkIdx = 0; blkIdx < 8; ++blkIdx) {
                (void)c5OverInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                  nullptr, 0, scratch, midi, nullptr, nullptr, &liveState);
                if (blkIdx >= 2) {
                    for (float s : outL) { sumSqHeld += static_cast<double>(s) * s; ++nHeld; }
                }
            }
            const double postHeldRms = std::sqrt(sumSqHeld / std::max(1, nHeld));
            check(postHeldRms > 0.02,
                  "VST2 C5: post-overflow held Note-On sounds after resume",
                  "rms=" + juce::String(postHeldRms, 5));
        }
    }

    // VST2 C4 + C7: Real 36-output-channel (>=32) AudioPluginInstance fixture with allocation
    // instrumentation asserting ZERO heap allocations during:
    //  1) >=32-channel scratch shrink/restore in processLiveBlock()
    //  2) Maximum-size normal MIDI replay (1024 captured + 256 current = 1280 events)
    //  3) Maximum-size overflow reconciled MIDI replay (>1024 contended + 256 current events)
    {
        Instance wideInst;
        auto widePlugin = std::make_unique<WideChannelTestPlugin>();
        auto* rawWide = widePlugin.get();
        juce::String wideErr;
        const bool wideReady = wideInst.loadPluginForTest(std::move(widePlugin), true) &&
                               wideInst.prepareLive(rate, static_cast<int>(kShmMaxFrames), wideErr);
        check(wideReady, "VST2 C4/C7: loads and prepares 36-output-channel fixture", wideErr);
        check(wideInst.preparedChannels() == WideChannelTestPlugin::kOutputChannels,
              "VST2 C7: preparedChannels() reports real >=32 output count (36)",
              "preparedChannels=" + juce::String(wideInst.preparedChannels()));
        if (wideReady) {
#if JUCE_MAC
            const MallocLoggerFn prevMallocLogger = malloc_logger;
            malloc_logger = &testMallocLogger;
            struct RestoreLogger {
                MallocLoggerFn prev;
                ~RestoreLogger() { malloc_logger = prev; }
            } restoreLogger{prevMallocLogger};
#endif
            // Allocate scratch buffers exactly as LiveSession does before starting its RT worker.
            juce::AudioBuffer<float> scratch;
            scratch.setSize(40, static_cast<int>(kShmMaxFrames), false, true, false);
            juce::MidiBuffer midi;
            midi.ensureSize(LiveRenderState::kWorstCaseReplayMidiBytes);
            const float* scratchPtrBefore = scratch.getReadPointer(0);
            const juce::uint8* midiPtrBefore = midi.data.begin();
            std::vector<float> outL(128, 0.0f), outR(128, 0.0f);
            LiveRenderState wideState;

            // 1) Normal >=32-channel block: verify 36 channels active and ZERO allocations.
            {
                ScopedAllocCounter allocs;
                const bool ok = wideInst.processLiveBlock(rate, 128, false, nullptr, nullptr,
                                                          outL.data(), outR.data(), nullptr, 0,
                                                          scratch, midi, nullptr, nullptr, &wideState);
                const std::uint64_t nAllocs = allocs.count();
                check(ok && rawWide->lastNumChannels == 36 && rawWide->lastNumSamples == 128,
                      "VST2 C7: 36-output plugin executed >=32-channel processLiveBlock branch",
                      "ch=" + juce::String(rawWide->lastNumChannels) + " n=" + juce::String(rawWide->lastNumSamples));
                check(nAllocs == 0 && scratch.getNumChannels() == 40 &&
                          scratch.getNumSamples() == static_cast<int>(kShmMaxFrames) &&
                          scratch.getReadPointer(0) == scratchPtrBefore,
                      "VST2 C7: >=32-channel shrink/restore caused zero heap allocations",
                      "allocs=" + juce::String(static_cast<juce::int64>(nAllocs)));
            }

            // 2) C4: Maximum-size normal replay (1024 captured + 256 current = 1280 events) -> ZERO allocations.
            std::vector<ShmMidiEvent> maxBurst(256);
            for (int i = 0; i < 256; ++i) {
                maxBurst[static_cast<size_t>(i)] =
                    ShmMidiEvent{i % 128, 0xB0, static_cast<std::uint8_t>(i & 0x7F),
                                 static_cast<std::uint8_t>((i * 3) & 0x7F), 0, kShmNoNoteId, 0.0f};
            }
            {
                std::atomic<bool> locked{false};
                std::atomic<bool> release{false};
                std::thread holder([&] {
                    std::lock_guard<std::recursive_mutex> g(wideInst.lock);
                    locked.store(true, std::memory_order_release);
                    while (!release.load(std::memory_order_acquire)) {
                        std::this_thread::sleep_for(std::chrono::microseconds(100));
                    }
                });
                while (!locked.load(std::memory_order_acquire)) {
                    std::this_thread::sleep_for(std::chrono::microseconds(100));
                }
                ScopedAllocCounter contendedAllocs;
                for (int k = 0; k < 4; ++k) {
                    (void)wideInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                    maxBurst.data(), static_cast<int>(maxBurst.size()),
                                                    scratch, midi, nullptr, nullptr, &wideState);
                }
                const std::uint64_t nContendedAllocs = contendedAllocs.count();
                release.store(true, std::memory_order_release);
                holder.join();
                check(nContendedAllocs == 0,
                      "VST2 C4: capturing 1024 contended MIDI events caused zero allocations",
                      "allocs=" + juce::String(static_cast<juce::int64>(nContendedAllocs)));

                ScopedAllocCounter replayAllocs;
                const bool ok = wideInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                          maxBurst.data(), static_cast<int>(maxBurst.size()),
                                                          scratch, midi, nullptr, nullptr, &wideState);
                const std::uint64_t nReplayAllocs = replayAllocs.count();
                check(ok && rawWide->lastMidiCount == 1280,
                      "VST2 C4: maximum-size replay delivered all 1024+256=1280 MIDI events",
                      "midiCount=" + juce::String(rawWide->lastMidiCount));
                check(nReplayAllocs == 0 && midi.data.begin() == midiPtrBefore &&
                          scratch.getReadPointer(0) == scratchPtrBefore,
                      "VST2 C4: maximum-size 1280-event MIDI replay caused zero host allocations",
                      "allocs=" + juce::String(static_cast<juce::int64>(nReplayAllocs)));
            }

            // 3) C4 + C5: Worst-case overflow reconciliation (>1024 events across all channels + 256 current) -> ZERO allocations.
            {
                std::atomic<bool> locked{false};
                std::atomic<bool> release{false};
                std::thread holder([&] {
                    std::lock_guard<std::recursive_mutex> g(wideInst.lock);
                    locked.store(true, std::memory_order_release);
                    while (!release.load(std::memory_order_acquire)) {
                        std::this_thread::sleep_for(std::chrono::microseconds(100));
                    }
                });
                while (!locked.load(std::memory_order_acquire)) {
                    std::this_thread::sleep_for(std::chrono::microseconds(100));
                }
                // Populate all 16 channels with notes and non-channel-mode CCs (0..119, avoiding CC 120/123 panic).
                std::vector<ShmMidiEvent> ovEvents;
                ovEvents.reserve(256);
                std::vector<ShmMidiEvent> currentBurst(256);
                for (int i = 0; i < 256; ++i) {
                    const auto ccNum = static_cast<std::uint8_t>((i % 70) + 1);  // CC 1..70 (leaves CC 74 untouched)
                    currentBurst[static_cast<size_t>(i)] =
                        ShmMidiEvent{i % 128, 0xB0u, ccNum, static_cast<std::uint8_t>((i * 3) & 0x7F),
                                     0, kShmNoNoteId, 0.0f};
                }
                ScopedAllocCounter ovCaptureAllocs;
                for (int ch = 0; ch < 16; ++ch) {
                    ovEvents.clear();
                    for (int p = 0; p < 128; ++p) {
                        ovEvents.push_back(ShmMidiEvent{0, static_cast<std::uint8_t>(0x90u | static_cast<unsigned>(ch)),
                                                        static_cast<std::uint8_t>(p), 100, 0, kShmNoNoteId, 0.0f});
                    }
                    for (int cc = 0; cc < 120; ++cc) {
                        ovEvents.push_back(ShmMidiEvent{0, static_cast<std::uint8_t>(0xB0u | static_cast<unsigned>(ch)),
                                                        static_cast<std::uint8_t>(cc), static_cast<std::uint8_t>((cc + ch) & 0x7F),
                                                        0, kShmNoNoteId, 0.0f});
                    }
                    (void)wideInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                    ovEvents.data(), static_cast<int>(ovEvents.size()),
                                                    scratch, midi, nullptr, nullptr, &wideState);
                }
                // Release half of ch 0's notes and set CC 74 = 99 on ch 0 after overflow.
                ovEvents.clear();
                for (int p = 0; p < 64; ++p) {
                    ovEvents.push_back(ShmMidiEvent{0, 0x80u, static_cast<std::uint8_t>(p), 0, 0, kShmNoNoteId, 0.0f});
                }
                ovEvents.push_back(ShmMidiEvent{0, 0xB0u, 74, 99, 0, kShmNoNoteId, 0.0f});
                (void)wideInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                ovEvents.data(), static_cast<int>(ovEvents.size()),
                                                scratch, midi, nullptr, nullptr, &wideState);
                const std::uint64_t nOvCaptureAllocs = ovCaptureAllocs.count();
                release.store(true, std::memory_order_release);
                holder.join();
                check(nOvCaptureAllocs == 0,
                      "VST2 C5: overflow folding of >3900 contended MIDI events caused zero allocations",
                      "allocs=" + juce::String(static_cast<juce::int64>(nOvCaptureAllocs)));

                ScopedAllocCounter ovReplayAllocs;
                const bool ok = wideInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                          currentBurst.data(), static_cast<int>(currentBurst.size()),
                                                          scratch, midi, nullptr, nullptr, &wideState);
                const std::uint64_t nOvReplayAllocs = ovReplayAllocs.count();
                check(ok && rawWide->lastNoteOffCount == 64 && rawWide->lastNoteOnCount == (16 * 128 - 64) &&
                          rawWide->lastCc74Value == 99,
                      "VST2 C5: overflow replay delivered exact reconciled Note-Offs, Note-Ons, and latest CC",
                      "offs=" + juce::String(rawWide->lastNoteOffCount) +
                          " ons=" + juce::String(rawWide->lastNoteOnCount) +
                          " cc74=" + juce::String(rawWide->lastCc74Value));
                check(nOvReplayAllocs == 0 && midi.data.begin() == midiPtrBefore &&
                          scratch.getReadPointer(0) == scratchPtrBefore,
                      "VST2 C4/C5: worst-case overflow + current MIDI replay caused zero host allocations",
                      "allocs=" + juce::String(static_cast<juce::int64>(nOvReplayAllocs)));
            }
        }
    }

    // VST2 E1: Sustain-aware overflow reconciliation.
    // Start with a released note (60) still sounding under sustain (CC64=127) and a held note (62).
    // During contention, exceed 1024 events, release sustain (CC64=0), then depress sustain again (CC64=127),
    // start held note (64), and update CC74=88. On resume, note 60 MUST NOT remain stuck under sustain,
    // held notes 62 and 64 MUST sound, and CC64=127 & CC74=88 MUST be chased without heap allocations.
    {
        Instance susInst;
        auto susPlugin = std::make_unique<SustainTestPlugin>();
        auto* rawSus = susPlugin.get();
        juce::String susErr;
        const bool susReady = susInst.loadPluginForTest(std::move(susPlugin), true) &&
                              susInst.prepareLive(rate, static_cast<int>(kShmMaxFrames), susErr);
        check(susReady, "VST2 E1: loads and prepares SustainTestPlugin", susErr);
        if (susReady) {
            juce::AudioBuffer<float> scratch;
            scratch.setSize(4, static_cast<int>(kShmMaxFrames), false, true, false);
            juce::MidiBuffer midi;
            midi.ensureSize(LiveRenderState::kWorstCaseReplayMidiBytes);
            std::vector<float> outL(128, 0.0f), outR(128, 0.0f);
            LiveRenderState susState;

            // Pre-contention: press sustain (CC64=127), play & release note 60 (sustained only),
            // and hold note 62 (physically held).
            const std::array<ShmMidiEvent, 4> preEvents{
                ShmMidiEvent{0, 0xB0, 64, 127, 0, kShmNoNoteId, 0.0f},
                ShmMidiEvent{0, 0x90, 60, 100, 0, 1, 0.0f},
                ShmMidiEvent{1, 0x80, 60, 0, 0, 1, 0.0f},
                ShmMidiEvent{2, 0x90, 62, 105, 0, 2, 0.0f},
            };
            check(susInst.processLiveBlock(rate, 128, true, nullptr, nullptr, outL.data(), outR.data(),
                                           preEvents.data(), static_cast<int>(preEvents.size()),
                                           scratch, midi, nullptr, nullptr, &susState),
                  "VST2 E1: pre-contention sustained note 60 + held note 62 block");
            check(rawSus->sounding_[0][60] && !rawSus->held_[0][60] && rawSus->sounding_[0][62] && rawSus->held_[0][62],
                  "VST2 E1: pre-contention note 60 is sustained-only and note 62 is held");

            // Hold inst.lock to force contention, overflow >1024 events, release pedal (CC64=0),
            // re-depress pedal (CC64=127), press held note 64, and set CC74=88.
            std::atomic<bool> locked{false};
            std::atomic<bool> release{false};
            std::thread holder([&] {
                std::lock_guard<std::recursive_mutex> g(susInst.lock);
                locked.store(true, std::memory_order_release);
                while (!release.load(std::memory_order_acquire)) {
                    std::this_thread::sleep_for(std::chrono::microseconds(100));
                }
            });
            while (!locked.load(std::memory_order_acquire)) {
                std::this_thread::sleep_for(std::chrono::microseconds(100));
            }
            std::vector<ShmMidiEvent> ccFlood(256);
            for (int blk = 0; blk < 5; ++blk) {
                for (int i = 0; i < 256; ++i) {
                    ccFlood[static_cast<size_t>(i)] =
                        ShmMidiEvent{0, 0xB0, 1, static_cast<std::uint8_t>((blk + i) & 0x7F), 0, kShmNoNoteId, 0.0f};
                }
                (void)susInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                               ccFlood.data(), static_cast<int>(ccFlood.size()),
                                               scratch, midi, nullptr, nullptr, &susState);
            }
            const std::array<ShmMidiEvent, 4> pedalToggleAndHold{
                ShmMidiEvent{0, 0xB0, 64, 0, 0, kShmNoNoteId, 0.0f},
                ShmMidiEvent{0, 0xB0, 64, 127, 0, kShmNoNoteId, 0.0f},
                ShmMidiEvent{0, 0x90, 64, 115, 0, 3, 0.0f},
                ShmMidiEvent{0, 0xB0, 74, 88, 0, kShmNoNoteId, 0.0f},
            };
            (void)susInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                           pedalToggleAndHold.data(), static_cast<int>(pedalToggleAndHold.size()),
                                           scratch, midi, nullptr, nullptr, &susState);
            release.store(true, std::memory_order_release);
            holder.join();

            // Resume rendering and verify sustain transition + held note/controller re-chase (zero allocs).
#if JUCE_MAC
            const MallocLoggerFn prevSusMallocLogger = malloc_logger;
            malloc_logger = &testMallocLogger;
            struct RestoreSusLogger {
                MallocLoggerFn prev;
                ~RestoreSusLogger() { malloc_logger = prev; }
            } restoreSusLogger{prevSusMallocLogger};
#endif
            std::uint64_t nSusAllocs = 0;
            bool susResumed = false;
            {
                ScopedAllocCounter susReplayAllocs;
                susResumed = susInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                      nullptr, 0, scratch, midi, nullptr, nullptr, &susState);
                nSusAllocs = susReplayAllocs.count();
            }
            check(susResumed, "VST2 E1: post-overflow resume block");
            check(nSusAllocs == 0,
                  "VST2 E1: sustain-aware overflow reset + re-chase caused zero heap allocations",
                  "allocs=" + juce::String(static_cast<juce::int64>(nSusAllocs)));
            check(!rawSus->sounding_[0][60],
                  "VST2 E1: previously sustained note 60 released across CC64 0->127 overflow (no stuck voice)");
            check(rawSus->sounding_[0][62] && rawSus->held_[0][62],
                  "VST2 E1: pre-contention held note 62 re-chased after overflow reset");
            check(rawSus->sounding_[0][64] && rawSus->held_[0][64],
                  "VST2 E1: in-contention held note 64 re-chased after overflow reset");
            check(rawSus->sustain_[0] && rawSus->lastCc_[0][64] == 127 && rawSus->lastCc_[0][74] == 88,
                  "VST2 E1: final sustain (CC64=127) and controller (CC74=88) state re-chased",
                  "cc64=" + juce::String(rawSus->lastCc_[0][64]) + " cc74=" + juce::String(rawSus->lastCc_[0][74]));

            // VST2 G2: Reset All Controllers (CC121) during overflow reconciliation must be retained
            // per channel and emitted before chasing subsequent controller values.
            // Start from non-default modulation (CC1=127) and expression (CC11=40) on ch 0,
            // plus CC1=111 on ch 1 (which must NOT be reset).
            const std::array<ShmMidiEvent, 4> preModExpr{
                ShmMidiEvent{0, 0xB0, 1, 127, 0, kShmNoNoteId, 0.0f},
                ShmMidiEvent{0, 0xB0, 11, 40, 0, kShmNoNoteId, 0.0f},
                ShmMidiEvent{0, 0xB0, 74, 20, 0, kShmNoNoteId, 0.0f},
                ShmMidiEvent{0, 0xB1, 1, 111, 0, kShmNoNoteId, 0.0f},
            };
            check(susInst.processLiveBlock(rate, 128, true, nullptr, nullptr, outL.data(), outR.data(),
                                           preModExpr.data(), static_cast<int>(preModExpr.size()),
                                           scratch, midi, nullptr, nullptr, &susState),
                  "VST2 G2: pre-contention non-default modulation/expression block");
            check(rawSus->lastCc_[0][1] == 127 && rawSus->lastCc_[0][11] == 40 && rawSus->lastCc_[1][1] == 111,
                  "VST2 G2: pre-contention CC1=127, CC11=40 on ch 0 and CC1=111 on ch 1 applied");

            locked.store(false, std::memory_order_release);
            release.store(false, std::memory_order_release);
            std::thread holderG2([&] {
                std::lock_guard<std::recursive_mutex> g(susInst.lock);
                locked.store(true, std::memory_order_release);
                while (!release.load(std::memory_order_acquire)) {
                    std::this_thread::sleep_for(std::chrono::microseconds(100));
                }
            });
            while (!locked.load(std::memory_order_acquire)) {
                std::this_thread::sleep_for(std::chrono::microseconds(100));
            }
            // Send CC121=0 on ch 0, overflow with >1024 unrelated events on ch 2, then send CC74=88 on ch 0.
            const ShmMidiEvent resetAllCh0{0, 0xB0, 121, 0, 0, kShmNoNoteId, 0.0f};
            (void)susInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                           &resetAllCh0, 1, scratch, midi, nullptr, nullptr, &susState);
            for (int blk = 0; blk < 5; ++blk) {
                for (int i = 0; i < 256; ++i) {
                    ccFlood[static_cast<size_t>(i)] =
                        ShmMidiEvent{0, 0xB2, 20, static_cast<std::uint8_t>((blk + i) & 0x7F), 0, kShmNoNoteId, 0.0f};
                }
                (void)susInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                               ccFlood.data(), static_cast<int>(ccFlood.size()),
                                               scratch, midi, nullptr, nullptr, &susState);
            }
            const ShmMidiEvent postResetCc74{0, 0xB0, 74, 88, 0, kShmNoNoteId, 0.0f};
            (void)susInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                           &postResetCc74, 1, scratch, midi, nullptr, nullptr, &susState);
            release.store(true, std::memory_order_release);
            holderG2.join();

            std::uint64_t nG2Allocs = 0;
            bool g2Resumed = false;
            {
                ScopedAllocCounter g2ReplayAllocs;
                g2Resumed = susInst.processLiveBlock(rate, 128, false, nullptr, nullptr, outL.data(), outR.data(),
                                                     nullptr, 0, scratch, midi, nullptr, nullptr, &susState);
                nG2Allocs = g2ReplayAllocs.count();
            }
            check(g2Resumed, "VST2 G2: post-overflow resume block after CC121");
            check(nG2Allocs == 0,
                  "VST2 G2: CC121 overflow reconciliation caused zero heap allocations",
                  "allocs=" + juce::String(static_cast<juce::int64>(nG2Allocs)));
            check(rawSus->resetAllControllersCount_[0] == 1 && rawSus->resetAllControllersCount_[1] == 0,
                  "VST2 G2: CC121 emitted on ch 0 only during overflow reconciliation",
                  "ch0=" + juce::String(rawSus->resetAllControllersCount_[0]) +
                      " ch1=" + juce::String(rawSus->resetAllControllersCount_[1]));
            check(rawSus->lastCc_[0][1] == 0 && rawSus->lastCc_[0][11] == 127,
                  "VST2 G2: modulation (CC1) and expression (CC11) reset to defaults (not retained)",
                  "cc1=" + juce::String(rawSus->lastCc_[0][1]) + " cc11=" + juce::String(rawSus->lastCc_[0][11]));
            check(rawSus->lastCc_[0][74] == 88 && rawSus->lastCc_[1][1] == 111,
                  "VST2 G2: subsequent CC74=88 chased after CC121 and ch 1 CC1=111 preserved",
                  "ch0_cc74=" + juce::String(rawSus->lastCc_[0][74]) + " ch1_cc1=" + juce::String(rawSus->lastCc_[1][1]));
        }
    }

    std::printf("\n%s (%d failed)\n", g_fail ? "FAILED" : "ALL PASSED", g_fail);
    return g_fail ? 1 : 0;
}
