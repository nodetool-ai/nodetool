#include "TempoGrid.h"
#include "TempoProviders.h"
#include "wiring/WiringFixture.h"

#include <QFile>
#include <QJSValue>
#include <QQmlProperty>
#include <QTemporaryDir>

class TempoWiringTests : public WiringFixture {
    Q_OBJECT

    void loadDocument(bool midi, bool customTempo) {
        auto document = doc();
        QJsonArray tracks{QJsonObject{{"id", "v"}, {"name", "Video"}, {"type", "video"},
                                     {"index", 0}, {"heightPx", 80}}};
        if (midi) {
            tracks.append(QJsonObject{{"id", "m"}, {"name", "MIDI"}, {"type", "midi"}, {"index", 1}});
        }
        document.insert("tracks", tracks);
        document.insert("clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"}, {"name", "Still"},
            {"mediaType", "image"}, {"startMs", 1000}, {"durationMs", 501}}});
        if (customTempo) {
            document.insert("tempo", QJsonObject{{"bpm", 140}, {"offsetMs", 123},
                {"timeSignature", QJsonObject{{"beatsPerBar", 3}, {"beatUnit", 4}}}});
        } else {
            document.remove("tempo");
        }
        auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QCoreApplication::processEvents();
    }

private slots:
    void initTestCase() {
        QTest::ignoreMessage(QtWarningMsg, "Refused ruler provider bars");
        QVERIFY(!nt::wiring::registerRulerProvider("bars", nt::tempo::barRulerTicks));
    }
    void init() { open(); }
    void cleanup() { view.reset(); }

    void toolbarToggle() {
        QTRY_VERIFY_WITH_TIMEOUT(item("barsToggle"), 1000);
        auto* bars = item("barsToggle");
        auto* snap = item("snapToggle");
        QVERIFY(snap);
        QVERIFY(bars->mapToScene({0, 0}).x() >= snap->mapToScene({snap->width(), 0}).x());
        QCOMPARE(bars->property("label").toString(), QString("Bars"));
        QCOMPARE(bars->property("description").toString(), QString("The ruler counts bars and beats, not seconds"));
        QVERIFY(!bars->property("active").toBool());
        click("barsToggle");
        QCOMPARE(gestures()->viewState()->rulerMode(), QString("bars"));
        QVERIFY(bars->property("active").toBool());
        click("barsToggle");
        QCOMPARE(gestures()->viewState()->rulerMode(), QString("time"));
        QVERIFY(!bars->property("active").toBool());
        gestures()->viewState()->setRulerMode("bars");
        QVERIFY(bars->property("active").toBool());
        QCOMPARE(model.undoStack()->count(), 0);
    }

    void toolbarCompact() {
        QTRY_VERIFY_WITH_TIMEOUT(item("barsToggle"), 1000);
        auto* bars = item("barsToggle");
        auto* toolbar = item("toolToggle");
        QVERIFY(toolbar);
        for (const bool compact : {false, true, false}) {
            QVERIFY(toolbar->setProperty("compact", compact));
            QCOMPARE(bars->property("compact").toBool(), compact);
            QCOMPARE(bars->property("showLabel").toBool(), !compact);
        }
    }

    void rulerAccessibleName() {
        auto* ruler = item("timeRuler");
        QVERIFY(ruler);
        for (const auto& mode : {QStringLiteral("time"), QStringLiteral("bars"), QStringLiteral("time")}) {
            gestures()->viewState()->setRulerMode(mode);
            QCOMPARE(QQmlProperty::read(ruler, "Accessible.name", qmlContext(ruler)).toString(),
                mode == "bars" ? QStringLiteral("Bars ruler — click or drag to set playhead")
                               : QStringLiteral("Time ruler — click or drag to set playhead"));
        }
    }

    void rulerTicks_data() {
        QTest::addColumn<bool>("customTempo");
        QTest::addColumn<double>("zoom");
        QTest::newRow("140bpm-3-4-offset-close") << true << 10.0;
        QTest::newRow("140bpm-3-4-offset-wide") << true << 80.0;
        QTest::newRow("default-close") << false << 10.0;
        QTest::newRow("default-wide") << false << 80.0;
    }
    void rulerTicks() {
        QFETCH(bool, customTempo);
        QFETCH(double, zoom);
        loadDocument(false, customTempo);
        auto* state = gestures()->viewState();
        state->zoomTo(zoom, 0);
        state->setScrollLeftPx(0);
        state->flush();
        QCoreApplication::processEvents();
        auto* canvas = item("rulerCanvas");
        QVERIFY(canvas);
        const auto timeTicks = canvas->property("ticks").toList();
        QVERIFY(!timeTicks.isEmpty());
        state->setRulerMode("bars");
        const nt::tempo::Tempo tempo = customTempo ? nt::tempo::Tempo{140, 123, 3, 4} : nt::tempo::Tempo{};
        for (const double scroll : {0.0, 37.0}) {
            state->setScrollLeftPx(scroll);
            state->flush();
            QCoreApplication::processEvents();
            const double from = state->scrollLeftPx() * zoom;
            const auto expected = nt::tempo::computeBarRulerTicks(tempo, zoom, from, from + canvas->width() * zoom);
            const auto actual = canvas->property("ticks").toList();
            QVERIFY(!expected.empty());
            QCOMPARE(actual.size(), qsizetype(expected.size()));
            for (qsizetype i = 0; i < actual.size(); ++i) {
                const auto tick = actual[i].toMap();
                const auto& oracle = expected[std::size_t(i)];
                QCOMPARE(tick.value("timeMs").toDouble(), oracle.timeMs);
                QCOMPARE(tick.value("major").toBool(), oracle.kind == "bar");
                QCOMPARE(tick.value("label").toString(), QString::fromStdString(oracle.label.value_or("")));
            }
            if (scroll == 0) {
                QCOMPARE(actual.first().toMap().value("label").toString(), QString("1"));
            }
            canvas->setProperty("fps", 59.94);
            QCOMPARE(canvas->property("ticks").toList(), actual);
            canvas->setProperty("fps", 30.0);
        }
        state->setScrollLeftPx(0);
        state->flush();
        state->setRulerMode("time");
        QCOMPARE(canvas->property("ticks").toList(), timeTicks);
        QCOMPARE(model.undoStack()->count(), 0);
    }

    void gridSelection() {
        QTRY_VERIFY_WITH_TIMEOUT(item("gridDivisionSelect"), 1000);
        auto* select = item("gridDivisionSelect");
        auto* bars = item("barsToggle");
        QVERIFY(bars);
        QVERIFY(select->mapToScene({0, 0}).x() >= bars->mapToScene({bars->width(), 0}).x());
        QCOMPARE(select->implicitWidth(), 72.0);
        QCOMPARE(select->implicitHeight(), 28.0);
        QCOMPARE(select->property("label").toString(), QString("Grid division"));
        QCOMPARE(select->property("displayText").toString(), QString("Beat"));
        const auto raw = select->property("options");
        const auto options = raw.metaType() == QMetaType::fromType<QJSValue>()
            ? raw.value<QJSValue>().toVariant().toList() : raw.toList();
        const QStringList values{"bar", "beat", "1/4", "1/8", "1/16", "1/32", "1/8T", "1/16T"};
        const QStringList labels{"Bar", "Beat", "1/4", "1/8", "1/16", "1/32", "1/8T", "1/16T"};
        QCOMPARE(options.size(), values.size());
        for (qsizetype i = 0; i < values.size(); ++i) {
            QCOMPARE(options[i].toMap().value("value").toString(), values[i]);
            QCOMPARE(options[i].toMap().value("label").toString(), labels[i]);
        }
        // Open the real popup, then choose with its keyboard navigation.
        click("gridDivisionSelect");
        QTest::keyClick(view.get(), Qt::Key_Down);
        QTest::keyClick(view.get(), Qt::Key_Return);
        QTRY_COMPARE(gestures()->viewState()->gridDivision(), QString("1/4"));
        QCOMPARE(select->property("displayText").toString(), QString("1/4"));
        gestures()->viewState()->setGridDivision("1/16T");
        QTRY_COMPARE(select->property("displayText").toString(), QString("1/16T"));
        QCOMPARE(model.undoStack()->count(), 0);
    }

    void snapDrag_data() {
        QTest::addColumn<bool>("midi");
        QTest::addColumn<bool>("enabled");
        QTest::addColumn<QString>("division");
        QTest::addColumn<bool>("barTarget");
        QTest::addColumn<bool>("barsMode");
        QTest::addColumn<bool>("snapped");
        QTest::newRow("midi-beat") << true << true << QString("beat") << false << false << true;
        QTest::newRow("snap-off") << true << false << QString("beat") << false << false << false;
        QTest::newRow("midi-bar") << true << true << QString("bar") << true << false << true;
        QTest::newRow("bar-excludes-beat") << true << true << QString("bar") << false << false << false;
        QTest::newRow("video-time") << false << true << QString("beat") << false << false << false;
        QTest::newRow("video-bars") << false << true << QString("beat") << false << true << true;
    }
    void snapDrag() {
        QFETCH(bool, midi);
        QFETCH(bool, enabled);
        QFETCH(QString, division);
        QFETCH(bool, barTarget);
        QFETCH(bool, barsMode);
        QFETCH(bool, snapped);
        loadDocument(midi, true);
        auto* state = gestures()->viewState();
        state->setGridDivision(division);
        state->setRulerMode(barsMode ? "bars" : "time");
        if (!enabled) { click("snapToggle"); }
        QCOMPARE(gestures()->snapEnabled(), enabled);
        const auto before = doc();
        clock.seek(8000);
        QTRY_VERIFY(item("clip-c"));
        const auto from = center(item("clip-c"));
        // Web tempo: offset 123 + n * 60000/140, with three beats per bar.
        const double line = 123 + (barTarget ? 6 : 5) * (60000.0 / 140);
        const int pixels = qRound((line - 1000) / state->msPerPx()) + 3;
        const double rawStart = 1000 + pixels * state->msPerPx();
        const auto to = from + QPoint(pixels, 0);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), to, 20);
        QCOMPARE(model.undoStack()->count(), 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCoreApplication::processEvents();
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(clip("c").value("durationMs").toDouble(), 501.0);
        const double actual = clip("c").value("startMs").toDouble();
        QCOMPARE(actual, snapped ? line : rawStart);
        click("undoButton");
        QCOMPARE(doc(), before);
    }
};

int main(int argc, char** argv) {
    QTemporaryDir settings;
    if (!settings.isValid()) {
        return 1;
    }
    qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(settings.filePath("settings.ini")));
    QGuiApplication app(argc, argv);
    TempoWiringTests test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_tempowiring.moc"
