#pragma once

// The music job module (docs/MUSIC-MODE.md MD18, sections 9 and 13).
//
// MusicJobs submits Generate, Regenerate and Add instrument requests for one
// timeline, keeps up to eight of them active at once, and places their
// results as takes. It is separate from GenerationController, which holds one
// job (MF2), and owns its own GenerationTransport, so it has its own socket
// and the two never route each other's replies.
//
// A job is named by the request id of its first submission. Its record file,
// `<timelineId>.music-job-<jobId>.json` in the sequence's backup folder, is
// written before every send and after every state change. It holds the full
// `generate_media` data, the plan, the clip and track ids, the context asset
// id, the state, the resubmit count and the takes not yet placed, so a reopen
// recovers every job (JB-2). The name does not match the `.ai-generation-`
// pattern that GenerationController scans.
//
// States: rendering (the context bounce renders or uploads), queued (sent,
// an earlier job runs on the backend), running, placing (the takes are being
// downloaded and written), and the final done, failed and cancelled.
//
// Per operation (sections 9.1 to 9.3):
// - Generate inserts the placeholder (`music.insertPlaceholder`) and sends,
//   in the same call, so the placeholder appears in the submission's turn.
// - Regenerate renders a dry bounce of the target track over the context
//   window, uploads it, then sends it with the region and the splice parent.
// - Add instrument renders a mix bounce with the target muted, uploads it,
//   inserts the placeholder and sends with the track role.
// The bounce renders a copy of the snapshot taken at submission (MD16).
//
// Results arrive as `rpc_response` or through `lookup_generations`, polled
// every 3 seconds for every active request id in one call. `music_status`
// in a running row tells queued from running. A row left `interrupted` by a
// server restart is resent once under a new request id for the `acestep`
// provider (JB-2); a second interruption fails the job. Cancel sends
// `cancel_generation` and removes the placeholder in one undo step (JB-4).
// Retry sends the stored request under a new request id (JB-5). A result
// whose placeholder is gone stays in the record and `placeOrphan` places it.
// The run time per generated second, from the response `timing`, is kept as
// a moving average per task and model in the timeline preferences, and gives
// each job its expected duration.
//
// Thread affinity: GUI thread only. Bounces run on the worker thread of each
// MusicBounce (owned per job through std::unique_ptr), and take downloads run
// on worker QThreads this object owns through std::unique_ptr. Workers hand
// results back through queued calls guarded by QPointer, and the destructor
// interrupts and joins every worker before any member is destroyed.

#include "ai/GenerationTransport.h"
#include "model/TimelineTypes.h"
#include "music/MusicBounce.h"
#include "server/AutosaveController.h"

#include <QAbstractListModel>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointer>
#include <QTimer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

#include <cstdint>
#include <memory>
#include <optional>
#include <vector>

class QThread;
class TimelineModel;
class TestMusicJobs;
class TestMusicAssistant;
namespace nt::assets {
class MediaProtection;
}

namespace nt::music {

// The job list as a model for the panel (UI-2 item 6). Rows are snapshots
// MusicJobs hands in; `elapsedMs` is computed when read.
// Thread affinity: GUI thread only. Owned by its MusicJobs through the Qt
// parent.
class MusicJobListModel : public QAbstractListModel {
    Q_OBJECT
public:
    enum Role {
        JobIdRole = Qt::UserRole + 1,
        StateRole,
        OperationRole,
        ElapsedMsRole,
        ExpectedMsRole,
        ErrorRole,
        ClipIdRole,
        TrackIdRole,
        StartFrameRole,
        EndFrameRole,
        ResubmitCountRole,
        UnplacedTakesRole,
        CanCancelRole,
        CanRetryRole,
        CanPlaceRole,
    };
    explicit MusicJobListModel(QObject* parent) : QAbstractListModel(parent) {}
    int rowCount(const QModelIndex& parent = {}) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    void setRows(QList<QVariantMap> rows);
    // The elapsed time of active rows moves on.
    void tick();

private:
    QList<QVariantMap> m_rows;
};

class MusicJobs : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(bool ready READ ready NOTIFY readyChanged)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
    Q_PROPERTY(QAbstractListModel* jobList READ jobList CONSTANT)
    Q_PROPERTY(int activeCount READ activeCount NOTIFY jobsChanged)
    // Hatched bands of running Regenerate jobs: {jobId, clipId, trackId,
    // startFrame, endFrame}. Job state, never written to the document (9.2).
    Q_PROPERTY(QVariantList bands READ bands NOTIFY jobsChanged)
public:
    static constexpr int kMaxActiveJobs = 8;
    static constexpr int kPollIntervalMs = 3000;
    static constexpr int kMaxResubmits = 1;

    explicit MusicJobs(QObject* parent = nullptr);
    ~MusicJobs() override;
    MusicJobs(const MusicJobs&) = delete;
    MusicJobs& operator=(const MusicJobs&) = delete;

    // The timeline's job module, created on first use as a child of the
    // model with `timeline` set. The panel, the assistant commands (GN-8) and
    // the clean-up command share it, so a timeline has one socket and one
    // job list. QML reaches it through MusicJobsRegistry.
    static MusicJobs* forTimeline(TimelineModel* timeline);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    bool ready() const { return m_transport.ready(); }
    QString error() const { return m_error; }
    QAbstractListModel* jobList() const { return m_list; }
    int activeCount() const;
    QVariantList bands() const;

