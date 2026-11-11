#pragma once

// The controller behind the Audio panel, the gain dialog's Normalize modes and
// the Clip menu (issue #7080). One instance belongs to each TimelineModel (a
// child object), so the panel, the dialog and a menu item share one busy state
// and one result message. Measuring runs on a worker thread and can be
// cancelled. The result lands as exactly one `applyEdit`, so each action is one
// undo entry, and only if the document is the one that was measured.

#include "model/TimelineModel.h"
#include "RoleAnalysis.h"

#include <QObject>
#include <QPointer>
#include <QStringList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

#include <atomic>
#include <memory>

class QThread;

class AudioRoles : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Use AudioRolesRegistry.forTimeline")
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString task READ task NOTIFY busyChanged)
    Q_PROPERTY(double progress READ progress NOTIFY progressChanged)
    Q_PROPERTY(QString message READ message NOTIFY messageChanged)
    Q_PROPERTY(bool messageIsError READ messageIsError NOTIFY messageChanged)
    Q_PROPERTY(QVariantMap targets READ targets NOTIFY settingsChanged)
    Q_PROPERTY(double duckReduceDb READ duckReduceDb WRITE setDuckReduceDb NOTIFY settingsChanged)
    Q_PROPERTY(double duckSensitivity READ duckSensitivity WRITE setDuckSensitivity NOTIFY settingsChanged)
    Q_PROPERTY(double duckFadeS READ duckFadeS WRITE setDuckFadeS NOTIFY settingsChanged)
    Q_PROPERTY(QStringList duckAgainst READ duckAgainst WRITE setDuckAgainst NOTIFY settingsChanged)
public:
    // The instance of `timeline`, made on first use. Null for a null timeline.
    static AudioRoles* forTimeline(TimelineModel* timeline);
    ~AudioRoles() override;

    bool busy() const { return m_thread != nullptr; }
    QString task() const { return m_task; }
    double progress() const { return m_progress; }
    QString message() const { return m_message; }
    bool messageIsError() const { return m_messageIsError; }
    QVariantMap targets() const;
    double duckReduceDb() const { return m_duck.reduceDb; }
    double duckSensitivity() const { return m_duck.sensitivity; }
    double duckFadeS() const { return m_duck.fadeS; }
    QStringList duckAgainst() const { return m_duck.against; }
    void setDuckReduceDb(double db);
    void setDuckSensitivity(double value);
    void setDuckFadeS(double seconds);
    void setDuckAgainst(const QStringList& roles);

    // The role the clip plays as, "" for none.
    Q_INVOKABLE QString roleOf(const QString& clipId) const;
    // {role: "music"|"mixed"|"", count: n}: the shared role of the sounding clips among `ids`.
    Q_INVOKABLE QVariantMap roleSummary(const QStringList& ids) const;
    // Sets (or with "" clears) the role of the sounding, unlocked clips among `ids`. One undo entry.
    Q_INVOKABLE bool setRole(const QStringList& ids, const QString& role);
    Q_INVOKABLE void setTarget(const QString& role, double lufs);

    // Sets each clip's volume so its loudness reaches its role's target. `ids` empty means every clip that has a role.
    Q_INVOKABLE void matchLoudness(const QStringList& ids);
    // Sets the volume of `ids` so their loudness ("loudness", LUFS) or sample peak ("peak", dBFS) reaches `target`.
    Q_INVOKABLE void normalize(const QStringList& ids, const QString& mode, double target);
    // Writes ducking under the trigger roles for the Music and Ambience clips among `ids` (every one when empty).
    Q_INVOKABLE void duck(const QStringList& ids);
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void dismissMessage();

signals:
    void busyChanged();
    void progressChanged();
    void messageChanged();
    void settingsChanged();
    // `applied` is true when an edit was made.
    void finished(const QString& task, bool applied);

private:
    explicit AudioRoles(TimelineModel* timeline);
    void start(const QString& task, std::function<QJsonObject(const nt::Timeline&)> keyOf,
               std::function<void(const nt::audioroles::CancelFn&, const nt::audioroles::ProgressFn&)> work,
               std::function<bool()> apply);
    void report(const QString& text, bool error);
    void saveSettings() const;
    QStringList soundingIds(const QStringList& ids, const std::function<bool(const QString& role)>& wantRole,
                            int* skippedNoRole, int* skippedLocked) const;

    QPointer<TimelineModel> m_timeline;
    QThread* m_thread = nullptr;
    std::shared_ptr<std::atomic_bool> m_cancel;
    QString m_task;
    double m_progress = 0;
    QString m_message;
    bool m_messageIsError = false;
    QVariantMap m_targets;
    nt::audioroles::DuckSettings m_duck;

    // Results of the worker, kept for `apply`.
    std::vector<nt::audioroles::Measurement> m_measurements;
    std::vector<nt::audioroles::DuckPlan> m_plans;
    quint64 m_generation = 0;
    QJsonObject m_key;
    std::function<QJsonObject(const nt::Timeline&)> m_keyOf;
};

// QML reaches the per-timeline instance through this singleton.
class AudioRolesRegistry : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit AudioRolesRegistry(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE AudioRoles* forTimeline(TimelineModel* timeline) const { return AudioRoles::forTimeline(timeline); }
};
