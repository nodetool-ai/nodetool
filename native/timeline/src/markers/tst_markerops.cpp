#include "markers/MarkerOps.h"
#include <QtTest>

using namespace nt::markers;

namespace {
QJsonObject marker(const QString& id, double timeMs, const QString& label, const QJsonObject& extra = {}) {
    QJsonObject m{{"id", id}, {"timeMs", timeMs}, {"label", label}};
    for (auto it = extra.begin(); it != extra.end(); ++it) { m.insert(it.key(), it.value()); }
    return m;
}
QStringList rows(const QString& csv) {
    // Split on CRLF outside quotes, so a newline inside a note stays in its row.
    QStringList result;
    QString row;
    bool quoted = false;
    for (qsizetype i = 0; i < csv.size(); ++i) {
        const QChar c = csv[i];
        if (c == '"') { quoted = !quoted; }
        if (!quoted && c == '\r' && i + 1 < csv.size() && csv[i + 1] == '\n') {
            result << row;
            row.clear();
            ++i;
            continue;
        }
        row += c;
    }
    if (!row.isEmpty()) { result << row; }
    return result;
}
}  // namespace

class TestMarkerOps : public QObject {
    Q_OBJECT
private slots:
    void addRoundsTimeAndOmitsEmptyFields() {
        const auto after = add({}, {{"timeMs", 1234.6}, {"label", "Cut"}, {"note", ""}, {"durationMs", 0}, {"author", ""}, {"color", ""}});
        QCOMPARE(after.size(), 1);
        const auto m = after[0].toObject();
        QCOMPARE(m.value("timeMs").toDouble(), 1235.0);
        QCOMPARE(m.value("id").toString().size(), 32);
        QCOMPARE(m.keys(), QStringList({"id", "label", "timeMs"}));
    }
    void addKeepsTheFieldsOfAReviewNote() {
        const auto after = add({}, {{"id", "abc"}, {"timeMs", -50}, {"label", "Regenerate"}, {"note", "Hands look wrong"},
                                    {"durationMs", 2500.4}, {"author", "Ana"}, {"color", "#E5484D"}});
        const auto m = after[0].toObject();
        QCOMPARE(m.value("id").toString(), QString("abc"));
        QCOMPARE(m.value("timeMs").toDouble(), 0.0);
        QCOMPARE(m.value("note").toString(), QString("Hands look wrong"));
        QCOMPARE(m.value("durationMs").toDouble(), 2500.0);
        QCOMPARE(m.value("author").toString(), QString("Ana"));
        QCOMPARE(m.value("color").toString(), QString("#E5484D"));
    }
    void updateEditsOneMarkerAndLeavesOthers() {
        const QJsonArray start{marker("a", 100, "A"), marker("b", 200, "B", {{"note", "keep"}})};
        const auto after = update(start, {"a"}, {{"label", "Alpha"}, {"note", "Check the lip sync"}, {"durationMs", 800}, {"timeMs", 150}});
        QCOMPARE(after[0].toObject(), marker("a", 150, "Alpha", {{"note", "Check the lip sync"}, {"durationMs", 800}}));
        QCOMPARE(after[1], start[1]);
    }
    void updateRemovesClearedFields() {
        const QJsonArray start{marker("a", 100, "A", {{"note", "n"}, {"color", "#fff"}, {"author", "x"}, {"durationMs", 40}})};
        const auto after = update(start, {"a"}, {{"note", ""}, {"color", ""}, {"author", ""}, {"durationMs", 0}});
        QCOMPARE(after[0].toObject(), marker("a", 100, "A"));
    }
    void bulkEditTouchesEveryIdOrNone() {
        const QJsonArray start{marker("a", 100, "A"), marker("b", 200, "B"), marker("c", 300, "C")};
        const auto after = update(start, {"a", "c"}, {{"color", "#3E63DD"}, {"author", "Ana"}});
        QCOMPARE(after[0].toObject().value("color").toString(), QString("#3E63DD"));
        QVERIFY(!after[1].toObject().contains("color"));
        QCOMPARE(after[2].toObject().value("author").toString(), QString("Ana"));
        // One unknown id refuses the whole edit.
        QCOMPARE(update(start, {"a", "nope"}, {{"color", "#3E63DD"}}), start);
        // Moving or resizing needs a single marker.
        QCOMPARE(update(start, {"a", "b"}, {{"timeMs", 5}}), start);
        QCOMPARE(update(start, {"a", "b"}, {{"durationMs", 5}}), start);
        QCOMPARE(update(start, {}, {{"color", "#fff"}}), start);
    }
    void updateIgnoresKeysItDoesNotKnow() {
        const QJsonArray start{marker("a", 100, "A")};
        QCOMPARE(update(start, {"a"}, {{"id", "z"}, {"bogus", 1}}), start);
    }
    void removeDropsTheListedMarkers() {
        const QJsonArray start{marker("a", 100, "A"), marker("b", 200, "B"), marker("c", 300, "C")};
        const auto after = remove(start, {"a", "c", "missing"});
        QCOMPARE(after.size(), 1);
        QCOMPARE(after[0].toObject().value("id").toString(), QString("b"));
        QCOMPARE(remove(start, {"missing"}), start);
    }
    void colorsAreEightAndFoundIgnoringCase() {
        QCOMPARE(colors().size(), size_t(8));
        const auto* red = colorFor(colors()[1].css.toLower());
        QVERIFY(red);
        QCOMPARE(red->id, colors()[1].id);
        QCOMPARE(colorName(colors()[0].css), colors()[0].name);
        QCOMPARE(colorName("#123456"), QString("#123456"));
        QCOMPARE(colorName(""), QString());
        QVERIFY(!colorFor("nonsense"));
    }
    void sortedAndMatches() {
        const QJsonArray start{marker("b", 200, "Second"), marker("a", 100, "First", {{"note", "Fix the Shadows"}, {"author", "Ana"}}),
                               marker("c", 200, "Third", {{"color", colors()[1].css}})};
        const auto list = sorted(start);
        QCOMPARE(list[0].value("id").toString(), QString("a"));
        QCOMPARE(list[1].value("id").toString(), QString("b"));
        QCOMPARE(list[2].value("id").toString(), QString("c"));
        QVERIFY(matches(list[0], "shadow", ""));
        QVERIFY(matches(list[0], "ANA", ""));
        QVERIFY(matches(list[0], "first", ""));
        QVERIFY(!matches(list[1], "shadow", ""));
        QVERIFY(matches(list[2], "", colors()[1].id));
        QVERIFY(!matches(list[1], "", colors()[1].id));
        QVERIFY(matches(list[1], "", "none"));
        QVERIFY(!matches(list[2], "", "none"));
    }
    void timecodeFollowsTheFrameRate() {
        QCOMPARE(timecode(0, 30), QString("00:00:00:00"));
        QCOMPARE(timecode(1500, 30), QString("00:00:01:15"));
        QCOMPARE(timecode(3'661'000, 25), QString("01:01:01:00"));
    }
    void csvQuotesCommasQuotesAndNewlines() {
        const QJsonArray markers{marker("a", 2000, "Hero, \"close-up\"", {{"note", "Line one\nLine two, with \"quotes\"\r\nLine three"},
                                                                       {"author", "Ana"}, {"durationMs", 1000}, {"color", colors()[1].css}})};
        const auto csv = toCsv(markers, 30);
        const auto lines = rows(csv);
        QCOMPARE(lines.size(), 2);
        QCOMPARE(lines[0], QString("\"Time\",\"Duration\",\"Name\",\"Notes\",\"Author\",\"Colour\""));
        QCOMPARE(lines[1], QString("\"00:00:02:00\",\"00:00:01:00\",\"Hero, \"\"close-up\"\"\","
                                   "\"Line one\nLine two, with \"\"quotes\"\"\r\nLine three\",\"Ana\",\"%1\"").arg(colors()[1].name));
        QVERIFY(csv.endsWith("\r\n"));
    }
    void csvListsMarkersInTimeOrderAndKeepsPointMarkersAtZeroDuration() {
        const QJsonArray markers{marker("b", 4000, "Later"), marker("a", 1000, "Earlier")};
        const auto lines = rows(toCsv(markers, 24));
        QCOMPARE(lines.size(), 3);
        QVERIFY(lines[1].startsWith("\"00:00:01:00\",\"00:00:00:00\",\"Earlier\""));
        QVERIFY(lines[2].startsWith("\"00:00:04:00\""));
    }
    void csvDefusesFormulas() {
        const QJsonArray markers{marker("a", 0, "=HYPERLINK(\"http://x\")", {{"note", "  +1+1"}, {"author", "@me"}}),
                                 marker("b", 1, "-5", {{"note", "fine - really"}})};
        const auto lines = rows(toCsv(markers, 30));
        QVERIFY(lines[1].contains("\"'=HYPERLINK(\"\"http://x\"\")\""));
        QVERIFY(lines[1].contains("\"'  +1+1\""));
        QVERIFY(lines[1].contains("\"'@me\""));
        QVERIFY(lines[2].contains("\"'-5\""));
        QVERIFY(lines[2].contains("\"fine - really\""));
    }
    void csvOfNothingIsTheHeader() {
        QCOMPARE(rows(toCsv({}, 30)).size(), 1);
    }
};
QTEST_APPLESS_MAIN(TestMarkerOps)
#include "tst_markerops.moc"
