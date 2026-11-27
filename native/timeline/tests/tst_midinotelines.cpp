// The note lines of a midi clip: the geometry for a trimmed clip, a clip of
// 2000 notes, and the drawing item that rebuilds only when its inputs change.
#include "RequireValue.h"
#include "app/EditRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "ui/MidiNoteLines.h"
#include "midi/MidiNotes.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQuickWindow>
#include <QtTest>

#include <memory>

using namespace nt::ui;

namespace {
bool near(QPointF a, QPointF b) { return qAbs(a.x() - b.x()) < 1e-6 && qAbs(a.y() - b.y()) < 1e-6; }
QJsonObject note(int tick, int duration, int pitch, bool muted = false) {
    QJsonObject n{{"id", QString::number(tick) + "-" + QString::number(pitch)}, {"startTick", tick},
                  {"durationTick", duration}, {"pitch", pitch}, {"velocity", 100}};
    if (muted) { n["muted"] = true; }
    return n;
}
// 120 bpm: a beat (960 ticks) is 500 ms.
NoteLineView view120(double inPointMs, double msPerPx, double widthPx, double heightPx) {
    NoteLineView v;
    v.bpm = 120;
    v.inPointMs = inPointMs;
    v.msPerPx = msPerPx;
    v.widthPx = widthPx;
    v.heightPx = heightPx;
    v.toPx = widthPx;
    return v;
}
}  // namespace

class TestMidiNoteLines : public QObject {
    Q_OBJECT

