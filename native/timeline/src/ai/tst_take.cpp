#include "ai/Take.h"
#include <QJsonArray>
#include <QtTest>

class TakeTest : public QObject {
    Q_OBJECT
private slots:
    void application() {
        QJsonObject take{{"id", "new"}, {"assetId", "asset"}, {"status", "success"},
                         {"durationMs", 5000}, {"dependencyHash", "hash"},
                         {"paramOverridesSnapshot", QJsonObject{}}, {"mediaEdit", QJsonObject{{"source", "old"}}}};
        QJsonObject clip{{"id", "clip"}, {"mediaType", "video"}, {"durationMs", 4000},
                         {"startMs", 2000}, {"linkId", "linked-audio"}, {"dependencyHash", "hash"}, {"timeRemap", QJsonObject{}},
                         {"versions", QJsonArray{take}}};
        const auto applied = nt::ai::applyTake(clip, "new");
        QVERIFY(applied.error.isEmpty());
        QCOMPARE(applied.clip.value("currentAssetId").toString(), QString("asset"));
        QCOMPARE(applied.clip.value("outPointMs").toInt(), 4000);
        QCOMPARE(applied.clip.value("startMs").toInt(), 2000);
        QCOMPARE(applied.clip.value("linkId").toString(), QString("linked-audio"));
        QVERIFY(!applied.clip.contains("timeRemap"));
        take.insert("durationMs", 3999);
        clip.insert("versions", QJsonArray{take});
        const auto rejected = nt::ai::applyTake(clip, "new");
        QVERIFY(!rejected.error.isEmpty());
        QCOMPARE(rejected.clip, clip);
    }
    void slowedBaseline() {
        const QJsonObject take{{"id", "baseline"}, {"assetId", "original"}, {"status", "success"},
                               {"durationMs", 4000}, {"dependencyHash", ""}, {"paramOverridesSnapshot", QJsonObject{}},
                               {"sourceMapping", QJsonObject{{"inPointMs", 0}, {"outPointMs", 4000}, {"speedMultiplier", 0.5}}}};
        const QJsonObject clip{{"mediaType", "video"}, {"durationMs", 8000}, {"currentAssetId", "edited"},
                               {"inPointMs", 0}, {"outPointMs", 8000}, {"speedMultiplier", 1}, {"speedBaked", true},
                               {"versions", QJsonArray{take}}};
        const auto restored = nt::ai::applyTake(clip, "baseline");
        QVERIFY2(restored.error.isEmpty(), qPrintable(restored.error));
        QCOMPARE(restored.clip.value("currentAssetId").toString(), QString("original"));
        QCOMPARE(restored.clip.value("outPointMs").toInt(), 4000);
        QCOMPARE(restored.clip.value("speedMultiplier").toDouble(), 0.5);
        auto noMapping = take;
        noMapping.remove("sourceMapping");
        auto withoutMapping = clip;
        withoutMapping.insert("speedMultiplier", 0.5);
        withoutMapping.insert("speedBaked", false);
        withoutMapping.insert("outPointMs", 4000);
        withoutMapping.insert("versions", QJsonArray{noMapping});
        const auto refused = nt::ai::applyTake(withoutMapping, "baseline");
        QVERIFY(!refused.error.isEmpty());
        QCOMPARE(refused.clip, withoutMapping);
    }
    void history() {
        QJsonObject a{{"id", "a"}, {"assetId", "one"}, {"status", "success"}};
        QJsonObject b{{"id", "b"}, {"assetId", "two"}, {"status", "success"}};
        QJsonObject clip{{"currentAssetId", "one"}, {"activeTakeId", "b"}, {"versions", QJsonArray{a, b}}};
        QVERIFY(!nt::ai::deleteTake(clip, "a").error.isEmpty());
        const auto renamed = nt::ai::renameTake(clip, "b", "Alternate");
        QCOMPARE(renamed.clip.value("versions").toArray()[1].toObject().value("label").toString(), QString("Alternate"));
        const auto deleted = nt::ai::deleteTake(renamed.clip, "b");
        QVERIFY(deleted.error.isEmpty());
        QCOMPARE(deleted.clip.value("versions").toArray().size(), 1);
        QVERIFY(!nt::ai::deleteTake(clip, "missing").error.isEmpty());
    }
    void sharedAssetActiveTake() {
        const QJsonObject a{{"id", "one"}, {"assetId", "shared"}, {"status", "success"}, {"durationMs", 4000}};
        const QJsonObject b{{"id", "two"}, {"assetId", "shared"}, {"status", "success"}, {"durationMs", 4000}};
        QJsonObject clip{{"id", "clip"}, {"mediaType", "video"}, {"durationMs", 4000}, {"currentAssetId", "shared"},
            {"activeTakeId", "two"}, {"versions", QJsonArray{a, b}}};
        QVERIFY(!nt::ai::deleteTake(clip, "two").error.isEmpty());
        const auto removed = nt::ai::deleteTake(clip, "one");
        QVERIFY(removed.error.isEmpty());
        QCOMPARE(removed.clip.value("activeTakeId").toString(), QStringLiteral("two"));
        const auto switched = nt::ai::applyTake(clip, "one");
        QVERIFY(switched.error.isEmpty());
        QCOMPARE(switched.clip.value("activeTakeId").toString(), QStringLiteral("one"));
        QVERIFY(!nt::ai::deleteTake(switched.clip, "one").error.isEmpty());
    }
    void mappingAndRefusal() {
        QJsonObject take{{"id", "old"}, {"assetId", "asset"}, {"status", "success"},
                         {"durationMs", 9000}, {"dependencyHash", "oldhash"},
                         {"paramOverridesSnapshot", QJsonObject{{"gain", 2}}},
                         {"sourceMapping", QJsonObject{{"inPointMs", 1000}, {"outPointMs", 9000}, {"speedMultiplier", 2}}}};
        QJsonObject clip{{"mediaType", "video"}, {"durationMs", 4000}, {"dependencyHash", "newhash"},
                         {"inPointMs", 200}, {"outPointMs", 4200}, {"versions", QJsonArray{take}}};
        const auto mapped = nt::ai::applyTake(clip, "old");
        QVERIFY(mapped.error.isEmpty());
        QCOMPARE(mapped.clip.value("status").toString(), QString("stale"));
        QCOMPARE(mapped.clip.value("inPointMs").toInt(), 1000);
        take.insert("sourceMapping", QJsonObject{{"inPointMs", 0}, {"outPointMs", 5000}});
        clip.insert("versions", QJsonArray{take});
        QCOMPARE(nt::ai::applyTake(clip, "old").clip.value("inPointMs").toInt(), 200);
        take.insert("sourceMapping", QJsonObject{{"inPointMs", 1000}, {"outPointMs", 9000}, {"speedMultiplier", 2}});
        take.insert("durationMs", 5000);
        clip.insert("versions", QJsonArray{take});
        QVERIFY(!nt::ai::applyTake(clip, "old").error.isEmpty());
        take.insert("durationMs", 9000);
        take.insert("source", "extended");
        clip.insert("versions", QJsonArray{take});
        const auto refused = nt::ai::applyTake(clip, "old");
        QVERIFY(!refused.error.isEmpty());
        QCOMPARE(refused.clip, clip);
    }
    void remixTakesOfDifferentLengths() {
        // F11: the clip keeps its length, and each take's window starts at its own start.
        const auto take = [](const char* id, const char* asset, double length, double in, double out) {
            return QJsonObject{{"id", id}, {"assetId", asset}, {"status", "success"}, {"durationMs", length},
                               {"sourceMapping", QJsonObject{{"inPointMs", in}, {"outPointMs", out}}}};
        };
        const QJsonArray versions{take("source", "asset_source", 20000, 2000, 6000), take("short", "asset_short", 4000, 0, 4000),
                                  take("long", "asset_long", 6000, 0, 6000)};
        QJsonObject clip{{"mediaType", "video"}, {"durationMs", 4000}, {"currentAssetId", "asset_source"},
                         {"activeTakeId", "source"}, {"inPointMs", 2000}, {"outPointMs", 6000}, {"versions", versions}};
        const auto longer = nt::ai::applyTake(clip, "long");
        QVERIFY2(longer.error.isEmpty(), qPrintable(longer.error));
        QCOMPARE(longer.clip.value("durationMs").toDouble(), 4000.0);
        QCOMPARE(longer.clip.value("inPointMs").toDouble(), 0.0);
        QCOMPARE(longer.clip.value("outPointMs").toDouble(), 4000.0);
        const auto back = nt::ai::applyTake(longer.clip, "source");
        QCOMPARE(back.clip.value("inPointMs").toDouble(), 2000.0);
        QCOMPARE(back.clip.value("outPointMs").toDouble(), 6000.0);
        // A split half keeps its offset into the take.
        clip.insert("durationMs", 2000); clip.insert("inPointMs", 4000); clip.insert("outPointMs", 6000);
        const auto half = nt::ai::applyTake(clip, "long");
        QVERIFY2(half.error.isEmpty(), qPrintable(half.error));
        QCOMPARE(half.clip.value("inPointMs").toDouble(), 2000.0);
        QCOMPARE(half.clip.value("outPointMs").toDouble(), 4000.0);
    }
};
QTEST_GUILESS_MAIN(TakeTest)
#include "tst_take.moc"
