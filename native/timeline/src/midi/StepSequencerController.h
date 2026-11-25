#pragma once

#include "midi/PatternExpand.h"

#include <QAbstractListModel>
#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QMap>
#include <QPointer>
#include <QSet>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class TimelineModel;

// The rows of one pattern for the Step Sequencer grid (PERFORMANCE.md rules 9 and
// 10). An edit sends dataChanged for the rows that changed, so the ListView keeps
// its delegates and scroll position. The playhead updates only the `playingStep`
// role of rows whose playing step moved.
// Owned by StepSequencerController. UI thread only.
class StepSequencerRowModel : public QAbstractListModel {
    Q_OBJECT
    QML_ANONYMOUS
  public:
    enum Role { RowDataRole = Qt::UserRole + 1, RowIdRole, PlayingStepRole };
    using QAbstractListModel::QAbstractListModel;
    int rowCount(const QModelIndex& parent = {}) const override { return parent.isValid() ? 0 : static_cast<int>(m_rows.size()); }
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

    // Replaces the rows. Same ids in the same order: dataChanged for changed rows only.
    void setRows(const QVariantList& rows);
    void setPlayingSteps(const QHash<QString, int>& playing);
    const QVariantList& rows() const { return m_rows; }

  private:
    QVariantList m_rows;
    QStringList m_ids;
    std::vector<int> m_playing;
};

// The Pattern Browser list (SQ43): a section header per kind, then its factory
// entries. A search inserts and removes rows, never resets, so the ListView
// keeps its delegates. Owned by StepSequencerController. UI thread only.
class StepSequencerLibraryModel : public QAbstractListModel {
    Q_OBJECT
    QML_ANONYMOUS
  public:
    enum Role { HeaderRole = Qt::UserRole + 1, EntryIdRole, NameRole, KindRole, CategoryRole };
    explicit StepSequencerLibraryModel(const QVariantList& library, QObject* parent = nullptr);
    QString query() const { return m_query; }
    int rowCount(const QModelIndex& parent = {}) const override { return parent.isValid() ? 0 : static_cast<int>(m_rows.size()); }
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    void setQuery(const QString& query);
    // Replaces every entry after a library change (a save, a folder edit): a reset.
    void setLibrary(const QVariantList& library);

  private:
    struct Item {
        QString header;  // Empty for an entry.
        QVariantMap entry;
    };
    std::vector<Item> m_all;
    std::vector<int> m_rows;  // Indices into m_all, in order.
    QString m_query;
};

