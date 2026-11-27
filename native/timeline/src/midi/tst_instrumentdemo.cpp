// Renders a short phrase for every factory preset of the built-in instruments
// to 24-bit WAV files in $NT_DEMO_DIR, so a person can judge the sound.
// Without NT_DEMO_DIR the test only checks that each render is finite and non-silent.
#include "BassSynth.h"
#include "BassSynthPresets.h"
#include "DrumSampler.h"
#include "WavetablePresets.h"
#include "WavetableSynth.h"
#include "modal/ModalPresets.h"
#include "modal/ModalSynth.h"

#include <QDir>
#include <QFile>
#include <QtTest/QtTest>

#include <algorithm>
#include <cmath>
#include <limits>
#include <span>
#include <vector>

using namespace nt::midi;

namespace {

constexpr double kRate = 48000.0;
constexpr int kBlock = 64;

struct Note { double startSec; double lenSec; int midi; float vel; };

void writeWav(const QString& path, const std::vector<float>& stereo) {
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly)) { return; }
    const quint32 frames = static_cast<quint32>(stereo.size() / 2);
    const quint32 dataBytes = frames * 2 * 3;
    auto u32 = [&](quint32 v) { char b[4] = {char(v), char(v >> 8), char(v >> 16), char(v >> 24)}; f.write(b, 4); };
    auto u16 = [&](quint16 v) { char b[2] = {char(v), char(v >> 8)}; f.write(b, 2); };
    f.write("RIFF", 4); u32(36 + dataBytes); f.write("WAVEfmt ", 8); u32(16); u16(1); u16(2);
    u32(quint32(kRate)); u32(quint32(kRate) * 6); u16(6); u16(24); f.write("data", 4); u32(dataBytes);
    QByteArray pcm(int(dataBytes), 0);
    for (std::size_t i = 0; i < stereo.size(); ++i) {
        const float s = std::isfinite(stereo[i]) ? std::clamp(stereo[i], -1.0f, 1.0f) : 0.0f;
        const auto v = static_cast<qint32>(std::lround(double(s) * 8388607.0));
        pcm[int(i * 3)] = char(v); pcm[int(i * 3 + 1)] = char(v >> 8); pcm[int(i * 3 + 2)] = char(v >> 16);
    }
    f.write(pcm);
}

struct PlayResult {
    std::vector<float> audio;
    float rawPeak = 0.0f;
};

// Plays `notes` through `on`/`off`/`render` callbacks at block resolution, then
// normalizes the peak to -1 dBFS only when it clips, so presets keep relative levels.
template <class On, class Off, class Render>
PlayResult play(const std::vector<Note>& notes, double totalSec, On on, Off off, Render render) {
    const int total = int(totalSec * kRate);
    std::vector<float> out(std::size_t(total) * 2, 0.0f);
    for (int pos = 0; pos < total; pos += kBlock) {
        const double t0 = pos / kRate, t1 = (pos + kBlock) / kRate;
        for (const auto& n : notes) {
            if (n.startSec + n.lenSec >= t0 && n.startSec + n.lenSec < t1) { off(n.midi); }
        }
        for (const auto& n : notes) {
            if (n.startSec >= t0 && n.startSec < t1) { on(n.midi, n.vel); }
        }
        const int frames = std::min(kBlock, total - pos);
        render(std::span<float>(out.data() + std::size_t(pos) * 2, std::size_t(frames) * 2));
    }
    float peak = 0.0f;
    for (float s : out) { peak = std::max(peak, std::isfinite(s) ? std::abs(s) : 0.0f); }
    qInfo("raw peak %.2f", double(peak));
    if (peak > 0.891f) { for (float& s : out) { s *= 0.891f / peak; } }
    return {std::move(out), peak};
}

std::vector<Note> bassLine() {
    const int pat[] = {36, 36, 48, 36, 39, 36, 43, 41, 36, 36, 48, 46, 43, 39, 41, 34};
    std::vector<Note> n;
    for (int i = 0; i < 16; ++i) { n.push_back({i * 0.125, (i % 4 == 3) ? 0.2 : 0.09, pat[i], (i % 4 == 0) ? 1.0f : 0.7f}); }
    n.push_back({2.0, 1.0, 36, 0.9f});
    return n;
}

std::vector<Note> melody() {
    const int pat[] = {60, 63, 67, 70, 72, 70, 67, 63};
    std::vector<Note> n;
    for (int i = 0; i < 8; ++i) { n.push_back({i * 0.25, 0.22, pat[i], 0.8f}); }
    for (int m : {48, 55, 60, 63, 67}) { n.push_back({2.0, 1.6, m, 0.75f}); }
    return n;
}

std::vector<Note> drumGroove() {
    std::vector<Note> n;
    for (int bar = 0; bar < 2; ++bar) {
        const double b = bar * 2.0;
        for (int i = 0; i < 16; ++i) { n.push_back({b + i * 0.125, 0.05, (i % 4 == 2) ? 46 : 42, (i % 2) ? 0.55f : 0.8f}); }
        for (double k : {0.0, 0.75, 1.0, 1.375}) { n.push_back({b + k, 0.1, 36, 1.0f}); }
        for (double s : {0.5, 1.5}) { n.push_back({b + s, 0.1, 38, 0.9f}); }
    }
    n.push_back({0.0, 0.1, 49, 0.8f});
    return n;
}

QString outDir() { return qEnvironmentVariable("NT_DEMO_DIR"); }

void finish(const QString& name, const std::vector<float>& audio) {
    float peak = 0.0f;
    for (float s : audio) { QVERIFY(std::isfinite(s)); peak = std::max(peak, std::abs(s)); }
    QVERIFY2(peak > 1e-4f, qPrintable(name + " is silent"));
    if (const QString dir = outDir(); !dir.isEmpty()) {
        QDir().mkpath(dir);
        writeWav(dir + QLatin1Char('/') + name + QStringLiteral(".wav"), audio);
    }
}

} // namespace

