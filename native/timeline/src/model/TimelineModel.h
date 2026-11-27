#pragma once

#include "model/TimelineSource.h"
#include "model/TimelineTypes.h"
#include "model/TrackListModel.h"

#include <QHash>
#include <QJsonArray>
#include <QObject>
#include <QSet>
#include <QUndoStack>
#include <QThread>
#include <atomic>

#include <functional>
#include <memory>
#include <optional>
#include <vector>
#include <QtQmlIntegration/qqmlintegration.h>

class AutomationRecorder;

// The document the editor shows. It owns the timeline; QML only observes it.
// As a TimelineSource it forwards timelineChanged and previewChanged to
// sourceChanged.
// Thread affinity: UI thread only.
class TimelineModel : public TimelineSource {
    Q_OBJECT
    Q_MOC_INCLUDE("audio/automation/AutomationRecorder.h")
    QML_ELEMENT
    QML_UNCREATABLE("Created by main")
    Q_PROPERTY(QString effectMatteId READ effectMatteId NOTIFY effectMatteChanged)
    Q_PROPERTY(QString timelineId READ timelineId NOTIFY timelineChanged)
    Q_PROPERTY(QString projectId READ projectId NOTIFY timelineChanged)
    Q_PROPERTY(QString sourcePath READ sourcePath NOTIFY timelineChanged)
    Q_PROPERTY(QString name READ name NOTIFY timelineChanged)
    Q_PROPERTY(double fps READ fps NOTIFY timelineChanged)
    Q_PROPERTY(bool dropFrame READ dropFrame NOTIFY timelineChanged)
    Q_PROPERTY(double durationMs READ durationMs NOTIFY timelineChanged)
    Q_PROPERTY(int canvasWidth READ canvasWidth NOTIFY timelineChanged)
    Q_PROPERTY(int canvasHeight READ canvasHeight NOTIFY timelineChanged)
    // The later of `durationMs` and the last clip end (TracksRegion `contentEndMs`).
    Q_PROPERTY(double contentEndMs READ contentEndMs NOTIFY timelineChanged)
    Q_PROPERTY(int clipCount READ clipCount NOTIFY timelineChanged)
    Q_PROPERTY(TrackListModel* tracks READ tracks CONSTANT)
    Q_PROPERTY(AutomationRecorder* automationRecorder READ automationRecorder CONSTANT)
    // The edit history (D5): one command per edit, one per gesture.
    Q_PROPERTY(QUndoStack* undoStack READ undoStack CONSTANT)
    // The document's `markers` ({id, timeMs, label, color?, note?}), in
    // document order.
    Q_PROPERTY(QVariantList markers READ markers NOTIFY markersChanged)
    // A read-only document takes no edit: applyEdit, commitEdit and the
    // marker edits return no edit. A cloud timeline opened by a viewer, or
    // one whose access was removed, is read-only.
    Q_PROPERTY(bool readOnly READ readOnly NOTIFY readOnlyChanged)

public:
    // Observer installation and callbacks are UI-thread only. The disabled path
    // reads one relaxed atomic and never constructs payloads or lifetime guards.
    class MeasurementObserver {
    public:
        virtual ~MeasurementObserver() = default;
        virtual void phase(const char*, bool) const noexcept = 0;
        virtual void crossing(const char*, const QJsonValue&) const noexcept = 0;
    };
private:
    struct MeasurementRegistration {
        // Shared with scopes because a callback may destroy the model.
        std::shared_ptr<const MeasurementObserver> observer;
        unsigned active = 0; // UI thread only.
    };
public:
    bool clearMeasurementObserver() noexcept {
        Q_ASSERT(QThread::currentThread() == thread());
        if (m_measurement && m_measurement->active) { return false; }
        m_measuring.store(false, std::memory_order_relaxed);
        m_measurement.reset();
        return true;
    }
    bool setMeasurementObserver(std::shared_ptr<const MeasurementObserver> observer) {
        Q_ASSERT(QThread::currentThread() == thread());
        if (m_measurement && m_measurement->active) { return false; }
        m_measurement = observer ? std::make_shared<MeasurementRegistration>(MeasurementRegistration{std::move(observer), 0}) : nullptr;
        m_measuring.store(bool(m_measurement), std::memory_order_relaxed);
        return true;
    }
    template<class Payload>
    void crossing(const char* site, Payload&& payload) const {
        if (!m_measuring.load(std::memory_order_relaxed)) { return; }
        Q_ASSERT(QThread::currentThread() == thread());
        // Keep the observer alive if the callback destroys the model.
        const auto observer = m_measurement;
        ++observer->active;
        observer->observer->crossing(site, payload());
        --observer->active;
    }
    class Measurement {
    public:
        Measurement(const TimelineModel& model, const char* phase) : m_phase(phase) {
            if (!model.m_measuring.load(std::memory_order_relaxed)) { return; }
            Q_ASSERT(QThread::currentThread() == model.thread());
            m_observer = model.m_measurement;
            ++m_observer->active;
            m_observer->observer->phase(m_phase, true);
        }
        ~Measurement() noexcept {
            if (!m_observer) { return; }
            m_observer->observer->phase(m_phase, false);
            --m_observer->active;
        }
        Measurement(const Measurement&) = delete;
        Measurement& operator=(const Measurement&) = delete;
    private:
        // Shared with the model because a synchronous signal can destroy it
        // before this scope closes. Destruction never accesses the model.
        std::shared_ptr<MeasurementRegistration> m_observer;
        const char* m_phase;
    };
    explicit TimelineModel(QObject* parent = nullptr);
    ~TimelineModel() override;

