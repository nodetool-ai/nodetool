#include "TempoGrid.h"
#include "TempoGridQml.h"
#include "TempoJson.h"
#include <QFile>
#include <QGuiApplication>
#include <QJSValue>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QSignalSpy>
#include <QtTest>
#include <iostream>
#include <cmath>
#include <limits>
#include <memory>
#include <stdexcept>

namespace {
double oracleNumber(const QJsonValue& value) {
    const auto special = value.toObject()["$number"].toString();
    if (special == "Infinity") {
        return std::numeric_limits<double>::infinity();
    }
    if (special == "-Infinity") {
        return -std::numeric_limits<double>::infinity();
    }
    return value.toDouble(std::numeric_limits<double>::quiet_NaN());
}
std::optional<double> optionalNumber(const QJsonObject& object, const QString& key) {
    if (!object.contains(key)) {
        return std::nullopt;
    }
    return oracleNumber(object[key]);
}
QJsonObject bounds(const nt::tempo::SnapClipBounds& value) {
    return {{"startMs", value.startMs}, {"endMs", value.endMs}, {"durationMs", value.durationMs}};
}
std::vector<double> oracleNumbers(const QJsonValue& value) {
    std::vector<double> result;
    for (const auto& item : value.toArray()) {
        result.push_back(oracleNumber(item));
    }
    return result;
}
QJsonValue oracleRequest(const QString& fn, const QJsonArray& args) {
    using namespace nt::tempo;
    using namespace nt::tempo::json;
    const auto a = args.at(0).toObject();
    if (fn == "buildBeatGrid") {
        BeatGridSpec spec;
        if (a.contains("onsetsMs")) {
            spec.onsetsMs = oracleNumbers(a["onsetsMs"]);
        }
        spec.bpm = optionalNumber(a, "bpm");
        spec.offsetMs = optionalNumber(a, "offsetMs");
        spec.count = optionalNumber(a, "count");
        auto result = buildBeatGrid(spec);
        if (!result.ok()) {
            return QJsonObject{{"error", QString::fromStdString(result.error)}};
        }
        return array(result.times);
    }
    if (fn == "beatCountToCover") {
        return beatCountToCover(oracleNumber(args.at(0)), oracleNumber(args.at(1)), oracleNumber(args.at(2)));
    }
    if (fn == "nearestGridTime") {
        auto result = nearestGridTime(oracleNumber(args.at(0)), oracleNumbers(args.at(1)), oracleNumber(args.at(2)));
        return result ? QJsonValue(*result) : QJsonValue(QJsonValue::Null);
    }
    if (fn == "snapClipsToGrid") {
        std::vector<SnapClipInput> clips;
        for (const auto& raw : args.at(0).toArray()) {
            auto c = raw.toObject();
            clips.push_back(
                {c["id"].toString().toStdString(), oracleNumber(c["startMs"]), oracleNumber(c["durationMs"])});
        }
        auto rawOptions = args.at(2).toObject();
        SnapOptions opts;
        if (rawOptions.contains("toleranceMs")) {
            opts.toleranceMs = oracleNumber(rawOptions["toleranceMs"]);
        }
        if (rawOptions.contains("mode")) {
            opts.mode = rawOptions["mode"].toString().toStdString();
        }
        if (rawOptions.contains("action")) {
            opts.action = rawOptions["action"].toString().toStdString();
        }
        auto result = snapClipsToGrid(clips, oracleNumbers(args.at(1)), opts);
        QJsonArray entries;
        for (const auto& c : result.clips) {
            QJsonObject item{{"clipId", QString::fromStdString(c.clipId)},
                             {"snapped", c.snapped},
                             {"before", bounds(c.before)},
                             {"after", bounds(c.after)},
                             {"delta", QJsonObject{{"startMs", c.deltaStartMs}, {"endMs", c.deltaEndMs}}}};
            if (c.reason) {
                item["reason"] = QString::fromStdString(*c.reason);
            }
            entries.append(item);
        }
        return QJsonObject{{"toleranceMs", result.toleranceMs},
                           {"mode", QString::fromStdString(result.mode)},
                           {"action", QString::fromStdString(result.action)},
                           {"snapped", result.snapped},
                           {"skipped", result.skipped},
                           {"clips", entries}};
    }
    if (fn == "beatGridPhaseMs") {
        return beatGridPhaseMs(oracleNumbers(args.at(0)), oracleNumber(args.at(1)));
    }
    if (fn == "planClipBeats") {
        auto result =
            planClipBeats({oracleNumber(a["startMs"]), oracleNumber(a["durationMs"]), oracleNumber(a["rate"])},
                          oracleNumbers(args.at(1)), oracleNumber(args.at(2)), oracleNumber(args.at(3)));
        if (!result) {
            return QJsonValue(QJsonValue::Null);
        }
        return QJsonObject{
            {"bpm", result->bpm}, {"offsetMs", result->offsetMs}, {"barTimesMs", array(result->barTimesMs)}};
    }
    if (fn == "resolveTempo") {
        return resolveTempo(a);
    }
    if (fn == "beatDurationMs") {
        return beatDurationMs(tempo(a));
    }
    if (fn == "barDurationMs") {
        return barDurationMs(tempo(a));
    }
    if (fn == "barsBeatsAt") {
        auto result = barsBeatsAt(oracleNumber(args.at(0)), tempo(args.at(1).toObject()));
        return QJsonObject{{"bar", result.bar}, {"beat", result.beat}, {"tick", result.tick}};
    }
    if (fn == "divisionToTicks") {
        return divisionToTicks(args.at(0).toString().toStdString());
    }
    if (fn == "ticksToMs") {
        return ticksToMs(oracleNumber(args.at(0)), oracleNumber(args.at(1)));
    }
    if (fn == "tempoGridIntervalMs") {
        return tempoGridIntervalMs(tempo(a), args.at(1).toString().toStdString());
    }
    if (fn == "tempoGridMs") {
        return array(tempoGridMs(grid(a)));
    }
    if (fn == "visibleTempoGrid") {
        return array(visibleTempoGrid(grid(a)));
    }
    if (fn == "computeBarRulerTicks") {
        return ticks(computeBarRulerTicks(tempo(a["tempo"].toObject()), oracleNumber(a["msPerPx"]),
                                          oracleNumber(a["fromMs"]), oracleNumber(a["toMs"])));
    }
    if (fn == "GRID_DIVISION_OPTIONS") {
        return options();
    }
    if (fn == "gridSnapApplies") {
        return gridSnapApplies(snapGrid(a));
    }
    if (fn == "mergeSnapCandidates") {
        return array(mergeSnapCandidates(oracleNumbers(args.at(0)), snapGrid(args.at(1).toObject())));
    }
    if (fn == "snapGridSpecFrom") {
        return nt::tempo::json::snapGridSpecFrom(a, args.at(1).toObject());
    }
    throw std::invalid_argument("Unknown tempo function: " + fn.toStdString());
}
} // namespace

