#pragma once
#include "model/MessageModel.h"
#include "model/ThreadModel.h"
#include "server/ChatClient.h"
#include "ModelPickerCatalog.h"
#include <QHash>
#include <QQuickTextDocument>
#include <QColor>
#include <QSet>
#include <QSettings>
#include <QTimer>
#include <map>
#include <memory>
namespace nt::chat {
class ChatSession : public QObject {
  Q_OBJECT
public:
  Q_INVOKABLE QVariantList markdownPages(const QString &text) const;
  Q_INVOKABLE void styleMarkdownLinks(QQuickTextDocument *document, const QColor &colour);
  Q_INVOKABLE void copyText(const QString &text);
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
    Q_PROPERTY(QString mediaMode READ mediaMode WRITE setMediaMode NOTIFY stateChanged)
    Q_PROPERTY(QVariantList mediaModes READ mediaModes CONSTANT)
    Q_PROPERTY(QVariantMap mediaSettings READ mediaSettings NOTIFY stateChanged)
    Q_PROPERTY(nt::modelpicker::Catalog *mediaCatalog READ mediaCatalog CONSTANT)
    Q_PROPERTY(QString mediaModelName READ mediaModelName NOTIFY stateChanged)
    Q_PROPERTY(QVariantList mediaChips READ mediaChips NOTIFY stateChanged)
    Q_PROPERTY(QString mediaModelPlaceholder READ mediaModelPlaceholder NOTIFY stateChanged)
    Q_PROPERTY(QString mediaModelHint READ mediaModelHint NOTIFY stateChanged)
    Q_PROPERTY(QString reasoningEffort READ reasoningEffort WRITE setReasoningEffort NOTIFY stateChanged)
    Q_PROPERTY(bool reasoningSupported READ reasoningSupported NOTIFY stateChanged)
    Q_PROPERTY(QVariantList reasoningLevels READ reasoningLevels CONSTANT)
    // PermissionSelector.tsx: the selected thread's mode, else the last one picked.
    Q_PROPERTY(QString permissionMode READ permissionMode WRITE setPermissionMode NOTIFY stateChanged)
    Q_PROPERTY(QVariantList permissionModes READ permissionModes CONSTANT)
    Q_PROPERTY(QVariantList assetResults READ assetResults NOTIFY assetsChanged)
    Q_PROPERTY(QVariantList recentAssets READ recentAssets NOTIFY assetsChanged)
    Q_PROPERTY(bool hasMoreAssets READ hasMoreAssets NOTIFY assetsChanged)
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
    QString mediaMode() const { return m_mediaMode; }
    void setMediaMode(const QString &mode);
    QVariantList mediaModes() const;
    QVariantMap mediaSettings() const;
    nt::modelpicker::Catalog *mediaCatalog() { return &m_mediaCatalog; }
    QString mediaModelName() const;
    QVariantList mediaChips() const;
    QString mediaModelPlaceholder() const;
    QString mediaModelHint() const;
    QString reasoningEffort() const { return m_reasoningEffort; }
    void setReasoningEffort(const QString &effort);
    bool reasoningSupported() const;
    QVariantList reasoningLevels() const;
    QString permissionMode() const { return permissionModeFor(m_selected); }
    void setPermissionMode(const QString &mode);
    QVariantList permissionModes() const;
    QString permissionModeFor(const QString &threadId) const;
    // Keeps the composer selections the web persists (GlobalChatStore and
    // MediaGenerationStore partialize): reasoning level, permission modes and
    // media settings. Without it they last for the session. Restores them now.
    void usePreferences(std::unique_ptr<QSettings> preferences);
    QVariantList assetResults() const { return m_assetResults; }
    QVariantList recentAssets() const;
    bool hasMoreAssets() const { return !m_assetCursor.isEmpty(); }
    Q_INVOKABLE void setMediaSetting(const QString &key, const QVariant &value);
    Q_INVOKABLE QVariantList mediaOptions(const QString &key) const;
    // The media_generation field the next send carries, or null in chat mode.
    Q_INVOKABLE QVariantMap mediaRequest() const;
    Q_INVOKABLE void searchAssets(const QString &query);
    Q_INVOKABLE void loadMoreAssets();
    Q_INVOKABLE void closeAssetSearch();
    Q_INVOKABLE void attachAsset(const QVariantMap &asset);
    Q_INVOKABLE QVariantMap mentionTrigger(const QString &text, int caret) const;
    Q_INVOKABLE QVariantMap removeMention(const QString &text, int start, int end) const;
    // Workflow threads matching the search, with web relative-date headings.
    Q_INVOKABLE QVariantList workflowThreadRows(const QString &query) const;
  Q_INVOKABLE void selectThread(const QString &);
    Q_PROPERTY(QVariantList workflowThreads READ workflowThreads NOTIFY stateChanged)
    Q_PROPERTY(QString threadTitle READ threadTitle NOTIFY stateChanged)
    QVariantList workflowThreads() const;
    QString threadTitle() const;
    Q_INVOKABLE void setWorkflow(const QString &id);
    Q_INVOKABLE void deleteThread(const QString &id);
    Q_INVOKABLE void retry();
    bool hasActiveTurns() const;
  Q_INVOKABLE void createThread(const QString &draft = {});
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
  Q_PROPERTY(QStringList resourceKinds MEMBER m_resourceKinds NOTIFY stateChanged)
  Q_INVOKABLE void openResource(const QString &uri);
  Q_INVOKABLE void openMedia(const QVariantMap &locator);
  Q_INVOKABLE void openExternal(const QUrl &);
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
  void resourceRequested(QString uri);
  void hostToolRequested(QString id, QString name, QVariantMap args);
  void hostResponseReceived(QJsonObject response);
    void assetsChanged();
    // A send was refused because the selected mode has no model picked.
    void modelPickerRequested();

private:
  struct State {
    bool reconciling = false;
    bool reloadHistory = false;
    bool uncertainReplay = false;
    QJsonArray bufferedEvents;
    std::unique_ptr<MessageModel> messages;
    QString lastPrompt;
    QVariantList lastAttachments;
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
  QSet<QString> m_creatingWorkflows;
  QString m_workflow;
  QHash<QString, QString> m_threadWorkflows, m_workflowThreads;
  QStringList m_resourceKinds;
  ThreadModel m_threads;
  MessageModel m_empty;
  ChatClient m_client;
  nt::modelpicker::Catalog m_catalog;
    nt::modelpicker::Catalog m_mediaCatalog;
    QString m_mediaMode = "chat";
    QHash<QString, QVariantMap> m_mediaSettings;
    QString m_reasoningEffort;
    QHash<QString, QString> m_permissionModes;
    QString m_lastPermissionMode = "default";
    std::unique_ptr<QSettings> m_preferences;
    void savePreferences();
    QVariantList m_assetResults;
    QVariantList m_recentAssets;
    QString m_assetQuery;
    QString m_assetCursor;
    bool m_assetSearchOpen = false;
    quint64 m_assetSearch = 0;
    QTimer *m_assetTimer = nullptr;
    void requestAssets(bool append);
  std::map<QString, State> m_states;
  QSet<QString> m_answeredActions;
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
