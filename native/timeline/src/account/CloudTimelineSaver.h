#pragma once

// Saves a cloud timeline (WP1.10, FR11): each committed edit goes to the
// local drafts of the bundled server, then to the cloud, through
// CloudDocument. The window shows the document's status in place of the
// server autosave's (DocumentBar, CloudSyncStatus).
//
// The timeline was read from the cloud before the window opened
// (loadTimelineSource). A draft this account left on this computer arrives
// with CloudDocument::opened and is applied as one restoreDocument edit,
// after its media is resolved off the UI thread, so it is sent again and can
// be undone. A draft that arrives after the person already edited is not
// applied: the person's edits replace it.
//
// The draft is the document with the sequence's `fps`, `width` and `height`
// beside it (cloudDraft), so a change of the project settings is sent too.
// A draft with other settings restores them with one setProjectSettings
// edit after the document.
//
// The model is read-only while the document is: a viewer's window, or one
// whose access was removed, takes no edit (TimelineModel::readOnly).

#include "server/ServerTimeline.h"

#include <QObject>
#include <QPointer>
#include <QString>
#include <QThread>
#include <QUrl>

#include <memory>

class TimelineModel;

namespace nodetool::account {
class AccountSession;
}
namespace nodetool::account::qt {
class CloudDocument;
}

namespace nt::account {

struct CloudTimelineOptions {
    QUrl origin;
    QString timelineId;
    QString role;
    // The local server that keeps the drafts, and its token (may be empty).
    QUrl localServer;
    QString localToken;
    // Where the cloud media is cached, as loadTimelineSource used it.
    QString cacheRoot;
    // The access token the media of a draft is read with.
    QString accessToken;
};

// Thread affinity: UI thread only. The media of a draft is resolved on one
// worker thread, which only writes the result it shares with this object.
// Ownership: owns its CloudDocument. Borrows the model, which main declares
// first and destroys after this object.
class CloudTimelineSaver final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QObject* document READ document CONSTANT)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)

public:
    CloudTimelineSaver(TimelineModel& model, std::shared_ptr<nodetool::account::AccountSession> session,
                       CloudTimelineOptions options, QObject* parent = nullptr);
    // Waits for a running media resolve, then closes the document, which
    // writes its last edit to the local store.
    ~CloudTimelineSaver() override;

    QObject* document() const;
    QString error() const { return m_error; }

    // The raw sequence with its document part (documentForSave) replaced by
    // `draft`. The sequence row fields stay, except the settings the draft
    // names.
    static QJsonObject withDraft(const QJsonObject& rawSequence, const QJsonObject& draft);
    // What is sent for a raw sequence: documentForSave and its fps, width
    // and height.
    static QJsonObject cloudDraft(const QJsonObject& rawSequence);

signals:
    void errorChanged();

private:
    void sendEdit();
    void applyDraft(const QString& draft);
    void fail(const QString& error);

    TimelineModel& m_model;
    CloudTimelineOptions m_options;
    std::unique_ptr<nodetool::account::qt::CloudDocument> m_document;
    QPointer<QThread> m_worker;
    QString m_error;
};

}  // namespace nt::account
