#include "motion/wipe/Wipe.h"
#include <QtTest>
class TestWipe : public QObject {
    Q_OBJECT
  private slots:
    void noMask() {
        const auto uniform = nt::motion::wipeUniforms({}, {100, 80});
        QCOMPARE(uniform.mask[0], 0.f);
        QCOMPARE(uniform.coordinates, (std::array<float, 4>{1, 1, 0, 0}));
    }
    void sourceSpaceAfterCropAndOutset() {
        const auto uniform = nt::motion::wipeUniforms(nt::scene::WipeMask{"left", 0.12, 0.3}, {100, 80}, {10, 20, 30, 40});
        QCOMPARE(uniform.mask, (std::array<float, 4>{1, 0.3f, 0.12f, 0}));
        QCOMPARE(uniform.coordinates, (std::array<float, 4>{1.4f, 1.75f, -0.1f, -0.25f}));
    }
    void directions() {
        for (const auto& row : std::array<std::pair<std::string, float>, 4>{{{"left", 1}, {"right", 2}, {"up", 3}, {"down", 4}}}) {
            QCOMPARE(nt::motion::wipeUniforms(nt::scene::WipeMask{row.first, 0, 0.5}, {100, 80}).mask[0], row.second);
        }
    }
};
QTEST_GUILESS_MAIN(TestWipe)
#include "tst_wipe.moc"
