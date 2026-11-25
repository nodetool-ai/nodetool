// NodeToolVstHost core against a real VST3: the test instrument this build produces.
//   vst_host_test <path to NodeTool Test Tone.vst3>
#include <juce_audio_processors/juce_audio_processors.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <thread>
#if JUCE_MAC
#include <CoreFoundation/CoreFoundation.h>
#endif
#include "../source/VstHost.h"

namespace {
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

    std::printf("\n%s (%d failed)\n", g_fail ? "FAILED" : "ALL PASSED", g_fail);
    return g_fail ? 1 : 0;
}
