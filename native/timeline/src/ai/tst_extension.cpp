#include "ai/Extension.h"
#include <QtTest>

class ExtensionTest : public QObject {
    Q_OBJECT
private:
    QJsonObject clip() const {
        return {{"id", "c"}, {"trackId", "t"}, {"mediaType", "video"}, {"currentAssetId", "a"}, {"startMs", 4000},
                {"durationMs", 4000}, {"versions", QJsonArray{QJsonObject{{"id", "take"}, {"status", "success"},
                {"source", "extended"}, {"assetId", "b"}, {"durationMs", 6000}}}}};
    }
    QJsonObject source() const {
        return {{"clipId", "c"}, {"trackId", "t"}, {"sourceAssetId", "a"}, {"sourceStartMs", 0},
                {"sourceEndMs", 4000}, {"timelineStartMs", 4000}, {"timelineDurationMs", 4000}, {"rate", 1}};
    }
private slots:
    void timings() {
        const QJsonObject next{{"id", "n"}, {"trackId", "t"}, {"startMs", 8000}, {"durationMs", 1000}};
        QJsonArray clips{clip(), next};
        auto keep = nt::ai::applyExtension(clips, source(), "take", "start", 2000, "keep-cut");
        QVERIFY(keep.ok());
        QCOMPARE(keep.clips[0].toObject().value("inPointMs").toInt(), 2000);
        QCOMPARE(keep.clips[0].toObject().value("durationMs").toInt(), 4000);
        auto blocked = nt::ai::applyExtension(clips, source(), "take", "end", 2000, "available-space");
        QCOMPARE(blocked.code, QString("collision"));
        auto ripple = nt::ai::applyExtension(clips, source(), "take", "end", 2000, "ripple");
        QVERIFY(ripple.ok());
        QCOMPARE(ripple.clips[0].toObject().value("durationMs").toInt(), 6000);
        QCOMPARE(ripple.clips[1].toObject().value("startMs").toInt(), 10000);
        auto earlier = nt::ai::applyExtension(clips, source(), "take", "start", 2000, "available-space");
        QVERIFY(earlier.ok());
        QCOMPARE(earlier.clips[0].toObject().value("startMs").toInt(), 2000);
    }
    void guards() {
        auto stale = source(); stale.insert("sourceAssetId", "old");
        QCOMPARE(nt::ai::applyExtension({clip()}, stale, "take", "end", 2000, "keep-cut").code, QString("stale"));
        QCOMPARE(nt::ai::applyExtension({clip()}, source(), "take", "end", 2000, "keep-cut", {"t"}).code, QString("locked"));
        QCOMPARE(nt::ai::applyExtension({clip()}, source(), "take", "end", 3000, "keep-cut").code, QString("short"));
        auto linked = clip(); linked.insert("linkId", "link");
        QJsonObject other{{"id", "n"}, {"trackId", "other"}, {"linkId", "link"}, {"startMs", 4000}, {"durationMs", 4000}};
        QCOMPARE(nt::ai::applyExtension({linked, other}, source(), "take", "end", 2000, "ripple").code, QString("unsupported"));
    }
    void largeSequence() {
        QJsonArray clips{clip()};
        for (int i = 0; i < 10000; ++i) clips.append(QJsonObject{{"id", QString::number(i)}, {"trackId", "other"},
                                                                  {"startMs", 10000 + i * 2000}, {"durationMs", 1000}});
        const auto result = nt::ai::applyExtension(clips, source(), "take", "end", 2000, "ripple");
        QVERIFY(result.ok());
        QCOMPARE(result.clips.size(), 10001);
    }
};
QTEST_GUILESS_MAIN(ExtensionTest)
#include "tst_extension.moc"
