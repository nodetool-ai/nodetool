// The native-only behaviour of the storyboard Markdown port. Agreement with
// the TypeScript reference is checked by storyboard-markdown.oracle.test.mjs.
#include "StoryboardMarkdown.h"

#include <QElapsedTimer>
#include <QJsonArray>
#include <QRegularExpression>
#include <QtTest>

using namespace nt::storyboard;

class TestStoryboardMarkdown : public QObject {
    Q_OBJECT
private slots:
    void trailingLineBreakEndsTheText() {
        QCOMPARE(markdownLines(QStringLiteral("a\nb\n")), QStringList({"a", "b"}));
        QCOMPARE(markdownLines(QString()), QStringList({QString()}));
    }

    void newHeadingsGetHexIds() {
        const auto result = parseStoryboardMarkdown(markdownLines(QStringLiteral("### Shot\nAction.")), nullptr);
        QCOMPARE(result.missingIds.size(), 1);
        static const QRegularExpression hex(QStringLiteral("^[0-9a-f]{32}$"));
        QVERIFY(hex.match(result.missingIds.first().id).hasMatch());
        QVERIFY(!result.missingIds.first().replace.has_value());
        QCOMPARE(result.shotOrder, QStringList({result.missingIds.first().id}));
    }

    void roundTripsABoard() {
        const MarkdownEntities entities{{QStringLiteral("nova"), {QStringLiteral("Nova"), QStringLiteral("character"), {}}}};
        const QString markdown = QStringLiteral("# Film {#sp}\n\n- **Aspect ratio:** 16:9\n\n### Opening {#s1}\n![Still](asset://abc.png)\n\n"
                                                "[Nova](entity://nova) wakes.\n\n- **Duration:** 2.5s\n");
        const auto first = parseStoryboardMarkdown(markdownLines(markdown), nullptr, entities);
        QVERIFY(first.warnings.isEmpty());
        QVERIFY(first.missingIds.isEmpty());
        const QJsonObject shot = first.document.value("shots").toArray().first().toObject();
        QCOMPARE(shot.value("action").toString(), QStringLiteral("Nova wakes."));
        QCOMPARE(shot.value("entity_ids").toArray(), QJsonArray({"nova"}));
        QCOMPARE(shot.value("keyframe").toObject().value("asset_id").toString(), QStringLiteral("abc"));
        QCOMPARE(storyboardToMarkdown(first.document, entities), markdown);
        const auto second = parseStoryboardMarkdown(markdownLines(markdown), &first.document, entities);
        QCOMPARE(second.document, first.document);
    }

    void tokensAddUpToTheLine() {
        const QString line = QStringLiteral("- **Continuity:** until [Shot 2](#b) with [Nova](entity://nova) {#c1}");
        QString joined;
        for (const auto& token : tokenizeStoryboardLine(line)) joined += token.text;
        QCOMPARE(joined, line);
    }

    void readsLongLinesInLinearTime() {
        const QString uri = QStringLiteral("asset://a.mp4#") + QStringLiteral(".m4v#").repeated(50000);
        const QStringList lines{QStringLiteral("### Shot {#s1}"), QStringLiteral("![Clip](%1)").arg(uri), QStringLiteral("Action."),
            QStringLiteral("- **Motion:**") + QString(50000, QLatin1Char(' ')) + QStringLiteral("slow"),
            QStringLiteral("#") + QString(50000, QLatin1Char(' ')) + QStringLiteral("Act"),
            QStringLiteral("*") + QString(50000, QLatin1Char(' ')) + QStringLiteral("note")};
        QElapsedTimer timer;
        timer.start();
        const auto result = parseStoryboardMarkdown(lines, nullptr);
        for (const auto& line : lines) tokenizeStoryboardLine(line);
        QVERIFY2(timer.elapsed() < 2000, qPrintable(QStringLiteral("%1 ms").arg(timer.elapsed())));
        const QJsonObject shot = result.document.value("shots").toArray().first().toObject();
        QCOMPARE(shot.value("clip").toObject().value("uri").toString(), uri);
        QCOMPARE(shot.value("motion").toString(), QStringLiteral("slow"));
    }
};

QTEST_GUILESS_MAIN(TestStoryboardMarkdown)
#include "tst_storyboardmarkdown.moc"
