#pragma once

#include <QObject>
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointer>
#include <QSet>
#include <memory>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

#include "model/TimelineTypes.h"
#include <cstddef>
#include <vector>

class TimelineModel;

// UI-thread drag value. The renderer reads it only during scene-graph sync.
struct NoteDragValue {
    Q_GADGET
    QML_VALUE_TYPE(noteDragValue)
    Q_PROPERTY(double startTick MEMBER startTick)
    Q_PROPERTY(double durationTick MEMBER durationTick)
    Q_PROPERTY(int pitch MEMBER pitch)
    Q_PROPERTY(int velocity MEMBER velocity)
public:
    double startTick = 0;
    double durationTick = 1;
    int pitch = -1;
    int velocity = 100;
};

// The piano roll's view of one midi clip (web PianoRoll.tsx): its notes, its
// window and the tempo, with tick <-> timeline-ms math. Notes are measured in
// ticks (960 per quarter) from the clip's content start, so a trimmed window
// hides notes and does not delete them. Gestures keep a typed overlay and
// commit one named MIDI patch. Controller lanes use `midi.setControllers`.
// UI thread only.
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
    // Legacy list access remains for the step editor and the frozen Canvas oracle.
    Q_PROPERTY(QVariantList notes READ notes NOTIFY notesChanged)
    Q_PROPERTY(int noteRevision READ noteRevision NOTIFY notesChanged)
    Q_PROPERTY(QVariantMap noteSummary READ noteSummary NOTIFY notesChanged)
    Q_PROPERTY(bool toolActive READ toolActive NOTIFY toolChanged)
    Q_PROPERTY(bool noteDragActive READ noteDragActive NOTIFY noteDragChanged)
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

    TimelineModel* timeline() const;
    void setTimeline(TimelineModel* timeline);
    QString clipId() const { return m_clipId; }
    void setClipId(const QString& clipId);

    const std::vector<nt::MidiNote>& typedNotes() const;
    // Model, controller consumers and render snapshots share immutable storage across edits.
    std::shared_ptr<const std::vector<nt::MidiNote>> noteStorage() const;
    bool valid() const { return m_valid; }
    bool editable() const;
    QVariantMap regionParams() const { return m_regionParams; }
    QString clipName() const { return m_clipName; }
    QString clipColor() const { return m_clipColor; }
    QString trackColor() const { return m_trackColor; }
    QString trackName() const { return m_trackName; }
    QString keyTonic() const { return m_keyTonic; }
    QVariantList notes() const;
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
    Q_INVOKABLE bool patchNotes(const QVariantList& notes);
    Q_INVOKABLE bool beginNoteDrag(const QStringList& ids, const QString& kind);
    Q_INVOKABLE void updateNoteDrag(double ticks, double pitch, double minimum = 1, const QList<int>& rows = {}, const QList<int>& scale = {});
    Q_INVOKABLE bool commitNoteDrag(bool noOverlap = false);
    Q_INVOKABLE void cancelNoteDrag();
    bool noteDragActive() const { return !m_dragKind.isEmpty(); }
    Q_INVOKABLE QStringList noteDragIds() const;
    Q_INVOKABLE int noteDragRow(const QString& id) const;
    Q_INVOKABLE NoteDragValue previewNote(const QString& id) const;
    // Writes the controller lanes as one `midi.setControllers` undo entry.
    Q_INVOKABLE bool setControllers(const QVariantList& controllers);
    // Writes a mixed note/controller selection as one undo entry.
    Q_INVOKABLE bool setEvents(const QVariantList& notes, const QVariantList& controllers);
    Q_INVOKABLE QString newNoteId() const;
    int noteRevision() const { return m_noteRevision; }
    QVariantMap noteSummary() const { return m_noteSummary; }
    Q_INVOKABLE QVariantMap noteAtRow(int row) const;
    Q_INVOKABLE QVariantMap noteById(const QString& id) const;
    Q_INVOKABLE QVariantList selectedNotes(const QStringList& ids) const;
    Q_INVOKABLE QStringList selectNotes(const QString& action, const QStringList& ids = {}, double tick = 0) const;
    Q_INVOKABLE bool patchSelection(const QVariantList& values, const QStringList& replacedIds);
    Q_INVOKABLE QStringList splitNotes(const QStringList& ids, double tick);
    Q_INVOKABLE bool glueNotes(const QStringList& ids);
    Q_INVOKABLE bool finishNotes(const QString& action, const QStringList& ids);
    Q_INVOKABLE bool removeNotes(const QStringList& ids);
    Q_INVOKABLE bool beginTool(const QString& kind);
    Q_INVOKABLE QString previewAdd(int pitch, double tick, double duration, bool unique = false);
    Q_INVOKABLE void previewLength(const QString& id, double duration);
    Q_INVOKABLE void previewErase(const QString& id);
    Q_INVOKABLE void previewExpression(const QString& id, const QString& key, const QVariantList& points);
    Q_INVOKABLE bool commitTool();
    Q_INVOKABLE void cancelTool();
    bool toolActive() const { return !m_toolKind.isEmpty(); }
    const std::vector<nt::MidiNote>& toolNotes() const { return m_toolNotes; }
    QStringList toolHiddenIds() const;


  signals:
    void timelineChanged();
    void clipIdChanged();
    void clipChanged();
    void notesChanged();
    void notesReset();
    void notesPatched(const QStringList& ids);
    void noteDragChanged();
    void controllersChanged();
    void toolChanged();

  private:
    QVariantMap computeNoteSummary() const;
    QVariantMap m_noteSummary{{"low", 48}, {"high", 72}, {"from", 0}, {"to", 0}, {"pitches", QVariantList{}}};
    QSet<QPair<int, double>> m_noteOnsets;
    QSet<QPair<int, double>> m_toolOnsets;
    int m_noteRevision = 0;
    QString m_toolKind;
    std::vector<nt::MidiNote> m_toolNotes;
    QSet<QString> m_toolRemoved;
    bool applyPatch(const QString& name, QJsonObject payload);
    struct DragNote {
        QString id;
        int row = 0;
        double start = 0;
        double duration = 1;
        int pitch = 60;
        int velocity = 100;
    };
    QString m_dragKind;
    std::vector<DragNote> m_dragNotes;
    QHash<QString, std::size_t> m_dragIndex;
    double m_dragTicks = 0;
    double m_dragPitch = 0;
    double m_dragMinimum = 1;
    QList<int> m_dragRows;
    QList<int> m_dragScale;
    QJsonArray dragPatch() const;
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
    mutable QVariantList m_notes;
    mutable bool m_notesValid = true;
    QHash<QString, std::size_t> m_noteIndex;
    QVariantList m_controllers;
    double m_startMs = 0;
    double m_inPointMs = 0;
    double m_durationMs = 0;
    double m_bpm = 120;
    double m_offsetMs = 0;
    double m_beatsPerBar = 4;
    double m_beatUnit = 4;
};
