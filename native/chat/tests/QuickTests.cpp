#include "runtime/ChatSession.h"
#include <QQmlContext>
#include <QClipboard>
#include <QGuiApplication>
#include <QQmlEngine>
#include <QtQuickTest/quicktest.h>
class ChatTestDriver : public QObject {
    Q_OBJECT
public:
    explicit ChatTestDriver(nt::chat::ChatSession* session) : QObject(session), m_session(session) {}
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
    Q_INVOKABLE void clearHistory(const QString& thread) { m_session->importHistory(thread, {}); }
private:
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
