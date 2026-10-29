#pragma once
#include "ai/GenerationTransport.h"
#include "server/AutosaveController.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QJsonArray>
#include <QPointer>
#include <QTimer>
#include <QUrl>
#include <QtQmlIntegration/qqmlintegration.h>
#include <optional>
#include <memory>

class TimelineModel;
class PlaybackClock;
class QThread;
namespace nt::audio { class AppAudio; }
namespace nt::assets { class MediaProtection; }
namespace nt::ai { class WorkflowGeneration; }

class GenerationController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool resolving READ resolving NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString state READ state NOTIFY changed)
    Q_PROPERTY(QVariantList workflowInputs READ workflowInputs NOTIFY workflowInputsChanged)
    Q_PROPERTY(QString workflowInputClipId READ workflowInputClipId NOTIFY workflowInputsChanged)
    Q_PROPERTY(bool workflowInputsLoading READ workflowInputsLoading NOTIFY workflowInputsChanged)
    Q_PROPERTY(QString workflowInputsError READ workflowInputsError NOTIFY workflowInputsChanged)
    Q_PROPERTY(QString workflowCostLabel READ workflowCostLabel NOTIFY workflowInputsChanged)
    Q_PROPERTY(QString workflowCostDetail READ workflowCostDetail NOTIFY workflowInputsChanged)
    Q_PROPERTY(QVariantList candidates READ candidates NOTIFY changed)
    Q_PROPERTY(TimelineModel* previewTimeline READ previewTimeline CONSTANT)
    Q_PROPERTY(PlaybackClock* previewClock READ previewClock CONSTANT)
    Q_PROPERTY(QString previewAudioMode READ previewAudioMode WRITE setPreviewAudioMode)
public:
    explicit GenerationController(QObject* parent = nullptr);
    ~GenerationController() override;
    TimelineModel* timeline() const;
    TimelineModel* previewTimeline() const { return m_previewTimeline; }
    PlaybackClock* previewClock() const { return m_previewClock; }
    QString previewAudioMode() const { return m_previewAudioMode; }
    void setPreviewAudioMode(const QString& mode) { m_previewAudioMode = mode; }
    void setTimeline(TimelineModel* timeline);
    bool ready() const { return m_transport.ready(); }
    bool busy() const { return m_state == "pending" || m_state == "queued" || m_state == "running" || m_state == "recovering" || m_state == "cancelling"; }
    bool resolving() const { return m_resolving || m_worker; }
    QString error() const { return m_error; }
    QString state() const { return m_state; }
    QVariantList candidates() const;
    QVariantList workflowInputs() const;
    QString workflowInputClipId() const { return m_workflowInputClipId; }
    bool workflowInputsLoading() const { return m_workflowInputsLoading; }
    QString workflowInputsError() const { return m_workflowInputsError; }
    QString workflowCostLabel() const { return m_workflowCostLabel; }
    QString workflowCostDetail() const { return m_workflowCostDetail; }
    Q_INVOKABLE void loadWorkflowInputs(const QString& clipId);
    Q_INVOKABLE bool setWorkflowInput(const QString& clipId, const QString& name, const QVariant& value);
    Q_INVOKABLE void open();
    Q_INVOKABLE void submit(const QString& mode, const QString& provider, const QString& model,
                            const QString& prompt, double duration, const QString& aspect,
                            const QString& resolution, const QString& voice, const QVariantList& references,
                            double startMs, const QVariantList& entities = {});
    Q_INVOKABLE void submitMediaEdit(const QString& clipId, const QVariantMap& options);
    Q_INVOKABLE void submitWorkflow(const QString& clipId);
    Q_INVOKABLE void submitLineDelivery(const QString& clipId, const QVariantMap& input);
    Q_INVOKABLE void regenerate(const QString& clipId);
    Q_INVOKABLE void regeneratePrepared(const QString& clipId, const QString& requestId);
    Q_INVOKABLE void regenerateProductionPrepared(const QString& clipId, const QVariantMap& compiled);
    Q_INVOKABLE void submitExtension(const QString& clipId, const QVariantMap& model, const QVariantMap& options);
    Q_INVOKABLE void applyExtension(const QString& clipId, const QString& takeId, const QString& timing);
    Q_INVOKABLE void submitImageToVideo(const QString& clipId, const QVariantMap& model, const QVariantMap& options);
    Q_INVOKABLE void playPreview();
    Q_INVOKABLE void stopPreview();
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void restoreClip(const QString& clipId);
    Q_INVOKABLE void renameTake(const QString& clipId, const QString& takeId, const QString& label);
    Q_INVOKABLE void deleteTake(const QString& clipId, const QString& takeId);
    Q_INVOKABLE void apply(const QString& clipId, const QString& takeId);
    Q_INVOKABLE QUrl previewUrl(const QString& clipId, const QString& takeId);
signals:
    void clipInserted(QString clipId);
    void changed();
    void timelineChanged();
    void workflowInputsChanged();
private:
    void regenerateRequest(const QString& clipId, const QString& requestId, const QJsonObject& production);
    friend class TestGenerationController;
    friend class GenerationUiTest;
    friend class TestGenerationDevice;
    bool canonicalizeTarget();
    void receive(const QJsonObject& message);
    void submitLineDeliveryContext(const QString& clipId, const QVariantMap& input);
    void lookup();
    void recoverWorkflow();
    bool save();
    void restore();
    void resetMediaProtection();
    void syncWorkflowCost();
    void startWorkflowCost();
    void setError(const QString& error);
    void resolve(const QString& clipId, const QString& takeId, bool apply, const QString& timing = {});
    QJsonObject candidate(const QString& clipId, const QString& takeId) const;
    QPointer<TimelineModel> m_timeline;
    QPointer<QThread> m_workflowInputWorker;
    QPointer<QThread> m_workflowCostWorker;
    QJsonObject m_workflowCostInputs;
    quint64 m_workflowCostRevision = 0;
    bool m_workflowCostHasInputs = false;
    bool m_workflowCostPending = false;
    QJsonObject m_workflowInputDocument;
    QString m_workflowInputClipId;
    QString m_workflowInputWorkflowId;
    QString m_workflowInputsError;
    QString m_workflowCostLabel;
    QString m_workflowCostDetail;
    bool m_workflowInputsLoading = false;
    quint64 m_workflowInputsRevision = 0;
    std::optional<nt::server::SaveTarget> m_target;
    nt::ai::GenerationTransport m_transport;
    QTimer m_poll;
    QTimer m_reconnect;
    int m_reconnectAttempts = 0;
    QJsonObject m_job;
    QJsonArray m_candidates;
    QHash<QString, QUrl> m_previews;
    quint64 m_generation = 0;
    QString m_state;
    QString m_error;
    QString m_cancelRequestId;
    QString m_previewKey;
    QString m_loadedPreviewKey;
    bool m_resolving = false;
    bool m_recoverWorkflowAfterWorker = false;
    QThread* m_worker = nullptr;
    TimelineModel* m_previewTimeline;
    PlaybackClock* m_previewClock;
    QString m_previewAudioMode = QStringLiteral("none");
    std::unique_ptr<nt::audio::AppAudio> m_previewAudio;
    std::shared_ptr<nt::assets::MediaProtection> m_mediaProtection;
    nt::ai::WorkflowGeneration* m_workflow;
};