// The Step Sequencer's view of one pattern region (web StepSequencer.tsx). It
// reads `clip.pattern` and writes every edit through the same step pattern
// operations the assistant tools run (PatternOps.h), so a person and an agent
// reach the same edits. Each mutating runOp call is one "Edit Step Pattern"
// undo entry.
// Owned by its QML parent. It owns its row and library models (QObject children). UI thread only.
class StepSequencerController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(QString clipId READ clipId WRITE setClipId NOTIFY clipIdChanged)
    // True when the clip is a MIDI clip that carries a pattern.
    Q_PROPERTY(bool valid READ valid NOTIFY patternChanged)
    // True for a MIDI clip without a pattern: the panel offers the conversion.
    Q_PROPERTY(bool convertible READ convertible NOTIFY patternChanged)
    Q_PROPERTY(bool editable READ editable NOTIFY patternChanged)
    Q_PROPERTY(QString clipName READ clipName NOTIFY patternChanged)
    Q_PROPERTY(QString trackId READ trackId NOTIFY patternChanged)
    Q_PROPERTY(QString trackName READ trackName NOTIFY patternChanged)
    Q_PROPERTY(QString trackColor READ trackColor NOTIFY patternChanged)
    // The track instrument: kit pads for the Add Row menu (SQ19, SQ42).
    Q_PROPERTY(QVariantMap instrument READ instrument NOTIFY patternChanged)
    // Pattern settings (SQ2) without rows.
    Q_PROPERTY(QVariantMap settings READ settings NOTIFY patternChanged)
    // One entry per row: id, label, type, targetKind, mute, solo, playback, stepRate,
    // lengthSteps, loopStart, loopEnd, subrows, subrowsExpanded, color, pitch, steps.
    // For lookups. The grid binds rowModel.
    Q_PROPERTY(QVariantList rows READ rows NOTIFY patternChanged)
    Q_PROPERTY(QAbstractItemModel* rowModel READ rowModel CONSTANT)
    Q_PROPERTY(QString patternText READ patternText NOTIFY patternChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
    // Factory and user patterns and templates: id, name, kind, category, tags,
    // source, folder. Factory entries are parsed once; user entries reload after
    // a library op.
    Q_PROPERTY(QVariantList library READ library NOTIFY libraryChanged)
    // The browser rows after setLibraryQuery: header, entryId, name, kind, category.
    Q_PROPERTY(QAbstractItemModel* libraryModel READ libraryModel CONSTANT)
    // The Add Row and row assignment choices (web stepRowAssignments.ts):
    // [{id, label, choices: [{id, label, name, assignment}]}]. Kit, drums, notes,
    // melodic, degrees, controllers, instrument parameters and the parameters of
    // each insert effect (group ids `effect.<slot>`).
    Q_PROPERTY(QVariantList addRowGroups READ addRowGroups NOTIFY addRowGroupsChanged)
    // Timeline time in ms of the playhead, or negative when nothing plays.
    Q_PROPERTY(double playheadMs READ playheadMs WRITE setPlayheadMs NOTIFY playheadMsChanged)
    // Learn (SQ38): "" (off), "add" or "assign". learnNote and learnController act only while on.
    Q_PROPERTY(QString learnMode READ learnMode WRITE setLearnMode NOTIFY learnModeChanged)
    // Step recording (SQ40): notes turn on recordStep (0-based); the release of
    // the last held note moves it on.
    Q_PROPERTY(bool stepRecording READ stepRecording WRITE setStepRecording NOTIFY stepRecordingChanged)
    Q_PROPERTY(int recordStep READ recordStep WRITE setRecordStep NOTIFY recordStepChanged)
    // The id of the first MIDI track, or "" when the timeline has none.
    Q_PROPERTY(QString firstMidiTrackId READ firstMidiTrackId NOTIFY firstMidiTrackIdChanged)

  public:
    explicit StepSequencerController(QObject* parent = nullptr);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QString clipId() const { return m_clipId; }
    void setClipId(const QString& clipId);

    bool valid() const { return m_valid; }
    bool convertible() const { return m_convertible; }
    bool editable() const;
    QString clipName() const { return m_clipName; }
    QString trackId() const { return m_trackId; }
    QString trackName() const { return m_trackName; }
    QString trackColor() const { return m_trackColor; }
    QVariantMap instrument() const { return m_instrument.toVariantMap(); }
    QVariantMap settings() const { return m_settings; }
    QVariantList rows() const { return m_rowModel->rows(); }
    QAbstractItemModel* rowModel() const { return m_rowModel; }
    QString patternText() const { return m_patternText; }
    QString lastError() const { return m_lastError; }
    QVariantList library() const;
    QAbstractItemModel* libraryModel() const { return m_libraryModel; }
    QVariantList addRowGroups() const;
    Q_INVOKABLE void setLibraryQuery(const QString& query) { m_libraryModel->setQuery(query); }
    double playheadMs() const { return m_playheadMs; }
    void setPlayheadMs(double ms);

    // Runs one step pattern operation (get_pattern, set_steps, set_pattern_row, ...)
    // on this clip. `clipId` is filled in for ops that take one. A mutation is one
    // undo entry and runs the op once (twice only when the document is rebased).
    // Returns the committed result, or {ok: false, error} and sets lastError.
    Q_INVOKABLE QVariantMap runOp(const QString& op, const QVariantMap& args = {});
    // Runs [{op, args}, ...] in order as one undo entry, for an edit that needs
    // several ops (a relative change across steps with different values). Stops
    // at the first failure and changes nothing. Returns the last result.
    Q_INVOKABLE QVariantMap runOps(const QVariantList& ops);
    // The 0-based step of `rowId` that plays at timeline time `ms`, or -1.
    Q_INVOKABLE int playingStep(const QString& rowId, double ms);
    Q_INVOKABLE QString noteName(int pitch) const;
    QString learnMode() const { return m_learnMode; }
    void setLearnMode(const QString& mode);
    bool stepRecording() const { return m_stepRecording; }
    void setStepRecording(bool on);
    int recordStep() const { return m_recordStep; }
    void setRecordStep(int step);
    // A played note in Learn mode: add its row, or assign it to `rowId` (SQ38).
    Q_INVOKABLE QVariantMap learnNote(int pitch, const QString& rowId = {});
    // A controller in Learn mode: {kind: cc, cc} | {kind: pitchBend} | {kind: channelPressure}.
    Q_INVOKABLE QVariantMap learnController(const QVariantMap& target, const QString& rowId = {});
    Q_INVOKABLE void stepRecordNoteOn(int pitch, int velocity);
    Q_INVOKABLE void stepRecordNoteOff(int pitch);
    // Saves this pattern to the user library (SQ43) and reloads the browser.
    Q_INVOKABLE QVariantMap savePattern(const QString& name, const QString& kind, const QString& folder = {});
    QString firstMidiTrackId() const { return m_firstMidiTrackId; }
    // Creates an empty pattern region at `atMs` on `trackId` (the first MIDI track
    // when empty) as one undo entry, then edits it: clipId becomes its id. The
    // length is `durationMs`, or 1 bar when it is not positive.
    // Returns the op result ({ok, clip, ...}) or {ok: false, error}.
    Q_INVOKABLE QVariantMap createPatternRegion(const QString& trackId, double atMs, double durationMs = 0);
    // Reloads the clip this many times since construction (for tests).
    Q_INVOKABLE int reloadCount() const { return m_reloadCount; }

  signals:
    void timelineChanged();
    void clipIdChanged();
    void patternChanged();
    void lastErrorChanged();
    void playheadMsChanged();
    // The track instrument changed, so the Add Row menus rebuild only then.
    void addRowGroupsChanged();
    void libraryChanged();
    void learnModeChanged();
    void stepRecordingChanged();
    void recordStepChanged();
    void firstMidiTrackIdChanged();

  protected:
    bool eventFilter(QObject* watched, QEvent* event) override;

  private:
    void onTimelineChanged();
    void reload();
    void updateFirstMidiTrack();
    void reloadLibrary();
    void setLastError(const QString& error);
    void ensureSpans();
    QJsonObject tempoDoc() const;
    QJsonObject trackRaw() const;
    int stepAt(const QString& rowId, double ms);

    QPointer<TimelineModel> m_timeline;
    StepSequencerRowModel* m_rowModel = nullptr;
    StepSequencerLibraryModel* m_libraryModel = nullptr;
    QString m_clipId;
    bool m_valid = false;
    bool m_convertible = false;
    bool m_locked = false;
    QString m_clipName;
    QString m_trackId;
    QString m_trackName;
    QString m_trackColor;
    QJsonObject m_instrument;
    QJsonArray m_effects;  // The track's insert effects, for the Add Row menu.
    QVariantMap m_settings;
    QString m_patternText;
    QString m_lastError;
    QJsonObject m_clipRaw;
    QJsonObject m_tempoDoc;
    QJsonObject m_trackRaw;
    nt::midi::PatternStepSpans m_spans;
    bool m_spansDirty = true;
    double m_playheadMs = -1;
    QString m_learnMode;
    bool m_stepRecording = false;
    int m_recordStep = 0;
    QSet<int> m_heldNotes;
    QMap<int, int> m_chordNotes;
    QVariantList m_library;
    int m_reloadCount = 0;
    QString m_firstMidiTrackId;
};
