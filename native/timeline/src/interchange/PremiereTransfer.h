#pragma once

// Export a server timeline to Premiere Pro and bring a Premiere sequence back
// (issue 7085). Both run on a worker thread so the editor stays live, report
// progress and can be cancelled.
//
//   export: GET /api/timelines/<id>/export-premiere streams a zip (the sequence
//           as xmeml plus its media) into the file the person chose. The file
//           is written beside the target and moved into place when complete, so
//           a cancel or a failure leaves nothing behind. The server describes
//           what it left out in the `x-nodetool-export-report` header.
//   import: a `.xml` is packed with the media it names (PremiereArchive), a
//           `.zip` is sent as it is, to POST /api/timelines/import-zip. The
//           server stores the media and makes a new timeline.
//
// A timeline opened from a file has no server to ask, so both are refused with
// a reason (`unavailableReason`) the panel shows. They do not upload the file
// first: that would create a server copy the person did not ask for.

#include "model/TimelineModel.h"
#include "server/AutosaveController.h"

#include <QPointer>
#include <QThread>
#include <QUrl>
#include <QtQmlIntegration/qqmlintegration.h>

#include <functional>
#include <optional>

class PremiereTransfer : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    // True when the open timeline lives on a server.
    Q_PROPERTY(bool available READ available NOTIFY changed)
    Q_PROPERTY(QString unavailableReason READ unavailableReason NOTIFY changed)
    Q_PROPERTY(bool running READ running NOTIFY changed)
    // "export" or "import" while running and after, until `dismiss`.
    Q_PROPERTY(QString mode READ mode NOTIFY changed)
    // "packing", "transferring" or "finishing".
    Q_PROPERTY(QString phase READ phase NOTIFY changed)
    // 0..1, or -1 when the size is not known.
    Q_PROPERTY(double ratio READ ratio NOTIFY changed)
    Q_PROPERTY(qint64 transferredBytes READ transferredBytes NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    // True once a run ended well; the result properties below are then set.
    Q_PROPERTY(bool done READ done NOTIFY changed)
    Q_PROPERTY(QString outputPath READ outputPath NOTIFY changed)
    Q_PROPERTY(int clipsExported READ clipsExported NOTIFY changed)
    Q_PROPERTY(QStringList notes READ notes NOTIFY changed)
    Q_PROPERTY(int omittedNotes READ omittedNotes NOTIFY changed)
    Q_PROPERTY(QString importedId READ importedId NOTIFY changed)
    Q_PROPERTY(QString importedName READ importedName NOTIFY changed)
    Q_PROPERTY(int importedMedia READ importedMedia NOTIFY changed)
    Q_PROPERTY(int importedClips READ importedClips NOTIFY changed)
    Q_PROPERTY(int missingClips READ missingClips NOTIFY changed)
public:
    explicit PremiereTransfer(QObject* parent = nullptr);
    ~PremiereTransfer() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* value);
    // Tests aim the transfer at a server without a loaded source.
    void setTarget(std::optional<nt::server::SaveTarget> target);
    bool available() const { return m_target.has_value(); }
    QString unavailableReason() const;
    bool running() const { return m_running; }
    QString mode() const { return m_mode; }
    QString phase() const { return m_phase; }
    double ratio() const { return m_ratio; }
    qint64 transferredBytes() const { return m_transferred; }
    QString error() const { return m_error; }
    bool done() const { return m_done; }
    QString outputPath() const { return m_outputPath; }
    int clipsExported() const { return m_clipsExported; }
    QStringList notes() const { return m_notes; }
    int omittedNotes() const { return m_omitted; }
    QString importedId() const { return m_importedId; }
    QString importedName() const { return m_importedName; }
    int importedMedia() const { return m_importedMedia; }
    int importedClips() const { return m_importedClips; }
    int missingClips() const { return m_missingClips; }

    // A file name to offer in the save dialog, in the Documents folder.
    Q_INVOKABLE QString suggestedExportPath() const;
    Q_INVOKABLE QUrl suggestedExportUrl() const { return QUrl::fromLocalFile(suggestedExportPath()); }
    // `location` is a path or a file URL, as a QML FileDialog returns it.
    Q_INVOKABLE void exportTo(const QString& location);
    Q_INVOKABLE void importFrom(const QString& location);
    Q_INVOKABLE void cancel();
    // Clears the last result and error.
    Q_INVOKABLE void dismiss();
    // Opens the imported timeline in another editor window.
    Q_INVOKABLE bool openImported();
    // A path in the file manager. False when it cannot be shown.
    Q_INVOKABLE bool reveal(const QString& path) const;
    // A path from a plain path or a `file:` URL.
    static QString localPath(const QString& location);
signals:
    void changed();
    void finished(bool success);
private:
    struct Progress {
        QString phase;
        double ratio = -1;
        qint64 bytes = 0;
    };
    struct Outcome {
        bool ok = false;
        bool cancelled = false;
        QString error;
        QString outputPath;
        int clipsExported = 0;
        QStringList notes;
        int omitted = 0;
        QString importedId, importedName;
        int importedMedia = 0, importedClips = 0, missingClips = 0;
    };
    void begin(const QString& mode, const QString& phase);
    void run(std::function<Outcome(const std::function<void(Progress)>&)> work);
    void apply(const Progress& progress);
    void conclude(const Outcome& outcome);
    QString projectId() const;
    QPointer<TimelineModel> m_timeline;
    std::optional<nt::server::SaveTarget> m_target;
    bool m_explicitTarget = false;
    QPointer<QThread> m_worker;
    quint64 m_epoch = 0;
    QString m_mode, m_phase, m_error, m_outputPath, m_importedId, m_importedName;
    QStringList m_notes;
    double m_ratio = -1;
    qint64 m_transferred = 0;
    int m_clipsExported = 0, m_omitted = 0, m_importedMedia = 0, m_importedClips = 0, m_missingClips = 0;
    bool m_done = false;
    bool m_running = false;
};
