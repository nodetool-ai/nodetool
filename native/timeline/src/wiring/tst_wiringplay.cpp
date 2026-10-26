#include "wiring/WiringFixture.h"
#include <QQmlEngine>
#include <QProcess>

class TestWiringPlay : public WiringFixture {
    Q_OBJECT
    std::int64_t nowNs = 0;
    void key(Qt::Key key, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        QTest::keyClick(view.get(), key, mods);
    }
    void replace(const QJsonObject& fixture) {
        auto parsed = nt::parseTimelineJson(QJsonDocument(fixture).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QCoreApplication::processEvents();
    }
private slots:
    void init() {
        nowNs = 0;
        clock.setNowSource([this] { return nowNs; });
        open();
        QVERIFY(gestures());
        click("timeRuler");
        clock.seek(1500);
    }
    void cleanup() { clock.pause(); clock.setLoop(false); clock.clearRange(); clock.setRate(1); view.reset(); }
    void shuttle() {
        const auto before = doc();
        QSignalSpy clips(&model, &TimelineModel::clipsChanged);
        QSignalSpy tracks(model.tracks(), &QAbstractItemModel::dataChanged);
        for (auto direction : {-1, 1}) {
            key(Qt::Key_K);
            QVERIFY(!clock.playing()); QCOMPARE(clock.rate(), 1.0);
            for (double speed : {1, 2, 4, 8, 8}) {
                key(direction < 0 ? Qt::Key_J : Qt::Key_L);
                QVERIFY(clock.playing()); QCOMPARE(clock.rate(), direction * speed);
                QVERIFY(!clock.audioMaster());
            }
            key(direction < 0 ? Qt::Key_L : Qt::Key_J);
            QCOMPARE(clock.rate(), double(-direction));
        }
        key(Qt::Key_K); QVERIFY(!clock.playing()); QCOMPARE(clock.rate(), 1.0);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(clips.count(), 0); QCOMPARE(tracks.count(), 0);
    }
    void markedLoop() {
        const auto before = doc();
        clock.seek(1000); key(Qt::Key_I);
        clock.seek(3000); key(Qt::Key_O);
        QCOMPARE(clock.rangeInMs(), 1000.0); QCOMPARE(clock.rangeOutMs(), 3000.0);
        key(Qt::Key_L, Qt::ShiftModifier); QVERIFY(clock.loop());
        clock.seek(2800); key(Qt::Key_L);
        nowNs += 500000000; clock.tick(); QCOMPARE(clock.time(), 1000.0);
        key(Qt::Key_K);
        clock.seek(4000); key(Qt::Key_I);
        QCOMPARE(clock.rangeInMs(), 4000.0); QCOMPARE(clock.rangeOutMs(), -1.0);
        key(Qt::Key_X, Qt::ControlModifier | Qt::ShiftModifier);
        QCOMPARE(clock.rangeInMs(), -1.0); QCOMPARE(clock.rangeOutMs(), -1.0);
        click("clip-c"); key(Qt::Key_X);
        QCOMPARE(clock.rangeInMs(), 1000.0); QCOMPARE(clock.rangeOutMs(), 3000.0);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void playInToOut() {
        clock.seek(1000); key(Qt::Key_I); clock.seek(3000); key(Qt::Key_O);
        const auto before = doc();
        key(Qt::Key_Space, Qt::ControlModifier | Qt::ShiftModifier);
        QVERIFY(clock.playingInToOut()); QVERIFY(clock.playing());
        QCOMPARE(clock.rate(), 1.0); QCOMPARE(clock.time(), 1000.0);
        nowNs += 2500000000; clock.tick(); QVERIFY(!clock.playing()); QCOMPARE(clock.time(), 3000.0);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void frameStep() {
        const auto before = doc();
        clock.seek(1510); key(Qt::Key_Right, Qt::AltModifier);
        QVERIFY(qAbs(clock.time() - 46 * 1000.0 / 30) < 1e-9);
        key(Qt::Key_Left, Qt::AltModifier); QCOMPARE(clock.time(), 1500.0);
        key(Qt::Key_Right, Qt::AltModifier | Qt::ShiftModifier);
        QVERIFY(qAbs(clock.time() - 50 * 1000.0 / 30) < 1e-9);
        clock.seek(6000); key(Qt::Key_Right, Qt::AltModifier); QCOMPARE(clock.time(), 6000.0);
        clock.seek(0); key(Qt::Key_Left, Qt::AltModifier); QCOMPARE(clock.time(), 0.0);
        clock.seek(1500); key(Qt::Key_L);
        const auto playingTime = clock.time(); key(Qt::Key_Right, Qt::AltModifier); QCOMPARE(clock.time(), playingTime);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void diamonds_data() {
        QTest::addColumn<bool>("underPlayhead");
        QTest::newRow("B12-drag-away-from-playhead") << false;
        QTest::newRow("B12-drag-after-seek") << true;
    }
    void diamonds() {
        QFETCH(bool, underPlayhead);
        auto fixture = doc(); auto clips = fixture["clips"].toArray(); auto c = clips[0].toObject();
        c.insert("animations", QJsonArray{QJsonObject{{"id", "keys"}, {"preset", "custom"}, {"role", "emphasis"},
            {"params", QJsonObject{{"keyframed", true}}}, {"custom", QJsonObject{{"curves", QJsonArray{
                QJsonObject{{"property", "offsetX"}, {"keyframes", QJsonArray{QJsonObject{{"t", 0.25}, {"value", 0}}, QJsonObject{{"t", 0.75}, {"value", 100}}}}},
                QJsonObject{{"property", "offsetY"}, {"keyframes", QJsonArray{QJsonObject{{"t", 0.25}, {"value", 10}}, QJsonObject{{"t", 0.75}, {"value", 80}}}}}
            }}}}}});
        clips[0] = c; fixture.insert("clips", clips); replace(fixture);
        const auto before = doc(); QSignalSpy changes(&model, &TimelineModel::clipsChanged);
        auto* mark = item("clip-keyframe-c-500"); QVERIFY2(mark, "B12: clip keyframe diamonds must mount in production ClipBody");
        clock.seek(1500);
        const auto aboveDiamond = mark->mapToScene({mark->width() / 2, -20}).toPoint();
        drag(aboveDiamond, aboveDiamond + QPoint(10, 0));
        QCOMPARE(clock.time(), 1600.0); QCOMPARE(doc(), before); QCOMPARE(changes.count(), 0);
        clock.seek(2200);
        click("clip-keyframe-c-500"); QCOMPARE(clock.time(), 1500.0); QCOMPARE(changes.count(), 0);
        if (!underPlayhead) { clock.seek(2200); }
        const double targetMs = 52 * (1000.0 / 30) - 1000;
        QProcess oracle;
        oracle.start("node", {"--import", "tsx", QStringLiteral(NT_WIRING_SOURCE "/src/wiring/keyframe-oracle.mjs")});
        QVERIFY(oracle.waitForStarted());
        oracle.write(QJsonDocument(QJsonObject{{"document", before}, {"clipId", "c"}, {"fromMs", 500}, {"toMs", targetMs}}).toJson());
        oracle.closeWriteChannel();
        QVERIFY(oracle.waitForFinished(30000));
        QVERIFY2(oracle.exitCode() == 0, oracle.readAllStandardError().constData());
        const auto expected = QJsonDocument::fromJson(oracle.readAllStandardOutput()).object();
        QVERIFY(!expected.isEmpty()); QVERIFY(expected != before);
        const auto from = center(mark); const auto to = from + QPoint(23, 0);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), to, 20);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(doc(), expected); QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(qAbs(clock.time() - (52 * (1000.0 / 30))) < 1e-9);
        click("undoButton"); QCOMPARE(doc(), before);
    }
    void playheadGrabWithoutDiamond() {
        const auto before = doc();
        clock.seek(1500);
        QSignalSpy changes(&model, &TimelineModel::clipsChanged);
        QSignalSpy tracks(model.tracks(), &QAbstractItemModel::dataChanged);
        auto* lane = item("trackLane-v"); QVERIFY(lane);
        auto* playhead = item("playhead"); QVERIFY(playhead);
        const auto from = QPointF(playhead->mapToScene({8, 0}).x(), center(lane).y()).toPoint();
        drag(from, from + QPoint(30, 0));
        QCOMPARE(clock.time(), 1800.0);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(changes.count(), 0); QCOMPARE(tracks.count(), 0);
    }
    void shortcutRows() {
        click("helpButton");
        auto* sheet = item("shortcutsSheet"); QVERIFY(sheet); QVERIFY(sheet->property("open").toBool());
        QSet<QString> remaining{
            "copy", "cut", "paste", "pasteAttributes", "pasteInsert", "duplicate", "duplicateWithGap", "groupClips", "ungroupClips",
            "liftRange", "extractRange", "rippleTrimPrevToPlayhead", "rippleTrimNextToPlayhead", "cutAllTracks",
            "toggleLoop", "playInToOut", "shuttleBack", "shuttleStop", "shuttleForward", "stepFrameBack", "stepFrameForward",
            "stepFramesBack", "stepFramesForward"};
        const auto inspect = [&](auto&& self, QQuickItem* target) -> void {
            if (target->property("available").isValid()) {
                const auto data = target->property("modelData");
                const auto row = data.metaType() == QMetaType::fromType<QJSValue>() ? data.value<QJSValue>().toVariant().toMap() : data.toMap();
                const auto id = row.value("id").toString();
                if (remaining.contains(id)) {
                    QVERIFY2(target->property("available").toBool(), qPrintable("Unavailable shortcut row: " + id));
                    remaining.remove(id);
                }
            }
            for (auto* child : target->childItems()) { self(self, child); }
        };
        inspect(inspect, sheet);
        QVERIFY2(remaining.isEmpty(), qPrintable("Missing available rows: " + QStringList(remaining.begin(), remaining.end()).join(", ")));
    }
};
QTEST_MAIN(TestWiringPlay)
#include "tst_wiringplay.moc"
