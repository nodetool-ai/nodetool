#include "scenedetect/SceneDetect.h"

#include <QTest>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <utility>
#include <vector>

using namespace nt::shots;

namespace {
std::vector<std::uint8_t> frame(std::uint32_t shot, std::uint32_t t, int w, int h) {
    std::vector<std::uint8_t> v(w * h * 4);
    std::uint32_t seed = shot * 2654435761U ^ t * 40503U;
    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            seed = seed * 1103515245U + 12345U;
            const int noise = static_cast<int>((seed >> 16) % 9) - 4;
            const float xx = static_cast<float>(static_cast<std::uint32_t>(x) + 2U * t);
            float r, g, b;
            switch (shot % 4) {
            case 0: r = 40.0F + 150.0F * std::abs(std::sin(xx * 0.05F)); g = 90.0F; b = 160.0F; break;
            case 1: r = 200.0F; g = 180.0F - static_cast<float>(y) * 0.5F;
                b = 40.0F + std::abs(std::cos(xx * 0.1F)) * 60.0F; break;
            case 2: r = (static_cast<std::size_t>(xx) / 8 + y / 8) % 2 == 0 ? 230.0F : 20.0F;
                g = 120.0F; b = 60.0F; break;
            default: r = 30.0F; g = 30.0F + std::min(static_cast<float>(y) * 1.5F, 200.0F);
                b = 30.0F + std::abs(std::sin(xx * 0.03F)) * 200.0F; break;
            }
            const int i = (y * w + x) * 4;
            v[i] = static_cast<std::uint8_t>(std::clamp(static_cast<int>(r) + noise, 0, 255));
            v[i + 1] = static_cast<std::uint8_t>(std::clamp(static_cast<int>(g) + noise, 0, 255));
            v[i + 2] = static_cast<std::uint8_t>(std::clamp(static_cast<int>(b) + noise, 0, 255));
            v[i + 3] = 255;
        }
    }
    return v;
}
std::vector<int> run(std::initializer_list<std::pair<std::uint32_t, int>> shots, SceneOptions opt = {}) {
    std::vector<float> diffs;
    Signature prev;
    std::uint32_t t = 0;
    for (const auto& [shot, len] : shots) {
        for (int i = 0; i < len; ++i) {
            const auto pixels = frame(shot, t, 96, 54);
            const auto sig = signature(std::span<const std::uint8_t>(pixels), 96, 54);
            diffs.push_back(t == 0 ? 0.0F : difference(prev, sig));
            prev = sig;
            ++t;
        }
    }
    return detectCuts(diffs, opt);
}
}

class TestSceneDetect : public QObject {
    Q_OBJECT
private slots:
    void findsHardCutsAndIgnoresMotion() {
        QCOMPARE(run({{0, 20}, {1, 15}, {2, 25}, {3, 12}, {0, 10}}), (std::vector<int>{20, 35, 60, 72}));
        for (const float s : {0.0F, 50.0F, 100.0F}) {
            QVERIFY(run({{2, 60}}, {.sensitivity = s}).empty());
        }
    }
    void minShotLengthMergesFlashes() {
        QCOMPARE(run({{0, 20}, {1, 2}, {0, 20}}), (std::vector<int>{20}));
        QCOMPARE(run({{0, 20}, {1, 2}, {0, 20}}, {.minShotFrames = 1}), (std::vector<int>{20, 22}));
    }
    void sensitivityControlsSubtleCuts() {
        auto pixels = frame(0, 0, 64, 36);
        const auto a = signature(std::span<const std::uint8_t>(pixels), 64, 36);
        for (std::size_t i = 0; i < pixels.size(); i += 4) {
            for (int c = 0; c < 3; ++c) {
                pixels[i + c] = static_cast<std::uint8_t>(std::clamp(static_cast<int>(pixels[i + c]) + 12, 0, 255));
            }
        }
        const auto b = signature(std::span<const std::uint8_t>(pixels), 64, 36);
        std::vector<float> diffs(30, 0.0F);
        diffs[15] = difference(a, b);
        QVERIFY(diffs[15] > 0.1F && diffs[15] < 0.4F);
        QVERIFY(detectCuts(diffs, {.sensitivity = 0.0F}).empty());
        QCOMPARE(detectCuts(diffs, {.sensitivity = 100.0F}), (std::vector<int>{15}));
        QVERIFY(SceneOptions{100.0F}.threshold() < SceneOptions{}.threshold());
    }
    void degenerateInputs() {
        QVERIFY(detectCuts({}, {}).empty());
        const std::vector<float> one{0.0F};
        QVERIFY(detectCuts(one, {}).empty());
        const auto s = signature(std::span<const std::uint8_t>{}, 0, 0);
        QCOMPARE(s, Signature{});
        QCOMPARE(difference(s, s), 0.0F);
        const std::vector<float> two{0.0F, 0.8F};
        QCOMPARE(detectCuts(two, {.minShotFrames = 1}), (std::vector<int>{1}));
    }
    void paddedRows() {
        const auto packed = frame(3, 2, 96, 54);
        constexpr int stride = 96 * 4 + 28;
        std::vector<std::uint8_t> padded(stride * 54, 211);
        for (int y = 0; y < 54; ++y) {
            std::copy_n(packed.data() + y * 96 * 4, 96 * 4, padded.data() + y * stride);
        }
        QCOMPARE(signature(std::span<const std::uint8_t>(packed), 96, 54),
                 signature(std::span<const std::uint8_t>(padded), 96, 54, stride));
        QCOMPARE(signature(packed.data(), 96, 54), signature(std::span<const std::uint8_t>(packed), 96, 54));
    }
    void undersizedBuffer() {
        const auto pixels = frame(0, 0, 96, 54);
        QCOMPARE(signature(std::span<const std::uint8_t>(pixels.data(), pixels.size() - 1), 96, 54), Signature{});
        QCOMPARE(signature(std::span<const std::uint8_t>(pixels), 96, 54, 95 * 4), Signature{});
        QCOMPARE(signature(nullptr, 96, 54), Signature{});
    }
    void symmetricDifference() {
        const auto pixelsA = frame(0, 0, 96, 54);
        const auto pixelsB = frame(1, 0, 96, 54);
        const auto a = signature(std::span<const std::uint8_t>(pixelsA), 96, 54);
        const auto b = signature(std::span<const std::uint8_t>(pixelsB), 96, 54);
        QCOMPARE(difference(a, a), 0.0F);
        QCOMPARE(difference(a, b), difference(b, a));
        QVERIFY(difference(a, b) > 0.0F);
    }
};
QTEST_GUILESS_MAIN(TestSceneDetect)
#include "tst_scenedetect.moc"
