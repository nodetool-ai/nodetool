#include "runtime/ChatSession.h"
#include <QQmlContext>
#include <QFile>
#include <QJsonDocument>
#include <QClipboard>
#include <QDesktopServices>
#include <QGuiApplication>
#include <QQmlEngine>
#include <QtQuickTest/quicktest.h>
class ChatTestDriver : public QObject {
    Q_OBJECT
public:
    explicit ChatTestDriver(nt::chat::ChatSession* session) : QObject(session), m_session(session) {
        QDesktopServices::setUrlHandler("https", this, "recordUrl");
    }
    ~ChatTestDriver() override { QDesktopServices::unsetUrlHandler("https"); }
    Q_INVOKABLE QAbstractItemModel *currentParts() const {
        auto *model = m_session->messages();
        return model->data(model->index(0, 0), nt::chat::MessageModel::PartsRole).value<QAbstractItemModel *>();
    }
    Q_INVOKABLE QString openedLink() const { return m_openedLink; }
    Q_INVOKABLE void replay(const QString& name, int limit = 100000, int offset = 0) {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/") + name + ".json");
        if (!file.open(QIODevice::ReadOnly)) { return; }
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        int count = 0;
        for (auto event : fixture["events"].toArray()) {
            if (count++ < offset) { continue; }
            if (count > offset + limit) { break; }
            auto object = event.toObject(); object["thread_id"] = "a";
            m_session->applyEvent(object);
        }
    }
    Q_INVOKABLE void mediaHistory(int count) {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/media-resources.json"));
        if (!file.open(QIODevice::ReadOnly)) { return; }
        const auto sample = QJsonDocument::fromJson(file.readAll()).object()["events"].toArray()[0].toObject();
        QJsonArray rows;
        for (int i = 0; i < count; ++i) {
            auto row = sample;
            row["id"] = QString::number(i);
            rows.append(row);
        }
        m_session->importHistory("a", rows);
    }
    Q_INVOKABLE void longExecution() {
        for (int i = 0; i < 2000; ++i) {
            m_session->applyEvent({{"type", "log_update"}, {"thread_id", "a"},
                {"agent_execution_id", "long-run"}, {"node_id", QString::number(i)},
                {"content", QString(8192, QLatin1Char('x'))}});
        }
    }
    Q_INVOKABLE void thoughtHistory(int count) {
        QJsonArray rows;
        for (int i = 0; i < count; ++i) {
            rows.append(QJsonObject{{"id", QString::number(i)}, {"role", "assistant"},
                {"content", "<think>Saved reasoning</think>Answer"}});
        }
        m_session->importHistory("a", rows);
    }
    Q_INVOKABLE void persistedTools() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/persisted-tools.json"));
        if (!file.open(QIODevice::ReadOnly)) { return; }
        m_session->importHistory("a", QJsonDocument::fromJson(file.readAll()).object()["messages"].toArray());
    }
    Q_INVOKABLE void toolHistory(int count) {
        QJsonArray rows;
        for (int i = 0; i < count; ++i) {
            rows.append(QJsonObject{{"id", QString::number(i)}, {"role", "assistant"}, {"content", ""},
                {"tool_calls", QJsonArray{QJsonObject{{"id", QString("call-%1").arg(i)}, {"name", i % 2 ? "open_file" : "read_file"},
                    {"args", QJsonObject{{"path", "notes.txt"}}}}}}});
        }
        m_session->importHistory("a", rows);
    }
    Q_INVOKABLE void history(const QString& thread, int count) {
        QJsonArray rows;
        for (int index = 0; index < count; ++index) {
            rows.append(QJsonObject{{"id", QString::number(index)}, {"role", "assistant"},
                {"content", QStringLiteral("History row %1").arg(index)}});
        }
        m_session->importHistory(thread, rows);
    }
    Q_INVOKABLE void longHistory(const QString& thread) {
        m_session->importHistory(thread, {QJsonObject{{"id", "long"}, {"role", "assistant"}, {"content", QString(10000, QLatin1Char('x'))}}});
    }
    Q_INVOKABLE QString screenshotDirectory() const { return qEnvironmentVariable("CHAT_SCREENSHOT_DIR"); }
    Q_INVOKABLE QString clipboardText() const { return QGuiApplication::clipboard()->text(); }
    Q_INVOKABLE void setClipboardText(const QString& text) { QGuiApplication::clipboard()->setText(text); }
    Q_INVOKABLE void stream(const QString& thread, const QString& text, bool done = false) {
        m_session->applyEvent({{"type", "chunk"}, {"thread_id", thread}, {"content", text}, {"done", done}});
    }
    Q_INVOKABLE void codeHistory(const QString& thread, const QString& code) {
        m_session->importHistory(thread, {QJsonObject{{"id", "code"}, {"role", "assistant"}, {"content", "```cpp\n" + code + "```"}}});
    }
    Q_INVOKABLE void approval(const QString& thread) {
        m_session->applyEvent({{"type", "tool_approval_request"}, {"thread_id", thread},
            {"approval_id", "qml-approval"}, {"tool_name", "test_write"},
            {"message", "Review the proposed edit"}, {"args", QJsonObject{{"value", 1}}}});
    }
    Q_INVOKABLE void resetSession() {
        m_session->upsertThread({{"id", "a"}, {"title", "First conversation"}});
        m_session->upsertThread({{"id", "b"}, {"title", "Second conversation"}});
        m_session->selectThread("a");
    }
public slots:
    void recordUrl(const QUrl &url) { m_openedLink = url.toString(); }
private:
    QString m_openedLink;
    nt::chat::ChatSession* m_session;
};
class ChatQuickSetup : public QObject {
    Q_OBJECT
public slots:
    void qmlEngineAvailable(QQmlEngine* engine) {
        auto* session = new nt::chat::ChatSession(engine);
        session->upsertThread({{"id", "a"}, {"title", "First conversation"}});
        session->upsertThread({{"id", "b"}, {"title", "Second conversation"}});
        session->selectThread("a");
        engine->rootContext()->setContextProperty("testSession", session);
        engine->rootContext()->setContextProperty("testDriver", new ChatTestDriver(session));
    }
};
QUICK_TEST_MAIN_WITH_SETUP(chat, ChatQuickSetup)
#include "QuickTests.moc"