class TempoTests : public QObject {
    Q_OBJECT
  private slots:
    void beatGridRoundsBeforeDeduplication() {
        nt::tempo::BeatGridSpec spec;
        spec.onsetsMs = {{500.5, 0.5, 500.49, 500.5}};
        const auto result = nt::tempo::buildBeatGrid(spec);
        QVERIFY(result.ok());
        QCOMPARE(result.times, (std::vector<double>{1, 500, 501}));
        QVERIFY(!nt::tempo::buildBeatGrid({}).ok());
        spec.onsetsMs = {{-0.0}};
        const auto zeros = nt::tempo::buildBeatGrid(spec);
        QCOMPARE(zeros.times.size(), std::size_t(1));
        QVERIFY(!std::signbit(zeros.times.front()));
    }
    void nearestTieChoosesEarlierBeat() {
        const std::vector<double> grid{100, 0};
        QCOMPARE(nt::tempo::nearestGridTime(50, grid, 50), std::optional<double>(0));
    }
    void barsAndVisibleGrid() {
        const auto ticks = nt::tempo::computeBarRulerTicks({}, 10, 0, 2000);
        QCOMPARE(ticks.size(), std::size_t(5));
        QCOMPARE(ticks.front().label, std::optional<std::string>("1"));
        QCOMPARE(ticks[1].kind, std::string("beat"));
        QCOMPARE(nt::tempo::visibleTempoGrid({{}, "1/32", 0, 1e9}).size(), std::size_t(2048));
    }
    void clipSnappingAndBeatPlans() {
        const std::vector<nt::tempo::SnapClipInput> clips{{"cut", 10, 480}, {"aligned", 500, 500}};
        const std::vector<double> grid{0, 500, 1000};
        auto snapped = nt::tempo::snapClipsToGrid(clips, grid, {60, "both", "trim"});
        QCOMPARE(snapped.snapped, 1);
        QCOMPARE(snapped.skipped, 1);
        QCOMPARE(snapped.clips.front().after.durationMs, 500.0);
        QCOMPARE(snapped.clips.back().reason, std::optional<std::string>("already on the grid"));
        QCOMPARE(nt::tempo::beatCountToCover(120, 0, 1000), 4.0);
        const std::vector<double> onsets{50, 550, 1050};
        QCOMPARE(nt::tempo::beatGridPhaseMs(onsets, 120), 50.0);
        const auto plan = nt::tempo::planClipBeats({0, 5000, 1}, onsets, 120, 4);
        QVERIFY(plan);
        QCOMPARE(plan->barTimesMs, (std::vector<double>{50, 2050, 4050}));
        QCOMPARE(nt::tempo::beatDurationMs({120, 0, 6, 8}), 250.0);
        QCOMPARE(nt::tempo::barDurationMs({120, 0, 6, 8}), 1500.0);
        const auto location = nt::tempo::barsBeatsAt(-1, {});
        QCOMPARE(location.bar, 0.0);
        QCOMPARE(location.beat, 4.0);
        QCOMPARE(location.tick, 958.0);
    }
    void qmlTypeExposesPureFunctions() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQml
import NodeTool.Timeline
QtObject {
 property var options: TempoGrid.divisionOptions
 property var ticks: TempoGrid.barRulerTicks({}, 10, 0, 2000)
 property var rawTicks: TempoGrid.barRulerTicks({bpm:120,offsetMs:0,timeSignature:{beatsPerBar:4,beatUnit:4}}, 10, 0, 2000)
 property var docTicks: TempoGrid.barRulerTicks({tempo:{bpm:120,offsetMs:0,timeSignature:{beatsPerBar:4,beatUnit:4}}}, 10, 0, 2000)
 property var spec: TempoGrid.snapGridSpecFrom({tracks:[{type:"midi"}]}, {snapEnabled:true,rulerMode:"time",gridDivision:"bar",msPerPx:10,scrollLeftPx:2,lanesViewportWidthPx:0})
 property var lines: TempoGrid.visibleTempoGrid({tempo: {bpm:120, offsetMs:0, timeSignature:{beatsPerBar:4,beatUnit:4}}, division:"beat", fromMs:0, toMs:1000})
 property bool applies: TempoGrid.gridSnapApplies({snapEnabled:true, rulerMode:"bars"})
 property var merged: TempoGrid.mergeSnapCandidates([0,250], {tempo:{bpm:120,offsetMs:0,timeSignature:{beatsPerBar:4,beatUnit:4}},division:"beat",fromMs:0,toMs:1000,snapEnabled:true,rulerMode:"bars"})
})",
                          QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        const auto list = [](const QVariant& value) {
            return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant().toList()
                                                                       : value.toList();
        };
        QCOMPARE(list(object->property("options")).size(), 8);
        QCOMPARE(list(object->property("ticks")).size(), 5);
        QCOMPARE(list(object->property("rawTicks")), list(object->property("ticks")));
        QCOMPARE(list(object->property("docTicks")), list(object->property("ticks")));
        const auto rawSpec = object->property("spec");
        const auto spec = rawSpec.metaType() == QMetaType::fromType<QJSValue>()
                              ? rawSpec.value<QJSValue>().toVariant().toMap()
                              : rawSpec.toMap();
        QCOMPARE(spec["fromMs"].toDouble(), 20.0);
        QCOMPARE(spec["toMs"].toDouble(), 12020.0);
        QVERIFY(spec["hasMidiTrack"].toBool());
        QCOMPARE(list(object->property("lines")), (QVariantList{0.0, 500.0, 1000.0}));
        QVERIFY(object->property("applies").toBool());
        QCOMPARE(list(object->property("merged")), (QVariantList{0.0, 250.0, 500.0, 1000.0}));
    }
    void qmlReportsInvalidTempo() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQml
