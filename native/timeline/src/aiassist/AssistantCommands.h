#pragma once
// The editor's commands as Assistant tools: ui_timeline_list_commands, ui_timeline_run_command,
// ui_timeline_read_scopes and ui_timeline_capture_frame, and the three music operations of
// src/music/MusicAssistant.h. Commands come from the registries the keys
// and menus use. The tables in AssistantCommandTable.cpp say which ones the Assistant may run, so a
// new registration fails `nodetool-timeline --audit-assistant-commands` until someone decides.
// The id, enabled state and undo model follow FilmCraft's crates/engine/src/commands.rs at 8c171a0
// (MIT OR Apache-2.0, see licenses/FilmCraft-MIT.txt).
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QSet>
#include <QStringList>
#include <QThreadPool>
#include <QVariantMap>

class ClipGestureController;
class FrameCapture;
class ScopesController;

namespace nt::aiassist {
// What a check of the tables against the registries found. Each list is sorted.
struct CommandAudit {
    QStringList unlisted;    // registered, and neither allowed nor denied
    QStringList stale;       // in a table, and registered nowhere
    QStringList conflicting; // both allowed and denied
    QStringList unrunnable;  // allowed, with no key action, menu entry or edit to run
    int allowed = 0;
    int denied = 0;
    bool clean() const { return unlisted.isEmpty() && stale.isEmpty() && conflicting.isEmpty() && unrunnable.isEmpty(); }
};
// Every id in the key action, built-in action, menu bar, context menu and edit registries.
QSet<QString> registeredCommandIds();
CommandAudit auditCommands(const QSet<QString>& registered = registeredCommandIds());
// Folds the commands pushed since `indexBefore` into one undo entry. A command that pushes
// more than one would otherwise take several undos to reverse.
void foldUndoEntries(TimelineModel& model, int indexBefore, const QString& label);

// native-rules #9: a QThreadPool job posts results back to it from another thread, no affinity comment
class AssistantCommands : public QObject {
    Q_OBJECT
public:
    AssistantCommands(TimelineModel& model, PlaybackClock& clock, QObject* parent = nullptr);
    ~AssistantCommands() override;
    // The window's TimelineEditor, which holds the gesture controller and the frame capture.
    void setEditor(QObject* editor);
    static QVariantList tools();
    static bool handles(const QString& name);
    // A result with `deferred` set arrives later through toolCompleted, with this call id.
    QVariantMap execute(const QString& name, const QVariantMap& args, const QString& callId = {});
signals:
    void toolCompleted(QString callId, QVariantMap result);

private:
    ClipGestureController* gestures() const;
    FrameCapture* capture() const;
    QString timelineId() const;
    QJsonObject state(ClipGestureController& gestures) const;
    QJsonObject listCommands(const QJsonObject& args);
    QJsonObject runCommand(const QJsonObject& args);
    QJsonObject readScopes(const QJsonObject& args, const QString& callId);
    QJsonObject captureFrame(const QJsonObject& args, const QString& callId);
    TimelineModel& m_model;
    PlaybackClock& m_clock;
    QPointer<QObject> m_editor;
    ScopesController* m_scopes = nullptr;
    QThreadPool m_encoder;
};
}