    void setTimeline(nt::Timeline timeline);
    AutomationRecorder* automationRecorder();
    // Rewrites one undo checkpoint (a raw sequence) for an adopted external change.
    using HistoryRebase = std::function<QJsonObject(const QJsonObject&)>;
    // Replace the document with an adopted external change and rebase the
    // undo history instead of clearing it.
    void adoptExternalTimeline(nt::Timeline timeline, const HistoryRebase& rebase);
    // Replaces the document with an empty one: every clip leaves the preview,
    // so its decoders close.
    void close();
    Q_INVOKABLE void setEffectMattePreview(const QString& clipId, const QString& effectId);
    QString effectMatteId() const { return QString::fromStdString(m_timeline->matteEffectId); }
    // Adds runtime paths by media identity and refreshes matching snapshot clips.
    void registerMedia(const nt::Clip& media);
    void registerMatteMedia(const QString& assetId, const std::string& path);
    QSet<QString> resolvedMediaPaths() const;
    const nt::Timeline& timeline() const { return *m_timeline; }
    // An immutable snapshot the render thread keeps by pointer (D8). A new
    // document makes a new snapshot; an old one stays valid while held.
    std::shared_ptr<const nt::Timeline> snapshot() const override;
    // UI-thread writes, audio-thread atomic reads. Never changes document/undo.
    std::optional<double> mixerOverrideValue(const QString& trackId, const QString& param, bool master = false) const;
    void setMixerOverride(const QString& trackId, const QString& param, std::optional<double> value, bool master = false);
    void setDeviceOverride(const QString& trackId, const QString& deviceId, const QJsonObject& patch, bool hold = false);
    void holdMixerOverride(const QString& trackId,const QString& param,double value, bool master = false);
    void releaseMixerOverride(const QString& trackId,const QString& param,double endMs,double value,double after);

    QString timelineId() const { return QString::fromStdString(m_timeline->id); }
    QString projectId() const { return m_timeline->raw.value(u"projectId").toString(); }
    QString sourcePath() const { return m_timeline->sourcePath; }
    QString name() const { return QString::fromStdString(m_timeline->name); }
    double fps() const { return m_timeline->fps; }
    bool dropFrame() const { return m_timeline->dropFrame; }
    double durationMs() const { return m_timeline->durationMs; }
    int canvasWidth() const { return m_timeline->width; }
    int canvasHeight() const { return m_timeline->height; }
    double contentEndMs() const;
    int clipCount() const { return static_cast<int>(m_timeline->clips.size()); }
    TrackListModel* tracks() const { return m_tracks; }

    QUndoStack* undoStack() const { return m_undo; }
    // Initial command application preserves active automation gestures. History
    // navigation and source changes outside this scope invalidate them.
    bool pushingCommand() const { return m_pushingCommand; }
    void pushCommand(std::unique_ptr<QUndoCommand> command);
    // Counts document replacements (setTimeline, close). A gesture started
    // under one generation never writes into another.
    quint64 documentGeneration() const override { return m_generation; }

