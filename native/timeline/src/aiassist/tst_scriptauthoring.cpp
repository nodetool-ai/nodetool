#include "aiassist/ScriptAuthoring.h"
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QtTest>
class ScriptAuthoringTest : public QObject {
    Q_OBJECT
private slots:
    void webStoreActionsAndPanelProjection() {
        QFile file(QFileInfo(QString::fromUtf8(__FILE__)).absolutePath() + "/fixtures/script-authoring-web.json");
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        QVERIFY(!fixture.isEmpty());
        for (const auto& name : {"add", "addEmpty"}) {
            const auto test = fixture.value(name).toObject();
            QCOMPARE(nt::aiassist::addScriptLine(test.value("script").toObject(), test.value("payload").toObject()), test.value("expected").toObject());
        }
        const auto patch = fixture.value("patch").toObject();
        QCOMPARE(nt::aiassist::patchScriptLineText(patch.value("script").toObject(), patch.value("payload").toObject()), patch.value("expected").toObject());
        const auto remove = fixture.value("remove").toObject();
        QCOMPARE(nt::aiassist::removeEmptyScriptLine(remove.value("script").toObject(), remove.value("payload").toObject()), remove.value("expected").toObject());
        const auto rows = fixture.value("rows").toObject();
        QCOMPARE(nt::aiassist::scriptPanelRows(rows.value("script").toObject(), rows.value("timeline").toObject()), rows.value("expected").toArray());
        QCOMPARE(nt::aiassist::scriptPanelHeader(rows.value("script").toObject()), (QJsonObject{{"title", "Demo script"}, {"lineCount", 5}}));
        QCOMPARE(nt::aiassist::scriptPanelHeader({}), (QJsonObject{{"title", "Untitled script"}, {"lineCount", 0}}));
    }
    void backspaceOnlyRemovesExactlyEmptyText() {
        const QJsonObject empty{{"id", "empty"}, {"text", ""}, {"takes", QJsonArray{}}};
        const QJsonObject spaces{{"id", "spaces"}, {"text", " "}, {"takes", QJsonArray{}}};
        const QJsonObject section{{"id", "section"}, {"lines", QJsonArray{empty, spaces}}};
        const QJsonObject script{{"id", "script"}, {"document", QJsonObject{{"sections", QJsonArray{section}}}}};
        QCOMPARE(nt::aiassist::removeEmptyScriptLine(script, {{"lineId", "spaces"}}), script);
        const auto updated = nt::aiassist::removeEmptyScriptLine(script, {{"lineId", "empty"}});
        const auto lines = updated.value("document").toObject().value("sections").toArray().at(0).toObject().value("lines").toArray();
        QCOMPARE(lines, QJsonArray{spaces});
    }
    void linePrefixesOnlyAliasCanonicalIds() {
        const QString canonical = "123456789abc123456789abc12345678";
        const QString legacy = "abcdef123456zzzzzzzzzzzzzzzzzzzz";
        const QJsonObject first{{"id", canonical}, {"text", "First"}, {"takes", QJsonArray{}}};
        const QJsonObject second{{"id", legacy}, {"text", "Second"}, {"takes", QJsonArray{}}};
        const QJsonObject section{{"id", "section"}, {"lines", QJsonArray{first, second}}};
        const QJsonObject script{{"id", "script"}, {"document", QJsonObject{{"sections", QJsonArray{section}}}}};
        const auto updated = nt::aiassist::patchScriptLineText(script, {{"lineId", canonical.left(12)}, {"text", "Updated"}});
        QCOMPARE(updated.value("document").toObject().value("sections").toArray().at(0).toObject().value("lines").toArray().at(0).toObject().value("text").toString(), QString("Updated"));
        QCOMPARE(nt::aiassist::patchScriptLineText(script, {{"lineId", legacy.left(12)}, {"text", "Refused"}}), script);
        QVERIFY(nt::aiassist::patchScriptLineText(script, {{"lineId", legacy}, {"text", "Exact"}}) != script);
    }
    void editorUrlPreservesOriginAndEncodesOneIdSegment() {
        const auto url = nt::aiassist::scriptEditorUrl(QUrl("https://user:password@example.test:8123/api?token=secret#fragment"), "personal:alice/a?#");
        QCOMPARE(url.toEncoded(), QByteArray("https://example.test:8123/studio/script/personal%3Aalice%2Fa%3F%23"));
        QVERIFY(nt::aiassist::scriptEditorUrl(QUrl("file:///tmp/api"), "script").isEmpty());
        QVERIFY(nt::aiassist::scriptEditorUrl(QUrl("https://example.test"), "").isEmpty());
    }
};
QTEST_GUILESS_MAIN(ScriptAuthoringTest)
#include "tst_scriptauthoring.moc"
