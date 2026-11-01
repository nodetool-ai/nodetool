#pragma once

#include "model/TimelineTypes.h"
#include "model/TrackListModel.h"

#include <QHash>
#include <QJsonArray>
#include <QObject>
#include <QSet>
#include <QUndoStack>

#include <memory>
#include <optional>
#include <vector>
#include <QtQmlIntegration/qqmlintegration.h>

// The document the editor shows. It owns the timeline; QML only observes it.
class TimelineModel : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Created by main")
    Q_PROPERTY(QString name READ name NOTIFY timelineChanged)
    Q_PROPERTY(double fps READ fps NOTIFY timelineChanged)
    Q_PROPERTY(double durationMs READ durationMs NOTIFY timelineChanged)
    Q_PROPERTY(int canvasWidth READ canvasWidth NOTIFY timelineChanged)
    Q_PROPERTY(int canvasHeight READ canvasHeight NOTIFY timelineChanged)
    // The later of `durationMs` and the last clip end (TracksRegion `contentEndMs`).
    Q_PROPERTY(double contentEndMs READ contentEndMs NOTIFY timelineChanged)
    Q_PROPERTY(int clipCount READ clipCount NOTIFY timelineChanged)
    Q_PROPERTY(TrackListModel* tracks READ tracks CONSTANT)
    // The edit history (D5): one command per edit, one per gesture.
    Q_PROPERTY(QUndoStack* undoStack READ undoStack CONSTANT)
    // The document's `markers` ({id, timeMs, label, color?, note?}), in
    // document order.
    Q_PROPERTY(QVariantList markers READ markers NOTIFY markersChanged)

public:
    explicit TimelineModel(QObject* parent = nullptr);

    void setTimeline(nt::Timeline timeline);
    // Replaces the document with an empty one: every clip leaves the preview,
    // so its decoders close.
    void close();
    // Adds runtime paths by media identity and refreshes matching snapshot clips.
    void registerMedia(const nt::Clip& media);
    void registerMatteMedia(const QString& assetId, const std::string& path);
    QSet<QString> resolvedMediaPaths() const;
    const nt::Timeline& timeline() const { return *m_timeline; }
    // An immutable snapshot the render thread keeps by pointer (D8). A new
    // document makes a new snapshot; an old one stays valid while held.
    std::shared_ptr<const nt::Timeline> snapshot() const { return m_timeline; }

    QString name() const { return QString::fromStdString(m_timeline->name); }
    double fps() const { return m_timeline->fps; }
    double durationMs() const { return m_timeline->durationMs; }
    int canvasWidth() const { return m_timeline->width; }
    int canvasHeight() const { return m_timeline->height; }
    double contentEndMs() const;
    int clipCount() const { return static_cast<int>(m_timeline->clips.size()); }
    TrackListModel* tracks() const { return m_tracks; }

    QUndoStack* undoStack() const { return m_undo; }
    // Counts document replacements (setTimeline, close). A gesture started
    // under one generation never writes into another.
    quint64 documentGeneration() const { return m_generation; }

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
    void settleTransient();
    // O(1) through the snapshot's id index. Null: no such clip.
    const nt::Clip* findClip(const QString& clipId) const;
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

    // Only the command at the undo cursor updates the current document. Unknown,
    // superseded, discarded and previous-document tokens return false. A token
    // also becomes stale when a later command exists, including in redo history.
    bool settleCommand(quint64 token, const QJsonObject& document);
    // Reconcile asynchronous resources without adding a user undo command.
    bool settleDocument(const QJsonObject& document);

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
    void beforeCommand();
    void timelineChanged();
    void commandSettled();
    // The clips changed: an edit, or a new document (then the tracks reset too).
    void clipsChanged();
    // A new document replaced the old one (emitted before clipsChanged).
    void documentReplaced();
    void markersChanged();
    // A transient snapshot for the preview (previewClips). The preview and
    // the audio follow it. timelineChanged and clipsChanged come later.
    void previewChanged();

private:
    bool replaceDocument(const QJsonObject& raw);
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
    std::optional<QSet<QString>> m_changedClipIds;
    QSet<QString> m_changedTrackIds;
    quint64 m_takesRevision = 0;
    std::shared_ptr<const nt::Timeline> m_timeline;
    TrackListModel* m_tracks;
    QUndoStack* m_undo;
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
