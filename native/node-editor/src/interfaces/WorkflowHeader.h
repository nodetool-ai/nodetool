#pragma once

#include <QStringList>
#include <QObject>
#include <QString>

namespace nodetool::node_editor {

// What the workflow document bar (HeaderRow.qml) reads and does about the
// document: its name and whether it can be renamed, the save state, undo and
// redo, and the rename, save, server sync, document command and tool tip requests.
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
    // The document commands the bar shows as icon buttons, and their state.
    Q_PROPERTY(QStringList enabledActions READ enabledActions NOTIFY actionsChanged)
    Q_PROPERTY(bool instantUpdate READ instantUpdate NOTIFY actionsChanged)
    Q_PROPERTY(bool mouseNavigation READ mouseNavigation NOTIFY actionsChanged)
    // Only platforms without a trackpad default offer the canvas navigation switch.
    Q_PROPERTY(bool navigationSwitch READ navigationSwitch CONSTANT)
public:
    explicit WorkflowHeader(QObject *parent = nullptr);
    ~WorkflowHeader() override;

    QString workflowName() const { return workflowName_; }
    bool renamable() const { return renamable_; }
    QString saveStatus() const { return saveStatus_; }
    bool canUndo() const { return canUndo_; }
    bool canRedo() const { return canRedo_; }
    QStringList enabledActions() const { return enabledActions_; }
    bool instantUpdate() const { return instantUpdate_; }
    bool mouseNavigation() const { return mouseNavigation_; }
    bool navigationSwitch() const {
#ifdef Q_OS_MACOS
        return false;
#else
        return true;
#endif
    }
    void setActions(const QStringList &enabled, bool instantUpdate, bool mouseNavigation);

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
    // Runs a document command by its menu name, such as "Version history".
    Q_INVOKABLE void runAction(const QString &name) { emit actionRequested(name); }
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
    void actionsChanged();
    void actionRequested(const QString &name);
    void toolTipRequested(const QString &text);

private:
    QString workflowName_;
    bool renamable_ = false;
    QString saveStatus_ = QStringLiteral("saved");
    bool canUndo_ = false;
    bool canRedo_ = false;
    QStringList enabledActions_;
    bool instantUpdate_ = false;
    bool mouseNavigation_ = false;
};

}  // namespace nodetool::node_editor
