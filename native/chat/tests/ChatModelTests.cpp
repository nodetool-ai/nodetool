#include "runtime/ChatSession.h"
#include "model/MessageModel.h"
#include <QFile>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QElapsedTimer>
#include <QtTest>
using namespace nt::chat;
namespace {
QJsonObject fixture() {
    QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/streaming.json"));
    if (!file.open(QIODevice::ReadOnly)) { return {}; }
    return QJsonDocument::fromJson(file.readAll()).object();
}
QJsonObject normalized(ChatSession& session, const QJsonArray& threads) {
    QJsonObject result;
    for (const auto& value : threads) {
        const auto id = value.toObject()["id"].toString();
        session.selectThread(id);
        QJsonArray messages;
        auto* model = session.messages();
        for (int row = 0; row < model->rowCount(); ++row) {
            messages.append(QJsonObject{{"role", model->data(model->index(row, 0), MessageModel::RoleRole).toString()},
                {"text", model->data(model->index(row, 0), MessageModel::TextRole).toString()}});
        }
        result[id] = QJsonObject{{"status", session.turnStatus()}, {"messages", messages}};
    }
    return result;
}
QAbstractItemModel* partsFor(MessageModel& model, int row = 0) {
    return model.data(model.index(row), MessageModel::PartsRole).value<QAbstractItemModel*>();
}
QVariantMap partAt(QAbstractItemModel* model, int row) {
    const auto roles = model->roleNames();
    for (auto it = roles.cbegin(); it != roles.cend(); ++it) {
        if (it.value() == "modelData") { return model->data(model->index(row, 0), it.key()).toMap(); }
    }
    return {};
}
QJsonObject message(int id) {
    return {{"id", QString::number(id).rightJustified(32, QLatin1Char('0'))},
        {"role", id % 2 ? "assistant" : "user"}, {"content", QStringLiteral("History message %1").arg(id)}};
}
}
class ChatModelTests : public QObject {
    Q_OBJECT
private slots:
    void persistedAssistantToolCallsRemainReadable() {
        MessageModel model;
        const QJsonObject call{{"id", "call-authoritative"}, {"type", "function"},
            {"function", QJsonObject{{"name", "ui_add_marker"}, {"arguments", "{\"time\":2}"}}}};
        const QJsonObject raw{{"id", "assistant-tool-message"}, {"role", "assistant"},
            {"content", QJsonValue::Null}, {"tool_calls", QJsonArray{call}}};
        model.upsert(raw);
        auto* parts = partsFor(model);
        QVERIFY(parts != nullptr);
        QCOMPARE(parts->rowCount(), 1);
        const auto part = partAt(parts, 0);
        QCOMPARE(part["type"].toString(), QStringLiteral("tool_call"));
        QCOMPARE(part["tool_call_id"].toString(), QStringLiteral("call-authoritative"));
        QCOMPARE(part["name"].toString(), QStringLiteral("ui_add_marker"));
        QVERIFY(part["text"].toString().contains("{\"time\":2}"));
        QCOMPARE(QJsonObject::fromVariantMap(part["payload"].toMap()), call);
        QCOMPARE(model.snapshot().first().toObject(), raw);
    }
    void fixtureConformance() {
        const auto data = fixture();
        QVERIFY(!data.isEmpty());
        const auto threads = data["threads"].toArray();
        const auto events = data["events"].toArray();
        const auto expected = data["expected"].toArray();
        QVERIFY(!events.isEmpty());
        QCOMPARE(events.size(), expected.size());
        ChatSession session;
        for (const auto& thread : threads) { session.upsertThread(thread.toObject()); }
        for (int index = 0; index < events.size(); ++index) {
            session.applyEvent(events[index].toObject());
            QCOMPARE(normalized(session, threads), expected[index].toObject());
        }
    }
    void detectsCorruptDelta() {
        const auto data = fixture();
        ChatSession session;
        const auto threads = data["threads"].toArray();
        for (const auto& thread : threads) { session.upsertThread(thread.toObject()); }
        auto events = data["events"].toArray();
        QVERIFY(events.size() > 2);
        auto corrupted = events[2].toObject();
        corrupted["content"] = "lost";
        events[2] = corrupted;
        for (int index = 0; index <= 2; ++index) { session.applyEvent(events[index].toObject()); }
        QVERIFY(normalized(session, threads) != data["expected"].toArray()[2].toObject());
    }
    void preservesDrafts() {
        ChatSession session;
        session.upsertThread({{"id", "a"}, {"title", "A"}});
        session.upsertThread({{"id", "b"}, {"title", "B"}});
        session.selectThread("a");
        session.setDraft("first\nsecond");
        session.selectThread("b");
        QCOMPARE(session.draft(), QString());
        session.setDraft("other");
        session.selectThread("a");
        QCOMPARE(session.draft(), QStringLiteral("first\nsecond"));
    }
    void errorsBelongToTheirThread() {
        ChatSession session;
        session.upsertThread({{"id", "a"}});
        session.upsertThread({{"id", "b"}});
        session.selectThread("b");
        session.applyEvent({{"type", "error"}, {"thread_id", "a"}, {"message", "Thread A failed"}});
        QCOMPARE(session.error(), QString());
        session.selectThread("a");
        QCOMPARE(session.error(), QStringLiteral("Thread A failed"));
    }
    void streamingDoesNotResetModel() {
        MessageModel model;
        QSignalSpy resets(&model, &QAbstractItemModel::modelReset);
        QSignalSpy changes(&model, &QAbstractItemModel::dataChanged);
        model.appendChunk("one", false);
        model.appendChunk(" ", false);
        model.appendChunk(" ", false);
        model.appendChunk("two", true);
        QCOMPARE(model.rowCount(), 1);
        QCOMPARE(model.data(model.index(0), MessageModel::TextRole).toString(), QStringLiteral("one  two"));
        QCOMPARE(resets.count(), 0);
        QVERIFY(changes.count() > 0);
    }
    void historyPrependKeepsIdentityAndDeduplicates() {
        MessageModel model;
        model.importHistory({message(3), message(4)});
        QSignalSpy resets(&model, &QAbstractItemModel::modelReset);
        model.importHistory({message(1), message(2), message(3)}, true);
        QCOMPARE(model.rowCount(), 4);
        QCOMPARE(model.data(model.index(0), MessageModel::MessageIdRole).toString(), message(1)["id"].toString());
        QCOMPARE(model.data(model.index(3), MessageModel::MessageIdRole).toString(), message(4)["id"].toString());
        QCOMPARE(resets.count(), 0);
    }
    void unknownContentPreserved() {
        MessageModel model;
        const QJsonObject payload{{"type", "future_content"}, {"payload", QJsonObject{{"value", 42}}}};
        model.upsert({{"id", "unknown"}, {"role", "assistant"}, {"content", QJsonArray{payload}}});
        QCOMPARE(model.snapshot()[0].toObject()["content"].toArray()[0].toObject(), payload);
        QVERIFY(partsFor(model));
        QVERIFY(partsFor(model)->rowCount() > 0);
    }
    void replaySequenceDeduplicatesWithoutContentHeuristic() {
        ChatSession session;
        session.upsertThread({{"id", "a"}});
        session.selectThread("a");
        const QJsonObject first{{"type", "chunk"}, {"thread_id", "a"}, {"content", " "}, {"chat_seq", 1}};
        session.applyEvent(first);
        session.applyEvent(first);
        auto second = first;
        second["chat_seq"] = 2;
        session.applyEvent(second);
        QCOMPARE(session.messages()->rowCount(), 1);
        QCOMPARE(session.messages()->data(session.messages()->index(0, 0), MessageModel::TextRole).toString(), QStringLiteral("  "));
    }
    void idlessMediaUsesStableProjectionWithoutInventingServerId() {
        MessageModel model;
        const auto key = model.upsert({{"role", "assistant"}, {"content", QJsonArray{QJsonObject{{"type", "image_url"}, {"image", QJsonObject{{"asset_id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}}}}});
        QVERIFY(!key.isEmpty());
        QVERIFY(!model.snapshot()[0].toObject().contains("id"));
        QVERIFY(model.addResolvedPart(key, {{"type", "image"}, {"mediaUrl", "data:image/png;base64,AA=="}}));
        QVERIFY(partsFor(model));
        QVERIFY(partsFor(model)->rowCount() > 0);
    }
    void objectContentHasReadableFallbackWithoutLosingPayload() {
        MessageModel model;
        const QJsonObject content{{"future", "visible payload"}};
        model.upsert({{"id", "future"}, {"role", "assistant"}, {"content", content}});
        QCOMPARE(model.snapshot()[0].toObject()["content"].toObject(), content);
        auto* parts = partsFor(model);
        QVERIFY(parts);
        QVERIFY(parts->rowCount() > 0);
        QVERIFY(partAt(parts, 0)["text"].toString().contains("visible payload"));
    }
    void structuredPartsUpdateAffectedRowsWithoutReset() {
        MessageModel model;
        model.upsert({{"id", "approval-message"}, {"role", "assistant"}, {"content", "Review this action"}});
        auto* parts = partsFor(model);
        QVERIFY(parts);
        QSignalSpy resets(parts, &QAbstractItemModel::modelReset);
        QSignalSpy inserted(parts, &QAbstractItemModel::rowsInserted);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        QSignalSpy messageResets(&model, &QAbstractItemModel::modelReset);
        const QJsonObject request{{"type", "tool_approval_request"}, {"actionId", "approval-one"},
            {"pending", true}, {"args", QJsonObject{{"title", "Preserved argument"}}}};
        model.addPart(request);
        QCOMPARE(partsFor(model), parts);
        QCOMPARE(parts->rowCount(), 1);
        QCOMPARE(inserted.count(), 1);
        QCOMPARE(QJsonObject::fromVariantMap(partAt(parts, 0)), request);
        auto response = request;
        response["pending"] = false;
        model.addPart(response);
        QCOMPARE(partsFor(model), parts);
        QCOMPARE(parts->rowCount(), 1);
        QVERIFY(changed.count() > 0);
        QCOMPARE(partAt(parts, 0)["pending"].toBool(), false);
        QCOMPARE(QJsonObject::fromVariantMap(partAt(parts, 0)), response);
        QCOMPARE(model.snapshot()[0].toObject()["parts"].toArray()[0].toObject(), response);
        QCOMPARE(resets.count(), 0);
        QCOMPARE(messageResets.count(), 0);
    }
    void toolRequestDoesNotFinishTurn() {
        ChatSession session;
        session.upsertThread({{"id", "a"}});
        session.selectThread("a");
        session.applyEvent({{"type", "chunk"}, {"thread_id", "a"}, {"content", "Working"}});
        session.applyEvent({{"type", "message"}, {"thread_id", "a"}, {"id", "tool-message"},
            {"role", "assistant"}, {"content", "Working"},
            {"tool_calls", QJsonArray{QJsonObject{{"id", "call-one"}, {"name", "tool"}}}}});
        QCOMPARE(session.turnStatus(), QStringLiteral("streaming"));
    }
    void mediaResolutionMergesByStableMessageId() {
        MessageModel model;
        model.upsert({{"id", "image-message"}, {"role", "assistant"}, {"content", "Original"}});
        model.upsert({{"id", "image-message"}, {"role", "assistant"}, {"content", "Updated while loading"}});
        QVERIFY(model.addResolvedPart("image-message", {{"type", "image"}, {"mediaUrl", "data:image/png;base64,AA=="}}));
        QCOMPARE(model.data(model.index(0), MessageModel::TextRole).toString(), QStringLiteral("Updated while loading"));
        model.clear();
        QVERIFY(!model.addResolvedPart("image-message", {{"type", "image"}}));
        QCOMPARE(model.rowCount(), 0);
    }
    void mixedContentSurvivesStreaming() {
        MessageModel model;
        const QJsonObject image{{"type", "image_url"}, {"image", QJsonObject{{"uri", "asset://protected"}}}};
        model.upsert({{"id", "mixed"}, {"role", "assistant"}, {"status", "streaming"},
            {"content", QJsonArray{QJsonObject{{"type", "text"}, {"text", "Before"}}, image}}});
        model.appendChunk(" after", true);
        QCOMPARE(model.data(model.index(0), MessageModel::TextRole).toString(), QStringLiteral("Before after"));
        QVERIFY(model.snapshot()[0].toObject()["content"].toArray().contains(image));
    }
    void logoutClearsProtectedHistoryAndDrafts() {
        ChatSession session;
        session.upsertThread({{"id", "a"}});
        session.selectThread("a");
        session.setDraft("private draft");
        session.importHistory("a", {message(1)});
        session.disconnectFromServer();
        QCOMPARE(session.threads()->rowCount(), 0);
        QCOMPARE(session.messages()->rowCount(), 0);
        QCOMPARE(session.draft(), QString());
        QCOMPARE(session.selectedThreadId(), QString());
    }
    void pagedTenThousandMessageCorpus() {
        MessageModel model;
        QElapsedTimer timer;
        timer.start();
        constexpr int CorpusSize = 10000;
        constexpr int PageSize = 100;
        for (int start = CorpusSize - PageSize; start >= 0; start -= PageSize) {
            QJsonArray page;
            for (int row = start; row < start + PageSize; ++row) { page.append(message(row)); }
            model.importHistory(page, start != CorpusSize - PageSize);
        }
        QCOMPARE(model.rowCount(), CorpusSize);
        QCOMPARE(model.snapshot().first().toObject()["id"].toString(), message(0)["id"].toString());
        model.importHistory({message(CorpusSize)}, true);
        QVERIFY(model.rowCount() <= CorpusSize);
        qInfo().noquote() << QJsonDocument(QJsonObject{{"corpus_messages", CorpusSize},
            {"retained_messages", model.rowCount()}, {"elapsed_ms", timer.elapsed()},
            {"platform", QSysInfo::prettyProductName()}, {"cpu", QSysInfo::currentCpuArchitecture()},
            {"qt", QT_VERSION_STR}}).toJson(QJsonDocument::Compact);
        const auto previousLast = model.data(model.index(model.rowCount() - 1), MessageModel::TextRole).toString();
        model.appendChunk("new turn", false);
        QCOMPARE(model.rowCount(), CorpusSize);
        QCOMPARE(model.data(model.index(model.rowCount() - 1), MessageModel::TextRole).toString(), QStringLiteral("new turn"));
        QCOMPARE(model.data(model.index(model.rowCount() - 2), MessageModel::TextRole).toString(), previousLast);
        model.clear();
        QCOMPARE(model.rowCount(), 0);
    }
};
QTEST_MAIN(ChatModelTests)
#include "ChatModelTests.moc"
