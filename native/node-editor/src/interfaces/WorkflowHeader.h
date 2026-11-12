#pragma once
#include <QObject>
#include <QString>

namespace nodetool::node_editor {

// What the workflow document bar (HeaderRow.qml) reads and does about the
// document: its name and whether it can be renamed, the save state, undo and
// redo, and the rename, save, server sync, More menu and tool tip requests.
// The bar's panel toggles come from PanelLayout.
//
// The owner fills the state with the setters and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class WorkflowHeader : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString workflowName READ workflowName NOTIFY workflowNameChanged)
    Q_PROPERTY(bool renamable READ renamable NOTIFY renamableChanged)
    // saved, saving, dirty, error, conflict, deleted or readOnly, as
    // web/src/components/ui_primitives/SaveStatus.tsx names them.
    Q_PROPERTY(QString saveStatus READ saveStatus NOTIFY saveStatusChanged)
    Q_PROPERTY(bool canUndo READ canUndo NOTIFY historyChanged)
    Q_PROPERTY(bool canRedo READ canRedo NOTIFY historyChanged)
public:
    explicit WorkflowHeader(QObject *parent = nullptr);
    ~WorkflowHeader() override;

    QString workflowName() const { return workflowName_; }
    bool renamable() const { return renamable_; }
    QString saveStatus() const { return saveStatus_; }
    bool canUndo() const { return canUndo_; }
    bool canRedo() const { return canRedo_; }

    void setWorkflowName(const QString &name);
    void setRenamable(bool renamable);
    void setSaveStatus(const QString &status);
    void setHistory(bool canUndo, bool canRedo);

    Q_INVOKABLE void rename(const QString &name) { emit renameRequested(name); }
    Q_INVOKABLE void undo() { emit undoRequested(); }
    Q_INVOKABLE void redo() { emit redoRequested(); }
    // Saves to the server again after a failed save.
    Q_INVOKABLE void saveToServer() { emit saveToServerRequested(); }
    // Opens the server sync panel, which resolves a conflict or a deleted workflow.
    Q_INVOKABLE void openServerSync() { emit serverSyncRequested(); }
    Q_INVOKABLE void openMore() { emit moreRequested(); }
    // Empty text hides the tool tip.
    Q_INVOKABLE void showToolTip(const QString &text) { emit toolTipRequested(text); }

signals:
    void workflowNameChanged();
    void renamableChanged();
    void saveStatusChanged();
    void historyChanged();
    void renameRequested(const QString &name);
    void undoRequested();
    void redoRequested();
    void saveToServerRequested();
    void serverSyncRequested();
    void moreRequested();
    void toolTipRequested(const QString &text);

private:
    QString workflowName_;
    bool renamable_ = false;
    QString saveStatus_ = QStringLiteral("saved");
    bool canUndo_ = false;
    bool canRedo_ = false;
};

}  // namespace nodetool::node_editor
