// Step sequencer operation contracts (SQ49-SQ55): strict argument checks like the
// TS zod schemas, numeric safety, and the ops native lacked (review F2-F15, F25).

#include "midi/PatternExpand.h"
#include "midi/PatternOps.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QtTest>
#include <future>

using namespace nt::midi;

namespace {

QJsonObject step(bool on) { return on ? QJsonObject{{"on", true}} : QJsonObject{}; }

QJsonArray steps(const QString& grid) {
    QJsonArray out;
    for (QChar c : grid) out.append(step(c == u'x'));
    return out;
}

QJsonObject document(bool locked = false) {
    const auto pattern = normalizePattern(QJsonObject{
        {"lengthSteps", 8},
        {"rows", QJsonArray{
            QJsonObject{{"id", "r1"}, {"name", "Kick"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 36}}}, {"steps", steps("x...x...")}},
            QJsonObject{{"id", "r2"}, {"name", "Lead"}, {"assignment", QJsonObject{{"type", "melodic"}, {"pitch", 60}}}, {"steps", steps("x.x.....")}},
            QJsonObject{{"id", "r3"}, {"name", "Cutoff"}, {"assignment", QJsonObject{{"type", "automation"}, {"target", QJsonObject{{"kind", "cc"}, {"cc", 74}}}}}, {"steps", steps("........")}}}}});
    return QJsonObject{
        {"tempo", QJsonObject{{"bpm", 120}}},
        {"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"name", "Drums"}, {"type", "midi"}, {"index", 0}, {"locked", locked}}}},
        {"clips", QJsonArray{
            QJsonObject{{"id", "c"}, {"trackId", "t"}, {"name", "Beat"}, {"mediaType", "midi"}, {"startMs", 0}, {"durationMs", 2000}, {"pattern", pattern}},
            QJsonObject{{"id", "d"}, {"trackId", "t"}, {"name", "Fill"}, {"mediaType", "midi"}, {"startMs", 2000}, {"durationMs", 2000}, {"pattern", pattern}}}}};
}

QJsonObject patternOf(const QJsonObject& doc, const QString& clipId = "c") {
    for (const auto& v : doc.value("clips").toArray()) {
        if (v.toObject().value("id").toString() == clipId) return v.toObject().value("pattern").toObject();
    }
    return {};
}

QJsonObject rowOf(const QJsonObject& doc, const QString& rowId, const QString& clipId = "c") {
    for (const auto& v : patternOf(doc, clipId).value("rows").toArray()) {
        if (v.toObject().value("id").toString() == rowId) return v.toObject();
    }
    return {};
}

StepPatternOpOutcome run(const QString& op, QJsonObject args, const QJsonObject& doc = document()) {
    if (!args.contains("clipId") && stepPatternOpTakes(op, "clipId") && !args.contains("trackId")) args.insert("clipId", "c");
    return runStepPatternOp(doc, op, args);
}

}  // namespace

