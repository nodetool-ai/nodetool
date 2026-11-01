#pragma once

#include <QJsonObject>
#include <QObject>
#include <QTimer>
#include <QUrl>
#include <QWebSocket>

namespace nt::ai {

// A single socket session. Generation requests are never queued or resent:
// recovery looks up the original request id on a new session instead.
class GenerationTransport : public QObject {
    Q_OBJECT
public:
    explicit GenerationTransport(QObject* parent = nullptr);
    ~GenerationTransport() override;

    void configure(const QUrl& server, const QString& token = {});
    void open();
    void close();
    bool ready() const { return m_ready; }
    bool send(const QString& command, const QJsonObject& data, const QString& requestId);

signals:
    void readyChanged();
    void response(QJsonObject message);
    void message(QJsonObject message);
    void error(QString message);
    void disconnected();

private:
    void setReady(bool ready);
    void acknowledgeMode();
    void receiveText(const QString& text);

    QUrl m_server;
    QString m_token;
    QWebSocket m_socket;
    QTimer m_modeTimeout;
    bool m_ready = false;
};

} // namespace nt::ai
