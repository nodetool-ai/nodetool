#include "midi/MidiNotes.h"

#include <QTest>

namespace {
QJsonObject document(bool clipLocked = false, bool trackLocked = false, const QString& mediaType = QStringLiteral("midi")) {
    return QJsonObject{
        {"tracks", QJsonArray{QJsonObject{{"id", "t1"}, {"type", "midi"}, {"locked", trackLocked}}}},
        {"clips", QJsonArray{QJsonObject{{"id", "c1"}, {"trackId", "t1"}, {"mediaType", mediaType},
                                         {"locked", clipLocked}, {"notes", QJsonArray{}}}}}};
}
QJsonObject note(double pitch, double velocity, double start, double duration, const QString& id = {}) {
    QJsonObject value{{"pitch", pitch}, {"velocity", velocity}, {"startTick", start}, {"durationTick", duration}};
    if (!id.isEmpty()) {
        value.insert("id", id);
    }
    return value;
}
QJsonArray notesOf(const QJsonObject& raw) {
    return raw.value(u"clips").toArray().at(0).toObject().value(u"notes").toArray();
}
QJsonArray controllersOf(const QJsonObject& raw) {
    return raw.value(u"clips").toArray().at(0).toObject().value(u"controllers").toArray();
}
QJsonObject point(double tick, double value, const QString& id = {}) {
    QJsonObject p{{"tick", tick}, {"value", value}};
    if (!id.isEmpty()) {
        p.insert("id", id);
    }
    return p;
}
QJsonObject lane(const QString& kind, const QJsonArray& points) {
    return QJsonObject{{"id", "l-" + kind}, {"kind", kind}, {"points", points}};
}
QJsonObject withControllers(const QJsonObject& raw, const QJsonArray& lanes) {
    return nt::midi::setClipControllers(raw, {{"clipId", "c1"}, {"controllers", lanes}});
}
QJsonObject noteWith(const QJsonObject& extra) {
    auto n = note(60, 100, 0, 960, "n");
    for (auto it = extra.begin(); it != extra.end(); ++it) {
        n.insert(it.key(), it.value());
    }
    return n;
}
QJsonArray notesWith(const QJsonObject& extra) {
    return notesOf(nt::midi::setClipNotes(document(), {{"clipId", "c1"}, {"notes", QJsonArray{noteWith(extra)}}}));
}
}  // namespace

class TestMidiNotes : public QObject {
    Q_OBJECT
  private slots:
    void writesBothEventKindsAtomically() {
        const auto raw = document();
        const auto volume = QJsonObject{{"id","L1"},{"kind","cc"},{"cc",7},{"points",QJsonArray{point(0,80,"p")}}};
        const auto payload = QJsonObject{{"clipId","c1"},{"notes",QJsonArray{note(60,100,0,240,"n")}},{"controllers",QJsonArray{volume}}};
        const auto next = nt::midi::setClipEvents(raw, payload);
        QCOMPARE(notesOf(next).size(), 1); QCOMPARE(controllersOf(next).size(), 1);
        auto invalid = payload;
        auto badLane = volume; badLane.insert("points",QJsonArray{point(0,200,"p")});
        invalid.insert("controllers",QJsonArray{badLane});
        QCOMPARE(nt::midi::setClipEvents(raw,invalid), raw);
        invalid = payload; invalid.insert("notes",QJsonArray{note(60,0,0,240,"n")});
        QCOMPARE(nt::midi::setClipEvents(raw,invalid), raw);
        QCOMPARE(nt::midi::setClipEvents(document(true),payload), document(true));
        QCOMPARE(nt::midi::setClipEvents(document(false,true),payload), document(false,true));
    }

