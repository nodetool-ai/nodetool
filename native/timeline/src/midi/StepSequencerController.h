#pragma once

#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class TimelineModel;

// The Step Sequencer's view of one pattern region (web StepSequencer.tsx). It
// reads `clip.pattern` and writes every edit through the same step pattern
// operations the assistant tools run (PatternOps.h), so a person and an agent
// reach the same edits. Each runOp call is one `stepSequencer.op` undo entry.
// Owned by its QML parent. UI thread only.
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
    Q_PROPERTY(QString trackName READ trackName NOTIFY patternChanged)
    Q_PROPERTY(QString trackColor READ trackColor NOTIFY patternChanged)
    // Pattern settings (SQ2) without rows.
    Q_PROPERTY(QVariantMap settings READ settings NOTIFY patternChanged)
    // One entry per row: id, label, type, mute, solo, playback, stepRate, lengthSteps,
    // loopStart, loopEnd, subrows, subrowsExpanded, color, pitch, steps (normalized).
    Q_PROPERTY(QVariantList rows READ rows NOTIFY patternChanged)
    Q_PROPERTY(QString patternText READ patternText NOTIFY patternChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
    // Factory patterns and templates: id, name, kind, category, tags.
    Q_PROPERTY(QVariantList library READ library CONSTANT)

  public:
    using QObject::QObject;

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QString clipId() const { return m_clipId; }
    void setClipId(const QString& clipId);

    bool valid() const { return m_valid; }
    bool convertible() const { return m_convertible; }
    bool editable() const;
    QString clipName() const { return m_clipName; }
    QString trackName() const { return m_trackName; }
    QString trackColor() const { return m_trackColor; }
    QVariantMap settings() const { return m_settings; }
    QVariantList rows() const { return m_rows; }
    QString patternText() const { return m_patternText; }
    QString lastError() const { return m_lastError; }
    QVariantList library() const;

    // Runs one step pattern operation (get_pattern, set_steps, set_pattern_row, ...)
    // on this clip. `clipId` is filled in. Mutations are one undo entry. Returns
    // the operation result, or {ok: false, error} and sets lastError.
    Q_INVOKABLE QVariantMap runOp(const QString& op, const QVariantMap& args = {});
    // The 0-based step of `rowId` that plays at timeline time `ms`, or -1.
    Q_INVOKABLE int playingStep(const QString& rowId, double ms) const;
    Q_INVOKABLE QString noteName(int pitch) const;

  signals:
    void timelineChanged();
    void clipIdChanged();
    void patternChanged();
    void lastErrorChanged();

  private:
    void reload();
    void setLastError(const QString& error);

    QPointer<TimelineModel> m_timeline;
    QString m_clipId;
    bool m_valid = false;
    bool m_convertible = false;
    bool m_locked = false;
    QString m_clipName;
    QString m_trackName;
    QString m_trackColor;
    QVariantMap m_settings;
    QVariantList m_rows;
    QString m_patternText;
    QString m_lastError;
    QJsonObject m_pattern;
    double m_startMs = 0;
    double m_inPointMs = 0;
    double m_bpm = 120;
};