class TestPatternOps : public QObject {
    Q_OBJECT

private slots:
    void rejectsArgumentsTheContractForbids_data() {
        QTest::addColumn<QString>("op");
        QTest::addColumn<QJsonObject>("args");
        // F2: seed, density and by must be whole or in range before any cast.
        QTest::newRow("F2-seed-huge") << "set_pattern_seed" << QJsonObject{{"seed", 1e20}};
        QTest::newRow("F2-seed-negative") << "set_pattern_seed" << QJsonObject{{"seed", -1}};
        QTest::newRow("F2-seed-fraction") << "randomize_pattern" << QJsonObject{{"mode", "onOff"}, {"seed", 1.5}};
        QTest::newRow("F2-density-negative") << "randomize_pattern" << QJsonObject{{"mode", "onOff"}, {"density", -10}};
        QTest::newRow("F2-by-fraction") << "rotate_pattern" << QJsonObject{{"by", 1.5}};
        // F4: TS nudge_pattern_values has no `steps`.
        QTest::newRow("F4-nudge-steps") << "nudge_pattern_values" << QJsonObject{{"row", "r1"}, {"mode", "velocity"}, {"delta", 1}, {"steps", QJsonArray{1}}};
        // F7: toIndex must be a whole number in range.
        QTest::newRow("F7-toIndex-fraction") << "move_pattern_row" << QJsonObject{{"row", "r3"}, {"toIndex", 1.5}};
        QTest::newRow("F7-toIndex-huge") << "move_pattern_row" << QJsonObject{{"row", "r3"}, {"toIndex", 1e20}};
        // F8: set_pattern_row checks every field.
        QTest::newRow("F8-rate") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"stepRate", "1/7"}};
        QTest::newRow("F8-automationMode") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"automationMode", "bogus"}};
        QTest::newRow("F8-pitch") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 999}}}};
        QTest::newRow("F8-subrows") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"subrows", QJsonArray{"bogus", 42}}};
        QTest::newRow("F8-color") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"color", 7}};
        QTest::newRow("F8-mute") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"mute", "yes"}};
        QTest::newRow("F8-name") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"name", 5}};
        QTest::newRow("F8-midiChannel") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"midiChannel", 99}};
        QTest::newRow("F8-lengthSteps") << "set_pattern_row" << QJsonObject{{"row", "r1"}, {"lengthSteps", "4"}};
        // F9: randomize_pattern rows, density and seed types.
        QTest::newRow("F9-rows-string") << "randomize_pattern" << QJsonObject{{"mode", "onOff"}, {"rows", "Kick"}};
        QTest::newRow("F9-density-string") << "randomize_pattern" << QJsonObject{{"mode", "onOff"}, {"density", "50"}};
        QTest::newRow("F9-density-high") << "randomize_pattern" << QJsonObject{{"mode", "onOff"}, {"density", 250}};
        QTest::newRow("F9-seed-string") << "randomize_pattern" << QJsonObject{{"mode", "onOff"}, {"seed", "42"}};
        // F10: misspelled arguments fail instead of falling back to defaults.
        QTest::newRow("F10-step") << "set_steps" << QJsonObject{{"row", "r1"}, {"step", "1"}, {"values", QJsonObject{{"on", true}}}};
        QTest::newRow("F10-direction") << "rotate_pattern" << QJsonObject{{"by", 1}, {"direction", 1}};
        // F14: list filters are strings.
        QTest::newRow("F14-query") << "list_step_patterns" << QJsonObject{{"query", 5}};
    }
    void rejectsArgumentsTheContractForbids() {
        QFETCH(QString, op);
        QFETCH(QJsonObject, args);
        const auto out = run(op, args);
        QVERIFY2(!out.ok, qPrintable(op + " accepted invalid arguments"));
    }

    void timelineIdIsAccepted() {
        QVERIFY(run("get_pattern", {{"timeline_id", "tl"}}).ok);
    }

    void reviewF2HugeAmountsStayDefined() {
        // TS reduces `by` modulo the row length: 1e20 % 8 == 0.
        auto out = run("rotate_pattern", {{"row", "r1"}, {"by", 1e20}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(rowOf(out.nextDocument, "r1").value("steps"), rowOf(document(), "r1").value("steps"));
        out = run("nudge_pattern_values", {{"row", "r1"}, {"mode", "velocity"}, {"delta", 1e20}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(normalizeStep(rowOf(out.nextDocument, "r1").value("steps").toArray().at(0).toObject()).value("velocity").toInt(), 127);
        out = run("nudge_pattern_values", {{"row", "r1"}, {"mode", "loop"}, {"delta", -1e20}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(rowOf(out.nextDocument, "r1").value("loopEnd").toInt(), 1);
    }

    void reviewF5ToFixedRoundsTiesAwayFromZero() {
        // 0.03125 is exact in binary: JS (0.03125).toFixed(4) is "0.0313".
        QCOMPARE(jsToFixed(0.03125, 4), 0.0313);
        QCOMPARE(jsToFixed(-0.03125, 4), -0.0313);
        QCOMPARE(jsToFixed(1.23456789, 4), 1.2346);
        QCOMPARE(jsToFixed(0.99995, 4), 1.0);  // 0.99995 is just below the tie in binary
    }

    void reviewF9EmptyRowsRandomizesEveryRowLikeTs() {
        const auto out = run("randomize_pattern", {{"mode", "velocity"}, {"rows", QJsonArray{}}, {"seed", 7}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(rowOf(out.nextDocument, "r1") != rowOf(document(), "r1"));
        QVERIFY(rowOf(out.nextDocument, "r2") != rowOf(document(), "r2"));
    }

    void reviewF10SchemasAreStrict() {
        const auto tools = stepPatternAssistantTools();
        QCOMPARE(tools.size(), 34);
        for (const auto& tool : tools) {
            const auto params = tool.toMap().value("parameters").toMap();
            QVERIFY2(params.value("additionalProperties").toBool() == false, qPrintable(tool.toMap().value("name").toString()));
            QVERIFY(params.value("required").toStringList().contains("timeline_id"));
        }
    }

    void reviewF14ListMatchesTsResponse() {
        auto out = run("list_step_patterns", {});
        QVERIFY2(out.ok, qPrintable(out.error));
        const auto entries = out.result.value("entries").toArray();
        QVERIFY(!entries.isEmpty());
        QVERIFY(out.result.value("folders").isArray());
        QVERIFY(!out.result.contains("patterns"));
        bool preset = false;
        for (const auto& e : entries) preset = preset || e.toObject().value("instrumentPreset").isString();
        QVERIFY(preset);
        const auto id = entries.first().toObject().value("id").toString();
        out = run("list_step_patterns", {{"query", id}});
        QVERIFY(!out.result.value("entries").toArray().isEmpty());
        out = run("list_step_patterns", {{"folder", "Drums"}});
        QVERIFY(out.result.value("entries").toArray().isEmpty());
    }

    void reviewF15CopyStepsAndCut() {
        auto out = run("copy_steps", {{"row", "r1"}, {"steps", "1"}, {"toRow", "r1"}, {"toStep", 3}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(rowOf(out.nextDocument, "r1").value("steps").toArray().at(2).toObject().value("on").toBool());
        out = run("copy_steps", {{"row", "r1"}, {"steps", "1"}, {"toRow", "r2"}, {"toStep", 2}, {"cut", true}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(!rowOf(out.nextDocument, "r1").value("steps").toArray().at(0).toObject().value("on").toBool());
        QVERIFY(rowOf(out.nextDocument, "r2").value("steps").toArray().at(1).toObject().value("on").toBool());
        QVERIFY(!run("copy_steps", {{"row", "r1"}, {"steps", "1"}, {"toRow", "r3"}, {"toStep", 1}}).ok);
        out = run("copy_steps", {{"row", "r1"}, {"steps", "1"}, {"toRow", "r1"}, {"toStep", 8}, {"toClipId", "d"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(rowOf(out.nextDocument, "r1", "d").value("steps").toArray().at(7).toObject().value("on").toBool());
    }

    void reviewF15RepeatStep() {
        auto out = run("repeat_step", {{"row", "r1"}, {"step", 1}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(rowOf(out.nextDocument, "r1").value("steps").toArray().at(1).toObject().value("on").toBool());
        QCOMPARE(out.result.value("repeatedToStep").toInt(), 2);
        QVERIFY(!run("repeat_step", {{"row", "r1"}, {"step", 8}}).ok);
    }

    void reviewF15TransposePattern() {
        auto out = run("transpose_pattern", {{"row", "r2"}, {"semitones", 2}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(rowOf(out.nextDocument, "r2").value("assignment").toObject().value("pitch").toInt(), 62);
        out = run("transpose_pattern", {{"row", "r2"}, {"semitones", 14}, {"steps", "1"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        const auto s = rowOf(out.nextDocument, "r2").value("steps").toArray().at(0).toObject();
        QCOMPARE(s.value("note").toInt(), 2);
        QCOMPARE(s.value("octave").toInt(), 4);
        QCOMPARE(rowOf(run("transpose_pattern", {{"semitones", 5}}).nextDocument, "r3"), rowOf(document(), "r3"));
    }

    void reviewF15CopyPatternRow() {
        auto out = run("copy_pattern_row", {{"row", "r1"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        const auto rows = patternOf(out.nextDocument).value("rows").toArray();
        QCOMPARE(rows.size(), 4);
        QCOMPARE(rows.at(1).toObject().value("steps"), rowOf(document(), "r1").value("steps"));
        out = run("copy_pattern_row", {{"row", "r1"}, {"nextAssignment", true}});
        QCOMPARE(patternOf(out.nextDocument).value("rows").toArray().at(1).toObject().value("assignment").toObject().value("pitch").toInt(), 37);
        out = run("copy_pattern_row", {{"row", "r2"}, {"toRow", "r1"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(rowOf(out.nextDocument, "r1").value("assignment").toObject().value("type").toString(), QString("melodic"));
        QCOMPARE(rowOf(out.nextDocument, "r1").value("name").toString(), QString("Kick"));
        QVERIFY(!run("copy_pattern_row", {{"row", "r1"}, {"toRow", "r3"}}).ok);
    }

    void reviewF15AndF25RowSortPersists() {
        auto out = run("set_pattern_row_sort", {{"rowSort", "typeAndNoteDesc"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(patternOf(out.nextDocument).value("rowSort").toString(), QString("typeAndNoteDesc"));
        out = run("add_pattern_rows", {{"rows", QJsonArray{QJsonObject{{"assignment", QJsonObject{{"type", "note"}, {"pitch", 40}}}}}}}, out.nextDocument);
        QVERIFY2(out.ok, qPrintable(out.error));
        // Descending also reverses the type order: automation, melodic, then notes high to low.
        QCOMPARE(patternOf(out.nextDocument).value("rows").toArray().at(2).toObject().value("assignment").toObject().value("pitch").toInt(), 40);
        out = run("set_pattern_row_sort", {{"rowSort", "none"}}, out.nextDocument);
        QVERIFY(!patternOf(out.nextDocument).contains("rowSort"));
    }

    void reviewF15CreatePatternRegion() {
        auto out = run("create_pattern_region", {{"trackId", "t"}, {"atBar", 3}, {"bars", 2}, {"name", "Groove"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        const auto clips = out.nextDocument.value("clips").toArray();
        QCOMPARE(clips.size(), 3);
        const auto clip = clips.last().toObject();
        QCOMPARE(clip.value("startMs").toDouble(), 4000.0);
        QCOMPARE(clip.value("durationMs").toDouble(), 4000.0);
        QCOMPARE(clip.value("pattern").toObject().value("name").toString(), QString("Groove"));
        QVERIFY(validateStepPattern(clip.value("pattern").toObject()).isEmpty());
        out = run("create_pattern_region", {{"trackId", "t"}, {"text", "Kick: x...x..."}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(!run("create_pattern_region", {{"trackId", "t"}}, document(true)).ok);
    }

    void reviewF15SeparatePatternRows() {
        const auto out = run("separate_pattern_rows", {});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(out.nextDocument.value("tracks").toArray().size(), 4);
        QCOMPARE(out.nextDocument.value("clips").toArray().size(), 4);
        for (int i = 0; i < 4; ++i) QCOMPARE(out.nextDocument.value("tracks").toArray().at(i).toObject().value("index").toInt(), i);
        QCOMPARE(out.result.value("removedClipId").toString(), QString("c"));
    }

    void reviewF15TrackTemplateAndSave() {
        auto out = run("set_track_step_template", {{"trackId", "t"}, {"fromClipId", "c"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        const auto tpl = out.nextDocument.value("tracks").toArray().at(0).toObject().value("stepTemplate").toObject();
        QCOMPARE(tpl.value("rows").toArray().size(), 3);
        QVERIFY(!tpl.value("rows").toArray().at(0).toObject().value("steps").toArray().at(0).toObject().value("on").toBool());
        out = run("create_pattern_region", {{"trackId", "t"}}, out.nextDocument);
        QCOMPARE(out.nextDocument.value("clips").toArray().last().toObject().value("pattern").toObject().value("rows").toArray().size(), 3);
        out = run("set_track_step_template", {{"trackId", "t"}, {"clear", true}}, out.nextDocument);
        QVERIFY(!out.nextDocument.value("tracks").toArray().at(0).toObject().contains("stepTemplate"));
        out = run("save_step_pattern", {{"name", "My Beat"}, {"kind", "template"}, {"folder", "Drums"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(!out.mutated);
        QCOMPARE(out.result.value("id").toString(), QString("user:template:my-beat"));
        QCOMPARE(out.result.value("folder").toString(), QString("Step Patterns/Templates/Drums"));
    }

    void reviewF15FoldersFailLikeTsWithoutLibrary() {
        const auto out = run("create_step_pattern_folder", {{"name", "Drums"}});
        QVERIFY(!out.ok);
        QVERIFY(out.error.contains("does not support folder operations"));
        QVERIFY(!run("move_step_pattern", {{"pattern", "x"}}).ok);
    }
    // S-F32: a new sound drops the row's old name, so the label follows the sound.
    void sf32ReassignDropsStaleName() {
        auto out = run("set_pattern_row", {{"row", "r1"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 50}}}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(!rowOf(out.nextDocument, "r1").contains("name"));
        out = run("set_pattern_row", {{"row", "r1"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 38}}}, {"name", "Snare"}});
        QCOMPARE(rowOf(out.nextDocument, "r1").value("name").toString(), QString("Snare"));
        out = run("set_pattern_row", {{"row", "r1"}, {"mute", true}});
        QCOMPARE(rowOf(out.nextDocument, "r1").value("name").toString(), QString("Kick"));
    }

    // SQ38: Learn (Add) adds a row for an unknown note once; Learn (Assign) sets the row's sound.
    void sq38LearnAddsRowOnce() {
        auto kitDoc = document();
        auto tracks = kitDoc["tracks"].toArray();
        auto track = tracks[0].toObject();
        const QJsonObject kit{{"type", "drum"}, {"pads", QJsonArray{QJsonObject{{"name", "Kick"}}, QJsonObject{{"name", "Rim"}}, QJsonObject{{"name", "Snare"}}}}};
        track["instrument"] = kit;
        tracks[0] = track;
        kitDoc["tracks"] = tracks;
        auto out = run("learn_pattern_row", {{"pitch", 38}}, kitDoc);
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(out.mutated);
        auto rows = patternOf(out.nextDocument).value("rows").toArray();
        QCOMPARE(rows.size(), 4);
        bool snare = false;
        for (const auto& r : rows) snare = snare || rowLabel(r.toObject(), kit) == u"Snare";
        QVERIFY(snare);
        out = run("learn_pattern_row", {{"pitch", 38}}, out.nextDocument);
        QVERIFY2(out.ok, qPrintable(out.error));
        QVERIFY(!out.mutated);
        QVERIFY(!out.result.value("added").toBool());
        out = run("learn_pattern_row", {{"controller", QJsonObject{{"kind", "cc"}, {"cc", 11}}}});
        QVERIFY(out.mutated);
        QCOMPARE(patternOf(out.nextDocument).value("rows").toArray().last().toObject().value("assignment").toObject().value("type").toString(), QString("automation"));
        out = run("learn_pattern_row", {{"mode", "assign"}, {"row", "r1"}, {"pitch", 40}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(rowOf(out.nextDocument, "r1").value("assignment").toObject().value("pitch").toInt(), 40);
        QVERIFY(!rowOf(out.nextDocument, "r1").contains("name"));
    }

    // SQ40: a three-note chord turns on three rows at one step and moves on once.
    void sq3bN2LearnSoundingPitch() {
        auto doc = document();
        doc["key"] = QJsonObject{{"tonic", 2}, {"mode", "major"}};
        auto clips = doc["clips"].toArray();
        auto clip = clips[0].toObject();
        auto pat = clip["pattern"].toObject();
        pat["key"] = QJsonObject{{"tonic", 0}, {"mode", "major"}};
        pat["pitchSource"] = "key";
        pat["noTranspose"] = false;
        clip["pattern"] = pat;
        clips[0] = clip;
        doc["clips"] = clips;
        const auto learned = run("learn_pattern_row", {{"pitch", 60}}, doc);
        QVERIFY2(learned.ok, qPrintable(learned.error));
        const auto learnedPattern = patternOf(learned.nextDocument);
        const auto rows = learnedPattern["rows"].toArray();
        const auto sounding = stepPitch(rows.last().toObject(), {{"on", true}},
                                       {{"pattern", learnedPattern}, {"key", doc["key"]}});
        QVERIFY(sounding.has_value());
        QCOMPARE(*sounding, 60);
        const auto repeated = run("learn_pattern_row", {{"pitch", 60}}, learned.nextDocument);
        QVERIFY(repeated.ok);
        QVERIFY(!repeated.result["added"].toBool());
        QCOMPARE(patternOf(repeated.nextDocument)["rows"].toArray().size(), rows.size());
        const auto assigned = run("learn_pattern_row", {{"mode", "assign"}, {"row", "r1"}, {"pitch", 60}}, doc);
        QVERIFY(assigned.ok);
        QCOMPARE(stepPitch(rowOf(assigned.nextDocument, "r1"), {{"on", true}},
                           {{"pattern", patternOf(assigned.nextDocument)}, {"key", doc["key"]}}).value_or(-1), 60);
        const auto recorded = run("step_record", {{"step", 2}, {"pitches", QJsonArray{60}}}, learned.nextDocument);
        QVERIFY(recorded.ok);
        QCOMPARE(patternOf(recorded.nextDocument)["rows"].toArray().size(), rows.size());
    }

    void sq3bN1RecordShortRow() {
        const auto shortened = run("set_pattern_row", {{"row", "r1"}, {"lengthSteps", 4}});
        QVERIFY(shortened.ok);
        const auto out = run("step_record", {{"step", 6}, {"pitches", QJsonArray{36}}, {"velocity", 91}}, shortened.nextDocument);
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(out.result.value("nextStep").toInt(), 7);
        const auto row = rowOf(out.nextDocument, "r1");
        QCOMPARE(row.value("lengthSteps").toInt(), 4);
        QCOMPARE(row.value("steps").toArray()[1].toObject().value("velocity").toInt(), 91);
    }

    void sq40StepRecordChord() {
        const auto out = run("step_record", {{"step", 4}, {"pitches", QJsonArray{36, 38, 42}}, {"velocity", 90}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(out.result.value("nextStep").toInt(), 5);
        const auto rows = patternOf(out.nextDocument).value("rows").toArray();
        QCOMPARE(rows.size(), 5);
        int on = 0;
        for (const auto& r : rows) {
            const auto s = r.toObject().value("steps").toArray().at(3).toObject();
            if (s.value("on").toBool()) {
                ++on;
                QCOMPARE(s.value("velocity").toInt(), 90);
            }
        }
        QCOMPARE(on, 3);
    }

    void cleanup() { setUserStepPatternLibraryRoot({}); }

    void sq3bS2UnsafeFolders_data() {
        QTest::addColumn<QString>("folder");
        QTest::newRow("drive") << QString("C:/escape");
        QTest::newRow("absolute") << QString("/escape");
        QTest::newRow("control") << QString("bad\nname");
    }
    void sq3bS2UnsafeFolders() {
        QFETCH(QString, folder);
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(!run("save_step_pattern", {{"name", "Beat"}, {"kind", "pattern"}, {"folder", folder}}).ok);
    }
    void sq3bS2Symlink() {
        QTemporaryDir dir, outside;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(QDir().mkpath(dir.filePath("Patterns")));
        QVERIFY(QFile::link(outside.path(), dir.filePath("Patterns/escape")));
        QVERIFY(!run("save_step_pattern", {{"name", "Beat"}, {"kind", "pattern"}, {"folder", "escape"}}).ok);
    }
    void sq3bS3EmojiIsVisible() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(run("save_step_pattern", {{"name", "🥁"}, {"kind", "pattern"}}).ok);
        QCOMPARE(run("list_step_patterns", {{"query", "🥁"}}).result["entries"].toArray().size(), 1);
    }
    void sq3bS3HiddenFolder() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(!run("create_step_pattern_folder", {{"name", ".drafts"}, {"kind", "pattern"}}).ok);
    }
    void sq3bS4FailedSavePreservesOriginal() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(run("save_step_pattern", {{"name", "Beat"}, {"kind", "pattern"}, {"folder", "Original"}}).ok);
        QFile blocked(dir.filePath("Patterns/blocked"));
        QVERIFY(blocked.open(QIODevice::WriteOnly));
        blocked.close();
        QVERIFY(!run("save_step_pattern", {{"name", "Beat"}, {"kind", "pattern"}, {"folder", "blocked"}}).ok);
        QVERIFY(QFile::exists(dir.filePath("Patterns/Original/beat.json")));
    }
    void sq3bS5CollisionPreservesBoth() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        const auto first = run("save_step_pattern", {{"name", "Beat"}, {"kind", "pattern"}, {"folder", "Grooves"}});
        const auto second = run("save_step_pattern", {{"name", "Beat"}, {"kind", "pattern"}, {"folder", "Fills"}});
        QVERIFY(first.ok && second.ok);
        QVERIFY(first.result["id"] != second.result["id"]);
        QVERIFY(QFile::exists(dir.filePath("Patterns/Grooves/beat.json")));
    }
    void sq3bS7LiteralFolder() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(run("create_step_pattern_folder", {{"name", "Step Patterns"}, {"kind", "pattern"}}).ok);
        QVERIFY(run("create_step_pattern_folder", {{"name", "Drums"}, {"parentFolder", "Step Patterns"}, {"kind", "pattern"}}).ok);
        QVERIFY(run("save_step_pattern", {{"name", "Beat"}, {"kind", "pattern"}, {"folder", "Step Patterns/Drums"}}).ok);
        QVERIFY(QFile::exists(dir.filePath("Patterns/Step Patterns/Drums/beat.json")));
    }
    void sq3bS7SingleName() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(!run("create_step_pattern_folder", {{"name", "Step Patterns/x/Drums"}, {"kind", "pattern"}}).ok);
    }
    void sq3bS10CaseRenameAndMove() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(run("save_step_pattern", {{"name", "Beat"}, {"kind", "pattern"}, {"folder", "drums"}}).ok);
        QVERIFY(run("rename_step_pattern_folder", {{"folder", "drums"}, {"newName", "Drums"}, {"kind", "pattern"}}).ok);
        QVERIFY(run("move_step_pattern", {{"pattern", "user:pattern:beat"}, {"folder", "drums"}}).ok);
    }
    void sq3bS11HiddenContents() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(QDir().mkpath(dir.filePath("Patterns/Drums")));
        QFile hidden(dir.filePath("Patterns/Drums/.DS_Store"));
        QVERIFY(hidden.open(QIODevice::WriteOnly));
        hidden.close();
        const auto out = run("delete_step_pattern_folder", {{"folder", "Drums"}, {"kind", "pattern"}});
        QVERIFY(!out.ok);
        QVERIFY(out.error.contains("not empty"));
    }
    void sq3bS15ShortKit() {
        auto doc = document();
        auto tracks = doc["tracks"].toArray();
        auto track = tracks[0].toObject();
        track["instrument"] = QJsonObject{{"type", "drum"}, {"pads", QJsonArray{QJsonObject{}, QJsonObject{}, QJsonObject{}}}};
        tracks[0] = track;
        doc["tracks"] = tracks;
        const auto out = run("learn_pattern_row", {{"pitch", 40}}, doc);
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(patternOf(out.nextDocument)["rows"].toArray().last().toObject()["assignment"].toObject()["type"].toString(), QString("note"));
    }
    void sq3bS15ScaleMatching() {
        auto doc = document();
        auto clips = doc["clips"].toArray();
        auto clip = clips[0].toObject();
        auto pat = clip["pattern"].toObject();
        pat["scaleQuantize"] = true;
        pat["scale"] = "major";
        pat["key"] = QJsonObject{{"tonic", 0}, {"mode", "major"}};
        auto rows = pat["rows"].toArray();
        auto r = rows[1].toObject();
        r["assignment"] = QJsonObject{{"type", "melodic"}, {"pitch", 61}};
        rows[1] = r;
        pat["rows"] = rows;
        clip["pattern"] = pat;
        clips[0] = clip;
        doc["clips"] = clips;
        const auto pitch = stepPitch(r, {{"on", true}}, {{"pattern", pat}});
        QVERIFY(pitch.has_value());
        const int learnedPitch = pitch.value_or(-1);
        QVERIFY(learnedPitch != 61);
        const auto out = run("learn_pattern_row", {{"pitch", learnedPitch}}, doc);
        QVERIFY(out.ok);
        QCOMPARE(patternOf(out.nextDocument)["rows"].toArray().size(), rows.size());
    }

    void sq3bS9EmptyAppData() { QVERIFY(stepPatternLibraryRootForAppData({}).isEmpty()); }

    void sq3bS12WorkerLibraryRejected() {
        const auto out = std::async(std::launch::async, [] { return run("list_step_patterns", {}); }).get();
        QVERIFY(!out.ok);
        QVERIFY(out.error.contains("thread"));
    }

    void sq3bS18WhitespaceReference() {
        QTemporaryDir dir;
        setUserStepPatternLibraryRoot(dir.path());
        QVERIFY(QDir().mkpath(dir.filePath("Patterns")));
        QFile file(dir.filePath("Patterns/unnamed.json"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(QJsonDocument(QJsonObject{{"id", "user:pattern:unnamed"}, {"pattern", patternOf(document())}}).toJson());
        file.close();
        QVERIFY(!run("move_step_pattern", {{"pattern", "   "}, {"folder", "Moved"}}).ok);
    }

    // SQ43, SQ44: a saved pattern lists, loads equal, and moves between folders.
    void userLibraryRoundTrip() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        setUserStepPatternLibraryRoot(dir.path());
        auto out = run("save_step_pattern", {{"name", "My Beat"}, {"kind", "pattern"}, {"folder", "Drums"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        out = run("list_step_patterns", {{"folder", "Drums"}});
        auto entries = out.result.value("entries").toArray();
        QCOMPARE(entries.size(), 1);
        QCOMPARE(entries.at(0).toObject().value("source").toString(), QString("user"));
        QVERIFY(out.result.value("folders").toArray().contains(QJsonValue("Drums")));
        const auto id = entries.at(0).toObject().value("id").toString();
        out = run("apply_step_pattern", {{"clipId", "d"}, {"pattern", id}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(patternOf(out.nextDocument, "d").value("rows"), patternOf(document()).value("rows"));
        QVERIFY(run("create_step_pattern_folder", {{"name", "Fills"}, {"kind", "pattern"}}).ok);
        out = run("move_step_pattern", {{"pattern", id}, {"folder", "Fills"}});
        QVERIFY2(out.ok, qPrintable(out.error));
        QCOMPARE(run("list_step_patterns", {{"folder", "Fills"}}).result.value("entries").toArray().size(), 1);
        QVERIFY(!run("delete_step_pattern_folder", {{"folder", "Fills"}, {"kind", "pattern"}}).ok);
        QVERIFY(run("rename_step_pattern_folder", {{"folder", "Drums"}, {"newName", "Kits"}, {"kind", "pattern"}}).ok);
        QVERIFY(run("delete_step_pattern_folder", {{"folder", "Kits"}, {"kind", "pattern"}}).ok);
        setUserStepPatternLibraryRoot({});
    }
};

QTEST_GUILESS_MAIN(TestPatternOps)
#include "tst_patternops.moc"
