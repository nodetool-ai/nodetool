#include "entities/EntityAssist.h"
#include "server/ServerSource.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTest>
#include <QWebSocketServer>

namespace {
struct Socket : QObject {
    QWebSocketServer server{"entities", QWebSocketServer::NonSecureMode};
    QWebSocket* peer = nullptr;
    QList<QJsonObject> frames;
    Socket() {
        server.listen(QHostAddress::LocalHost, 0);
        connect(&server, &QWebSocketServer::newConnection, this, [this] {
            peer = server.nextPendingConnection(); peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, this, [this](const QString& text) {
                const auto frame = QJsonDocument::fromJson(text.toUtf8()).object();
                if (frame.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else frames.append(frame);
            });
        });
    }
    QUrl base() const { auto url = server.serverUrl(); url.setScheme("http"); return url; }
    void reply(int index, const QJsonObject& result, const QJsonObject& error = {}) {
        QJsonObject frame{{"type", "rpc_response"}, {"request_id", frames[index].value("request_id")}, {"result", result}};
        if (!error.isEmpty()) frame.insert("error", error);
        peer->sendTextMessage(QString::fromUtf8(QJsonDocument(frame).toJson()));
    }
};
void target(const QUrl& server) {
    QList<QByteArray> args{"test", "--server", server.toString().toUtf8(), "--timeline", "entities", "--token", "secret"};
    QList<char*> argv;
    for (auto& arg : args) argv.append(arg.data());
    argv.append(nullptr);
    int argc = args.size();
    QCOMPARE(nt::server::takeServerArgs(argc, argv.data()), 0);
}
QVariantMap image() { return {{"provider", "openai"}, {"model", "image-model"}, {"prompt", " Draw Mara "}, {"aspectRatio", "2:3"}, {"takes", 1}}; }
}
class EntityAssistTest : public QObject {
    Q_OBJECT
private slots:
    void reference() {
        Socket socket;
        EntityAssist assist;
        assist.configure(socket.base());
        QTest::qWait(20);
        QVERIFY(!socket.peer);
        QSignalSpy ready(&assist, &EntityAssist::referenceReady);
        assist.generateReference(image());
        QVERIFY(assist.generating());
        QTRY_COMPARE(socket.frames.size(), 1);
        QCOMPARE(socket.frames[0].value("command").toString(), QString("generate_media"));
        QCOMPARE(socket.frames[0].value("data").toObject(), QJsonObject({{"provider", "openai"}, {"model", "image-model"},
            {"prompt", "Draw Mara"}, {"aspect_ratio", "2:3"}, {"mode", "image"}, {"resolution", "1K"}, {"variations", 1}}));
        socket.reply(0, {{"asset_ids", QJsonArray{"one"}}});
        QTRY_COMPARE(ready.size(), 1);
        QCOMPARE(ready[0][0].toString(), QString("one"));
        QVERIFY(!assist.generating()); QVERIFY(assist.takes().isEmpty());
        auto edit = image(); edit.insert("sourceAssetId", "source"); edit.insert("takes", 4);
        assist.generateReference(edit);
        QTRY_COMPARE(socket.frames.size(), 2);
        auto expected = socket.frames[0].value("data").toObject();
        expected.insert("mode", "image_edit"); expected.insert("source_asset_id", "source"); expected.insert("variations", 4);
        QCOMPARE(socket.frames[1].value("data").toObject(), expected);
        socket.reply(1, {{"asset_ids", QJsonArray{"two", 9, "three"}}});
        QTRY_COMPARE(assist.takes(), QStringList({"two", "three"}));
        QVERIFY(!assist.generating()); QCOMPARE(ready.size(), 1);
        assist.chooseTake("invalid"); QCOMPARE(ready.size(), 1);
        assist.chooseTake("three"); QCOMPARE(ready.size(), 2);
        QCOMPARE(ready[1][0].toString(), QString("three")); QVERIFY(assist.takes().isEmpty());
    }
    void failuresAndCancellation() {
        Socket socket; EntityAssist assist; assist.configure(socket.base());
        QSignalSpy ready(&assist, &EntityAssist::referenceReady);
        assist.generateReference(image()); QTRY_COMPARE(socket.frames.size(), 1);
        socket.reply(0, {{"asset_ids", QJsonArray{}}});
        QTRY_VERIFY(!assist.generating());
        QCOMPARE(assist.generateError(), QString("The image model returned no reference image."));
        assist.generateReference(image()); QTRY_COMPARE(socket.frames.size(), 2);
        socket.reply(1, {}, {{"code", "BAD_REQUEST"}, {"message", "The image was refused."}});
        QTRY_VERIFY(!assist.generating()); QCOMPARE(assist.generateError(), QString("The image was refused."));
        assist.generateReference(image()); QTRY_COMPARE(socket.frames.size(), 3);
        assist.cancelReference();
        QTRY_COMPARE(socket.frames.size(), 4);
        QCOMPARE(socket.frames[3].value("command").toString(), QString("cancel_generation"));
        QCOMPARE(socket.frames[3].value("data").toObject().value("request_ids").toArray(), QJsonArray{socket.frames[2].value("request_id")});
        socket.reply(2, {{"asset_ids", QJsonArray{"late"}}});
        socket.reply(3, {});
        QTest::qWait(30); QVERIFY(assist.takes().isEmpty()); QCOMPARE(ready.size(), 0); QVERIFY(assist.generateError().isEmpty());
        assist.setReferenceTimeout(100);
        assist.generateReference(image()); QTRY_VERIFY(socket.frames.size() >= 5);
        QTRY_VERIFY(!assist.generating()); QCOMPARE(assist.generateError(), QString("The reference image took too long. Try again."));
        QTRY_COMPARE(socket.frames.size(), 6);
        QCOMPARE(socket.frames[5].value("command").toString(), QString("cancel_generation"));
        QCOMPARE(socket.frames[5].value("data").toObject().value("request_ids").toArray(), QJsonArray{socket.frames[4].value("request_id")});
        socket.reply(4, {{"asset_ids", QJsonArray{"late"}}});
        QTest::qWait(30); QCOMPARE(ready.size(), 0);
    }
    void recovery_data() {
        QTest::addColumn<QString>("status");
        for (const auto* status : {"completed", "running", "unknown", "failed"}) QTest::newRow(status) << QString(status);
    }
    void recovery() {
        QFETCH(QString, status);
        Socket socket; EntityAssist assist; assist.configure(socket.base()); assist.setReferenceTimeout(4000);
        QSignalSpy ready(&assist, &EntityAssist::referenceReady);
        assist.generateReference(image()); QTRY_COMPARE(socket.frames.size(), 1);
        const auto id = socket.frames[0].value("request_id");
        socket.peer->close();
        QTRY_COMPARE(socket.frames.size(), 2);
        QVERIFY(assist.generating());
        QCOMPARE(socket.frames[1].value("command").toString(), QString("lookup_generations"));
        QCOMPARE(socket.frames[1].value("data").toObject().value("request_ids").toArray(), QJsonArray{id});
        const auto row = [&](const QString& state) { return QJsonObject{{"request_id", id}, {"status", state}, {"asset_ids", QJsonArray{"recovered"}}, {"error", "Render failed."}}; };
        socket.reply(1, {{"generations", status == "unknown" ? QJsonArray{} : QJsonArray{row(status)}}});
        if (status == "running") {
            QTRY_COMPARE(socket.frames.size(), 3);
            QVERIFY(assist.generating());
            QCOMPARE(socket.frames[2].value("command").toString(), QString("lookup_generations"));
            socket.reply(2, {{"generations", QJsonArray{row("completed")}}});
        }
        QTRY_VERIFY(!assist.generating());
        if (status == "completed" || status == "running") {
            QCOMPARE(ready.size(), 1); QCOMPARE(ready[0][0].toString(), QString("recovered"));
            QVERIFY(assist.generateError().isEmpty());
        } else { QCOMPARE(ready.size(), 0); QVERIFY(!assist.generateError().isEmpty()); }
        QTest::qWait(50);
        int generations = 0;
        for (const auto& frame : socket.frames) if (frame.value("command") == "generate_media") ++generations;
        QCOMPARE(generations, 1);
    }
    void recoveryTimeout() {
        Socket socket; EntityAssist assist; assist.configure(socket.base()); assist.setReferenceTimeout(300);
        QSignalSpy ready(&assist, &EntityAssist::referenceReady);
        assist.generateReference(image()); QTRY_COMPARE(socket.frames.size(), 1);
        socket.peer->close(); QTRY_COMPARE(socket.frames.size(), 2);
        socket.reply(1, {{"generations", QJsonArray{QJsonObject{{"request_id", socket.frames[0].value("request_id")}, {"status", "running"}}}}});
        QTRY_VERIFY(!assist.generating());
        QCOMPARE(assist.generateError(), QString("The reference image took too long. Try again."));
        QTRY_COMPARE(socket.frames.size(), 3);
        QCOMPARE(socket.frames[2].value("command").toString(), QString("cancel_generation"));
        socket.reply(1, {{"generations", QJsonArray{QJsonObject{{"request_id", socket.frames[0].value("request_id")}, {"status", "completed"}, {"asset_ids", QJsonArray{"late"}}}}}});
        QTest::qWait(30); QCOMPARE(ready.size(), 0);
    }
    void textDisconnect() {
        Socket socket; EntityAssist assist; assist.configure(socket.base());
        assist.assist({}); QTRY_COMPARE(socket.frames.size(), 1);
        socket.peer->close(); QTRY_VERIFY(!assist.assisting());
        QVERIFY(!assist.assistError().isEmpty());
        QTest::qWait(100); QCOMPARE(socket.frames.size(), 1);
    }
    void expectedInstance_data() {
        QTest::addColumn<bool>("explicitTarget");
        QTest::newRow("automatic") << false;
        QTest::newRow("explicit") << true;
    }
    void expectedInstance() {
        QFETCH(bool, explicitTarget);
        Socket socket; target(socket.base());
        qputenv("NODETOOL_TIMELINE_EXPECT_INSTANCE", "different-instance");
        EntityAssist assist;
        if (explicitTarget) assist.configure(socket.base(), "secret");
        assist.generateReference(image()); assist.assist({});
        QTest::qWait(100);
        qunsetenv("NODETOOL_TIMELINE_EXPECT_INSTANCE");
        QVERIFY(!socket.peer);
        QVERIFY(socket.frames.isEmpty());
        QVERIFY(!assist.generating()); QVERIFY(!assist.assisting());
        QCOMPARE(assist.generateError(), QString("Generation is unavailable for a server that requires instance verification."));
        QVERIFY(!assist.assistError().isEmpty());
    }
    void targetChange_data() {
        QTest::addColumn<bool>("text");
        QTest::newRow("image") << false;
        QTest::newRow("text") << true;
    }
    void targetChange() {
        QFETCH(bool, text);
        Socket first, second; target(first.base());
        EntityAssist assist;
        assist.assist({}); QTRY_COMPARE(first.frames.size(), 1);
        first.reply(0, {{"text", "first"}}); QTRY_VERIFY(!assist.assisting());
        target(second.base());
        if (text) assist.assist({}); else assist.generateReference(image());
        QTRY_COMPARE(second.frames.size(), 1);
        if (text) {
            second.reply(0, {{"text", "second"}}); QTRY_COMPARE(assist.proposal(), QString("second"));
            QVERIFY(assist.assistError().isEmpty());
        } else {
            QSignalSpy ready(&assist, &EntityAssist::referenceReady);
            second.reply(0, {{"asset_ids", QJsonArray{"second"}}}); QTRY_COMPARE(ready.size(), 1);
            QVERIFY(assist.generateError().isEmpty());
        }
    }
    void text_data() {
        QTest::addColumn<QString>("text"); QTest::addColumn<QString>("current");
        QTest::newRow("empty") << QString("  ") << QString("(empty)");
        QTest::newRow("text") << QString(" Red coat ") << QString(" Red coat ");
    }
    void text() {
        QFETCH(QString, text); QFETCH(QString, current);
        Socket socket; EntityAssist assist; assist.configure(socket.base());
        assist.assist({{"provider", "openai"}, {"model", "text-model"}, {"instruction", "Improve it"}, {"text", text},
            {"label", "Descriptor"}, {"description", "Visual details"}, {"context", "A character named Mara"}});
        QTRY_COMPARE(socket.frames.size(), 1);
        QCOMPARE(socket.frames[0].value("command").toString(), QString("generate_text"));
        const auto data = socket.frames[0].value("data").toObject();
        QCOMPARE(data, QJsonObject({{"provider", "openai"}, {"model", "text-model"}, {"max_tokens", 2000},
            {"system", "You write the text of one form field in a creative AI application.\nFollow the instruction. Respect the field's purpose, hint and placeholder.\nKeep the language of the current text, or of the placeholder when the field is empty.\nReply with the new field text only: no preamble, no explanation, no quotation marks around it, no Markdown code fence."},
            {"prompt", QString("# Field\nLabel: Descriptor\nHint: Visual details\n\n# Context\nA character named Mara\n\n# Current text\n%1\n\n# Instruction\nImprove it").arg(current)}}));
        socket.reply(0, {{"text", " ```text\n“Blue coat”\n``` "}});
        QTRY_VERIFY(!assist.assisting()); QCOMPARE(assist.proposal(), QString("Blue coat"));
        assist.assist({{"text", "next"}}); QTRY_COMPARE(socket.frames.size(), 2);
        assist.assist({{"text", "newest"}}); QTRY_COMPARE(socket.frames.size(), 3);
        socket.reply(1, {{"text", "stale"}}); QTest::qWait(20);
        QVERIFY(assist.assisting()); QCOMPARE(assist.proposal(), QString("Blue coat"));
        socket.reply(2, {{"text", "'New coat'"}}); QTRY_VERIFY(!assist.assisting()); QCOMPARE(assist.proposal(), QString("New coat"));
        assist.assist({}); QTRY_COMPARE(socket.frames.size(), 4);
        socket.reply(3, {{"text", " \n "}}); QTRY_VERIFY(!assist.assisting());
        QCOMPARE(assist.assistError(), QString("The model returned no text. Try again or pick another model."));
        QCOMPARE(assist.proposal(), QString("New coat"));
        assist.clearProposal(); QVERIFY(assist.proposal().isEmpty()); QVERIFY(assist.assistError().isEmpty());
        assist.assist({}); QTRY_COMPARE(socket.frames.size(), 5); assist.cancelAssist();
        socket.reply(4, {{"text", "cancelled"}}); QTest::qWait(20); QVERIFY(assist.proposal().isEmpty());
    }
    void viewsAndActions() {
        EntityAssist assist;
        const QMap<QString, QStringList> expected{{"character", {"full-body", "portrait", "character-sheet"}},
            {"location", {"establishing-view", "detail-view", "location-sheet"}}, {"style", {"style-sample", "style-sheet", "texture-detail"}},
            {"prop", {"product-view", "detail-view", "turnaround-sheet"}}};
        const QMap<QString, QVariantMap> goldenViews{
            {"full-body", {{"id", "full-body"}, {"label", "Full body"}, {"instruction", "Show one full-body, front-facing pose, head to toe. Center the character against a neutral background with even studio lighting. Make their face, clothing, and distinctive features clear."}, {"aspectRatio", "1:1"}}},
            {"portrait", {{"id", "portrait"}, {"label", "Portrait"}, {"instruction", "Show a head-and-shoulders portrait with the face fully visible and a neutral expression. Use a simple background and even lighting so facial features and hair are easy to identify."}, {"aspectRatio", "2:3"}}},
            {"character-sheet", {{"id", "character-sheet"}, {"label", "Character sheet"}, {"instruction", "Create a character sheet with front, side, and back views plus a close-up of the face. Keep proportions, clothing, colors, and distinctive features consistent across views. Use a clean background without text or labels."}, {"aspectRatio", "3:2"}}},
            {"establishing-view", {{"id", "establishing-view"}, {"label", "Establishing view"}, {"instruction", "Show a wide establishing view of the location. Make its layout, architecture, landmarks, and atmosphere clear in one coherent scene."}, {"aspectRatio", "3:2"}}},
            {"detail-view", {{"id", "detail-view"}, {"label", "Detail view"}, {"instruction", "Show a closer view of the defining materials, objects, and architectural details. Keep the setting and atmosphere recognizable."}, {"aspectRatio", "1:1"}}},
            {"location-sheet", {{"id", "location-sheet"}, {"label", "Location sheet"}, {"instruction", "Create a location sheet with three views of the same place from different angles. Keep the architecture, landmarks, lighting, and color palette consistent. No text or labels."}, {"aspectRatio", "3:2"}}},
            {"style-sample", {{"id", "style-sample"}, {"label", "Style sample"}, {"instruction", "Create one cohesive scene that clearly shows this visual style's palette, lighting, texture, and rendering treatment."}, {"aspectRatio", "1:1"}}},
            {"style-sheet", {{"id", "style-sheet"}, {"label", "Style sheet"}, {"instruction", "Create a visual style sheet with three different subjects rendered in the same style. Keep the palette, lighting, texture, and rendering treatment consistent. No text or labels."}, {"aspectRatio", "3:2"}}},
            {"texture-detail", {{"id", "texture-detail"}, {"label", "Texture detail"}, {"instruction", "Show a close-up sample of this style's defining textures, brushwork, materials, and color relationships, with enough detail to reuse the treatment."}, {"aspectRatio", "1:1"}}},
            {"product-view", {{"id", "product-view"}, {"label", "Product view"}, {"instruction", "Show one clear three-quarter view of the object, fully visible and centered against a neutral background. Use even studio lighting to reveal its shape, materials, and colors."}, {"aspectRatio", "1:1"}}},
            {"turnaround-sheet", {{"id", "turnaround-sheet"}, {"label", "Turnaround sheet"}, {"instruction", "Create an object turnaround sheet with front, side, and back views. Keep its shape, scale, materials, colors, and details consistent across views. Use a clean background without text or labels."}, {"aspectRatio", "3:2"}}}};
        for (auto it = expected.begin(); it != expected.end(); ++it) {
            const auto views = assist.referenceViews(it.key()); QCOMPARE(views.size(), 3);
            for (int i = 0; i < 3; ++i) {
                const auto view = views[i].toMap(); QCOMPARE(view.value("id").toString(), it.value()[i]);
                QCOMPARE(view, goldenViews.value(it.value()[i]));
                const auto ratio = it.value()[i] == "portrait" ? "2:3" : it.value()[i].endsWith("sheet") || it.value()[i] == "establishing-view" ? "3:2" : "1:1";
                QCOMPARE(view.value("aspectRatio").toString(), QString(ratio));
                QCOMPARE(assist.referencePrompt(it.key(), "Mara", " Coat ", it.value()[i]),
                    QString("A reference image of Mara. Coat ") + view.value("instruction").toString());
                QCOMPARE(assist.referencePrompt(it.key(), "", " Coat ", it.value()[i]),
                    QString("A reference image of %1. Coat ").arg(it.key()) + view.value("instruction").toString());
            }
        }
        QCOMPARE(assist.assistContext("character", " Mara "), QString("The entity is a character named \"Mara\"."));
        QCOMPARE(assist.assistContext("prop", "  "), QString("The entity is a prop."));
        const auto actions = assist.quickActions(); QCOMPARE(actions.size(), 5);
        QCOMPARE(actions[0].toMap(), QVariantMap({{"id", "draft"}, {"label", "Write it"}, {"instruction", "Write a complete value for this field."}, {"needsText", false}}));
        for (int i = 1; i < actions.size(); ++i) QVERIFY(actions[i].toMap().value("needsText").toBool());
    }
};
QTEST_GUILESS_MAIN(EntityAssistTest)
#include "tst_entityassist.moc"
