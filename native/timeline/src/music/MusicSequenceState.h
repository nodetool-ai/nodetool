#pragma once

// What music mode reads of the open sequence (docs/MUSIC-MODE.md section 15):
// whether it carries the `music` object (MD3), whether it has a video track
// (the Music layout shows the program monitor only then), its tempo text,
// prompt history and bar labels, and what the music toolbar shows: the tempo
// chip, the key and the tempo lock (MD6). It follows the model's edits and document
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
    // "120 BPM 4/4", empty without a readable tempo.
    Q_PROPERTY(QString tempoChip READ tempoChip NOTIFY changed)
    // "A minor", or empty when the sequence has no key.
    Q_PROPERTY(QString keyText READ keyText NOTIFY changed)
    // MD6: an audio clip holds the tempo, so only the key can change.
    Q_PROPERTY(bool tempoLocked READ tempoLocked NOTIFY changed)
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
    QString tempoChip() const { return m_tempoChip; }
    QString keyText() const { return m_keyText; }
    bool tempoLocked() const { return m_tempoLocked; }
    QStringList promptHistory() const { return m_promptHistory; }
    int openedDocuments() const { return m_openedDocuments; }

    // "5" on the line of bar 5, "5.3" inside beat 3 of bar 5; empty without a readable tempo.
    Q_INVOKABLE QString barLabel(double frame) const;
    // "5.3.2": bar, beat and quarter beat of a time in milliseconds; empty without a readable tempo.
    Q_INVOKABLE QString positionLabel(double ms) const;

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
    QString m_tempoChip;
    QString m_keyText;
    bool m_tempoLocked = false;
    QStringList m_promptHistory;
    int m_openedDocuments = 0;
};