    // The document as the server holds it (D4): the raw sequence JSON with
    // every field, the edited clips included.
    QJsonArray clipsJson() const;
    QByteArray documentJson() const;
    // Replaces the clips array of the raw document and re-derives the typed
    // model from it, with no undo entry (the edit commands and a gesture's
    // live preview use it). The tracks stay, so the track rows stay; the
    // lanes re-read their clips. Returns false when nothing changed.
    bool replaceClips(const QJsonArray& clips);
    // Replaces only the given clips, matched by id, in place. No clip is
    // added or removed, so no comparison of the other clips runs. Returns
    // false when an id is unknown or nothing changed.
    bool patchClips(const QJsonArray& changed);
    // The same for one step of a drag: only the preview hears it
    // (previewChanged). The other listeners hear every transient change at
    // once on settleTransient, when the gesture ends.
    bool previewClips(const QJsonArray& changed);
    // Updates only track effects in the render/audio snapshot, retaining the UI rows.
    bool previewTrackEffects(const QJsonArray& tracks);
    // Shows a track at a height during a resize drag, with no undo entry. Put the
    // starting height back before the edit that records the change.
    bool previewTrackHeight(const QString& trackId, double heightPx);
    void settleTransient();
    // O(1) through the snapshot's id index. Null: no such clip.
    const nt::Clip* findClip(const QString& clipId) const;
    // Borrowed indices into timeline(), built once per document snapshot on the UI thread.
    const std::vector<size_t>& trackClipIndices(const QString& trackId) const;
    bool trackClipIndexChanged(const QString& trackId) const;
    quint64 trackIndexVisits() const { return m_trackIndexVisits; }
    quint64 clipQueryVisits() const { return m_clipQueryVisits; }
    quint64 effectClipReads() const { return m_effectClipReads; }
    Q_INVOKABLE QVariantMap clipAt(const QString& trackId, double ms) const;
    Q_INVOKABLE QVariantList effectClips(const QStringList& ids) const;
    // True when the last clips change touched the clip. A change that added,
    // removed or reordered clips, or a new document, touches every clip.
    Q_INVOKABLE bool clipTouched(const QString& clipId) const;
    // True when the last clips change touched a clip on the track, before or
    // after it. When false, the clips keep their ids and order, so a clip
    // has the same index in the new snapshot.
    bool trackTouched(const QString& trackId) const;
    // Goes up when the takes (`versions`) of a clip can have changed.
    quint64 takesRevision() const { return m_takesRevision; }
    // Pushes one undo command from `before` to `after` (and applies `after`).
    // No command when the two are equal. A `continuation` with a `mergeId`
    // folds into the previous command of that id (a held key's repeats).
    // Zero means no edit. A continuation supersedes the merged command's token.
    quint64 commitEdit(const QString& text, const QJsonArray& before, const QJsonArray& after, int mergeId = 0,
                    bool continuation = false);

    Q_INVOKABLE quint64 applyEdit(const QString& name, const QJsonObject& payload);
    // Synchronous callback. Undo stores document snapshots, never this callable.
    quint64 applyEdit(const QString& label, const QJsonObject& payload,
                      const std::function<QJsonObject(QJsonObject, const QJsonObject&)>& edit);

    bool readOnly() const { return m_readOnly; }
    // Turning it on clears the undo history, so undo cannot change the
    // document either. Asynchronous settles and adopted external changes
    // still apply.
    void setReadOnly(bool readOnly);

    // Only the command at the undo cursor updates the current document. Unknown,
    // superseded, discarded and previous-document tokens return false. A token
    // also becomes stale when a later command exists, including in redo history.
    bool settleCommand(quint64 token, const QJsonObject& document);
    // Reconcile asynchronous resources without adding a user undo command.
    bool settleDocument(const QJsonObject& document);
    // The project the server now files the timeline under, with no undo
    // entry. Undo and redo keep it. Returns false when nothing changed.
    bool setProjectId(const QString& projectId);

    // Moves one clip to a new start on its track, as one undoable edit.
    Q_INVOKABLE bool moveClip(const QString& clipId, double startMs);

