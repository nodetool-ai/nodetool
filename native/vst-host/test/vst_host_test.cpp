// NodeToolVstHost core against a real VST3: the test instrument this build produces.
//   vst_host_test <path to NodeTool Test Tone.vst3>
#include <juce_audio_processors/juce_audio_processors.h>
#include <cmath>
#include <cstdio>
#include "../source/VstHost.h"

using namespace vsthost;

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

    std::printf("\n== NodeToolVstHost: render ==\n");
    Instance inst;
    juce::String error;
    check(inst.load(path, tone ? tone->uid : juce::String(), error), "loads the plug-in", error);
    if (!inst.plugin()) return 1;

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
        check(inst.setState({}, error) && inst.getState() == state, "empty state restores the default", error);
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

    std::printf("\n== NodeToolVstHost: output file ==\n");
    const auto file = juce::File::createTempFile(".f32");
    check(writePlanarF32(a, file) && file.getSize() == (juce::int64)(2 * 48000 * sizeof(float)), "writes planar float32");
    juce::FileInputStream in(file);
    in.setPosition((juce::int64)(48000 + 10000) * 4);
    check(std::abs(in.readFloat() - a.getSample(1, 10000)) < 1e-9f, "right channel follows every left frame");
    file.deleteFile();

    std::printf("\n%s (%d failed)\n", g_fail ? "FAILED" : "ALL PASSED", g_fail);
    return g_fail ? 1 : 0;
}
