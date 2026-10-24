#pragma once

#include "model/TimelineTypes.h"
#include "model/TrackListModel.h"

#include <QObject>

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
    Q_PROPERTY(TrackListModel* tracks READ tracks CONSTANT)

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
    TrackListModel* tracks() const { return m_tracks; }

signals:
    void timelineChanged();

private:
    std::shared_ptr<const nt::Timeline> m_timeline;
    TrackListModel* m_tracks;
};
