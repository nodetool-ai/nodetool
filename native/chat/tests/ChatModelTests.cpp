#include "runtime/ChatSession.h"
#include "model/MessageModel.h"
#include "model/Markdown.h"
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
    void markdownStructureAndOrdering() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/markdown.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        MessageModel model;
        model.importHistory(fixture["messages"].toArray());
        auto *parts = partsFor(model);
        QCOMPARE(parts->rowCount(), 5);
        QCOMPARE(partAt(parts, 0)["type"].toString(), "prose");
        QVERIFY(partAt(parts, 1)["tool"].toBool());
        QCOMPARE(partAt(parts, 2)["text"].toString(), "Text after the tool.");
        QCOMPARE(partAt(parts, 3)["image"].toMap()["uri"].toString(), "asset://00000000000000000000000000000045");
        QCOMPARE(partAt(parts, 4)["text"].toString(), "Text after the image.");
        QCOMPARE(model.snapshot(), fixture["messages"].toArray());
        const auto pages = markdownPages(partAt(parts, 0)["text"].toString());
        bool code = false, table = false, link = false;
        for (const auto &page : pages) {
            for (const auto &section : page.toList()) {
                const auto block = section.toMap();
                QVERIFY(!block["text"].toString().contains("<|"));
                if (block["code"].toBool()) {
                    code = true;
                    QCOMPARE(block["language"].toString(), "cpp");
                    QCOMPARE(block["copy"].toString(), "int answer = 42;\n");
                }
                table |= block["text"].toString().contains("| --- | --- |");
                link |= block["text"].toString().contains("https://nodetool.ai");
            }
        }
        QVERIFY(code && table && link);
        QCOMPARE(cleanHarmony("prefix<|start|>assistant<|channel|>final<|message|>partial"), "prefixpartial");
        MessageModel stream;
        stream.appendChunk("Before", false);
        stream.addPart({{"type", "tool_call_update"}, {"name", "read_file"}, {"tool_call_id", "call"}});
        stream.appendChunk("After", true);
        QCOMPARE(partAt(partsFor(stream), 0)["text"].toString(), "Before");
        QVERIFY(partAt(partsFor(stream), 1)["tool"].toBool());
        QCOMPARE(partAt(partsFor(stream), 2)["text"].toString(), "After");
        MessageModel arrayStream;
        arrayStream.upsert({{"id", "array"}, {"role", "assistant"}, {"status", "streaming"},
            {"content", QJsonArray{QJsonObject{{"type", "text"}, {"text", "Before"}},
                                  QJsonObject{{"type", "image_url"}, {"image", QJsonObject{{"uri", "asset://full-id"}}}}}}});
        arrayStream.addPart({{"type", "tool_call_update"}, {"name", "read_file"}, {"tool_call_id", "call"}});
        arrayStream.appendChunk("After", true);
        auto *arrayParts = partsFor(arrayStream);
        QCOMPARE(partAt(arrayParts, 1)["type"].toString(), "image_url");
        QVERIFY(partAt(arrayParts, 2)["tool"].toBool());
        QCOMPARE(partAt(arrayParts, 3)["text"].toString(), "After");

    }
    void longMarkdownStreaming() {
        const QString code = QString("int value = 42;\n").repeated(2000);
        const auto pages = markdownPages("```cpp\n" + code + "```\n");
        QVERIFY(pages.size() > 1);
        QString reconstructed;
        for (const auto &page : pages) {
            for (const auto &section : page.toList()) {
                const auto block = section.toMap();
                if (!block["code"].toBool()) { continue; }
                QCOMPARE(block["copy"].toString(), code);
                QVERIFY(block["text"].toString().size() <= 4096);
                reconstructed += block["text"].toString();
            }
        }
        QCOMPARE(reconstructed, code);
        const QString header = "| Name | Value |\n| --- | --- |\n";
        const auto tables = markdownPages(header + QString("| row | value |\n").repeated(2000));
        QVERIFY(tables.size() > 1);
        for (const auto &page : tables) {
            QVERIFY(page.toList().first().toMap()["text"].toString().startsWith(header));
        }
        MessageModel model;
        QSignalSpy reset(&model, &QAbstractItemModel::modelReset);
        QElapsedTimer elapsed;
        elapsed.start();
        for (int i = 0; i < 100; ++i) {
            model.appendChunk(code.left(2048), false);
            QVERIFY(!markdownPages(model.data(model.index(0), MessageModel::TextRole).toString()).isEmpty());
            QCoreApplication::processEvents();
        }
        model.appendChunk({}, true);
        QCOMPARE(reset.count(), 0);
        QVERIFY2(elapsed.elapsed() < 5000, "Long-document reduction exceeded five seconds");
    }
    void thinkingLifecycleAndHistory() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/thinking.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        MessageModel model;
        const auto events = fixture["events"].toArray();
        model.appendChunk(events[0].toObject()["content"].toString(), false, true);
        auto *parts = qobject_cast<PartModel *>(partsFor(model));
        QCOMPARE(partAt(parts, 0)["label"].toString(), "Thinking");
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        parts->toggleExpanded(0);
        QSignalSpy changes(parts, &QAbstractItemModel::dataChanged);
        QSignalSpy resets(parts, &QAbstractItemModel::modelReset);
        model.appendChunk(events[1].toObject()["content"].toString(), false, true);
        model.appendChunk(events[2].toObject()["content"].toString(), true);
        QVERIFY(!partAt(parts, 0)["expanded"].toBool());
        QCOMPARE(partAt(parts, 0)["label"].toString(), "Thought for 1s");
        QVERIFY(changes.count() > 0);
        QCOMPARE(resets.count(), 0);
        parts->toggleExpanded(0);
        model.upsert({{"id", "final"}, {"role", "assistant"}, {"content", "The answer is **42**."}});
        QCOMPARE(partsFor(model), parts);
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        MessageModel loaded;
        loaded.importHistory(fixture["messages"].toArray());
        QCOMPARE(partAt(partsFor(loaded), 0)["text"], partAt(parts, 0)["text"]);
        QCOMPARE(partAt(partsFor(loaded), 1)["text"], partAt(parts, 1)["text"]);
        QCOMPARE(partAt(partsFor(loaded), 0)["label"].toString(), "Thought");
        QVERIFY(!partAt(partsFor(loaded), 0)["expanded"].toBool());
        MessageModel stopped;
        stopped.appendChunk("unfinished", false, true);
        stopped.finishThinking();
        QVERIFY(!partAt(partsFor(stopped), 0)["running"].toBool());
    }
    void webToolPresentationCases() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/tool-presentation.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        for (const auto &value : fixture["phrases"].toArray()) {
            auto call = value.toObject();
            MessageModel model;
            call["type"] = "tool_call_update";
            model.addPart(call);
            QCOMPARE(partAt(partsFor(model), 0)["label"].toString(), call["label"].toString());
        }
        for (const auto &value : fixture["groups"].toArray()) {
            const auto test = value.toObject();
            MessageModel model;
            model.upsert({{"id", "group"}, {"role", "assistant"}, {"content", ""}, {"tool_calls", test["calls"]}});
            auto *parts = partsFor(model);
            QCOMPARE(parts->rowCount(), test["rows"].toInt());
            const auto labels = test["labels"].toArray();
            for (int i = 0; i < labels.size(); ++i) {
                QCOMPARE(partAt(parts, i)["label"].toString(), labels[i].toString());
            }
            if (test.contains("preview")) { QCOMPARE(partAt(parts, 0)["preview"].toString(), test["preview"].toString()); }
        }
        MessageModel model;
        const auto messages = fixture["messages"].toArray();
        model.upsert(messages[0].toObject());
        auto *parts = partsFor(model);
        QSignalSpy inserted(&model, &QAbstractItemModel::rowsInserted);
        QSignalSpy reset(&model, &QAbstractItemModel::modelReset);
        model.upsert(messages[1].toObject());
        model.upsert(messages[2].toObject());
        QCOMPARE(model.rowCount(), 1);
        QCOMPARE(model.data(model.index(0), MessageModel::MessageIdRole).toString(), messages[0].toObject()["id"].toString());
        QCOMPARE(partsFor(model), parts);
        QCOMPARE(inserted.count(), 0);
        QCOMPARE(reset.count(), 0);
        QCOMPARE(model.snapshot(), messages);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        model.addPart({{"type", "tool_result_update"}, {"tool_call_id", QString("%1").arg(2, 32, 16, QLatin1Char('0'))}, {"result", "found"}});
        QCOMPARE(changed.count(), 1);
        QCOMPARE(partAt(parts, 0)["progress"].toString(), QString("1/3"));
    }
    void persistedToolsMatchLiveRows() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/persisted-tools.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        ChatSession live;
        live.upsertThread({{"id", "a"}});
        live.selectThread("a");
        for (const auto &event : fixture["events"].toArray()) { live.applyEvent(event.toObject()); }
        auto *streamed = qobject_cast<MessageModel *>(live.messages());
        MessageModel loaded;
        const auto raw = fixture["messages"].toArray();
        loaded.importHistory(raw);
        QCOMPARE(loaded.rowCount(), 2);
        QCOMPARE(loaded.rowCount(), streamed->rowCount());
        const auto presentation = [](const QVariantMap &part) {
            QVariantMap out;
            for (const auto key : {"label", "preview", "count", "progress", "displayStatus", "argumentsText", "resultText", "code", "duration"}) {
                out[key] = part.value(key);
            }
            QVariantList calls;
            for (const auto &value : part.value("calls").toList()) {
                auto call = value.toMap();
                QVariantMap item;
                for (const auto key : {"tool_call_id", "label", "displayStatus", "argumentsText", "resultText", "duration"}) { item[key] = call.value(key); }
                calls.append(item);
            }
            out["calls"] = calls;
            return out;
        };
        for (int row = 0; row < loaded.rowCount(); ++row) {
            for (const auto role : {MessageModel::MessageIdRole, MessageModel::RoleRole, MessageModel::TextRole, MessageModel::TimestampRole, MessageModel::StatusRole}) {
                QCOMPARE(loaded.data(loaded.index(row), role), streamed->data(streamed->index(row), role));
            }
            auto *a = partsFor(loaded, row);
            auto *b = partsFor(*streamed, row);
            QCOMPARE(a->rowCount(), b->rowCount());
            for (int part = 0; part < a->rowCount(); ++part) {
                QCOMPARE(presentation(partAt(a, part)), presentation(partAt(b, part)));
            }
        }
        for (const auto &original : raw) { QVERIFY(loaded.snapshot().contains(original)); }
        QCOMPARE(partAt(partsFor(loaded), 0)["displayStatus"].toString(), QString("Failed"));
        QCOMPARE(partAt(partsFor(loaded, 1), 0)["duration"].toString(), QString("1.2s"));
        QCOMPARE(partAt(partsFor(loaded, 1), 0)["code"].toString(), QString("console.log(2);"));
        auto *parts = partsFor(loaded, 1);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        loaded.upsert(raw.last().toObject());
        QCOMPARE(changed.count(), 0);
        // Results can arrive before their call when history pages are fetched separately.
        MessageModel reordered;
        reordered.upsert(raw.last().toObject());
        reordered.upsert(raw[raw.size() - 2].toObject());
        QCOMPARE(reordered.rowCount(), 1);
        QCOMPARE(presentation(partAt(partsFor(reordered), 0)), presentation(partAt(partsFor(loaded, 1), 0)));
    }
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
    void streamedToolResultRetainsArguments() {
        ChatSession session;
        const QString thread = QString(32, 'a');
        session.upsertThread({{"id", thread}});
        session.selectThread(thread);
        session.applyEvent({{"type", "tool_call_update"}, {"thread_id", thread},
            {"tool_call_id", "call"}, {"name", "execute_code"},
            {"args", QJsonObject{{"code", "console.log(2)"}}}});
        auto* parts = partsFor(*qobject_cast<MessageModel*>(session.messages()));
        QSignalSpy reset(parts, &QAbstractItemModel::modelReset);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        session.applyEvent({{"type", "tool_result_update"}, {"thread_id", thread},
            {"tool_call_id", "call"}, {"result", QJsonObject{{"stdout", "2"}}}});
        QCOMPARE(parts->rowCount(), 1);
        QCOMPARE(partAt(parts, 0)["args"].toMap()["code"].toString(), QString("console.log(2)"));
        QVERIFY(partAt(parts, 0)["resultText"].toString().contains("2"));
        QCOMPARE(reset.count(), 0);
        QCOMPARE(changed.count(), 1);
    }
    void longToolConversationUpdatesOnlyOwningRow() {
        MessageModel model;
        for (int i = 0; i < 2000; ++i) {
            model.upsert({{"id", QString::number(i)}, {"role", "assistant"}, {"content", ""}});
            model.addPart({{"type", "tool_call_update"}, {"tool_call_id", QString("call-%1").arg(i)},
                {"name", "read_file"}, {"args", QJsonObject{{"path", "notes.txt"}}}});
        }
        auto* parts = partsFor(model, 5);
        QSignalSpy reset(&model, &QAbstractItemModel::modelReset);
        QSignalSpy changed(&model, &QAbstractItemModel::dataChanged);
        model.addPart({{"type", "tool_result_update"}, {"tool_call_id", "call-5"},
            {"is_error", true}, {"result", QJsonObject{{"error", "File not found"}}}});
        QCOMPARE(model.rowCount(), 2000);
        QCOMPARE(reset.count(), 0);
        QCOMPARE(changed.count(), 1);
        QCOMPARE(changed.first().first().value<QModelIndex>().row(), 5);
        QCOMPARE(partAt(parts, 0)["displayStatus"].toString(), QString("Failed"));
        QCOMPARE(partAt(parts, 0)["argumentsText"].toString().contains("notes.txt"), true);
    }
    void consecutiveToolsGroupWithoutLosingResults() {
        MessageModel model;
        model.upsert({{"id", "group"}, {"role", "assistant"}, {"content", ""}});
        model.addPart({{"type", "tool_call_update"}, {"name", "search"}, {"tool_call_id", "one"}, {"args", QJsonObject{{"query", "first"}}}});
        model.addPart({{"type", "tool_call_update"}, {"name", "search"}, {"tool_call_id", "two"}, {"args", QJsonObject{{"query", "second"}}}});
        auto* parts = partsFor(model);
        QCOMPARE(parts->rowCount(), 1);
        QCOMPARE(partAt(parts, 0)["label"].toString(), QString("Ran 2 searches"));
        QVERIFY(partAt(parts, 0)["preview"].toString().contains("first"));
        QVERIFY(partAt(parts, 0)["preview"].toString().contains("second"));
        QCOMPARE(model.snapshot()[0].toObject()["parts"].toArray().size(), 2);
    }
    void failedToolRemainsVisibleWhenCollapsed() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/compact-tools.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto data = QJsonDocument::fromJson(file.readAll()).object();
        ChatSession session;
        const auto thread = data["threads"].toArray().first().toObject();
        session.upsertThread(thread);
        session.selectThread(thread["id"].toString());
        for (const auto event : data["events"].toArray()) {
            session.applyEvent(event.toObject());
        }
        auto* model = qobject_cast<MessageModel*>(session.messages());
        const auto part = partAt(partsFor(*model), 1);
        QCOMPARE(part["displayStatus"].toString(), QString("Failed"));
        QCOMPARE(part["label"].toString(), QString("Count scenes"));
        QVERIFY(!part["expanded"].toBool());
        QCOMPARE(part["code"].toString(), QString("console.log(2);"));
        QVERIFY(part["resultText"].toString().contains("Execution unavailable"));
    }
    void toolExpansionIsPresentationState() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/tool-calls.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto data = QJsonDocument::fromJson(file.readAll()).object();
        ChatSession session;
        const auto thread = data["threads"].toArray().first().toObject();
        session.upsertThread(thread);
        session.selectThread(thread["id"].toString());
        const auto events = data["events"].toArray();
        session.applyEvent(events.first().toObject());
        auto* model = qobject_cast<MessageModel*>(session.messages());
        auto* parts = qobject_cast<PartModel*>(partsFor(*model));
        QVERIFY(parts);
        const auto raw = model->snapshot();
        QSignalSpy reset(parts, &QAbstractItemModel::modelReset);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        QVERIFY(!partAt(parts, 0)["expanded"].toBool());
        parts->toggleExpanded(0);
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        QCOMPARE(changed.count(), 1);
        QCOMPARE(model->snapshot(), raw);
        session.applyEvent(events.last().toObject());
        QCOMPARE(partsFor(*model), parts);
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        QCOMPARE(partAt(parts, 0)["displayStatus"].toString(), QString("Done"));
        parts->toggleExpanded(0);
        QVERIFY(!partAt(parts, 0)["expanded"].toBool());
        parts->toggleExpanded(-1);
        parts->toggleExpanded(1);
        QCOMPARE(reset.count(), 0);
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
        QCOMPARE(parts->rowCount(), 2);
        QCOMPARE(inserted.count(), 1);
        QCOMPARE(partAt(parts, 0)["text"].toString(), "Review this action");
        QCOMPARE(QJsonObject::fromVariantMap(partAt(parts, 1)), request);
        auto response = request;
        response["pending"] = false;
        model.addPart(response);
        QCOMPARE(partsFor(model), parts);
        QCOMPARE(parts->rowCount(), 2);
        QVERIFY(changed.count() > 0);
        QCOMPARE(partAt(parts, 1)["pending"].toBool(), false);
        QCOMPARE(QJsonObject::fromVariantMap(partAt(parts, 1)), response);
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