    void writesNotes() {
        const auto next = nt::midi::setClipNotes(document(), {{"clipId", "c1"},
            {"notes", QJsonArray{note(60, 100, 0, 960, "a"), note(64, 90, 960, 480)}}});
        const auto notes = notesOf(next);
        QCOMPARE(notes.size(), 2);
        QCOMPARE(notes.at(0).toObject().value(u"id").toString(), QStringLiteral("a"));
        QVERIFY(!notes.at(1).toObject().value(u"id").toString().isEmpty());
        QCOMPARE(notes.at(1).toObject().value(u"pitch").toInt(), 64);
    }
    void duplicateIdsGetNewOnes() {
        const auto notes = notesOf(nt::midi::setClipNotes(document(), {{"clipId", "c1"},
            {"notes", QJsonArray{note(60, 100, 0, 960, "a"), note(62, 100, 0, 960, "a")}}}));
        QCOMPARE(notes.size(), 2);
        QVERIFY(notes.at(0).toObject().value(u"id") != notes.at(1).toObject().value(u"id"));
    }
    void rejectsInvalidNotes_data() {
        QTest::addColumn<QJsonObject>("bad");
        QTest::newRow("pitch high") << note(128, 100, 0, 960);
        QTest::newRow("velocity zero") << note(60, 0, 0, 960);
        QTest::newRow("negative start") << note(60, 100, -1, 960);
        QTest::newRow("zero duration") << note(60, 100, 0, 0);
        QTest::newRow("fractional tick") << note(60, 100, 0.5, 960);
    }
    void rejectsInvalidNotes() {
        QFETCH(QJsonObject, bad);
        const auto raw = document();
        QCOMPARE(nt::midi::setClipNotes(raw, {{"clipId", "c1"}, {"notes", QJsonArray{bad}}}), raw);
    }
    void rejectsTooManyNotes() {
        QJsonArray notes;
        for (int i = 0; i <= nt::midi::MAX_NOTES_PER_CLIP; ++i) {
            notes.append(note(60, 100, i, 1));
        }
        const auto raw = document();
        QCOMPARE(nt::midi::setClipNotes(raw, {{"clipId", "c1"}, {"notes", notes}}), raw);
    }
    void keepsOptionalNoteFields() {
        const QJsonObject expression{{"pitch", QJsonArray{point(0, 0), point(480, 2.5)}},
                                     {"volume", QJsonArray{point(960, 4)}},
                                     {"pan", QJsonArray{point(0, -1)}},
                                     {"brightness", QJsonArray{point(0, 0.5)}}};
        const auto notes = notesWith({{"muted", true}, {"channel", 9}, {"releaseVelocity", 0}, {"expression", expression}});
        QCOMPARE(notes.size(), 1);
        const auto kept = notes.at(0).toObject();
        QCOMPARE(kept.value(u"muted").toBool(), true);
        QCOMPARE(kept.value(u"channel").toInt(), 9);
        QVERIFY(kept.contains(u"releaseVelocity"));
        QCOMPARE(kept.value(u"releaseVelocity").toInt(), 0);
        QCOMPARE(kept.value(u"expression").toObject(), expression);
        // Absent fields stay absent.
        const auto plain = notesWith({}).at(0).toObject();
        QVERIFY(!plain.contains(u"muted") && !plain.contains(u"channel") && !plain.contains(u"releaseVelocity") &&
                !plain.contains(u"expression"));
    }
    void rejectsInvalidOptionalFields_data() {
        QTest::addColumn<QJsonObject>("extra");
        const auto expr = [](const QString& kind, const QJsonArray& points) {
            return QJsonObject{{"expression", QJsonObject{{kind, points}}}};
        };
        QTest::newRow("muted not bool") << QJsonObject{{"muted", 1}};
        QTest::newRow("channel 16") << QJsonObject{{"channel", 16}};
        QTest::newRow("channel negative") << QJsonObject{{"channel", -1}};
        QTest::newRow("channel fractional") << QJsonObject{{"channel", 1.5}};
        QTest::newRow("release velocity 128") << QJsonObject{{"releaseVelocity", 128}};
        QTest::newRow("release velocity negative") << QJsonObject{{"releaseVelocity", -1}};
        QTest::newRow("expression not object") << QJsonObject{{"expression", 3}};
        QTest::newRow("pitch high") << expr("pitch", QJsonArray{point(0, 49)});
        QTest::newRow("pitch low") << expr("pitch", QJsonArray{point(0, -48.5)});
        QTest::newRow("volume high") << expr("volume", QJsonArray{point(0, 4.1)});
        QTest::newRow("pan high") << expr("pan", QJsonArray{point(0, 1.1)});
        QTest::newRow("brightness low") << expr("brightness", QJsonArray{point(0, -0.1)});
        QTest::newRow("tick past duration") << expr("pitch", QJsonArray{point(961, 0)});
        QTest::newRow("tick negative") << expr("pitch", QJsonArray{point(-1, 0)});
        QTest::newRow("tick fractional") << expr("pitch", QJsonArray{point(0.5, 0)});
        QTest::newRow("ticks decrease") << expr("pitch", QJsonArray{point(100, 0), point(50, 0)});
        QTest::newRow("points not array") << QJsonObject{{"expression", QJsonObject{{"pitch", 1}}}};
    }
    void rejectsInvalidOptionalFields() {
        QFETCH(QJsonObject, extra);
        const auto raw = document();
        QCOMPARE(nt::midi::setClipNotes(raw, {{"clipId", "c1"}, {"notes", QJsonArray{noteWith(extra)}}}), raw);
    }
    void rejectsTooManyExpressionPoints() {
        QJsonArray points;
        for (int i = 0; i <= nt::midi::MAX_EXPRESSION_POINTS; ++i) {
            points.append(point(0, 0));
        }
        const auto raw = document();
        QCOMPARE(nt::midi::setClipNotes(raw, {{"clipId", "c1"}, {"notes", QJsonArray{noteWith({{"expression", QJsonObject{{"pitch", points}}}})}}}), raw);
        points.removeLast();
        QCOMPARE(notesWith({{"expression", QJsonObject{{"pitch", points}}}}).size(), 1);
    }
    void writesControllers() {
        const auto raw = withControllers(document(), QJsonArray{
            QJsonObject{{"id", "a"}, {"kind", "cc"}, {"cc", 1}, {"channel", 2}, {"interpolation", "step"},
                        {"points", QJsonArray{point(0, 0, "p1"), point(960, 127)}}},
            lane("pitchBend", QJsonArray{point(0, -8192), point(10, 8191)}),
            QJsonObject{{"kind", "polyPressure"}, {"pitch", 60}, {"points", QJsonArray{}}}});
        const auto lanes = controllersOf(raw);
        QCOMPARE(lanes.size(), 3);
        const auto first = lanes.at(0).toObject();
        QCOMPARE(first.value(u"id").toString(), QStringLiteral("a"));
        QCOMPARE(first.value(u"cc").toInt(), 1);
        QCOMPARE(first.value(u"channel").toInt(), 2);
        QCOMPARE(first.value(u"interpolation").toString(), QStringLiteral("step"));
        QCOMPARE(first.value(u"points").toArray().at(0).toObject().value(u"id").toString(), QStringLiteral("p1"));
        QVERIFY(!first.value(u"points").toArray().at(1).toObject().value(u"id").toString().isEmpty());
        QVERIFY(!lanes.at(2).toObject().value(u"id").toString().isEmpty());
        // An empty array removes the field.
        QVERIFY(!withControllers(raw, QJsonArray{}).value(u"clips").toArray().at(0).toObject().contains(u"controllers"));
    }
    void rejectsInvalidControllers_data() {
        QTest::addColumn<QJsonArray>("lanes");
        const auto cc = [](int number, int channel, const QJsonArray& points) {
            return QJsonObject{{"id", QString::number(number * 100 + channel)}, {"kind", "cc"}, {"cc", number},
                               {"channel", channel}, {"points", points}};
        };
        QTest::newRow("unknown kind") << QJsonArray{lane("aftertouch", {})};
        QTest::newRow("cc missing number") << QJsonArray{lane("cc", {})};
        QTest::newRow("cc 128") << QJsonArray{cc(128, 0, {})};
        QTest::newRow("cc on bend") << QJsonArray{QJsonObject{{"kind", "pitchBend"}, {"cc", 1}, {"points", QJsonArray{}}}};
        QTest::newRow("pitch on cc") << QJsonArray{QJsonObject{{"kind", "cc"}, {"cc", 1}, {"pitch", 3}, {"points", QJsonArray{}}}};
        QTest::newRow("poly missing pitch") << QJsonArray{lane("polyPressure", {})};
        QTest::newRow("poly pitch 128") << QJsonArray{QJsonObject{{"kind", "polyPressure"}, {"pitch", 128}, {"points", QJsonArray{}}}};
        QTest::newRow("channel 16") << QJsonArray{cc(1, 16, {})};
        QTest::newRow("bad interpolation") << QJsonArray{QJsonObject{{"kind", "channelPressure"}, {"interpolation", "cubic"}, {"points", QJsonArray{}}}};
        QTest::newRow("points missing") << QJsonArray{QJsonObject{{"kind", "channelPressure"}}};
        QTest::newRow("cc value 128") << QJsonArray{cc(1, 0, QJsonArray{point(0, 128)})};
        QTest::newRow("pressure negative") << QJsonArray{lane("channelPressure", QJsonArray{point(0, -1)})};
        QTest::newRow("bend low") << QJsonArray{lane("pitchBend", QJsonArray{point(0, -8193)})};
        QTest::newRow("bend high") << QJsonArray{lane("pitchBend", QJsonArray{point(0, 8192)})};
        QTest::newRow("value fractional") << QJsonArray{cc(1, 0, QJsonArray{point(0, 1.5)})};
        QTest::newRow("tick negative") << QJsonArray{cc(1, 0, QJsonArray{point(-1, 1)})};
        QTest::newRow("ticks decrease") << QJsonArray{cc(1, 0, QJsonArray{point(10, 1), point(9, 1)})};
        QTest::newRow("duplicate identity") << QJsonArray{cc(1, 0, {}), QJsonObject{{"id", "other"}, {"kind", "cc"}, {"cc", 1}, {"points", QJsonArray{}}}};
    }
    void rejectsInvalidControllers() {
        QFETCH(QJsonArray, lanes);
        const auto raw = document();
        QCOMPARE(withControllers(raw, lanes), raw);
    }
    void controllerLimits() {
        const auto raw = document();
        QJsonArray lanes;
        for (int i = 0; i <= nt::midi::MAX_CONTROLLER_LANES_PER_CLIP; ++i) {
            lanes.append(QJsonObject{{"kind", "cc"}, {"cc", i}, {"points", QJsonArray{}}});
        }
        QCOMPARE(withControllers(raw, lanes), raw);
        lanes.removeLast();
        QCOMPARE(controllersOf(withControllers(raw, lanes)).size(), nt::midi::MAX_CONTROLLER_LANES_PER_CLIP);
        QJsonArray points;
        for (int i = 0; i <= nt::midi::MAX_CONTROLLER_POINTS_PER_LANE; ++i) {
            points.append(point(i, 1));
        }
        QCOMPARE(withControllers(raw, QJsonArray{lane("channelPressure", points)}), raw);
        points.removeLast();
        QCOMPARE(controllersOf(withControllers(raw, QJsonArray{lane("channelPressure", points)})).at(0).toObject()
                     .value(u"points").toArray().size(), nt::midi::MAX_CONTROLLER_POINTS_PER_LANE);
    }
    void controllersHonourLocks() {
        const QJsonArray lanes{lane("pitchBend", QJsonArray{point(0, 0)})};
        const QJsonObject payload{{"clipId", "c1"}, {"controllers", lanes}};
        QCOMPARE(nt::midi::setClipControllers(document(true), payload), document(true));
        QCOMPARE(nt::midi::setClipControllers(document(false, true), payload), document(false, true));
        QCOMPARE(nt::midi::setClipControllers(document(false, false, "audio"), payload), document(false, false, "audio"));
        QCOMPARE(nt::midi::setClipControllers(document(), {{"clipId", "nope"}, {"controllers", lanes}}), document());
        QCOMPARE(nt::midi::setClipControllers(document(), {{"clipId", "c1"}, {"controllers", 3}}), document());
    }
    void leavesLockedAndOtherClips() {
        const QJsonObject payload{{"clipId", "c1"}, {"notes", QJsonArray{note(60, 100, 0, 960)}}};
        QCOMPARE(nt::midi::setClipNotes(document(true), payload), document(true));
        QCOMPARE(nt::midi::setClipNotes(document(false, true), payload), document(false, true));
        QCOMPARE(nt::midi::setClipNotes(document(false, false, "audio"), payload), document(false, false, "audio"));
        QCOMPARE(nt::midi::setClipNotes(document(), {{"clipId", "nope"}, {"notes", QJsonArray{}}}), document());
    }
};

QTEST_GUILESS_MAIN(TestMidiNotes)
#include "tst_midinotes.moc"