import NodeTool.Timeline
QtObject {
 property string validationError: {
   try {
     TempoGrid.barRulerTicks({bpm:0, offsetMs:0, timeSignature:{beatsPerBar:4,beatUnit:4}}, 10, 0, 1000)
     return "no error"
   } catch (error) { return error.message }
 }
})",
                          QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        QCOMPARE(object->property("validationError").toString(), QString("bpm must be a positive number; got 0."));
    }
    void gridSelectIsControlledAndEmitsDivision() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "GridDivisionSelect");
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        QCOMPARE(item->implicitWidth(), 72.0);
        QCOMPARE(item->implicitHeight(), 28.0);
        QCOMPARE(object->property("label").toString(), QString("Grid division"));
        QCOMPARE(object->property("count").toInt(), 8);
        QCOMPARE(object->property("displayText").toString(), QString("Beat"));
        object->setProperty("value", "1/16T");
        QCOMPARE(object->property("currentIndex").toInt(), 7);
        QCOMPARE(object->property("displayText").toString(), QString("1/16T"));
        QSignalSpy spy(object.get(), SIGNAL(change(QString)));
        item->forceActiveFocus();
        QKeyEvent up(QEvent::KeyPress, Qt::Key_Up, Qt::NoModifier);
        QCoreApplication::sendEvent(item, &up);
        QKeyEvent release(QEvent::KeyRelease, Qt::Key_Up, Qt::NoModifier);
        QCoreApplication::sendEvent(item, &release);
        QCOMPARE(spy.size(), 1);
        QCOMPARE(spy.front().front().toString(), QString("1/8T"));
        QCOMPARE(object->property("value").toString(), QString("1/16T"));
        object->setProperty("value", "bar");
        QCOMPARE(object->property("displayText").toString(), QString("Bar"));
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (app.arguments().contains("--oracle")) {
        QFile input;
        if (!input.open(stdin, QIODevice::ReadOnly)) {
            return 2;
        }
        QJsonParseError error;
        const auto document = QJsonDocument::fromJson(input.readAll(), &error);
        if (error.error != QJsonParseError::NoError || !document.isArray()) {
            std::cerr << "Expected a JSON array of tempo requests\n";
            return 2;
        }
        QJsonArray results;
        for (const auto& value : document.array()) {
            const auto request = value.toObject();
            try {
                results.append(oracleRequest(request["fn"].toString(), request["args"].toArray()));
            } catch (const std::exception& failure) {
                results.append(QJsonObject{{"error", QString::fromUtf8(failure.what())}});
            }
        }
        QFile output;
        if (!output.open(stdout, QIODevice::WriteOnly)) {
            return 2;
        }
        output.write(QJsonDocument(results).toJson(QJsonDocument::Compact));
        return 0;
    }
    TempoTests tests;
    return QTest::qExec(&tests, argc, argv);
}
#include "tst_tempo.moc"
