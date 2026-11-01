#pragma once
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QObject>
#include <QWebSocket>
#include <functional>
namespace nt::chat {
class ChatClient : public QObject {
  Q_OBJECT
public:
  using Callback = std::function<void(QJsonValue, QString)>;
  explicit ChatClient(QObject *parent = nullptr);
  void connectToServer(const QUrl &, const QString &);
  void disconnectFromServer();
  void call(const QString &, QJsonObject, bool mutation, Callback);
  void upload(const QString &id, const QUrl &, Callback,
              std::function<void(qint64, qint64)> progress);
  void cancelUpload(const QString &id);
  void fetchMedia(const QUrl &, Callback);
  bool send(const QJsonObject &);
  bool ready() const { return m_ready; }
  QUrl baseUrl() const { return m_base; }
  QString token() const { return m_token; }
  quint64 epoch() const { return m_epoch; }
signals:
  void eventReceived(QJsonObject event);
  void statusChanged(QString status);
  void errorOccurred(QString error);

private:
  QNetworkAccessManager m_network;
  QWebSocket m_socket;
  QUrl m_base;
  QString m_token;
  quint64 m_epoch = 0;
  bool m_ready = false;
  int m_mediaRequests = 0;
  void receive(const QByteArray &);
};
} // namespace nt::chat
