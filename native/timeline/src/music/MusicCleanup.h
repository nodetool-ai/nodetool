#pragma once

// The clean-up command (docs/MUSIC-MODE.md TK-5, MR8, MR10): Edit > Clean Up
// Unused Music Takes.
//
// `scan` lists the unused music takes of the open sequence and the context
// bounces the server holds for it (MusicCleanupPlan.h), with the size the
// server reports for each asset. `confirm` removes the listed takes from their
// clips in one undo step (`music.removeTakes`), then waits until the autosave
// holds the server copy of that document. Only then does it delete the audio
// on the server, and only the assets the document at that moment still does
// not name and no music job holds. An undo of the removal before the save
// cancels every deletion.
// An undo after it puts the takes back without their audio, which the
// confirmation says.
//
// Thread affinity: GUI thread only. Server calls run on one worker QThread
// at a time, which only this object holds through a std::unique_ptr. The
// worker gets its own copies of the target and the ids, touches no member,
// and hands its result back through a queued call guarded by a QPointer.
// The destructor requests interruption and joins it before any member is
// destroyed, so no queued call outlives this object.

#include "model/TimelineModel.h"
#include "music/MusicCleanupPlan.h"
#include "server/AutosaveController.h"

#include <QJsonArray>
#include <QPointer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

#include <memory>
#include <optional>

class QThread;

namespace nt::music {

class MusicCleanup : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    // The editor's AutosaveController (the `autosave` context property).
    Q_PROPERTY(QObject* autosave READ autosave WRITE setAutosave NOTIFY changed)
    // idle, scanning, ready, saving (waiting for the autosave), deleting, done, failed
    Q_PROPERTY(QString state READ state NOTIFY changed)
    // {clipName, label, assetId, sizeBytes (-1 unknown), kept, reason}
    Q_PROPERTY(QVariantList takes READ takes NOTIFY changed)
    // {name, assetId, sizeBytes, kept, reason}
    Q_PROPERTY(QVariantList contexts READ contexts NOTIFY changed)
    Q_PROPERTY(int removeCount READ removeCount NOTIFY changed)
    Q_PROPERTY(int deleteCount READ deleteCount NOTIFY changed)
    Q_PROPERTY(double deleteBytes READ deleteBytes NOTIFY changed)
    Q_PROPERTY(QString message READ message NOTIFY changed)
public:
    explicit MusicCleanup(QObject* parent = nullptr);
    ~MusicCleanup() override;
    MusicCleanup(const MusicCleanup&) = delete;
    MusicCleanup& operator=(const MusicCleanup&) = delete;

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QObject* autosave() const { return m_autosave; }
    void setAutosave(QObject* autosave);
    QString state() const { return m_state; }
    QVariantList takes() const;
    QVariantList contexts() const;
    int removeCount() const;
    int deleteCount() const { return static_cast<int>(m_plan.deleteAssetIds.size()); }
    double deleteBytes() const;
    QString message() const { return m_message; }

    // Test seam: the server the timeline saves to. setTimeline reads it from
    // the launch arguments.
    void setServerTarget(std::optional<nt::server::SaveTarget> target) { m_target = std::move(target); }

    // Lists what a clean-up would remove. False when one is running or the
    // timeline has no server.
    Q_INVOKABLE bool scan();
    // Removes the listed takes and deletes their audio after the save.
    Q_INVOKABLE bool confirm();
    // Drops the listing, or the deletions still waiting for the save.
    Q_INVOKABLE void reset();

signals:
    void changed();

private:
    struct ScanResult {
        QJsonArray contexts;               // context bounce rows of this sequence
        QHash<QString, double> sizes;      // asset id -> bytes
        QString error;
    };
    struct DeleteResult {
        QStringList deleted;
        QStringList failed;  // "id: error"
    };
    void scanned(const ScanResult& result);
    void autosaveChanged();
    void deletedAssets(const DeleteResult& result);
    QSet<QString> jobAssets() const;
    void setState(const QString& state, const QString& message = {});
    bool busy() const;

    QPointer<TimelineModel> m_timeline;
    QPointer<nt::server::AutosaveController> m_autosave;
    std::optional<nt::server::SaveTarget> m_target;
    QString m_state = QStringLiteral("idle");
    QString m_message;
    CleanupPlan m_plan;
    QJsonArray m_contextRows;
    QHash<QString, double> m_sizes;
    QSet<QString> m_shownRemovals;  // "clipId\ntakeId" the person saw
    QSet<QString> m_shownDeletes;
    QStringList m_pending;          // asset ids that wait for the save
    QSet<QString> m_removed;        // "clipId\ntakeId" the confirmed edit removed
    std::unique_ptr<QThread> m_worker;
};

}  // namespace nt::music
