#pragma once

#include <QObject>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class TimelineModel;

// The piano roll's view of one midi clip (web PianoRoll.tsx): its notes, its
// window and the tempo, with tick <-> timeline-ms math. Notes are measured in
// ticks (960 per quarter) from the clip's content start, so a trimmed window
// hides notes and does not delete them. Every write is one `midi.setNotes` or
// `midi.setControllers` undo entry. UI thread only.
class PianoRollController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(QString clipId READ clipId WRITE setClipId NOTIFY clipIdChanged)
    Q_PROPERTY(bool valid READ valid NOTIFY clipChanged)
    Q_PROPERTY(bool editable READ editable NOTIFY clipChanged)
    Q_PROPERTY(QVariantMap regionParams READ regionParams NOTIFY clipChanged)
    Q_PROPERTY(QString clipName READ clipName NOTIFY clipChanged)
    // The clip's own color and its track's, as stored ("" when none), and the track's name.
    Q_PROPERTY(QString clipColor READ clipColor NOTIFY clipChanged)
    Q_PROPERTY(QString trackColor READ trackColor NOTIFY clipChanged)
    Q_PROPERTY(QString trackName READ trackName NOTIFY clipChanged)
    // The tonic of the document key ("C", "Eb", ...), or "" when the document has none.
    Q_PROPERTY(QString keyTonic READ keyTonic NOTIFY clipChanged)
    Q_PROPERTY(QVariantList notes READ notes NOTIFY notesChanged)
    // The controller lanes of the clip (cc, pitch bend, pressure), as stored.
    Q_PROPERTY(QVariantList controllers READ controllers NOTIFY controllersChanged)
    Q_PROPERTY(double startMs READ startMs NOTIFY clipChanged)
    Q_PROPERTY(double inPointMs READ inPointMs NOTIFY clipChanged)
    Q_PROPERTY(double durationMs READ durationMs NOTIFY clipChanged)
    Q_PROPERTY(double bpm READ bpm NOTIFY clipChanged)
    Q_PROPERTY(double offsetMs READ offsetMs NOTIFY clipChanged)
    Q_PROPERTY(double beatsPerBar READ beatsPerBar NOTIFY clipChanged)
    Q_PROPERTY(double beatUnit READ beatUnit NOTIFY clipChanged)
    // The clip window, in content ticks.
    Q_PROPERTY(double windowFromTick READ windowFromTick NOTIFY clipChanged)
    Q_PROPERTY(double windowToTick READ windowToTick NOTIFY clipChanged)
    Q_PROPERTY(int maxNotes READ maxNotes CONSTANT)

  public:
    using QObject::QObject;

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QString clipId() const { return m_clipId; }
    void setClipId(const QString& clipId);

    bool valid() const { return m_valid; }
    bool editable() const;
    QVariantMap regionParams() const { return m_regionParams; }
    QString clipName() const { return m_clipName; }
    QString clipColor() const { return m_clipColor; }
    QString trackColor() const { return m_trackColor; }
    QString trackName() const { return m_trackName; }
    QString keyTonic() const { return m_keyTonic; }
    QVariantList notes() const { return m_notes; }
    QVariantList controllers() const { return m_controllers; }
    double startMs() const { return m_startMs; }
    double inPointMs() const { return m_inPointMs; }
    double durationMs() const { return m_durationMs; }
    double bpm() const { return m_bpm; }
    double offsetMs() const { return m_offsetMs; }
    double beatsPerBar() const { return m_beatsPerBar; }
    double beatUnit() const { return m_beatUnit; }
    double windowFromTick() const { return msToTicks(m_inPointMs); }
    double windowToTick() const { return msToTicks(m_inPointMs + m_durationMs); }
    int maxNotes() const;

    // Content ticks <-> timeline milliseconds, through the clip's start and in-point.
    Q_INVOKABLE double tickToTimelineMs(double tick) const;
    Q_INVOKABLE double timelineMsToTick(double ms) const;
    // Ticks of one grid step: "bar", "beat" or a note division such as "1/16".
    Q_INVOKABLE double gridStepTicks(const QString& division) const;
    // The drawn grid in content ticks between two content ticks (at most 2048 lines).
    Q_INVOKABLE QVariantList gridTicks(const QString& division, double fromTick, double toTick) const;
    // Writes the notes as one undo entry. False when nothing was written.
    Q_INVOKABLE bool setNotes(const QVariantList& notes);
    // Writes the controller lanes as one `midi.setControllers` undo entry.
    Q_INVOKABLE bool setControllers(const QVariantList& controllers);
    // Writes a mixed note/controller selection as one undo entry.
    Q_INVOKABLE bool setEvents(const QVariantList& notes, const QVariantList& controllers);
    Q_INVOKABLE QString newNoteId() const;

  signals:
    void timelineChanged();
    void clipIdChanged();
    void clipChanged();
    void notesChanged();
    void controllersChanged();

  private:
    double msToTicks(double ms) const;
    void reload();

    QPointer<TimelineModel> m_timeline;
    QString m_clipId;
    bool m_valid = false;
    bool m_locked = false;
    QVariantMap m_regionParams;
    QString m_clipName;
    QString m_clipColor;
    QString m_trackColor;
    QString m_trackName;
    QString m_keyTonic;
    QJsonArray m_noteData;
    QJsonArray m_controllerData;
    QJsonObject m_reloadInputs;
    QVariantList m_notes;
    QVariantList m_controllers;
    double m_startMs = 0;
    double m_inPointMs = 0;
    double m_durationMs = 0;
    double m_bpm = 120;
    double m_offsetMs = 0;
    double m_beatsPerBar = 4;
    double m_beatUnit = 4;
};
