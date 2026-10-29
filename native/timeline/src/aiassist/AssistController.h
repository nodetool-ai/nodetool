#pragma once
#include "model/TimelineModel.h"
#include "server/ServerClient.h"
#include "assets/AssetMedia.h"
#include <QPointer>
#include <functional>
#include <atomic>
#include <QtQmlIntegration/qqmlintegration.h>
class AssistController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ model WRITE setModel NOTIFY changed)
    Q_PROPERTY(QVariantList words READ words NOTIFY changed)
    Q_PROPERTY(QVariantList beats READ beats NOTIFY changed)
    Q_PROPERTY(QVariantList scriptRows READ scriptRows NOTIFY changed)
    Q_PROPERTY(QVariantMap scriptHeader READ scriptHeader NOTIFY changed)
    Q_PROPERTY(QUrl scriptEditorLink READ scriptEditorUrl NOTIFY changed)
    Q_PROPERTY(quint64 scriptDraftRevision READ scriptDraftRevision NOTIFY scriptDraftsChanged)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QVariant result READ result NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
public:
    using MediaResolver = std::function<nt::Clip(const QJsonObject&)>;
    void setMediaResolver(MediaResolver resolver) { m_mediaResolver = std::move(resolver); }
    using Call = std::function<nt::server::QueryResult(bool, const QString&, const QJsonObject&)>;
    explicit AssistController(QObject* parent = nullptr);
    ~AssistController() override;
    TimelineModel* model() const { return m_model; }
    void setModel(TimelineModel* model);
    void setCall(Call call) { m_call = std::move(call); }
    QVariantList words() const;
    QVariantList beats() const;
    QVariantList scriptRows() const;
    quint64 scriptDraftRevision() const { return m_scriptDraftRevision; }
    Q_INVOKABLE bool hasScriptLineDraft(const QString& scriptId, const QString& lineId) const;
    QVariantMap scriptHeader() const;
    Q_INVOKABLE QUrl scriptEditorUrl() const;
    Q_INVOKABLE bool addScriptLine();
    Q_INVOKABLE bool createLinkedScript();
    Q_INVOKABLE bool patchScriptLine(const QString& lineId, const QString& text);
    Q_INVOKABLE void setScriptLineDraft(const QString& scriptId, const QString& lineId, const QString& text);
    Q_INVOKABLE bool saveScriptLineDraft(const QString& scriptId, const QString& lineId);
    Q_INVOKABLE bool removeEmptyScriptLineForScript(const QString& scriptId, const QString& lineId, const QString& text);
    Q_INVOKABLE bool removeEmptyScriptLine(const QString& lineId, const QString& text);
    Q_INVOKABLE bool addBeat(const QString& text, const QString& provider, const QString& model, const QString& voice);
    Q_INVOKABLE bool setBeatText(const QString& clipId, const QString& text);
    Q_INVOKABLE bool deleteBeat(const QString& clipId);
    Q_INVOKABLE bool reorderBeats(const QStringList& ids);
    QString error() const { return m_error; }
    QVariant result() const { return m_result; }
    bool busy() const { return m_busy; }
    Q_INVOKABLE bool correctWord(const QString& clipId, int index, const QString& text);
    Q_INVOKABLE bool deleteWords(double startMs, double endMs);
    Q_INVOKABLE bool removeFillers();
    Q_INVOKABLE bool refreshLinkedScript();
    Q_INVOKABLE bool extractScript();
    Q_INVOKABLE bool assembleStoryboard(const QJsonObject& board);
    Q_INVOKABLE void updateResource(const QJsonObject& resource);
    Q_INVOKABLE bool listScripts();
    Q_INVOKABLE bool listStoryboards();
    Q_INVOKABLE bool openScript(const QString& id);
    Q_INVOKABLE bool applyScriptRevision(const QString& id);
    Q_INVOKABLE bool openClipScript(const QString& clipId);
    Q_INVOKABLE bool openStoryboard(const QString& id);
    Q_INVOKABLE bool linkScript(const QString& id, bool linked);
    Q_INVOKABLE bool saveScript(const QJsonObject& script);
    Q_INVOKABLE bool saveStoryboard(const QJsonObject& storyboard);
signals:
    void changed();
    void scriptDraftsChanged();
private:
    struct LineDraft { QString text; bool remove = false; };
    bool call(bool write, const QString& procedure, const QJsonObject& input);
    void confirmScriptDrafts(const QJsonObject& submitted, const QJsonObject& confirmed);
    QPointer<TimelineModel> m_model;
    Call m_call;
    MediaResolver m_mediaResolver;
    std::shared_ptr<nt::assets::MediaProtection> m_mediaProtection = std::make_shared<nt::assets::MediaProtection>();
    bool m_busy = false;
    std::shared_ptr<std::atomic_bool> m_cancelled;
    QString m_error;
    QVariant m_result;
    QHash<QString, QString> m_scriptRevisions;
    QHash<QString, QHash<QString, LineDraft>> m_scriptDrafts;
    quint64 m_scriptDraftRevision = 0;
    QString m_pendingCommitId;
};