    // Connects the job socket to the timeline's server. Submissions open it.
    Q_INVOKABLE void open();
    // Plans the operation for [startFrame, endFrame) on `trackId` and starts
    // it. `operation` is "text2music", "repaint", "lego", or empty for the
    // inferred one. `seed` below 0 lets the backend pick. `options` may carry
    // "provider" (default "acestep"), "steps" and "lmModel". Returns the job
    // id, or an empty string with `error` set.
    Q_INVOKABLE QString submit(const QString& trackId, double startFrame, double endFrame, const QString& operation,
                               const QString& prompt, int candidates, double seed, const QString& model,
                               const QVariantMap& options = {});
    Q_INVOKABLE bool cancel(const QString& jobId);
    Q_INVOKABLE bool retry(const QString& jobId);
    // Places the takes a finished job holds because its placeholder was gone,
    // inserting the placeholder again in the same undo step.
    Q_INVOKABLE bool placeOrphan(const QString& jobId);
    // Removes a final job from the list and deletes its record.
    Q_INVOKABLE bool dismiss(const QString& jobId);
    Q_INVOKABLE QVariantMap job(const QString& jobId) const;
    Q_INVOKABLE QVariantList jobs() const;
    // The expected run time of a window of `requestFrames` for this task and
    // model, from the stored average. 0: no job of that kind has finished.
    Q_INVOKABLE double expectedMs(const QString& task, const QString& model, double requestFrames) const;
    // The context bounce of every job in the list, final ones included: a
    // retry sends the same context again (TK-5 keeps these).
    QStringList contextAssetIds() const;

signals:
    void timelineChanged();
    void readyChanged();
    void errorChanged();
    void jobsChanged();
    void jobSubmitted(const QString& jobId, const QString& clipId);
    void jobChanged(const QString& jobId, const QString& state);

private:
    friend class ::TestMusicJobs;
    friend class ::TestMusicAssistant;
    struct Job {
        QString id;
        QString requestId;
        QString state;
        QString operation;  // "text2music", "repaint", "lego"
        QString provider;
        QString model;
        QString prompt;
        QString trackId;
        QString clipId;
        std::int64_t startFrame = 0;
        std::int64_t endFrame = 0;
        std::int64_t windowStartFrame = 0;
        std::int64_t requestFrames = 0;
        QJsonObject plan;
        QJsonObject request;  // the generate_media data
        QJsonObject clip;     // the placeholder, or the Regenerate clip at submission
        QString contextAssetId;
        int resubmitCount = 0;
        QJsonArray takes;     // music_takes not yet placed
        QJsonObject timing;
        QString error;
        QString createdAt;
        qint64 submittedAtMs = 0;
        qint64 finishedAtMs = 0;
        bool sent = false;
        // Session only.
        bool recovered = false;
        int missingLookups = 0;
        std::unique_ptr<MusicBounce> bounce;

        QJsonObject toJson() const;
        static Job fromJson(const QJsonObject& value);
    };

    bool canonicalizeTarget();
    Job* find(const QString& jobId);
    const Job* find(const QString& jobId) const;
    Job* findByRequest(const QString& requestId);
    QString recordPath(const QString& jobId) const;
    bool save(const Job& job);
    void restore();
    void reset();
    void setError(const QString& error);
    void setState(Job& job, const QString& state);
    void publish();
    QVariantMap row(const Job& job) const;

    void startBounce(Job& job, const nt::Timeline& snapshot);
    void bounceFinished(const QString& jobId, const BounceResult& result);
    bool insertPlaceholder(Job& job);
    void send(Job& job);
    void sendPending();
    void lookup();
    void receive(const QJsonObject& message);
    void applyRow(Job& job, const QJsonObject& row);
    void complete(Job& job, const QJsonArray& takes, const QJsonObject& timing);
    void fail(Job& job, const QString& error);
    void interrupted(Job& job, const QString& error);
    void resend(Job& job);
    void place(Job& job, bool reinsert);
    void placed(const QString& jobId, const QString& requestId, bool reinsert, const QList<nt::Clip>& media,
                const QString& error);
    void recordTiming(const Job& job);
    void updatePolling();

    QPointer<TimelineModel> m_timeline;
    std::optional<nt::server::SaveTarget> m_target;
    nt::ai::GenerationTransport m_transport;
    QTimer m_poll;
    QTimer m_reconnect;
    QTimer m_ticker;
    int m_reconnectAttempts = 0;
    QString m_error;
    std::vector<Job> m_jobs;
    MusicJobListModel* m_list;  // child of this
    // Shared because each download worker thread holds it while it runs:
    // unique ownership would leave that thread a raw pointer (rule 12).
    std::shared_ptr<nt::assets::MediaProtection> m_mediaProtection;
    std::vector<std::unique_ptr<QThread>> m_workers;
};

// QML reaches the per-timeline instance through this singleton.
// Thread affinity: GUI thread only.
class MusicJobsRegistry : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit MusicJobsRegistry(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE nt::music::MusicJobs* forTimeline(TimelineModel* timeline) const { return MusicJobs::forTimeline(timeline); }
};

} // namespace nt::music
