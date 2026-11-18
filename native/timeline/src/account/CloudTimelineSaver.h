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
// be undone. The model is read-only until then, so no edit on the server's
// revision replaces the draft. A draft that can't be opened or applied
// leaves the window read-only and the draft kept.
//
// The draft is the document with the sequence's `fps`, `width` and `height`
// beside it (cloudDraft), so a change of the project settings is sent too.
// A draft with other settings restores them with one setProjectSettings
// edit after the document.
//
// Every change of the undo stack is sent, as the server autosave sees it:
// an edit, a change of the project settings, a clip move, an undo and a
// redo (QUndoStack::indexChanged), besides a settled command. While the
// kept draft is applied nothing is sent, and the applied result goes once.
//
// The model is read-only while the document is: a viewer's window, or one
// whose access was removed, takes no edit (TimelineModel::readOnly).

#include "server/ServerTimeline.h"

#include <QObject>
#include <QPointer>
#include <QWindow>
#include <QString>
#include <QThread>
#include <QUrl>

#include <functional>
#include <memory>

class TimelineModel;

namespace nodetool::account {
class AccountSession;
class DraftStore;
class HttpTransport;
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
    server::AssetCacheRoot cacheRoot;
    // The access token, which names the media cache folder.
    QString accessToken;
    // Authorizes each request for the media of a draft through the account.
    server::RequestAuthorizer authorizer;
    // Tests only. Unset: the local server's draft store and QtHttpTransport.
    std::function<std::unique_ptr<nodetool::account::DraftStore>()> draftStore;
    std::function<std::unique_ptr<nodetool::account::HttpTransport>()> transport;
};

// Thread affinity: UI thread only. The media of a draft is resolved on one
// worker thread, which only writes the result it shares with this object.
// Ownership: owns its CloudDocument. Borrows the model, which main declares
// first and destroys after this object.
class CloudTimelineSaver final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QObject* document READ document CONSTANT)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
    // True while the window's close waits on the person: the last edit
    // could not be written to the local drafts.
    Q_PROPERTY(bool closeBlocked READ closeBlocked NOTIFY closeBlockedChanged)

public:
    CloudTimelineSaver(TimelineModel& model, std::shared_ptr<nodetool::account::AccountSession> session,
                       CloudTimelineOptions options, QObject* parent = nullptr);
    // Waits for a running media resolve, then closes the document, which
    // writes its last edit to the local store.
    ~CloudTimelineSaver() override;

    QObject* document() const;
    bool closeBlocked() const { return m_closeBlocked; }

    // Keeps `window` open while its last edit is only in memory: a close
    // writes the edit to the local drafts first, and when that fails the
    // window stays open and closeBlocked asks the person.
    void guardClose(QWindow* window);
    // The answers to closeBlocked: write again and close, close without the
    // last edits, or keep the window open.
    Q_INVOKABLE void retryClose();
    Q_INVOKABLE void discardAndClose();
    Q_INVOKABLE void cancelClose();
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
    void closeBlockedChanged();

protected:
    bool eventFilter(QObject* watched, QEvent* event) override;

private:
    void sendEdit();
    void applyDraft(const QString& draft);
    void fail(const QString& error);
    void updateReadOnly();
    // The kept draft is applied, or there was none.
    void recovered();

    TimelineModel& m_model;
    CloudTimelineOptions m_options;
    std::unique_ptr<nodetool::account::qt::CloudDocument> m_document;
    QPointer<QThread> m_worker;
    QString m_error;
    // True until the kept draft is known and applied.
    bool m_recovering = true;
    // True while the kept draft's edits go onto the stack.
    bool m_applying = false;
    // The last draft given to the document, so one change is sent once.
    QString m_lastSent;
    QPointer<QWindow> m_window;
    bool m_closeBlocked = false;
    // Set by discardAndClose: the next close goes through.
    bool m_closeApproved = false;
};

}  // namespace nt::account
