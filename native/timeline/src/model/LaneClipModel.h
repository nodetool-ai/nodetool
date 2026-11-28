#pragma once

// The clips of one track that a lane instantiates (DESIGN.md D28): only the
// clips that intersect the view state's clip window (the viewport plus 320 px
// of overscan on each side, `visibleClipIdsByTrack` in the web), plus the
// clip under an active gesture (`pinnedClipId`), which stays even when it
// leaves the window so its delegate keeps the pointer grab.
//
// With reuseDelegates, departed clips leave reusable presentation slots. Clips
// that stay keep their slot, and entering clips take idle slots before the pool
// grows. Idle slots have an empty clipId. Without reuse, rows remain in start
// order and removals/insertions follow the window. The model recomputes when the
// view state publishes a new clip window (at most once per frame), when the
// clips change, or when the pin changes. Playback never touches it.

#include "model/TimelineTypes.h"
#include "model/TimelineModel.h"
#include "ui/TimelineViewState.h"

#include <QAbstractListModel>
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>

#include <memory>
#include <vector>
#include <unordered_map>
#include <unordered_set>

// UI thread only. Lane delegates borrow rows held by the immutable snapshot.
class LaneClipModel : public QAbstractListModel {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(QString trackId READ trackId WRITE setTrackId NOTIFY trackIdChanged)
    Q_PROPERTY(TimelineViewState* viewState READ viewState WRITE setViewState NOTIFY viewStateChanged)
    Q_PROPERTY(QString pinnedClipId READ pinnedClipId WRITE setPinnedClipId NOTIFY pinnedClipIdChanged)
    Q_PROPERTY(QString detailPinnedClipId READ detailPinnedClipId WRITE setDetailPinnedClipId NOTIFY detailPinnedClipIdChanged)
    Q_PROPERTY(bool pinnedClipInTrack READ pinnedClipInTrack NOTIFY recomputed)
    Q_PROPERTY(bool reuseDelegates READ reuseDelegates WRITE setReuseDelegates NOTIFY reuseDelegatesChanged)
    Q_PROPERTY(int count READ count NOTIFY countChanged)
    Q_PROPERTY(int trackClipCount READ trackClipCount NOTIFY countChanged)
    Q_PROPERTY(int recomputeCount READ recomputeCount NOTIFY recomputed)
    // Rows an edit changed since creation (one dataChanged each).
    Q_PROPERTY(int dataChangedRows READ dataChangedRows NOTIFY recomputed)

public:
    enum Role {
        ClipIdRole = Qt::UserRole + 1,
        NameRole,
        StartMsRole,
        DurationMsRole,
        MediaTypeRole,
        HiddenRole,
        LockedRole,
        StatusRole,
        FadeInMsRole,
        FadeOutMsRole,
        FadeInShapeRole,
        FadeOutShapeRole,
        TransitionTypeRole,
        TransitionMsRole,
        // The clip pictures (M2b): the local file its waveform or filmstrip
        // reads (audio: `audioPath`, else `mediaPath`), the source in-point,
        // and the source out-point of clipSourceWindow (`outPointMs`, else
        // in + duration x source rate).
        MediaSourceRole,
        InPointMsRole,
        SourceOutMsRole,
        LabelColorRole,
        LoopLengthMsRole,
        SpeedMultiplierRole,
        SpeedBakedRole,
        HasEffectsRole,
        HasAnimationsRole,
        HasTimeRemapRole,
        AudioRoleRole,
        TakeBadgeRole,
        ActiveTakeLabelRole,
        HasActiveTakeRole,
        ActiveTakeDriftingRole,
        StackingIndexRole,

    };

    explicit LaneClipModel(QObject* parent = nullptr);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QString trackId() const { return m_trackId; }
    void setTrackId(const QString& id);
    TimelineViewState* viewState() const { return m_view; }
    void setViewState(TimelineViewState* view);
    QString pinnedClipId() const { return m_pinned; }
    void setPinnedClipId(const QString& id);
    QString detailPinnedClipId() const { return m_detailPinned; }
    void setDetailPinnedClipId(const QString& id);
    bool pinnedClipInTrack() const {
        return !m_pinned.isEmpty() && m_stackingIndices.contains(m_pinned.toStdString());
    }
    bool reuseDelegates() const { return m_reuseDelegates; }
    void setReuseDelegates(bool reuse);
    int count() const { return rowCount(); }
    int trackClipCount() const { return static_cast<int>(m_clips.size()); }
    quint64 rebuildClipVisits() const { return m_rebuildClipVisits; }
    quint64 windowVisits() const { return m_windowVisits; }
    quint64 rebuildCount() const { return m_rebuildCount; }
    int recomputeCount() const { return m_recomputes; }
    int dataChangedRows() const { return m_dataChangedRows; }
    // The ids in row order, for tests.
    Q_INVOKABLE QStringList clipIds() const;

    int rowCount(const QModelIndex& parent = QModelIndex()) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

signals:
    void timelineChanged();
    void trackIdChanged();
    void viewStateChanged();
    void pinnedClipIdChanged();
    void countChanged();
    void detailPinnedClipIdChanged();
    void reuseDelegatesChanged();
    void recomputed();

private:
    bool rebase();
    void rebuildClips();
    void recompute();
    void recomputeRows();
    void updatePool(const std::vector<const nt::Clip*>& next, bool newSnapshot,
                    const std::unordered_set<std::string>& restacked);

    QPointer<TimelineModel> m_timeline;
    QPointer<TimelineViewState> m_view;
    QString m_trackId;
    QString m_pinned;
    QString m_detailPinned;
    // Shared with TimelineModel and undo: rows must retain the old immutable
    // snapshot until all slot comparisons and notifications have finished.
    std::shared_ptr<const nt::Timeline> m_snapshot;
    // The snapshot `m_clips` points into; the rows move to it in recompute().
    std::shared_ptr<const nt::Timeline> m_snapshotNext;
    // This track's clips sorted by start, and the running maximum of their ends.
    std::vector<const nt::Clip*> m_clips;
    std::vector<double> m_prefixMaxEnd;
    std::unordered_map<std::string, int> m_stackingIndices;
    std::unordered_set<std::string> m_restackedIds;
    // The rows: the clip shown by each delegate.
    std::vector<const nt::Clip*> m_rows;
    // Idle slots borrow this GUI-owned value, never a released snapshot.
    nt::Clip m_idleClip;
    bool m_reuseDelegates = false;
    bool m_recomputing = false;
    bool m_recomputePending = false;
    quint64 m_rebuildClipVisits = 0;
    quint64 m_windowVisits = 0;
    quint64 m_rebuildCount = 0;
    int m_recomputes = 0;
    int m_dataChangedRows = 0;
};
