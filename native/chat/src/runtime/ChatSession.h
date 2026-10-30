#pragma once
#include "model/MessageModel.h"
#include "model/ThreadModel.h"
#include "server/ChatClient.h"
#include "ModelPickerCatalog.h"
#include <QHash>
#include <QSet>
#include <map>
#include <memory>
namespace nt::chat {
class ChatSession : public QObject {
  Q_OBJECT
  Q_PROPERTY(QAbstractItemModel *threads READ threads CONSTANT)
  Q_PROPERTY(QAbstractItemModel *messages READ messages NOTIFY stateChanged)
  Q_PROPERTY(QString selectedThreadId READ selectedThreadId NOTIFY stateChanged)
  Q_PROPERTY(QString draft READ draft WRITE setDraft NOTIFY stateChanged)
  Q_PROPERTY(QString connectionStatus READ connectionStatus NOTIFY stateChanged)
  Q_PROPERTY(QString error READ error NOTIFY stateChanged)
  Q_PROPERTY(QString turnStatus READ turnStatus NOTIFY stateChanged)
  Q_PROPERTY(bool historyLoading READ historyLoading NOTIFY stateChanged)
  Q_PROPERTY(bool hasMoreHistory READ hasMoreHistory NOTIFY stateChanged)
  Q_PROPERTY(
      QString provider READ provider WRITE setProvider NOTIFY stateChanged)
  Q_PROPERTY(QString model READ model WRITE setModel NOTIFY stateChanged)
  Q_PROPERTY(nt::modelpicker::Catalog *modelCatalog READ modelCatalog CONSTANT)
  Q_PROPERTY(QVariantList attachments READ attachments NOTIFY stateChanged)
public:
  explicit ChatSession(QObject *parent = nullptr);
  ~ChatSession() override;
  QAbstractItemModel *threads() { return &m_threads; }
  QAbstractItemModel *messages();
  QString selectedThreadId() const { return m_selected; }
  QString draft() const;
  void setDraft(const QString &);
  QString connectionStatus() const { return m_connection; }
  QString error() const;
  QString turnStatus() const;
  bool historyLoading() const;
  bool hasMoreHistory() const;
  QString provider() const { return m_provider; }
  void setProvider(const QString &v) {
    m_provider = v;
    emit stateChanged();
  }
  QString model() const { return m_model; }
  nt::modelpicker::Catalog *modelCatalog() { return &m_catalog; }
  void setModel(const QString &v) {
    m_model = v;
    emit stateChanged();
  }
  QVariantList attachments() const;
  Q_INVOKABLE void selectThread(const QString &);
  Q_INVOKABLE void createThread();
  Q_INVOKABLE void send();
  Q_INVOKABLE void stop();
  Q_INVOKABLE void refresh();
  Q_INVOKABLE void loadMore();
  Q_INVOKABLE void connectToServer(const QUrl &, const QString &token = {});
  Q_INVOKABLE void useServerDefaultModel();
  Q_INVOKABLE void openProviderSettings();
  Q_INVOKABLE void disconnectFromServer();
  Q_INVOKABLE void suspendConnection();
  Q_INVOKABLE void resumeConnection();
  Q_INVOKABLE void unloadThread(const QString &id);
  Q_INVOKABLE void respondToAction(const QString &, bool,
                                   const QString &text = {});
  Q_INVOKABLE void addAttachment(const QUrl &);
  Q_INVOKABLE void removeAttachment(const QString &);
  Q_INVOKABLE void completeHostTool(const QString &, const QVariantMap &,
                                    const QString &error = {});
  Q_INVOKABLE void openExternal(const QUrl &);
  Q_INVOKABLE void copyText(const QString &);
  Q_INVOKABLE void setHostTools(const QVariantList &tools);
  bool sendHostRequest(const QString &command, const QJsonObject &data,
                       const QString &requestId);
  Q_PROPERTY(QVariantMap hostContext MEMBER m_hostContext NOTIFY stateChanged)
  void applyEvent(const QJsonObject &);
  void importHistory(const QString &, const QJsonArray &, bool prepend = false);
  QJsonObject dumpState() const;
  void upsertThread(const QJsonObject &);
signals:
  void stateChanged();
  void hostToolRequested(QString id, QString name, QVariantMap args);
  void hostResponseReceived(QJsonObject response);

private:
  struct State {
    bool reconciling = false;
    bool reloadHistory = false;
    bool uncertainReplay = false;
    QJsonArray bufferedEvents;
    std::unique_ptr<MessageModel> messages;
    QString draft, status = "idle", cursor, error;
    qint64 sequence = 0;
    QVariantList attachments;
  };
  State &state(const QString &);
  const State *current() const;
  void loadHistory(const QString &, bool);
  void fail(const QString &);
  void resolveMedia(const QString &, const QJsonObject &,
                    const QString &projectionKey = {});
  ThreadModel m_threads;
  MessageModel m_empty;
  ChatClient m_client;
  nt::modelpicker::Catalog m_catalog;
  std::map<QString, State> m_states;
  QHash<QString, QJsonObject> m_actions, m_hostCalls;
  QHash<QString, QJsonObject> m_hostResults;
  QHash<QString, quint64> m_hostRequests;
  QList<QString> m_historyOrder;
  QVariantList m_hostTools;
  QVariantMap m_hostContext;
  QUrl m_serverUrl;
  QString m_serverToken;
  qint64 m_previewBytes = 0;
  QString m_selected, m_connection = "disconnected", m_error, m_provider,
                      m_model;
};
} // namespace nt::chat