    // Markers (TimelineStore addMarker, deleteMarker): each one undoable
    // edit of the raw `markers` array; other fields of a marker stay as read.
    QVariantList markers() const;
    QJsonArray markersJson() const;
    bool replaceMarkers(const QJsonArray& markers);
    Q_INVOKABLE QString addMarker(double timeMs, const QString& label);
    Q_INVOKABLE bool deleteMarker(const QString& markerId);

signals:
    void mixerOverrideChanged(const QString& trackId, const QString& param);
    void beforeCommand();
    void timelineChanged();
    void commandSettled();
    // The clips changed: an edit, or a new document (then the tracks reset too).
    void clipsChanged();
    // A new document replaced the old one (emitted before clipsChanged).
    void documentReplaced();
    void markersChanged();
    void readOnlyChanged();
    // A transient snapshot for the preview (previewClips). The preview and
    // the audio follow it. timelineChanged and clipsChanged come later.
    void previewChanged();
    void effectMatteChanged();

private:
    std::atomic<bool> m_measuring{false};
    // Shared with active scopes, UI-thread only.
    std::shared_ptr<MeasurementRegistration> m_measurement;
    mutable std::shared_ptr<const nt::Timeline> m_trackIndexSource; // Keeps indexed storage alive across edits.
    mutable QHash<QString, std::vector<size_t>> m_trackClipIndices;
    mutable QSet<QString> m_indexChangedTracks;
    mutable quint64 m_trackIndexVisits = 0;
    mutable quint64 m_clipQueryVisits = 0;
    mutable quint64 m_effectClipReads = 0;
    mutable QHash<QString,std::vector<double>> m_trackMaxEnds;
    bool m_pushingCommand = false;
    bool replaceDocument(const QJsonObject& raw);
    // An undo or redo step: the document, keeping the current project.
    bool replaceFromHistory(QJsonObject raw);
    void installTimeline(nt::Timeline timeline, const HistoryRebase* rebase);
    bool rebaseHistory(const HistoryRebase& rebase);
    bool applyClips(const QJsonArray& clips, const std::vector<int>& reuse, bool sameIds, bool transient = false);
    bool patch(const QJsonArray& changed, bool transient);
    // The clips and tracks the transient snapshots changed since the last full notification.
    struct Transient {
        QSet<QString> clipIds;
        QSet<QString> trackIds;
        bool takesChanged = false;
    };
    std::optional<Transient> m_transient;
    void markAllChanged();
    // Marks only these clips and tracks changed, with no takes change.
    void markClipsChanged(QSet<QString> clipIds, QSet<QString> trackIds);
    std::optional<QSet<QString>> m_changedClipIds;
    // UI-only map. The model and published plans share each atomic handoff.
    // Model and published audio snapshots share the atomic master handoff.
    mutable QHash<QString, std::shared_ptr<std::atomic<std::uint64_t>>> m_deviceRevisions;
    mutable QHash<QString, std::shared_ptr<nt::MixerOverride>> m_deviceOverrides;
    mutable std::shared_ptr<nt::MixerOverride> m_masterMixerOverride;
    mutable QHash<QString, std::shared_ptr<nt::MixerOverride>> m_mixerOverrides;
    // Shared with snapshot readers. Keep the source alive to compare cache identity safely.
    mutable std::shared_ptr<const nt::Timeline> m_mixerSnapshotSource, m_mixerSnapshot;
    // UI thread, uniquely model-owned. Views borrow the recorder and its host clock.
    std::unique_ptr<AutomationRecorder> m_automationRecorder;
    void clearMixerOverrides();
    QSet<QString> m_changedTrackIds;
    quint64 m_takesRevision = 0;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<const nt::Timeline> m_timeline;
    TrackListModel* m_tracks;
    QUndoStack* m_undo;
    bool m_readOnly = false;
    quint64 m_generation = 0;
    // The media the document's load resolved, per media identity of a clip
    // (its type, its raw `mediaPath` and `currentAssetId`): the picture and
    // audio paths. Paths a loader resolved against a folder, and paths a
    // server open set outside the JSON, so an edit (a split, an undone
    // delete) gives a clip back the media it had. Filled by setTimeline and
    // kept for the document's life.
    struct MediaPaths {
        std::string picture;
        std::string originalPicture;
        std::string audio;
    };
    QHash<QString, MediaPaths> m_media;
    QHash<QString, std::string> m_mattes;
};