class TstInstrumentDemo : public QObject {
    Q_OBJECT
private slots:
    void bass() {
        float minPeak = std::numeric_limits<float>::max();
        float maxPeak = 0.0f;
        for (const auto& p : factoryBassPresets()) {
            BassSynth s; s.prepare(kRate); s.setParams(p.params); s.snapParams();
            auto [a, peak] = play(bassLine(), 3.5, [&](int m, float v) { s.noteOn(m, v); }, [&](int m) { s.noteOff(m); },
                                  [&](std::span<float> b) { s.renderBlock(b); });
            const QString name = QStringLiteral("bass1_") + QString::fromUtf8(p.id.data(), qsizetype(p.id.size()));
            QVERIFY2(peak <= 1.0f, qPrintable(QStringLiteral("%1 raw peak %2 > 1.0").arg(name).arg(peak, 0, 'f', 3)));
            minPeak = std::min(minPeak, peak);
            maxPeak = std::max(maxPeak, peak);
            finish(name, a);
        }
        QVERIFY(minPeak > 0.0f);
        QVERIFY2(maxPeak / minPeak <= 2.0f,
                 qPrintable(QStringLiteral("bass peak spread %1 / %2 = %3 > 2.0").arg(maxPeak, 0, 'f', 3).arg(minPeak, 0, 'f', 3).arg(maxPeak / minPeak, 0, 'f', 3)));
    }
    void wavetable() {
        float minPeak = std::numeric_limits<float>::max();
        float maxPeak = 0.0f;
        for (const auto& p : factoryWavetablePresets()) {
            WavetableSynth s; s.prepare(kRate); s.setParams(p.params);
            auto [a, peak] = play(melody(), 4.5, [&](int m, float v) { s.noteOn(m, v); }, [&](int m) { s.noteOff(m); },
                                  [&](std::span<float> b) { s.renderBlock(b); });
            const QString name = QStringLiteral("wt1_") + QString::fromUtf8(p.id.data(), qsizetype(p.id.size()));
            QVERIFY2(peak <= 1.0f, qPrintable(QStringLiteral("%1 raw peak %2 > 1.0").arg(name).arg(peak, 0, 'f', 3)));
            minPeak = std::min(minPeak, peak);
            maxPeak = std::max(maxPeak, peak);
            finish(name, a);
        }
        QVERIFY(minPeak > 0.0f);
        QVERIFY2(maxPeak / minPeak <= 2.0f,
                 qPrintable(QStringLiteral("wavetable peak spread %1 / %2 = %3 > 2.0").arg(maxPeak, 0, 'f', 3).arg(minPeak, 0, 'f', 3).arg(maxPeak / minPeak, 0, 'f', 3)));
    }
    void modal() {
        float minPeak = std::numeric_limits<float>::max();
        float maxPeak = 0.0f;
        for (const auto& p : factoryModalPresets()) {
            ModalSynth s; s.prepare(kRate); s.setParams(p.params);
            auto [a, peak] = play(melody(), 5.0, [&](int m, float v) { s.noteOn(m, v); }, [&](int m) { s.noteOff(m); },
                                  [&](std::span<float> b) { s.renderBlock(b); });
            const QString name = QStringLiteral("mod1_") + QString::fromUtf8(p.id.data(), qsizetype(p.id.size()));
            QVERIFY2(peak <= 1.0f, qPrintable(QStringLiteral("%1 raw peak %2 > 1.0").arg(name).arg(peak, 0, 'f', 3)));
            minPeak = std::min(minPeak, peak);
            maxPeak = std::max(maxPeak, peak);
            finish(name, a);
        }
        QVERIFY(minPeak > 0.0f);
        QVERIFY2(maxPeak / minPeak <= 2.0f,
                 qPrintable(QStringLiteral("modal peak spread %1 / %2 = %3 > 2.0").arg(maxPeak, 0, 'f', 3).arg(minPeak, 0, 'f', 3).arg(maxPeak / minPeak, 0, 'f', 3)));
    }
    void drums() {
        float minPeak = std::numeric_limits<float>::max();
        float maxPeak = 0.0f;
        for (auto [kit, name] : {std::pair{DrumKitId::Classic808, "808"}, std::pair{DrumKitId::Uzu, "uzu"}}) {
            DrumSampler s; s.loadKit(kit); s.prepare(kRate);
            std::vector<DrumSampler::NoteEvent> pending;
            auto [a, peak] = play(drumGroove(), 4.5, [&](int m, float v) { pending.push_back({0, m, v, 1.0f}); }, [](int) {},
                                  [&](std::span<float> b) { s.renderBlock(b, pending); pending.clear(); });
            const QString fullName = QStringLiteral("drum1_") + QLatin1String(name);
            QVERIFY2(peak <= 1.0f, qPrintable(QStringLiteral("%1 raw peak %2 > 1.0").arg(fullName).arg(peak, 0, 'f', 3)));
            minPeak = std::min(minPeak, peak);
            maxPeak = std::max(maxPeak, peak);
            finish(fullName, a);
        }
        QVERIFY(minPeak > 0.0f);
        QVERIFY2(maxPeak / minPeak <= 2.0f,
                 qPrintable(QStringLiteral("drums peak spread %1 / %2 = %3 > 2.0").arg(maxPeak, 0, 'f', 3).arg(minPeak, 0, 'f', 3).arg(maxPeak / minPeak, 0, 'f', 3)));
    }
};

QTEST_GUILESS_MAIN(TstInstrumentDemo)
#include "tst_instrumentdemo.moc"
