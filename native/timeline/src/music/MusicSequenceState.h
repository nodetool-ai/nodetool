#pragma once

// What music mode reads of the open sequence (docs/MUSIC-MODE.md section 15):
// whether it carries the `music` object (MD3), whether it has a video track
// (the Music layout shows the program monitor only then), its tempo text,
// prompt history and bar labels. It follows the model's edits and document
// replacements.
//
// Thread affinity: GUI thread only. QML creates it; its QML parent owns it.
// The timeline is held by QPointer, so a destroyed model reads as none.

#include "model/TimelineModel.h"

#include <QObject>
#include <QPointer>
#include <QStringList>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class MusicSequenceState : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(bool isMusic READ isMusic NOTIFY changed)
    Q_PROPERTY(bool hasVideoTrack READ hasVideoTrack NOTIFY changed)
    Q_PROPERTY(QString tempoText READ tempoText NOTIFY changed)
    Q_PROPERTY(QStringList promptHistory READ promptHistory NOTIFY changed)
    // Counts document replacements, so QML can act once per opened sequence.
    Q_PROPERTY(int openedDocuments READ openedDocuments NOTIFY documentOpened)

public:
    explicit MusicSequenceState(QObject* parent = nullptr);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    bool isMusic() const { return m_isMusic; }
    bool hasVideoTrack() const { return m_hasVideoTrack; }
    QString tempoText() const { return m_tempoText; }
    QStringList promptHistory() const { return m_promptHistory; }
    int openedDocuments() const { return m_openedDocuments; }

    // "5" on the line of bar 5, "5.3" inside beat 3 of bar 5; empty without a readable tempo.
    Q_INVOKABLE QString barLabel(double frame) const;

signals:
    void timelineChanged();
    void changed();
    void documentOpened();

private:
    void refresh();

    QPointer<TimelineModel> m_timeline;
    bool m_isMusic = false;
    bool m_hasVideoTrack = false;
    QString m_tempoText;
    QStringList m_promptHistory;
    int m_openedDocuments = 0;
};
