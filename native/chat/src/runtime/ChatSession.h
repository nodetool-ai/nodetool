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
    // Images that Markdown and HTML name, and audio or video that a player
    // loads, resolved through the authenticated client: source → {url, error}.
    Q_PROPERTY(QVariantMap resolvedMedia READ resolvedMedia NOTIFY resolvedMediaChanged)
    // Whether this build plays audio and video in the chat (Qt Multimedia).
    Q_PROPERTY(bool embeddedMedia READ embeddedMedia CONSTANT)
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
    Q_INVOKABLE void renameThread(const QString &id, const QString &title);
    // Cloud providers that take an API key, from settings.providerCatalog:
    // {provider, name, key, configured}. The key itself stays on the server.
    Q_PROPERTY(QVariantList providerKeys READ providerKeys NOTIFY providerKeysChanged)
    Q_PROPERTY(QString providerKeyStatus READ providerKeyStatus NOTIFY providerKeysChanged)
    QVariantList providerKeys() const { return m_providerKeys; }
    QString providerKeyStatus() const { return m_providerKeyStatus; }
    Q_INVOKABLE void loadProviderKeys();
    Q_INVOKABLE void saveProviderKey(const QString &key, const QString &value);
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
    QVariantMap resolvedMedia() const { return m_resolvedMedia; }
    bool embeddedMedia() const;
    // Fetches an image named by Markdown or HTML (asset://, a server path or
    // a data URL) into resolvedMedia. External hosts are refused, as for
    // every chat preview, and keep their link.
    Q_INVOKABLE void resolveImage(const QString &source);
    // Downloads audio or video for the embedded player into resolvedMedia,
    // keyed by mediaKey(locator).
    Q_INVOKABLE void loadMedia(const QVariantMap &locator);
    Q_INVOKABLE QString mediaKey(const QVariantMap &locator) const;
    // GenerationBatchProgress.tsx: a batch's counts, time left and item rows
    // at nowMs, so the view can tick once a second.
    Q_INVOKABLE QVariantMap batchProgress(const QVariantMap &batch, double nowMs) const;
    // ToolApprovalCard.tsx: Allow for this chat grants the tool for the rest
    // of the conversation (decision allow_for_chat).
    Q_INVOKABLE void allowActionForChat(const QString &id);
    // SecretRequestCard.tsx: saves the key with settings.secrets.upsert, then
    // answers the request with saved. A failure keeps the request open.
    Q_INVOKABLE void saveSecret(const QString &id, const QString &value);
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
    void resolvedMediaChanged();
    // A send was refused because the selected mode has no model picked.
    void modelPickerRequested();
    void providerKeysChanged();
    // A chat send found no usable model: the host opens its API key dialog.
    void providerSetupRequested();
    void providerKeySaved(QString provider);

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
  void answerAction(const QString &id, const QJsonObject &response, const QString &status);
  void storeMedia(const QString &key, const QString &url, const QString &error, qint64 bytes);
  QVariantMap m_resolvedMedia;
  QVariantList m_providerKeys;
  QString m_providerKeyStatus;
  qint64 m_resolvedBytes = 0;
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
