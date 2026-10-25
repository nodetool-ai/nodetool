#pragma once

// Saving a server timeline (PLAN.md M5b; DESIGN.md D4, D31, D34).
//
// A save is `POST /trpc/timeline.update` with `{id, baseUpdatedAt, document}`.
// `document` is the raw sequence the editor holds (every field the server
// sent, edited clips included) without the sequence-row fields (id, name,
// fps, size, duration, timestamps). The server compares `baseUpdatedAt` and
// swaps atomically:
//   - success: the response's `updatedAt` becomes the next base, and the undo
//     stack is marked clean when no edit happened during the save. A non-empty
//     `stripped` list is a warning: the server dropped those fields. The sent
//     document is kept next to the raw backup of the last load
//     (`<id>.stripped.json`), so the dropped data is recoverable.
//   - conflict (`error.data.apiCode` ALREADY_EXISTS, or `code` CONFLICT):
//     the local document stays as it is, is written to `<id>.local.json`, and
//     autosave stops. Nothing overwrites the server copy.
// The client never saves without a base.
//
// Dirty is the undo stack's clean state. Autosave runs 750 ms after the last
// command (D34) while the document is dirty and no conflict is open.

#include "server/ServerClient.h"

#include <QJsonObject>
#include <QObject>
#include <QStringList>
#include <QTimer>
#include <QUrl>

#include <functional>
#include <memory>

class QUndoStack;

namespace nt::server {

struct SaveTarget {
    QUrl server;
    QString token;
    QString timelineId;
    QString backupDir;  // the folder that holds `<id>.json`, the raw backup of the last load
};

struct SaveResult {
    bool ok = false;
    bool conflict = false;
    QString updatedAt;
    QStringList stripped;
    QString error;
    QString keptCopy;  // the local document written on a conflict or a strip
};

// The document part of a raw sequence: everything but the sequence-row fields.
QJsonObject documentForSave(const QJsonObject& rawSequence);

class AutosaveController : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool dirty READ dirty NOTIFY stateChanged)
    Q_PROPERTY(bool saving READ saving NOTIFY stateChanged)
    Q_PROPERTY(bool conflict READ conflict NOTIFY stateChanged)
    Q_PROPERTY(QStringList stripped READ stripped NOTIFY stateChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY stateChanged)

public:
    using DocumentFn = std::function<QJsonObject()>;

    AutosaveController(SaveTarget target, QUndoStack* undo, DocumentFn document, QString baseUpdatedAt,
                       QObject* parent = nullptr);

    bool dirty() const;
    bool saving() const { return m_saving; }
    bool conflict() const { return m_conflict; }
    QStringList stripped() const { return m_stripped; }
    QString lastError() const { return m_lastError; }
    QString baseUpdatedAt() const { return m_base; }

    void setDebounceMs(int ms) { m_timer.setInterval(ms); }
    void setAutosave(bool on);

    // Saves now, dirty or not. Blocks until the server answers.
    SaveResult saveNow();

signals:
    void stateChanged();
    void saved(const QString& updatedAt);
    void conflictDetected();
    void strippedWarning(const QStringList& paths);

private:
    void scheduleSave();
    QString writeCopy(const QString& suffix, const QJsonObject& doc) const;

    SaveTarget m_target;
    QUndoStack* m_undo;
    DocumentFn m_document;
    QString m_base;
    std::unique_ptr<ServerClient> m_client;
    QTimer m_timer;
    bool m_autosave = true;
    bool m_saving = false;
    bool m_conflict = false;
    QStringList m_stripped;
    QString m_lastError;
};

}  // namespace nt::server
