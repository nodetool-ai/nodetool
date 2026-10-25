#pragma once

#include "model/TimelineTypes.h"
#include "model/TrackListModel.h"

#include <QHash>
#include <QJsonArray>
#include <QObject>
#include <QUndoStack>

#include <memory>
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
    // Pushes one undo command from `before` to `after` (and applies `after`).
    // No command when the two are equal. A `continuation` with a `mergeId`
    // folds into the previous command of that id (a held key's repeats).
    bool commitEdit(const QString& text, const QJsonArray& before, const QJsonArray& after, int mergeId = 0,
                    bool continuation = false);

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
    void timelineChanged();
    // The clips changed: an edit, or a new document (then the tracks reset too).
    void clipsChanged();
    // A new document replaced the old one (emitted before clipsChanged).
    void documentReplaced();
    void markersChanged();

private:
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
    QHash<QString, std::pair<std::string, std::string>> m_media;
};