  private slots:
    void trimmedClipMapsContentTicksToTheClipWindow() {
        // The clip shows content from 1000 ms on, 400 px at 5 ms/px = 2000 ms.
        const auto v = view120(1000, 5, 400, 40);
        const QJsonArray notes{
            note(0, 960, 60),           // starts before the in-point: not drawn
            note(1920, 960, 72),        // 1000 ms: the left edge, 500 ms = 100 px
            note(2880, 480, 60, true),  // 1500 ms: x 100, 250 ms = 50 px, muted
            note(5568, 960, 66),        // 2900 ms: x 380, cut at the clip end
            note(6240, 960, 66),        // 3250 ms: past the window: not drawn
        };
        const auto lines = computeNoteLines(notes, v);
        QCOMPARE(int(lines.size()), 3);
        QVERIFY(qAbs(lines[0].rect.left()) < 1e-6);
        QCOMPARE(lines[0].rect.width(), 100.0);
        QCOMPARE(lines[1].rect.left(), 100.0);
        QCOMPARE(lines[1].rect.width(), 50.0);
        QVERIFY(lines[1].muted);
        QCOMPARE(lines[2].rect.left(), 380.0);
        QCOMPARE(lines[2].rect.right(), 400.0);
        // The pitch range of the clip window is 60..72, the highest on top.
        QCOMPARE(lines[0].rect.top(), 3.0);
        QCOMPARE(lines[1].rect.top(), std::round(3.0 + (40 - 6 - 2)));
        QVERIFY(lines[0].rect.top() < lines[2].rect.top());
        QVERIFY(lines[2].rect.top() < lines[1].rect.top());
        QCOMPARE(lines[0].rect.height(), 2.0);
    }
    void singlePitchSitsInTheMiddleAndShortBodiesUseOnePixel() {
        const QJsonArray notes{note(0, 960, 64), note(960, 960, 64)};
        auto lines = computeNoteLines(notes, view120(0, 5, 400, 40));
        QCOMPARE(int(lines.size()), 2);
        QCOMPARE(lines[0].rect.top(), 19.0);
        QCOMPARE(lines[0].rect.height(), 2.0);
        lines = computeNoteLines(notes, view120(0, 5, 400, 16));
        QCOMPARE(lines[0].rect.height(), 1.0);
    }
    void aTinyNoteIsTwoPixelsLong() {
        const QJsonArray notes{note(0, 1, 60), note(960 * 4 - 1, 1, 60)};
        const auto lines = computeNoteLines(notes, view120(0, 5, 400, 40));
        QCOMPARE(int(lines.size()), 2);
        QCOMPARE(lines[0].rect.width(), 2.0);
        QCOMPARE(lines[1].rect.width(), 2.0);
        QVERIFY(lines[1].rect.right() <= 400.0);
    }
    void aClipOf2000NotesKeepsTheDrawingInputCorrect() {
        QJsonArray notes;
        for (int i = 0; i < 2000; ++i) { notes.append(note(i * 240, 200, 36 + (i * 7) % 49, i % 10 == 0)); }
        // 2000 sixteenth notes = 500 beats = 250 s. Show the first 100 s.
        auto v = view120(0, 100, 1000, 60);
        QElapsedTimer timer;
        timer.start();
        const auto lines = computeNoteLines(notes, v);
        const auto elapsed = timer.elapsed();
        QCOMPARE(int(lines.size()), 800);  // 100 s hold 800 sixteenth notes
        int muted = 0;
        for (const NoteLine& l : lines) {
            QVERIFY(l.rect.left() >= 0 && l.rect.right() <= 1000.0);
            QVERIFY(l.rect.top() >= 3 && l.rect.bottom() <= 60 - 3);
            QCOMPARE(l.rect.height(), 2.0);
            QVERIFY(l.rect.width() >= 2.0);
            muted += l.muted ? 1 : 0;
        }
        QCOMPARE(muted, 80);
        QVERIFY2(elapsed < 100, qPrintable(QString::number(elapsed) + " ms"));
        // A narrower visible window draws only the lines in it.
        v.fromPx = 400;
        v.toPx = 500;
        const auto part = computeNoteLines(notes, v);
        QVERIFY(part.size() > 0 && part.size() < lines.size());
        for (const NoteLine& l : part) { QVERIFY(l.rect.right() >= 400 && l.rect.left() <= 500); }
        // Zoomed out so that the whole clip fits, all 2000 notes are there.
        v = view120(0, 250, 1000, 60);
        QCOMPARE(int(computeNoteLines(notes, v).size()), 2000);
    }
    void aStepLaneOnATrimmedClipDrawsHorizontalThenVerticalSegments() {
        // Content from 1000 ms (tick 1920), 400 px at 5 ms/px = ticks 1920..5760.
        const QJsonArray lanes{
            QJsonObject{{"id", "empty"}, {"kind", "cc"}, {"cc", 1}, {"interpolation", "step"}, {"points", QJsonArray{}}},
            QJsonObject{{"id", "l"}, {"kind", "cc"}, {"cc", 1}, {"interpolation", "step"},
                        {"points", QJsonArray{QJsonObject{{"tick", 960}, {"value", 127}},
                                              QJsonObject{{"tick", 2880}, {"value", 0}}}}}};
        auto v = view120(1000, 5, 400, 40);
        const auto curve = computeControllerCurve(lanes, v);
        // The lane starts before the in-point at 127, steps to 0 at 1500 ms (x 100), holds to the end.
        QCOMPARE(int(curve.size()), 3);
        QVERIFY(near(curve[0].from, QPointF(0, 3)));
        QVERIFY(near(curve[0].to, QPointF(100, 3)));
        QVERIFY(near(curve[1].from, QPointF(100, 3)));
        QVERIFY(near(curve[1].to, QPointF(100, 37)));
        QVERIFY(near(curve[2].from, QPointF(100, 37)));
        QVERIFY(near(curve[2].to, QPointF(400, 37)));
        // Before the first point nothing is drawn: the lane begins at 1500 ms.
        const QJsonArray late{QJsonObject{{"kind", "cc"}, {"interpolation", "step"},
                                          {"points", QJsonArray{QJsonObject{{"tick", 2880}, {"value", 127}}}}}};
        const auto lateCurve = computeControllerCurve(late, v);
        QCOMPARE(int(lateCurve.size()), 1);
        QVERIFY(qAbs(lateCurve[0].from.x() - 100.0) < 1e-6);
    }
    void aLinearLaneOnATrimmedClipDrawsStraightSegments() {
        const QJsonArray lanes{QJsonObject{{"kind", "pitchBend"}, {"interpolation", "linear"},
                                           {"points", QJsonArray{QJsonObject{{"tick", 1920}, {"value", -8192}},
                                                                 QJsonObject{{"tick", 3840}, {"value", 8191}}}}}};
        const auto curve = computeControllerCurve(lanes, view120(1000, 5, 400, 40));
        // -8192 at the left edge (bottom), 8191 at 2000 ms (x 200, top), then it holds.
        QCOMPARE(int(curve.size()), 2);
        QVERIFY(near(curve[0].from, QPointF(0, 37)));
        QVERIFY(near(curve[0].to, QPointF(200, 3)));
        QVERIFY(near(curve[1].to, QPointF(400, 3)));
        // A window that starts mid-ramp begins at the interpolated value.
        const auto mid = computeControllerCurve(lanes, view120(1500, 5, 300, 40));
        QVERIFY(mid.size() >= 1);
        QVERIFY(mid[0].from.y() > 3.0 && mid[0].from.y() < 37.0);
    }
    void theItemRebuildsOnlyWhenItsInputsChange() {
        // A stand-in for the piano roll's midi.setNotes edit.
        nt::app::registerEdit("test.setNotes", [](QJsonObject doc, const QJsonObject& payload) {
            QJsonArray clips = doc["clips"].toArray();
            QJsonObject clip = clips[0].toObject();
            clip["notes"] = payload["notes"];
            clips[0] = clip;
            doc["clips"] = clips;
            return doc;
        });
        TimelineModel model;
        const QJsonObject raw{
            {"id", "tl"}, {"name", "Song"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 4000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "m"}, {"name", "Keys"}, {"type", "midi"}},
                                  QJsonObject{{"id", "a"}, {"name", "Voice"}, {"type", "audio"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "m"}, {"name", "Riff"}, {"mediaType", "midi"},
                                             {"sourceType", "generated"}, {"status", "ready"}, {"startMs", 0},
                                             {"durationMs", 2000}, {"inPointMs", 0}, {"outPointMs", 2000},
                                             {"notes", QJsonArray{note(0, 960, 60), note(960, 960, 64)}}},
                                 QJsonObject{{"id", "au"}, {"trackId", "a"}, {"name", "Take"}, {"mediaType", "audio"},
                                             {"startMs", 0}, {"durationMs", 2000}, {"inPointMs", 0},
                                             {"outPointMs", 2000}}}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(requireValue(parsed.timeline));

        QQuickWindow window;
        window.resize(400, 120);
        MidiNoteLinesItem item;
        item.setParentItem(window.contentItem());
        item.setSize({400, 40});
        item.setTimeline(&model);
        item.setClipId("c");
        item.setMsPerPx(5);
        item.setColor(Qt::black);
        item.setMutedColor(Qt::gray);
        QCOMPARE(item.lines().size(), 2);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QTRY_VERIFY(item.paintCount() >= 1);
        const int base = item.paintCount();
        // Same values: no rebuild.
        item.setMsPerPx(5);
        item.setSize({400, 40});
        window.grabWindow();
        QCOMPARE(item.paintCount(), base);
        // A new zoom, a new scroll window and a new size each rebuild.
        item.setMsPerPx(10);
        window.grabWindow();
        QTRY_COMPARE(item.paintCount(), base + 1);
        item.setVisibleFromPx(50);
        window.grabWindow();
        QTRY_COMPARE(item.paintCount(), base + 2);
        item.setHeight(60);
        window.grabWindow();
        QTRY_COMPARE(item.paintCount(), base + 3);
        // An edit of the notes rebuilds.
        QVERIFY(model.applyEdit("test.setNotes", {{"notes", QJsonArray{note(0, 960, 60)}}}) != 0);
        window.grabWindow();
        QTRY_COMPARE(item.paintCount(), base + 4);
        QCOMPARE(item.lines().size(), 1);
        // The typed patch emits only the ChangeSet, not the legacy clip signal.
        const nt::app::Edit patch = nt::app::RegisteredTypedEdit{
            [](QJsonObject raw, const QJsonObject& payload) { return nt::midi::patchClipNotes("midi.moveNotes", std::move(raw), payload); },
            [](const nt::Timeline& before, const QJsonObject& payload) { return nt::midi::patchTypedNotes("midi.moveNotes", before, payload); }};
        QVERIFY(model.applyEdit("midi.moveNotes", {{"clipId", "c"},
            {"notes", QJsonArray{QJsonObject{{"id", "0-60"}, {"pitch", 62}}}}}, patch));
        window.grabWindow();
        QTRY_COMPARE(item.paintCount(), base + 5);
        // An audio clip draws no lines.
        item.setClipId("au");
        QCOMPARE(item.lines().size(), 0);
    }
    void theLinesReachThePixels() {
        // The tests and the offscreen shots run the software scene graph.
        TimelineModel model;
        const QJsonObject raw{{"name", "t"}, {"fps", 30}, {"width", 640}, {"height", 360},
            {"tracks", QJsonArray{QJsonObject{{"id", "m"}, {"name", "Keys"}, {"type", "midi"}, {"index", 0}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "m"}, {"name", "Riff"}, {"mediaType", "midi"},
                                             {"startMs", 0}, {"durationMs", 2000},
                                             {"notes", QJsonArray{note(0, 960, 60), note(960, 960, 72)}}}}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(requireValue(parsed.timeline));
        QQuickWindow window;
        window.setColor(Qt::white);
        window.resize(400, 40);
        MidiNoteLinesItem item;
        item.setParentItem(window.contentItem());
        item.setSize({400, 40});
        item.setTimeline(&model);
        item.setClipId("c");
        item.setMsPerPx(5);
        item.setColor(Qt::black);
        item.setMutedColor(Qt::gray);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        const auto lines = item.lines();
        QCOMPARE(lines.size(), 2);
        const auto first = lines[0].toMap();
        const QPoint at(int(first.value("x").toDouble() + 20), int(first.value("y").toDouble()));
        QTRY_VERIFY(item.paintCount() >= 1);
        const QImage frame = window.grabWindow();
        const qreal dpr = frame.devicePixelRatio();
        QCOMPARE(frame.pixelColor(at * dpr).lightness(), 0);
        QCOMPARE(frame.pixelColor(QPoint(at.x(), 30) * dpr).lightness(), 255);
    }
};

QTEST_MAIN(TestMidiNoteLines)
#include "tst_midinotelines.moc"
